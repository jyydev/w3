"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
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
  relayChainIds,
} from "../sharedServer";
import {
  getCoinByAddress,
  getTokenMeta,
  getUsableChainRpcs,
  mapWithConcurrency,
  withTimeout,
} from "./shared";

const venusTokenAbi = [
  "function comptroller() view returns (address)",
  "function underlying() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function mint(uint256 mintAmount) returns (uint256)",
  "function redeem(uint256 redeemTokens) returns (uint256)",
];
const venusComptrollerAbi = [
  "function getAllMarkets() view returns (address[])",
];
const venusTokenInterface = new ethers.Interface(venusTokenAbi);
const venusMarketFetchTimeoutMs = 15000;
const venusTokenMetaTimeoutMs = 8000;
const venusMarketFetchConcurrency = 8;
const venusGoodMarketRatio = 0.8;
const venusBlocksPerYearM = {
  Arbitrum: 126144000,
  BSC: 10512000,
  Ethereum: 2628000,
  Optimism: 15768000,
  zkSyncEra: 31536000,
};

function getVenusRateApr(rate = 0n, multiplier = 0) {
  try {
    if (!multiplier) return 0;
    const rawRate = Number(ethers.formatUnits(BigInt(rate || 0), 18));
    const apr = rawRate * multiplier * 100;
    return Number.isFinite(apr) ? apr : 0;
  } catch {
    return 0;
  }
}

async function getVenusSupplyApr(vToken, chain = "") {
  const blocksPerYear = venusBlocksPerYearM[chain] || 2628000;
  const blockRate = await withTimeout(
    vToken.supplyRatePerBlock(),
    venusTokenMetaTimeoutMs,
    `${chain} Venus supply APR timeout`,
  ).catch(() => null);
  if (blockRate !== null) return getVenusRateApr(blockRate, blocksPerYear);

  const timestampRate = await withTimeout(
    vToken.supplyRatePerTimestamp(),
    venusTokenMetaTimeoutMs,
    `${chain} Venus supply APR timeout`,
  ).catch(() => null);
  if (timestampRate !== null) return getVenusRateApr(timestampRate, 31536000);

  return 0;
}

function getVenusToken(chain = "", lendCoin = "") {
  return getEvmTokenAddress(chain, lendCoin, "Venus token");
}

function getSavedVenusMarkets(chain = "") {
  return Object.entries(coinM?.[chain] || {}).filter(([coin, coinE]) => {
    const text = `${coin} ${coinE?.name || ""}`.toLowerCase();
    return (
      coinE?.type == "lend" &&
      ethers.isAddress(coinE?.address || "") &&
      (/^v[A-Z]/.test(coin) || (text.includes("venus") && !/^f[A-Z]/.test(coin)))
    );
  });
}

export async function getVenusAllMarkets({ chain = "" } = {}) {
  if (chain == "Solana") return { ok: true, chain, markets: [] };

  const rpcList = getUsableChainRpcs(chain);
  if (!rpcList.length) throw new Error(`rpc not configured: ${chain}`);

  const savedMarkets = getSavedVenusMarkets(chain);
  if (!savedMarkets.length) {
    return { ok: true, chain, markets: [] };
  }

  let bestResult = null;
  let lastError = null;

  async function fetchMarkets(rpc) {
    const provider = new ethers.JsonRpcProvider(rpc);

    try {
      const comptrollers = [
        ...new Set(
          (
            await Promise.all(
              savedMarkets.map(async ([, coinE]) =>
                withTimeout(
                  new ethers.Contract(
                    coinE.address,
                    venusTokenAbi,
                    provider,
                  ).comptroller(),
                  venusTokenMetaTimeoutMs,
                  `${chain} Venus comptroller timeout`,
                ).catch(() => ""),
              ),
            )
          )
            .filter((address) => ethers.isAddress(address))
            .map((address) => ethers.getAddress(address)),
        ),
      ];
      const marketAddresses = [
        ...new Set(
          (
            await Promise.all(
              comptrollers.map(async (comptroller) =>
                withTimeout(
                  new ethers.Contract(
                    comptroller,
                    venusComptrollerAbi,
                    provider,
                  ).getAllMarkets(),
                  venusMarketFetchTimeoutMs,
                  `${chain} Venus markets timeout`,
                ).catch(() => []),
              ),
            )
          )
            .flat()
            .filter((address) => ethers.isAddress(address))
            .map((address) => ethers.getAddress(address)),
        ),
      ];
      const markets = (
        await mapWithConcurrency(
          marketAddresses,
          venusMarketFetchConcurrency,
          async (lendAddress) => {
            const vToken = new ethers.Contract(lendAddress, venusTokenAbi, provider);
            const underlyingAddress = await withTimeout(
              vToken.underlying(),
              venusTokenMetaTimeoutMs,
              `${chain} Venus underlying timeout`,
            ).catch(() => "");
            if (!ethers.isAddress(underlyingAddress)) return null;

            const [exchangeRateRaw, supplyApr] = await Promise.all([
              withTimeout(
                vToken.exchangeRateStored(),
                venusTokenMetaTimeoutMs,
                `${chain} Venus exchange rate timeout`,
              ).catch(() => 0n),
              getVenusSupplyApr(vToken, chain),
            ]);
            const [underlyingMeta, lendMeta] = await Promise.all([
              getTokenMeta(provider, underlyingAddress, chain),
              getTokenMeta(provider, lendAddress, chain),
            ]);
            const addedUnderlying = getCoinByAddress(chain, underlyingMeta.address);
            const addedLend = getCoinByAddress(chain, lendMeta.address);
            const underlyingPerReceipt = getVenusExchangeRate({
              rateRaw: BigInt(exchangeRateRaw),
              underlyingDecimals: underlyingMeta.decimals,
              receiptDecimals: lendMeta.decimals,
            });
            const metaFallback = !!underlyingMeta.fallback || !!lendMeta.fallback;

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
              exchangeRateRaw: BigInt(exchangeRateRaw).toString(),
              underlyingPerReceipt,
              receiptPerUnderlying: underlyingPerReceipt
                ? 1 / underlyingPerReceipt
                : 0,
              addedUnderlying: !!addedUnderlying,
              addedLend: !!addedLend,
              supplyApr,
              metaFallback,
            };
          },
        )
      ).filter(Boolean);

      return {
        rpc,
        marketCount: marketAddresses.length,
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
        result.markets.length >=
          Math.max(1, Math.floor(result.marketCount * venusGoodMarketRatio)) &&
        result.fallbackCount == 0
      ) {
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!bestResult) {
    throw new Error(
      lastError?.shortMessage ||
        lastError?.message ||
        `${chain} Venus markets failed`,
    );
  }

  return {
    ok: true,
    chain,
    rpc: bestResult.rpc,
    markets: bestResult.markets.sort((a, b) =>
      a.underlyingCoin.localeCompare(b.underlyingCoin),
    ),
  };
}

export async function getVenusMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = 8,
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");
  if (!ethers.isAddress(underlyingAddress)) throw new Error("underlying address invalid");
  if (!ethers.isAddress(lendAddress)) throw new Error("Venus token address invalid");

  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const owner = ethers.getAddress(walletAddress);
    const [underlyingRaw, lendRaw] = await Promise.all([
      new ethers.Contract(underlyingAddress, erc20Abi, provider).balanceOf(owner),
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

function getVenusAmount({
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  underlyingDecimals,
  lendDecimals,
} = {}) {
  const coin = action == "redeem" ? lendCoin : underlyingCoin;
  const decimals =
    action == "redeem"
      ? lendDecimals
      : underlyingDecimals;
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

function getVenusExchangeRate({
  rateRaw = 0n,
  underlyingDecimals = 18,
  receiptDecimals = 8,
} = {}) {
  const scaleDecimals = 18 + underlyingDecimals - receiptDecimals;
  if (scaleDecimals < 0) return Number(rateRaw) * 10 ** Math.abs(scaleDecimals);

  return Number(ethers.formatUnits(rateRaw, scaleDecimals));
}

async function assertVenusMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
} = {}) {
  const underlying = ethers.isAddress(underlyingAddress)
    ? ethers.getAddress(underlyingAddress)
    : getEvmTokenAddress(chain, underlyingCoin, "Venus underlying");
  const vTokenAddress = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress)
    : getVenusToken(chain, lendCoin);
  const vToken = new ethers.Contract(vTokenAddress, venusTokenAbi, provider);
  const [actualUnderlying, exchangeRateRaw] = await Promise.all([
    vToken.underlying(),
    vToken.exchangeRateStored(),
  ]);

  if (ethers.getAddress(actualUnderlying) != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  const underlyingPerReceipt = getVenusExchangeRate({
    rateRaw: BigInt(exchangeRateRaw),
    underlyingDecimals: Number.isInteger(underlyingDecimals)
      ? underlyingDecimals
      : getCoinDecimals(chain, underlyingCoin),
    receiptDecimals: Number.isInteger(lendDecimals)
      ? lendDecimals
      : getCoinDecimals(chain, lendCoin),
  });

  return {
    underlying,
    vTokenAddress,
    exchangeRateRaw: BigInt(exchangeRateRaw),
    underlyingPerReceipt,
    receiptPerUnderlying: underlyingPerReceipt ? 1 / underlyingPerReceipt : 0,
  };
}

export async function getVenusLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
    });
    const allowance =
      action == "redeem"
        ? amountIn
        : BigInt(
            await new ethers.Contract(
              market.underlying,
              erc20Abi,
              provider,
            ).allowance(walletAddress, market.vTokenAddress),
          );

    return {
      ok: true,
      defi: "Venus",
      chain,
      action,
      approvalNeeded: action != "redeem" && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      underlyingPerReceipt: market.underlyingPerReceipt,
      receiptPerUnderlying: market.receiptPerUnderlying,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildVenusLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
    });
    const txs = [];

    if (action == "redeem") {
      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "redeem",
          txData: {
            to: market.vTokenAddress,
            data: venusTokenInterface.encodeFunctionData("redeem", [amountIn]),
            value: "0",
          },
        }),
      );
    } else {
      const allowance = BigInt(
        await new ethers.Contract(
          market.underlying,
          erc20Abi,
          provider,
        ).allowance(walletAddress, market.vTokenAddress),
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
              token: market.underlying,
              spender: market.vTokenAddress,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: market.underlying,
            spender: market.vTokenAddress,
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
            to: market.vTokenAddress,
            data: venusTokenInterface.encodeFunctionData("mint", [amountIn]),
            value: "0",
          },
        }),
      );
    }

    return {
      ok: true,
      defi: "Venus",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeVenusLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
    });
    const vToken = new ethers.Contract(market.vTokenAddress, venusTokenAbi, wallet);
    const txs = [];

    if (action == "redeem") {
      const redeemTx = await vToken.redeem(amountIn);
      const receipt = await redeemTx.wait();
      txs.push({
        chain,
        type: "redeem",
        hash: redeemTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else {
      const token = new ethers.Contract(market.underlying, erc20Abi, wallet);
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
          spender: market.vTokenAddress,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );

      const lendTx = await vToken.mint(amountIn);
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
      defi: "Venus",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}
