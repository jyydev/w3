"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { chainIds } from "@/data/basic";
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
const aavePoolAbi = [
  "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
  "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
  "function getReservesList() view returns (address[])",
  "function getReserveData(address asset) view returns (tuple(uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))",
];
const aTokenAbi = [
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
];
const aavePoolInterface = new ethers.Interface(aavePoolAbi);
const aaveMarketFetchTimeoutMs = 20000;
const aaveTokenMetaTimeoutMs = 10000;
const aaveMarketFetchConcurrency = 3;
const venusTokenMetaTimeoutMs = 8000;

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

export async function getAaveAllMarkets({ chain = "" } = {}) {
  if (chain == "Solana") return { ok: true, chain, markets: [] };

  const pool = getAavePool(chain);
  const rpcList = getUsableChainRpcs(chain);
  if (!rpcList.length) throw new Error(`rpc not configured: ${chain}`);
  let bestResult = null;
  let lastError = null;

  async function fetchMarkets(rpc) {
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
            const addedUnderlying = getCoinByAddress(
              chain,
              underlyingMeta.address,
            );
            const addedLend = getCoinByAddress(chain, lendMeta.address);
            const metaFallback =
              !!underlyingMeta.fallback || !!lendMeta.fallback;

            return {
              value: `${underlyingMeta.symbol}:${lendMeta.symbol}:${lendMeta.address}`,
              chain,
              underlyingCoin: addedUnderlying?.[0] || underlyingMeta.symbol,
              underlyingName: underlyingMeta.name || underlyingMeta.symbol,
              underlyingAddress: underlyingMeta.address,
              underlyingDecimals: underlyingMeta.decimals,
              lendCoin: addedLend?.[0] || lendMeta.symbol,
              lendName: lendMeta.name || lendMeta.symbol,
              lendAddress: lendMeta.address,
              lendDecimals: lendMeta.decimals,
              addedUnderlying: !!addedUnderlying,
              addedLend: !!addedLend,
              supplyApr: getAaveRateApr(
                reserve.currentLiquidityRate || reserve[2],
              ),
              variableBorrowApr: getAaveRateApr(
                reserve.currentVariableBorrowRate || reserve[4],
              ),
              metaFallback,
            };
          },
        )
      ).filter(Boolean);

      return {
        rpc,
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
      const result = await fetchMarkets(rpc);
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

  return {
    ok: true,
    chain,
    pool,
    rpc: bestResult.rpc,
    markets: bestResult.markets.sort((a, b) =>
      a.underlyingCoin.localeCompare(b.underlyingCoin),
    ),
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
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

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
