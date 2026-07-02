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
} from "../../sharedServer";
import {
  cleanMarketSymbol,
  mapWithConcurrency,
  sameEvmAddress,
  withTimeout,
} from "../shared";

const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const erc4626Abi = [
  "function asset() view returns (address)",
  "function balanceOf(address account) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function deposit(uint256 assets,address receiver) returns (uint256)",
  "function redeem(uint256 shares,address receiver,address owner) returns (uint256)",
];
const erc4626Interface = new ethers.Interface(erc4626Abi);
const venusFluxApiBase = "https://api.fluid.instadapp.io";
const venusFluxMarketFetchTimeoutMs = 12000;
const venusFluxTokenMetaTimeoutMs = 8000;

function getCoinByAddress(chain = "", address = "") {
  if (!ethers.isAddress(address)) return null;

  return (
    Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
      sameEvmAddress(coinE?.address, address),
    ) || null
  );
}

function isVenusFluxCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE?.name || ""}`.toLowerCase();

  return (
    ethers.isAddress(coinE?.address || "") &&
    /^f[A-Z0-9]/.test(coin) &&
    (text.includes("venus") || text.includes("fluid") || text.includes("flux"))
  );
}

function getVenusFluxMarkets(chain = "") {
  return Object.entries(coinM?.[chain] || {}).filter(([coin, coinE]) =>
    isVenusFluxCoin(coin, coinE),
  );
}

function getVenusFluxChainId(chain = "") {
  return relayChainIds[chain] || 0;
}

function getVenusFluxApr(entry = {}) {
  const rate = Number(entry.totalRate ?? entry.supplyRate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate / 100 : 0;
}

function mergeVenusFluxMarket(prev = {}, next = {}) {
  return {
    ...prev,
    ...next,
    underlyingPerReceipt:
      next.underlyingPerReceipt || prev.underlyingPerReceipt || 0,
    receiptPerUnderlying:
      next.receiptPerUnderlying || prev.receiptPerUnderlying || 0,
    supplyApr: next.supplyApr || prev.supplyApr || 0,
  };
}

function getFallbackUnderlyingCoin(chain = "", lendCoin = "") {
  const stripped = String(lendCoin || "").replace(/^f/, "");
  if (stripped && coinM?.[chain]?.[stripped]) return stripped;

  return (
    ["USDT", "USDC", "USDS", "DAI", "USD1"].find(
      (coin) => coinM?.[chain]?.[coin],
    ) || stripped
  );
}

async function getTokenMeta(
  provider,
  address = "",
  chain = "",
  fallbackCoin = "",
) {
  const localCoin = getCoinByAddress(chain, address);
  if (localCoin) {
    const [symbol, coinE] = localCoin;

    return {
      address: ethers.getAddress(address),
      name: coinE.name || symbol,
      symbol,
      decimals: coinE.decimals ?? 18,
      fallback: false,
    };
  }

  const token = new ethers.Contract(address, erc20MetaAbi, provider);
  const [name, symbol, decimals] = await Promise.all([
    withTimeout(
      token.name(),
      venusFluxTokenMetaTimeoutMs,
      "token name timeout",
    ).catch(() => ""),
    withTimeout(
      token.symbol(),
      venusFluxTokenMetaTimeoutMs,
      "token symbol timeout",
    ).catch(() => fallbackCoin),
    withTimeout(
      token.decimals(),
      venusFluxTokenMetaTimeoutMs,
      "token decimals timeout",
    ).catch(() => 18),
  ]);

  return {
    address: ethers.getAddress(address),
    name: String(name || "").trim() || fallbackCoin,
    symbol: cleanMarketSymbol(symbol || fallbackCoin, address),
    decimals: Number(decimals),
    fallback: !String(symbol || "").trim(),
  };
}

async function getVenusFluxExchangeRate({
  vault,
  underlyingDecimals = 18,
  lendDecimals = 18,
} = {}) {
  const oneReceipt = ethers.parseUnits("1", lendDecimals);
  const oneUnderlying = ethers.parseUnits("1", underlyingDecimals);
  const [assets, shares] = await Promise.all([
    withTimeout(
      vault.convertToAssets(oneReceipt),
      venusFluxTokenMetaTimeoutMs,
      "Venus Flux convertToAssets timeout",
    ).catch(() => 0n),
    withTimeout(
      vault.convertToShares(oneUnderlying),
      venusFluxTokenMetaTimeoutMs,
      "Venus Flux convertToShares timeout",
    ).catch(() => 0n),
  ]);
  const underlyingPerReceipt = assets
    ? Number(ethers.formatUnits(assets, underlyingDecimals))
    : 1;
  const receiptPerUnderlying = shares
    ? Number(ethers.formatUnits(shares, lendDecimals))
    : underlyingPerReceipt
      ? 1 / underlyingPerReceipt
      : 1;

  return {
    underlyingPerReceipt,
    receiptPerUnderlying,
  };
}

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
  const vault = new ethers.Contract(vTokenAddress, erc4626Abi, provider);
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

async function buildVenusFluxMarketEntry({
  provider,
  chain = "",
  lendCoin = "",
  lendE = {},
} = {}) {
  const lendAddress = ethers.getAddress(lendE.address);
  const vault = new ethers.Contract(lendAddress, erc4626Abi, provider);
  const underlyingAddress = ethers.getAddress(
    await withTimeout(
      vault.asset(),
      venusFluxTokenMetaTimeoutMs,
      `${chain} Venus Flux asset timeout`,
    ),
  );
  const fallbackUnderlyingCoin = getFallbackUnderlyingCoin(chain, lendCoin);
  const [underlyingMeta, lendMeta] = await Promise.all([
    getTokenMeta(provider, underlyingAddress, chain, fallbackUnderlyingCoin),
    getTokenMeta(provider, lendAddress, chain, lendCoin),
  ]);
  const addedUnderlying = getCoinByAddress(chain, underlyingMeta.address);
  const addedLend = getCoinByAddress(chain, lendMeta.address);
  const rate = await getVenusFluxExchangeRate({
    vault,
    underlyingDecimals: underlyingMeta.decimals,
    lendDecimals: lendMeta.decimals,
  });

  return {
    value: `${underlyingMeta.symbol}:${lendMeta.symbol}:${lendMeta.address}`,
    chain,
    protocol: "venusFlux",
    underlyingCoin: addedUnderlying?.[0] || underlyingMeta.symbol,
    underlyingName: underlyingMeta.name || underlyingMeta.symbol,
    underlyingAddress: underlyingMeta.address,
    underlyingDecimals: underlyingMeta.decimals,
    lendCoin: addedLend?.[0] || lendMeta.symbol,
    lendName: lendMeta.name || lendMeta.symbol,
    lendAddress: lendMeta.address,
    lendDecimals: lendMeta.decimals,
    underlyingPerReceipt: rate.underlyingPerReceipt,
    receiptPerUnderlying: rate.receiptPerUnderlying,
    addedUnderlying: !!addedUnderlying,
    addedLend: !!addedLend,
    supplyApr: 0,
  };
}

async function buildVenusFluxApiMarketEntry({
  provider,
  chain = "",
  entry = {},
} = {}) {
  const lendAddress = entry.address;
  const underlyingAddress = entry.assetAddress || entry.asset?.address;
  if (!ethers.isAddress(lendAddress) || !ethers.isAddress(underlyingAddress)) {
    return null;
  }

  const normalizedLendAddress = ethers.getAddress(lendAddress);
  const normalizedUnderlyingAddress = ethers.getAddress(underlyingAddress);
  const addedUnderlying = getCoinByAddress(chain, normalizedUnderlyingAddress);
  const addedLend = getCoinByAddress(chain, normalizedLendAddress);
  const underlyingSymbol =
    addedUnderlying?.[0] ||
    cleanMarketSymbol(
      entry.asset?.symbol || entry.assetSymbol || entry.underlyingSymbol || "",
      normalizedUnderlyingAddress,
    );
  const lendSymbol =
    addedLend?.[0] || cleanMarketSymbol(entry.symbol || "", normalizedLendAddress);
  const underlyingMeta =
    entry.asset?.name && entry.asset?.decimals != null && underlyingSymbol
      ? {
          address: normalizedUnderlyingAddress,
          name: entry.asset.name,
          symbol: underlyingSymbol,
          decimals: Number(entry.asset.decimals),
        }
      : await getTokenMeta(
          provider,
          normalizedUnderlyingAddress,
          chain,
          underlyingSymbol,
        );
  const lendMeta =
    entry.name && entry.decimals != null && lendSymbol
      ? {
          address: normalizedLendAddress,
          name: entry.name,
          symbol: lendSymbol,
          decimals: Number(entry.decimals),
        }
      : await getTokenMeta(provider, normalizedLendAddress, chain, lendSymbol);
  const underlyingDecimals = Number.isInteger(underlyingMeta.decimals)
    ? underlyingMeta.decimals
    : 18;
  const lendDecimals = Number.isInteger(lendMeta.decimals) ? lendMeta.decimals : 18;
  const underlyingPerReceipt = entry.convertToAssets
    ? Number(ethers.formatUnits(BigInt(entry.convertToAssets), underlyingDecimals))
    : 0;
  const receiptPerUnderlying = entry.convertToShares
    ? Number(ethers.formatUnits(BigInt(entry.convertToShares), lendDecimals))
    : 0;
  const rate =
    underlyingPerReceipt && receiptPerUnderlying
      ? { underlyingPerReceipt, receiptPerUnderlying }
      : await getVenusFluxExchangeRate({
          vault: new ethers.Contract(normalizedLendAddress, erc4626Abi, provider),
          underlyingDecimals,
          lendDecimals,
        });

  return {
    value: `${underlyingMeta.symbol}:${lendMeta.symbol}:${normalizedLendAddress}`,
    chain,
    protocol: "venusFlux",
    underlyingCoin: addedUnderlying?.[0] || underlyingMeta.symbol,
    underlyingName: underlyingMeta.name || underlyingMeta.symbol,
    underlyingAddress: normalizedUnderlyingAddress,
    underlyingDecimals,
    lendCoin: addedLend?.[0] || lendMeta.symbol,
    lendName: lendMeta.name || lendMeta.symbol,
    lendAddress: normalizedLendAddress,
    lendDecimals,
    underlyingPerReceipt: rate.underlyingPerReceipt,
    receiptPerUnderlying: rate.receiptPerUnderlying,
    addedUnderlying: !!addedUnderlying,
    addedLend: !!addedLend,
    supplyApr: getVenusFluxApr(entry),
  };
}

async function fetchVenusFluxApiMarkets(chain = "") {
  const chainId = getVenusFluxChainId(chain);
  if (!chainId) return [];

  const response = await withTimeout(
    fetch(`${venusFluxApiBase}/v2/lending/${chainId}/tokens`, {
      cache: "no-store",
    }),
    venusFluxMarketFetchTimeoutMs,
    `${chain} Venus Flux markets timeout`,
  );
  if (!response.ok) {
    throw new Error(`${chain} Venus Flux markets HTTP ${response.status}`);
  }

  const json = await response.json();
  return Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
}

export async function getVenusFluxAllMarkets({ chain = "" } = {}) {
  if (chain == "Solana" || chain == "Hyperliquid") {
    return { ok: true, chain, markets: [] };
  }

  const savedMarkets = getVenusFluxMarkets(chain);
  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const apiMarkets = await fetchVenusFluxApiMarkets(chain).catch(() => []);
    const markets = [
      ...(
        await mapWithConcurrency(apiMarkets, 4, (entry) =>
          buildVenusFluxApiMarketEntry({ provider, chain, entry }).catch(() => null),
        )
      ).filter(Boolean),
      ...(
        await Promise.all(
          savedMarkets.map(([lendCoin, lendE]) =>
            buildVenusFluxMarketEntry({ provider, chain, lendCoin, lendE }).catch(
              () => null,
            ),
          ),
        )
      ).filter(Boolean),
    ];
    const marketM = new Map();
    for (const entry of markets) {
      if (!ethers.isAddress(entry.lendAddress)) continue;
      const key = ethers.getAddress(entry.lendAddress);
      marketM.set(key, mergeVenusFluxMarket(marketM.get(key), entry));
    }
    const uniqueMarkets = [...marketM.values()].sort((a, b) =>
      a.underlyingCoin.localeCompare(b.underlyingCoin),
    );

    return {
      ok: true,
      chain,
      markets: uniqueMarkets,
    };
  } finally {
    provider.destroy?.();
  }
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
  const provider = new ethers.JsonRpcProvider(rpc);

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

  const chainId = relayChainIds[chain];
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
  const provider = new ethers.JsonRpcProvider(rpc);

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
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

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
  const provider = new ethers.JsonRpcProvider(rpc);

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
    const vault = new ethers.Contract(market.vTokenAddress, erc4626Abi, wallet);
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
