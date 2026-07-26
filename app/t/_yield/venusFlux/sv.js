"use server";

import { ethers } from "ethers";
import { chainIds } from "@/data/basic";
import {
  venusErc4626Abi,
  venusFluxTokenMetaTimeoutMs,
} from "@/app/_shared/venus";
import {
  clearVenusFluxRuntimeCache as clearSharedVenusFluxRuntimeCache,
  getVenusFluxAllMarkets as getSharedVenusFluxAllMarkets,
  getVenusFluxExchangeRate,
} from "@/app/_shared/venus/flux";
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
  withTimeout,
} from "../shared";

const erc4626Interface = new ethers.Interface(venusErc4626Abi);

function getVenusFluxToken(chain = "", lendCoin = "") {
  return getEvmTokenAddress(chain, lendCoin, "Venus Flux token");
}

function getVenusFluxAmount({
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  underlyingDecimals,
  lendDecimals,
} = {}) {
  const coin = action == "redeem" ? lendCoin : underlyingCoin;
  const decimals = action == "redeem" ? lendDecimals : underlyingDecimals;
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

async function assertVenusFluxMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
} = {}) {
  const vTokenAddress = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress)
    : getVenusFluxToken(chain, lendCoin);
  const vault = new ethers.Contract(
    vTokenAddress,
    venusErc4626Abi,
    provider,
  );
  const actualUnderlying = ethers.getAddress(
    await withTimeout(
      vault.asset(),
      venusFluxTokenMetaTimeoutMs,
      "Venus Flux asset timeout",
    ),
  );
  const configuredUnderlying = ethers.isAddress(underlyingAddress)
    ? ethers.getAddress(underlyingAddress)
    : getEvmTokenAddress(chain, underlyingCoin, "Venus Flux underlying");

  if (actualUnderlying != configuredUnderlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  return {
    underlying: actualUnderlying,
    vTokenAddress,
    vault,
    ...(await getVenusFluxExchangeRate({
      vault,
      underlyingDecimals: Number.isInteger(underlyingDecimals)
        ? underlyingDecimals
        : getCoinDecimals(chain, underlyingCoin),
      lendDecimals: Number.isInteger(lendDecimals)
        ? lendDecimals
        : getCoinDecimals(chain, lendCoin),
    })),
  };
}

export async function clearVenusFluxRuntimeCache() {
  return clearSharedVenusFluxRuntimeCache();
}

export async function getVenusFluxAllMarkets(options = {}) {
  return getSharedVenusFluxAllMarkets(options);
}

export async function getVenusFluxMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = 18,
} = {}) {
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Venus Flux is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");
  if (!ethers.isAddress(underlyingAddress)) throw new Error("underlying address invalid");
  if (!ethers.isAddress(lendAddress)) throw new Error("Venus Flux token address invalid");

  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus Flux",
  });

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

export async function getVenusFluxLendPreview({
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
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Venus Flux is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getVenusFluxAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus Flux",
  });

  try {
    const market = await assertVenusFluxMarket({
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
      defi: "Venus Flux",
      chain,
      action,
      approvalNeeded: action != "redeem" && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      underlyingPerReceipt: market.underlyingPerReceipt,
      receiptPerUnderlying: market.receiptPerUnderlying,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildVenusFluxLendTxs({
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
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Venus Flux is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = chainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const amountIn = getVenusFluxAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus Flux",
  });

  try {
    const market = await assertVenusFluxMarket({
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
            data: erc4626Interface.encodeFunctionData("redeem", [
              amountIn,
              ethers.getAddress(walletAddress),
              ethers.getAddress(walletAddress),
            ]),
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
            data: erc4626Interface.encodeFunctionData("deposit", [
              amountIn,
              ethers.getAddress(walletAddress),
            ]),
            value: "0",
          },
        }),
      );
    }

    return {
      ok: true,
      defi: "Venus Flux",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeVenusFluxLend({
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
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Venus Flux is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_raw_${walletName} or pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getVenusFluxAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus Flux",
  });

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const market = await assertVenusFluxMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
    });
    const vault = new ethers.Contract(
      market.vTokenAddress,
      venusErc4626Abi,
      wallet,
    );
    const txs = [];

    if (action == "redeem") {
      const redeemTx = await vault.redeem(amountIn, wallet.address, wallet.address);
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

      const lendTx = await vault.deposit(amountIn, wallet.address);
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
      defi: "Venus Flux",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}
