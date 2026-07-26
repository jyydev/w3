"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { chainIds } from "@/data/basic";
import {
  getVenusExchangeRate,
  venusTokenAbi,
} from "@/app/_shared/venus";
import {
  clearVenusRuntimeCache as clearSharedVenusRuntimeCache,
  getVenusAllMarkets as getSharedVenusAllMarkets,
  getVenusSupportedChains as getSharedVenusSupportedChains,
} from "@/app/_shared/venus/lending";
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
  logRpcFailure,
  withTimeout,
} from "../shared";

const venusTokenInterface = new ethers.Interface(venusTokenAbi);

async function getVenusTokenBalance({
  provider,
  address = "",
  owner = "",
  chain = "",
  rpc = "",
  label = "token",
}) {
  try {
    return await new ethers.Contract(
      address,
      erc20Abi,
      provider,
    ).balanceOf(owner);
  } catch (e) {
    logRpcFailure({
      scope: `Venus ${label} balance`,
      chain,
      rpc,
      error: e,
    });
    return 0n;
  }
}

function getVenusFallbackExchangeRateRaw(value) {
  try {
    const raw = BigInt(value || 0);
    return raw >= 0n ? raw : 0n;
  } catch {
    return 0n;
  }
}

function getVenusToken(chain = "", lendCoin = "") {
  return getEvmTokenAddress(chain, lendCoin, "Venus token");
}

export async function getVenusSupportedChains() {
  return getSharedVenusSupportedChains();
}

export async function clearVenusRuntimeCache() {
  return clearSharedVenusRuntimeCache();
}

export async function getVenusAllMarkets(options = {}) {
  return getSharedVenusAllMarkets(options);
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

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus",
  });

  try {
    const owner = ethers.getAddress(walletAddress);
    const [underlyingRaw, lendRaw] = await Promise.all([
      getVenusTokenBalance({
        provider,
        address: underlyingAddress,
        owner,
        chain,
        rpc,
        label: "underlying",
      }),
      getVenusTokenBalance({
        provider,
        address: lendAddress,
        owner,
        chain,
        rpc,
        label: "receipt",
      }),
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

function sameVenusText(a = "", b = "") {
  return (
    String(a || "").trim().toLowerCase() ==
    String(b || "").trim().toLowerCase()
  );
}

async function resolveVenusMarket({
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  lendAddress = "",
} = {}) {
  const addressKey = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress).toLowerCase()
    : "";
  const res = await getVenusAllMarkets({ chain }).catch(() => null);
  const markets = Array.isArray(res?.markets) ? res.markets : [];

  return (
    markets.find(
      (entry) =>
        addressKey &&
        ethers.isAddress(entry.lendAddress) &&
        ethers.getAddress(entry.lendAddress).toLowerCase() == addressKey,
    ) ||
    markets.find(
      (entry) =>
        sameVenusText(entry.lendCoin, lendCoin) &&
        (!underlyingCoin ||
          sameVenusText(entry.underlyingCoin, underlyingCoin)),
    ) ||
    null
  );
}

async function assertVenusMarket({
  provider,
  rpc = "",
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  exchangeRateRaw,
} = {}) {
  const needsResolvedMarket =
    !ethers.isAddress(underlyingAddress) ||
    !ethers.isAddress(lendAddress) ||
    !Number.isInteger(underlyingDecimals) ||
    !Number.isInteger(lendDecimals);
  const resolvedMarket = needsResolvedMarket
    ? await resolveVenusMarket({
      chain,
      underlyingCoin,
      lendCoin,
      lendAddress,
    })
    : null;
  if (
    needsResolvedMarket &&
    !resolvedMarket &&
    (!coinM?.[chain]?.[underlyingCoin] || !coinM?.[chain]?.[lendCoin])
  ) {
    throw new Error(
      `${chain} Venus market not found: ${underlyingCoin}-${lendCoin}`,
    );
  }
  const resolvedUnderlyingAddress = ethers.isAddress(underlyingAddress)
    ? underlyingAddress
    : resolvedMarket?.underlyingAddress;
  const resolvedLendAddress = ethers.isAddress(lendAddress)
    ? lendAddress
    : resolvedMarket?.lendAddress;
  const finalUnderlyingDecimals = Number.isInteger(underlyingDecimals)
    ? underlyingDecimals
    : resolvedMarket?.underlyingDecimals;
  const finalLendDecimals = Number.isInteger(lendDecimals)
    ? lendDecimals
    : resolvedMarket?.lendDecimals;
  const underlying = ethers.isAddress(resolvedUnderlyingAddress)
    ? ethers.getAddress(resolvedUnderlyingAddress)
    : getEvmTokenAddress(chain, underlyingCoin, "Venus underlying");
  const vTokenAddress = ethers.isAddress(resolvedLendAddress)
    ? ethers.getAddress(resolvedLendAddress)
    : getVenusToken(chain, lendCoin);
  const vToken = new ethers.Contract(vTokenAddress, venusTokenAbi, provider);
  const [actualUnderlyingResult, exchangeRateResult] =
    await Promise.allSettled([
      vToken.underlying(),
      vToken.exchangeRateStored(),
    ]);
  const finalExchangeRateRaw =
    exchangeRateResult.status == "fulfilled"
      ? BigInt(exchangeRateResult.value)
      : getVenusFallbackExchangeRateRaw(
          exchangeRateRaw ?? resolvedMarket?.exchangeRateRaw,
        );
  if (exchangeRateResult.status != "fulfilled") {
    logRpcFailure({
      scope: "Venus exchange rate",
      chain,
      rpc,
      error: exchangeRateResult.reason,
    });
  }
  const actualUnderlying =
    actualUnderlyingResult.status == "fulfilled" &&
    ethers.isAddress(actualUnderlyingResult.value)
      ? ethers.getAddress(actualUnderlyingResult.value)
      : underlying;

  if (actualUnderlying != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  const underlyingPerReceipt = getVenusExchangeRate({
    rateRaw: finalExchangeRateRaw,
    underlyingDecimals: Number.isInteger(finalUnderlyingDecimals)
      ? finalUnderlyingDecimals
      : getCoinDecimals(chain, underlyingCoin),
    receiptDecimals: Number.isInteger(finalLendDecimals)
      ? finalLendDecimals
      : getCoinDecimals(chain, lendCoin),
  });

  return {
    underlying,
    vTokenAddress,
    underlyingDecimals: finalUnderlyingDecimals,
    lendDecimals: finalLendDecimals,
    exchangeRateRaw: finalExchangeRateRaw,
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
  exchangeRateRaw,
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus",
  });

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
      exchangeRateRaw,
      rpc,
    });
    const amountIn = getVenusAmount({
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amount,
      underlyingDecimals: market.underlyingDecimals ?? underlyingDecimals,
      lendDecimals: market.lendDecimals ?? lendDecimals,
    });
    const allowance =
      action == "redeem"
        ? amountIn
        : BigInt(
            await new ethers.Contract(
              market.underlying,
              erc20Abi,
              provider,
            )
              .allowance(walletAddress, market.vTokenAddress)
              .catch((e) => {
                logRpcFailure({
                  scope: "Venus allowance",
                  chain,
                  rpc,
                  error: e,
                });
                return 0n;
              }),
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
  exchangeRateRaw,
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = chainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus",
  });

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
      exchangeRateRaw,
      rpc,
    });
    const amountIn = getVenusAmount({
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amount,
      underlyingDecimals: market.underlyingDecimals ?? underlyingDecimals,
      lendDecimals: market.lendDecimals ?? lendDecimals,
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
        decimals: market.underlyingDecimals ?? underlyingDecimals,
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
  exchangeRateRaw,
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_raw_${walletName} or pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus",
  });

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
      exchangeRateRaw,
      rpc,
    });
    const amountIn = getVenusAmount({
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amount,
      underlyingDecimals: market.underlyingDecimals ?? underlyingDecimals,
      lendDecimals: market.lendDecimals ?? lendDecimals,
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
        decimals: market.underlyingDecimals ?? underlyingDecimals,
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
