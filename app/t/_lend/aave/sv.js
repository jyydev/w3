"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { chainIds } from "@/data/basic";
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

const aaveV3PoolM = {
  Ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  EthereumEtherFi: "0x0AA97c284e98396202b6A04024F5E2c65026F3c0",
  EthereumHorizon: "0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8",
  EthereumLido: "0x4e033931ad43597d96D6bcc25c280717730B58B1",
  BSC: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
  BNB: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
  Arbitrum: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Avalanche: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Optimism: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Base: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  Polygon: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Celo: "0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402",
  Fantom: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Gnosis: "0xb50201558B00496A145fE76f7424749556E326D8",
  Harmony: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Ink: "0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA",
  Linea: "0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac",
  Mantle: "0x458F293454fE0d67EC0655f3672301301DD51422",
  MegaEth: "0x7e324AbC5De01d112AfC03a584966ff199741C28",
  Metis: "0x90df02551bB792286e8D4f13E0e357b4Bf1D6a57",
  Monad: "0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef",
  Plasma: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
  Scroll: "0x11fCfe756c05AD438e312a7fd934381537D3cFfe",
  Soneium: "0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B",
  Sonic: "0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3",
  XLayer: "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116",
  ZkSync: "0x78e30497a3c7527d953c6B1E3541b021A98Ac43c",
  zkSyncEra: "0x78e30497a3c7527d953c6B1E3541b021A98Ac43c",
};
const aaveV3PoolAddressesProviderM = {
  Ethereum: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
  BSC: "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D",
  BNB: "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D",
  Arbitrum: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  Avalanche: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  Optimism: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  Base: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  Polygon: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  Celo: "0x9F7Cf9417D5251C59fE94fB9147feEe1aAd9Cea5",
  Fantom: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  Gnosis: "0x36616cf17557639614c1cdDb356b1B83fc0B2132",
  Harmony: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  Linea: "0x89502c3731F69DDC95B65753708A07F8Cd0373F4",
  Mantle: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
  Metis: "0xB9FABd7500B2C6781c35Dd48d54f81fc2299D7AF",
  Monad: "0x34793Fb9935F7bB5E5aE920fb963F39063E7A615",
  Scroll: "0x69850D0B276776781C063771b161bd8894BCdD04",
  Soneium: "0x82405D1a189bd6cE4667809C35B37fBE136A4c5B",
  Sonic: "0x5C2e738F6E27bCE0F7558051Bf90605dD6176900",
  XLayer: "0xdFf435BCcf782f11187D3a4454d96702eD78e092",
  ZkSync: "0x2A3948BB219D6B2Fa83D64100006391a96bE6cb7",
  zkSyncEra: "0x2A3948BB219D6B2Fa83D64100006391a96bE6cb7",
};
const aaveV3UiPoolDataProviderM = {
  Ethereum: "0x2dAd8162A989cd99D673dE4425Bb2298Db1E1aA2",
  BSC: "0x68100bD5345eA474D93577127C11F39FF8463e93",
  BNB: "0x68100bD5345eA474D93577127C11F39FF8463e93",
  Arbitrum: "0x91E04cf78e53aEBe609e8a7f2003e7EECD743F2B",
  Avalanche: "0xFBa4Df643205c5400BC3e05a1E67E0dFaEeeb41F",
  Optimism: "0x68100bD5345eA474D93577127C11F39FF8463e93",
  Base: "0x0C6BC4a12039788be08F87e87Cff87FEDbd1D386",
  Polygon: "0x66E1aBdb06e7363a618D65a910c540dfED23754f",
  Celo: "0xc851e6147dcE6A469CC33BE3121b6B2D4CaD2763",
  Fantom: "0xddf65434502E459C22263BE2ed7cF0f1FaFD44c0",
  Gnosis: "0x0C6BC4a12039788be08F87e87Cff87FEDbd1D386",
  Harmony: "0xeC6118C69af50660231108059ab98CD0cF9a6eA1",
  Linea: "0xc851e6147dcE6A469CC33BE3121b6B2D4CaD2763",
  Mantle: "0xc851e6147dcE6A469CC33BE3121b6B2D4CaD2763",
  Metis: "0x5c5228aC8BC1528482514aF3e27E692495148717",
  Monad: "0xa7D38785be3422c25677A8aa4a44D3a0853A3a17",
  Scroll: "0xE28E2c8d240dd5eBd0adcab86fbD79df7a052034",
  Soneium: "0xc851e6147dcE6A469CC33BE3121b6B2D4CaD2763",
  Sonic: "0xE28E2c8d240dd5eBd0adcab86fbD79df7a052034",
  XLayer: "0xc851e6147dcE6A469CC33BE3121b6B2D4CaD2763",
  ZkSync: "0x756Ff6722543F12d25396Ea646B0F2C96dA70c3e",
  zkSyncEra: "0x756Ff6722543F12d25396Ea646B0F2C96dA70c3e",
};
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
