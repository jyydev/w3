"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { chainIds } from "@/data/basic";
import {
  aaveV3PoolAddressesProviderM,
  aaveV3PoolM,
  aaveV3UiPoolDataProviderM,
} from "@/app/_shared/aave/index";
import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";
import {
  approveExactIfNeeded,
  assertWalletMatches,
  erc20Abi,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getEvmTokenAddress,
  getPrivateKey,
  getUnsignedTx,
  getUsableChainRpc,
  getWallet,
} from "../../sharedServer";
import {
  cleanMarketSymbol,
  createJsonRpcProvider,
  getCoinByAddress,
  getTokenMeta,
  getUsableChainRpcs,
  logRpcFailure,
  mapWithConcurrency,
  withTimeout,
} from "../shared";

const aavePoolAbi = [
  "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
  "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
  "function getReservesList() view returns (address[])",
  "function getReserveData(address asset) view returns (tuple(uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))",
];
const aaveUiPoolDataProviderAbi = [
  "function getReservesData(address provider) view returns (tuple(address underlyingAsset,string name,string symbol,uint256 decimals,uint256 baseLTVasCollateral,uint256 reserveLiquidationThreshold,uint256 reserveLiquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool isActive,bool isFrozen,uint128 liquidityIndex,uint128 variableBorrowIndex,uint128 liquidityRate,uint128 variableBorrowRate,uint40 lastUpdateTimestamp,address aTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint256 availableLiquidity,uint256 totalScaledVariableDebt,uint256 priceInMarketReferenceCurrency,address priceOracle,uint256 variableRateSlope1,uint256 variableRateSlope2,uint256 baseVariableBorrowRate,uint256 optimalUsageRatio,bool isPaused,bool isSiloedBorrowing,uint128 accruedToTreasury,uint128 isolationModeTotalDebt,bool flashLoanEnabled,uint256 debtCeiling,uint256 debtCeilingDecimals,uint256 borrowCap,uint256 supplyCap,bool borrowableInIsolation,uint128 virtualUnderlyingBalance,uint128 deficit)[], tuple(uint256 marketReferenceCurrencyUnit,int256 marketReferenceCurrencyPriceInUsd,int256 networkBaseTokenPriceInUsd,uint8 networkBaseTokenPriceDecimals))",
];
const aTokenAbi = [
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
];
const aavePoolInterface = new ethers.Interface(aavePoolAbi);
const aaveMarketFetchTimeoutMs = 20000;
const aaveTokenMetaTimeoutMs = 10000;
const aaveMarketFetchConcurrency = 3;
const venusTokenMetaTimeoutMs = 8000;
const aaveMarketCacheM = {};

function getAaveSupportedChainRows() {
  const skipAliases = new Set(["BNB", "ZkSync"]);

  return Object.keys(aaveV3PoolM)
    .filter((chain) => chainIds[chain])
    .filter((chain) => !skipAliases.has(chain))
    .sort((a, b) => a.localeCompare(b))
    .map((chain) => ({
      chain,
      chainId: chainIds[chain],
      pool: aaveV3PoolM[chain],
    }));
}

function getAaveRateApr(rate = 0n) {
  try {
    const apr = Number(ethers.formatUnits(BigInt(rate || 0), 25));
    return Number.isFinite(apr) ? apr : 0;
  } catch {
    return 0;
  }
}

function getAaveUiPoolConfig(chain = "") {
  const poolAddressesProvider = aaveV3PoolAddressesProviderM[chain];
  const uiPoolDataProvider = aaveV3UiPoolDataProviderM[chain];

  if (
    !ethers.isAddress(poolAddressesProvider || "") ||
    !ethers.isAddress(uiPoolDataProvider || "")
  ) {
    return null;
  }

  return {
    poolAddressesProvider: ethers.getAddress(poolAddressesProvider),
    uiPoolDataProvider: ethers.getAddress(uiPoolDataProvider),
  };
}

function getAaveUnderlyingMetaFromUiPool(chain = "", reserve = {}) {
  const address = ethers.getAddress(reserve.underlyingAsset || reserve[0]);
  const localCoin = getCoinByAddress(chain, address);
  const symbol = String(reserve.symbol || reserve[2] || "").trim();
  const name = String(reserve.name || reserve[1] || "").trim();
  const decimals = Number(reserve.decimals ?? reserve[3] ?? 18);

  return {
    address,
    name: localCoin?.[1]?.name || name || localCoin?.[0] || symbol,
    symbol: localCoin?.[0] || cleanMarketSymbol(symbol, address),
    decimals: Number(localCoin?.[1]?.decimals ?? decimals),
    fallback: !localCoin && !symbol,
  };
}

function getAaveReserveRate(
  reserve = {},
  uiKey = "",
  uiIndex,
  poolKey = "",
  poolIndex,
) {
  if (reserve[uiKey] !== undefined) return reserve[uiKey];
  if (reserve[poolKey] !== undefined) return reserve[poolKey];
  return reserve[uiIndex] ?? reserve[poolIndex] ?? 0n;
}

function formatAaveMarket({
  chain = "",
  reserve = {},
  underlyingMeta,
  lendMeta,
}) {
  const addedUnderlying = getCoinByAddress(chain, underlyingMeta.address);
  const addedLend = getCoinByAddress(chain, lendMeta.address);
  const underlyingCoin = addedUnderlying?.[0] || underlyingMeta.symbol;
  const lendCoin = addedLend?.[0] || lendMeta.symbol;
  const metaFallback = !!underlyingMeta.fallback || !!lendMeta.fallback;

  return {
    value: `${underlyingCoin}:${lendCoin}:${lendMeta.address}`,
    chain,
    underlyingCoin,
    underlyingName: underlyingMeta.name || underlyingCoin,
    underlyingAddress: underlyingMeta.address,
    underlyingDecimals: underlyingMeta.decimals,
    lendCoin,
    lendName: lendMeta.name || lendCoin,
    lendAddress: lendMeta.address,
    lendDecimals: lendMeta.decimals,
    addedUnderlying: !!addedUnderlying,
    addedLend: !!addedLend,
    supplyApr: getAaveRateApr(
      getAaveReserveRate(
        reserve,
        "liquidityRate",
        14,
        "currentLiquidityRate",
        2,
      ),
    ),
    variableBorrowApr: getAaveRateApr(
      getAaveReserveRate(
        reserve,
        "variableBorrowRate",
        15,
        "currentVariableBorrowRate",
        4,
      ),
    ),
    metaFallback,
  };
}

export async function clearAaveRuntimeCache() {
  clearDiscoveryCacheMap(aaveMarketCacheM);

  return { ok: true };
}

export async function getAaveAllMarkets({ chain = "", refresh = false } = {}) {
  if (chain == "Solana") return { ok: true, chain, markets: [] };

  const cacheKey = String(chain || "");
  const cached = !refresh
    ? getDiscoveryCacheMapEntry(aaveMarketCacheM, cacheKey)
    : null;
  if (cached?.markets) {
    return {
      ok: true,
      chain,
      pool: cached.pool,
      rpc: cached.rpc,
      markets: cached.markets,
      cache: makeDiscoveryCacheMeta({
        source: "cache",
        at: cached.at,
        ttlMs: discoveryCacheMs,
      }),
    };
  }

  const pool = getAavePool(chain);
  const rpcList = getUsableChainRpcs(chain);
  if (!rpcList.length) throw new Error(`rpc not configured: ${chain}`);
  let bestResult = null;
  let lastError = null;

  async function fetchMarketsViaUiPool(rpc) {
    const uiConfig = getAaveUiPoolConfig(chain);
    if (!uiConfig) return null;

    const provider = createJsonRpcProvider(rpc, {
      chain,
      scope: "Aave",
    });
    const uiPoolContract = new ethers.Contract(
      uiConfig.uiPoolDataProvider,
      aaveUiPoolDataProviderAbi,
      provider,
    );

    try {
      const [reserves] = await withTimeout(
        uiPoolContract.getReservesData(uiConfig.poolAddressesProvider),
        aaveMarketFetchTimeoutMs,
        `${chain} Aave UiPool reserves timeout`,
      );
      const markets = (
        await mapWithConcurrency(
          reserves,
          aaveMarketFetchConcurrency,
          async (reserve) => {
            const lendAddress = ethers.getAddress(
              reserve.aTokenAddress || reserve[17],
            );
            const underlyingMeta = getAaveUnderlyingMetaFromUiPool(
              chain,
              reserve,
            );
            const lendMeta = await getTokenMeta(
              provider,
              lendAddress,
              chain,
              venusTokenMetaTimeoutMs,
            );

            return formatAaveMarket({
              chain,
              reserve,
              underlyingMeta,
              lendMeta,
            });
          },
        )
      ).filter(Boolean);

      return {
        rpc,
        source: "uiPool",
        reserveCount: reserves.length,
        fallbackCount: markets.filter((entry) => entry.metaFallback).length,
        markets,
      };
    } finally {
      provider.destroy?.();
    }
  }

  async function fetchMarketsViaPool(rpc) {
    const provider = createJsonRpcProvider(rpc, {
      chain,
      scope: "Aave",
    });
    const poolContract = new ethers.Contract(pool, aavePoolAbi, provider);

    try {
      const reserves = await withTimeout(
        poolContract.getReservesList(),
        aaveMarketFetchTimeoutMs,
        `${chain} Aave reserves timeout`,
      );
      const markets = (
        await mapWithConcurrency(
          reserves,
          aaveMarketFetchConcurrency,
          async (underlyingAddress) => {
            const reserve = await withTimeout(
              poolContract.getReserveData(underlyingAddress),
              aaveTokenMetaTimeoutMs,
              `${chain} Aave reserve timeout`,
            ).catch(() => null);
            if (!reserve) return null;

            const lendAddress = ethers.getAddress(
              reserve.aTokenAddress || reserve[8],
            );
            const [underlyingMeta, lendMeta] = await Promise.all([
              getTokenMeta(
                provider,
                underlyingAddress,
                chain,
                venusTokenMetaTimeoutMs,
              ),
              getTokenMeta(
                provider,
                lendAddress,
                chain,
                venusTokenMetaTimeoutMs,
              ),
            ]);

            return formatAaveMarket({
              chain,
              reserve,
              underlyingMeta,
              lendMeta,
            });
          },
        )
      ).filter(Boolean);

      return {
        rpc,
        source: "pool",
        reserveCount: reserves.length,
        fallbackCount: markets.filter((entry) => entry.metaFallback).length,
        markets,
      };
    } finally {
      provider.destroy?.();
    }
  }

  for (const rpc of rpcList) {
    try {
      let result = await fetchMarketsViaUiPool(rpc).catch((e) => {
        logRpcFailure({ scope: "Aave UiPool", chain, rpc, error: e });
        return null;
      });
      result ||= await fetchMarketsViaPool(rpc);
      if (
        !bestResult ||
        result.markets.length > bestResult.markets.length ||
        (result.markets.length == bestResult.markets.length &&
          result.fallbackCount < bestResult.fallbackCount)
      ) {
        bestResult = result;
      }
      if (
        result.markets.length >= result.reserveCount &&
        result.fallbackCount == 0
      ) {
        break;
      }
    } catch (e) {
      lastError = e;
      logRpcFailure({ scope: "Aave", chain, rpc, error: e });
    }
  }

  if (!bestResult) {
    throw new Error(
      lastError?.shortMessage ||
        lastError?.message ||
        `${chain} Aave markets failed`,
    );
  }

  const markets = bestResult.markets.sort((a, b) =>
    a.underlyingCoin.localeCompare(b.underlyingCoin),
  );
  const at = Date.now();
  setDiscoveryCacheMapEntry(aaveMarketCacheM, cacheKey, {
    at,
    pool,
    rpc: bestResult.rpc,
    markets,
  });

  return {
    ok: true,
    chain,
    pool,
    rpc: bestResult.rpc,
    markets,
    cache: makeDiscoveryCacheMeta({ source: "api", at, ttlMs: discoveryCacheMs }),
  };
}

export async function getAaveSupportedChains() {
  return {
    ok: true,
    chains: getAaveSupportedChainRows(),
  };
}

function getAavePool(chain = "", lendCoin = "") {
  const coinPool =
    coinM?.[chain]?.[lendCoin]?.aavePool || coinM?.[chain]?.[lendCoin]?.pool;
  const pool = ethers.isAddress(coinPool || "")
    ? coinPool
    : aaveV3PoolM[coinPool] || aaveV3PoolM[chain];
  if (!pool) throw new Error(`Aave not configured: ${coinPool || chain}`);

  return ethers.getAddress(pool);
}

function getAaveAmount({
  chain = "",
  coin = "",
  amount = "",
  decimals,
  withdrawAll = false,
} = {}) {
  if (withdrawAll) return ethers.MaxUint256;

  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

async function assertAaveMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  lendAddress = "",
} = {}) {
  const underlying = ethers.isAddress(underlyingAddress)
    ? ethers.getAddress(underlyingAddress)
    : getEvmTokenAddress(chain, underlyingCoin, "Aave underlying");
  const aTokenAddress = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress)
    : getEvmTokenAddress(chain, lendCoin, "Aave token");
  const aToken = new ethers.Contract(aTokenAddress, aTokenAbi, provider);
  const actualUnderlying = ethers.getAddress(
    await aToken.UNDERLYING_ASSET_ADDRESS(),
  );

  if (actualUnderlying != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  return { underlying, aTokenAddress };
}

export async function getAaveMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = 18,
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress))
    throw new Error("EVM wallet address required");
  if (!ethers.isAddress(underlyingAddress))
    throw new Error("underlying address invalid");
  if (!ethers.isAddress(lendAddress))
    throw new Error("Aave token address invalid");

  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave",
  });

  try {
    const owner = ethers.getAddress(walletAddress);
    const [underlyingRaw, lendRaw] = await Promise.all([
      new ethers.Contract(underlyingAddress, erc20Abi, provider).balanceOf(
        owner,
      ),
      new ethers.Contract(lendAddress, erc20Abi, provider).balanceOf(owner),
    ]);

    return {
      ok: true,
      chain,
      walletAddress: owner,
      underlying: {
        address: ethers.getAddress(underlyingAddress),
        raw: underlyingRaw.toString(),
        balance: ethers.formatUnits(underlyingRaw, underlyingDecimals),
        decimals: underlyingDecimals,
      },
      lend: {
        address: ethers.getAddress(lendAddress),
        raw: lendRaw.toString(),
        balance: ethers.formatUnits(lendRaw, lendDecimals),
        decimals: lendDecimals,
      },
    };
  } finally {
    provider.destroy?.();
  }
}

export async function getAaveLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  amount = "",
  withdrawAll = false,
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress))
    throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({
    chain,
    coin: underlyingCoin,
    amount,
    decimals: underlyingDecimals,
    withdrawAll: action == "redeem" && withdrawAll,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave",
  });

  try {
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
    });
    const allowance =
      action == "redeem"
        ? amountIn
        : BigInt(
            await new ethers.Contract(underlying, erc20Abi, provider).allowance(
              walletAddress,
              pool,
            ),
          );

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      approvalNeeded: action != "redeem" && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      withdrawAll: action == "redeem" && withdrawAll,
      pool,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildAaveLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  amount = "",
  approvalAmount = "",
  withdrawAll = false,
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress))
    throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = chainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({
    chain,
    coin: underlyingCoin,
    amount,
    decimals: underlyingDecimals,
    withdrawAll: action == "redeem" && withdrawAll,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave",
  });

  try {
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
    });
    const txs = [];

    if (action == "redeem") {
      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "redeem",
          txData: {
            to: pool,
            data: aavePoolInterface.encodeFunctionData("withdraw", [
              underlying,
              amountIn,
              ethers.getAddress(walletAddress),
            ]),
            value: "0",
          },
        }),
      );
    } else {
      const allowance = BigInt(
        await new ethers.Contract(underlying, erc20Abi, provider).allowance(
          walletAddress,
          pool,
        ),
      );
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        defaultAmount: amountIn,
        decimals: underlyingDecimals,
      });

      if (allowance < amountIn && approveAmount != null) {
        if (allowance > 0n) {
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: underlying,
              spender: pool,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: underlying,
            spender: pool,
            amount: approveAmount,
          }),
        );
      }

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "lend",
          txData: {
            to: pool,
            data: aavePoolInterface.encodeFunctionData("supply", [
              underlying,
              amountIn,
              ethers.getAddress(walletAddress),
              0,
            ]),
            value: "0",
          },
        }),
      );
    }

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      withdrawAll: action == "redeem" && withdrawAll,
      pool,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeAaveLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  amount = "",
  approvalAmount = "",
  withdrawAll = false,
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress))
    throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_raw_${walletName} or pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({
    chain,
    coin: underlyingCoin,
    amount,
    decimals: underlyingDecimals,
    withdrawAll: action == "redeem" && withdrawAll,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave",
  });

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
    });
    const poolContract = new ethers.Contract(pool, aavePoolAbi, wallet);
    const txs = [];

    if (action == "redeem") {
      const redeemTx = await poolContract.withdraw(
        underlying,
        amountIn,
        wallet.address,
      );
      const receipt = await redeemTx.wait();
      txs.push({
        chain,
        type: "redeem",
        hash: redeemTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else {
      const token = new ethers.Contract(underlying, erc20Abi, wallet);
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        decimals: underlyingDecimals,
      });
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: pool,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );

      const lendTx = await poolContract.supply(
        underlying,
        amountIn,
        wallet.address,
        0,
      );
      const receipt = await lendTx.wait();
      txs.push({
        chain,
        type: "lend",
        hash: lendTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    }

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      withdrawAll: action == "redeem" && withdrawAll,
      pool,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}
