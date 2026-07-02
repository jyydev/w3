"use server";

import { ethers } from "ethers";
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
} from "../../sharedServer";
import {
  getCoinByAddress,
  getTokenMeta,
  getUsableChainRpcs,
  mapWithConcurrency,
  withTimeout,
} from "../shared";

const morphoApiBase =
  process.env.MORPHO_API_BASE ||
  process.env.morpho_api_base ||
  "https://blue-api.morpho.org/graphql";
const morphoChainIds = {
  Ethereum: 1,
  Optimism: 10,
  Polygon: 137,
  Base: 8453,
  Arbitrum: 42161,
};
const erc4626Abi = [
  "function asset() view returns (address)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function deposit(uint256 assets,address receiver) returns (uint256)",
  "function redeem(uint256 shares,address receiver,address owner) returns (uint256)",
];
const erc4626Interface = new ethers.Interface(erc4626Abi);
const morphoVaultFetchTimeoutMs = 15000;
const morphoTokenMetaTimeoutMs = 8000;
const morphoMetaConcurrency = 4;

async function morphoFetch(query, variables = {}, timeoutMs = morphoVaultFetchTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(morphoApiBase, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.errors?.length) {
      throw new Error(
        data?.errors?.[0]?.message || `Morpho request failed: ${res.status}`,
      );
    }

    return data?.data || {};
  } catch (e) {
    if (e?.name == "AbortError") throw new Error("Morpho request timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function getMorphoChainId(chain = "") {
  return morphoChainIds[chain] || relayChainIds[chain];
}

function getMorphoAmount({
  chain = "",
  coin = "",
  amount = "",
  decimals,
} = {}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

function getMorphoSupplyApr(vault = {}) {
  const netApy = Number(
    vault?.state?.netApy ??
      vault?.state?.apy ??
      vault?.netApy ??
      vault?.apy ??
      0,
  );
  return Number.isFinite(netApy) ? netApy * 100 : 0;
}

function getMorphoTotalAssetsUsd(vault = {}) {
  return Number(vault?.state?.totalAssetsUsd ?? vault?.totalAssetsUsd ?? 0);
}

function getMorphoSharePrice(vault = {}) {
  return Number(vault?.state?.sharePriceNumber ?? vault?.sharePrice ?? 0);
}

function getMorphoValue(vault = {}, underlyingMeta = {}, lendMeta = {}) {
  return [
    underlyingMeta.symbol || vault?.asset?.symbol || "",
    lendMeta.symbol || vault?.symbol || "",
    vault?.address || "",
  ].join(":");
}

async function assertMorphoMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  lendAddress = "",
  underlyingDecimals,
  lendDecimals,
} = {}) {
  const underlying = ethers.isAddress(underlyingAddress)
    ? ethers.getAddress(underlyingAddress)
    : getEvmTokenAddress(chain, underlyingCoin, "Morpho underlying");
  const vaultAddress = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress)
    : getEvmTokenAddress(chain, lendCoin, "Morpho vault");
  const vault = new ethers.Contract(vaultAddress, erc4626Abi, provider);
  const actualUnderlying = ethers.getAddress(
    await withTimeout(
      vault.asset(),
      morphoTokenMetaTimeoutMs,
      `${chain} Morpho asset timeout`,
    ),
  );

  if (actualUnderlying != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  let receiptPerUnderlying = 1;
  if (Number.isInteger(underlyingDecimals) && Number.isInteger(lendDecimals)) {
    const oneUnderlying = ethers.parseUnits("1", underlyingDecimals);
    const shares = await withTimeout(
      vault.convertToShares(oneUnderlying),
      morphoTokenMetaTimeoutMs,
      `${chain} Morpho convertToShares timeout`,
    ).catch(() => 0n);
    receiptPerUnderlying = shares
      ? Number(ethers.formatUnits(shares, lendDecimals))
      : 1;
  }

  return { underlying, vaultAddress, receiptPerUnderlying };
}

export async function getMorphoAllMarkets({ chain = "" } = {}) {
  if (chain == "Solana") return { ok: true, chain, markets: [] };

  const chainId = getMorphoChainId(chain);
  if (!chainId) return { ok: true, chain, markets: [] };

  const data = await morphoFetch(
    `query($chainId:Int!){
      vaults(
        first: 500
        orderBy: TotalAssetsUsd
        orderDirection: Desc
        where: { listed: true, chainId_in: [$chainId] }
      ) {
        items {
          address
          symbol
          name
          asset { address symbol name decimals }
          state { netApy apy totalAssetsUsd sharePriceNumber }
        }
      }
      vaultV2s(
        first: 500
        where: { listed: true, chainId_in: [$chainId] }
      ) {
        items {
          address
          symbol
          name
          type
          asset { address symbol name decimals }
          netApy
          apy
          totalAssetsUsd
          sharePrice
        }
      }
    }`,
    { chainId },
  );
  const vaults = [
    ...(Array.isArray(data?.vaults?.items)
      ? data.vaults.items.map((vault) => ({ ...vault, morphoVersion: "v1" }))
      : []),
    ...(Array.isArray(data?.vaultV2s?.items)
      ? data.vaultV2s.items.map((vault) => ({ ...vault, morphoVersion: "v2" }))
      : []),
  ];
  const rpcList = getUsableChainRpcs(chain);
  if (!rpcList.length) throw new Error(`rpc not configured: ${chain}`);
  let provider;

  try {
    provider = new ethers.JsonRpcProvider(rpcList[0]);
    const markets = (
      await mapWithConcurrency(
        vaults.filter((vault) => ethers.isAddress(vault?.address)),
        morphoMetaConcurrency,
        async (vault) => {
          const asset = vault.asset || {};
          if (!ethers.isAddress(asset.address)) return null;

          const [underlyingMeta, lendMeta] = await Promise.all([
            getTokenMeta(provider, asset.address, chain, morphoTokenMetaTimeoutMs)
              .catch(() => ({
                address: ethers.getAddress(asset.address),
                name: asset.name || asset.symbol || "",
                symbol: asset.symbol || "",
                decimals: Number(asset.decimals || 18),
                fallback: true,
              })),
            getTokenMeta(provider, vault.address, chain, morphoTokenMetaTimeoutMs)
              .catch(() => ({
                address: ethers.getAddress(vault.address),
                name: vault.name || vault.symbol || "",
                symbol: vault.symbol || "",
                decimals: Number(asset.decimals || 18),
                fallback: true,
              })),
          ]);
          const addedUnderlying = getCoinByAddress(chain, underlyingMeta.address);
          const addedLend = getCoinByAddress(chain, lendMeta.address);

          return {
            value: getMorphoValue(vault, underlyingMeta, lendMeta),
            chain,
            underlyingCoin: addedUnderlying?.[0] || underlyingMeta.symbol,
            underlyingName: underlyingMeta.name || underlyingMeta.symbol,
            underlyingAddress: underlyingMeta.address,
            underlyingDecimals: underlyingMeta.decimals,
            lendCoin: addedLend?.[0] || lendMeta.symbol,
            lendName: lendMeta.name || vault.name || lendMeta.symbol,
            lendAddress: lendMeta.address,
            lendDecimals: lendMeta.decimals,
            addedUnderlying: !!addedUnderlying,
            addedLend: !!addedLend,
            supplyApr: getMorphoSupplyApr(vault),
            totalAssetsUsd: getMorphoTotalAssetsUsd(vault),
            sharePriceNumber: getMorphoSharePrice(vault),
            morphoVersion: vault.morphoVersion || "v1",
            morphoType: vault.type || "",
            metaFallback: !!underlyingMeta.fallback || !!lendMeta.fallback,
          };
        },
      )
    ).filter(Boolean);

    return {
      ok: true,
      chain,
      chainId,
      markets: markets.sort((a, b) => {
        if (b.totalAssetsUsd != a.totalAssetsUsd) {
          return b.totalAssetsUsd - a.totalAssetsUsd;
        }

        return a.underlyingCoin.localeCompare(b.underlyingCoin);
      }),
    };
  } finally {
    provider?.destroy?.();
  }
}

export async function getMorphoMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = 18,
} = {}) {
  if (chain == "Solana") throw new Error("Morpho is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");
  if (!ethers.isAddress(underlyingAddress)) throw new Error("underlying address invalid");
  if (!ethers.isAddress(lendAddress)) throw new Error("Morpho vault address invalid");

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

export async function getMorphoLendPreview({
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
  if (chain == "Solana") throw new Error("Morpho is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getMorphoAmount({
    chain,
    coin: action == "redeem" ? lendCoin : underlyingCoin,
    amount,
    decimals: action == "redeem" ? lendDecimals : underlyingDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertMorphoMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
      underlyingDecimals,
      lendDecimals,
    });
    const allowance = action == "redeem"
      ? amountIn
      : BigInt(
          await new ethers.Contract(
            market.underlying,
            erc20Abi,
            provider,
          ).allowance(walletAddress, market.vaultAddress),
        );

    return {
      ok: true,
      defi: "Morpho",
      chain,
      action,
      approvalNeeded: action != "redeem" && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      vault: market.vaultAddress,
      receiptPerUnderlying: market.receiptPerUnderlying,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildMorphoLendTxs({
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
  if (chain == "Solana") throw new Error("Morpho is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const amountIn = getMorphoAmount({
    chain,
    coin: action == "redeem" ? lendCoin : underlyingCoin,
    amount,
    decimals: action == "redeem" ? lendDecimals : underlyingDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertMorphoMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
      underlyingDecimals,
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
            to: market.vaultAddress,
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
        ).allowance(walletAddress, market.vaultAddress),
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
              spender: market.vaultAddress,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: market.underlying,
            spender: market.vaultAddress,
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
            to: market.vaultAddress,
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
      defi: "Morpho",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      vault: market.vaultAddress,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeMorphoLend({
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
  if (chain == "Solana") throw new Error("Morpho is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getMorphoAmount({
    chain,
    coin: action == "redeem" ? lendCoin : underlyingCoin,
    amount,
    decimals: action == "redeem" ? lendDecimals : underlyingDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const market = await assertMorphoMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
      underlyingDecimals,
      lendDecimals,
    });
    const vault = new ethers.Contract(market.vaultAddress, erc4626Abi, wallet);
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
          spender: market.vaultAddress,
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
      defi: "Morpho",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      vault: market.vaultAddress,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}
