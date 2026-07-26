import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";
import {
  venusErc4626Abi,
  venusFluxApiBase,
  venusFluxChains,
  venusFluxMarketFetchTimeoutMs,
  venusFluxTokenMetaTimeoutMs,
} from "./index";
import {
  cleanMarketSymbol,
  createJsonRpcProvider,
  getCoinByAddress,
  getTokenMeta,
  getUsableChainRpc,
  mapWithConcurrency,
  withTimeout,
} from "./shared";

const venusFluxMarketCacheM = {};

function isVenusFluxCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE?.name || ""}`.toLowerCase();

  return (
    ethers.isAddress(coinE?.address || "") &&
    /^f[A-Z0-9]/.test(coin) &&
    (text.includes("venus") ||
      text.includes("fluid") ||
      text.includes("flux"))
  );
}

function getVenusFluxMarkets(chain = "") {
  return Object.entries(coinM?.[chain] || {}).filter(([coin, coinE]) =>
    isVenusFluxCoin(coin, coinE),
  );
}

function getVenusFluxApr(entry = {}) {
  const rate = Number(entry.totalRate ?? entry.supplyRate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate / 100 : 0;
}

function mergeVenusFluxMarket(previous = {}, next = {}) {
  return {
    ...previous,
    ...next,
    underlyingPerReceipt:
      next.underlyingPerReceipt || previous.underlyingPerReceipt || 0,
    receiptPerUnderlying:
      next.receiptPerUnderlying || previous.receiptPerUnderlying || 0,
    supplyApr: next.supplyApr || previous.supplyApr || 0,
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

export async function getVenusFluxExchangeRate({
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

async function buildVenusFluxMarketEntry({
  provider,
  chain = "",
  lendCoin = "",
  lendE = {},
} = {}) {
  const lendAddress = ethers.getAddress(lendE.address);
  const vault = new ethers.Contract(lendAddress, venusErc4626Abi, provider);
  const underlyingAddress = ethers.getAddress(
    await withTimeout(
      vault.asset(),
      venusFluxTokenMetaTimeoutMs,
      `${chain} Venus Flux asset timeout`,
    ),
  );
  const fallbackUnderlyingCoin = getFallbackUnderlyingCoin(chain, lendCoin);
  const [underlyingMeta, lendMeta] = await Promise.all([
    getTokenMeta(
      provider,
      underlyingAddress,
      chain,
      fallbackUnderlyingCoin,
      venusFluxTokenMetaTimeoutMs,
    ),
    getTokenMeta(
      provider,
      lendAddress,
      chain,
      lendCoin,
      venusFluxTokenMetaTimeoutMs,
    ),
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
    addedLend?.[0] ||
    cleanMarketSymbol(entry.symbol || "", normalizedLendAddress);
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
          venusFluxTokenMetaTimeoutMs,
        );
  const lendMeta =
    entry.name && entry.decimals != null && lendSymbol
      ? {
          address: normalizedLendAddress,
          name: entry.name,
          symbol: lendSymbol,
          decimals: Number(entry.decimals),
        }
      : await getTokenMeta(
          provider,
          normalizedLendAddress,
          chain,
          lendSymbol,
          venusFluxTokenMetaTimeoutMs,
        );
  const underlyingDecimals = Number.isInteger(underlyingMeta.decimals)
    ? underlyingMeta.decimals
    : 18;
  const lendDecimals = Number.isInteger(lendMeta.decimals)
    ? lendMeta.decimals
    : 18;
  const underlyingPerReceipt = entry.convertToAssets
    ? Number(
        ethers.formatUnits(
          BigInt(entry.convertToAssets),
          underlyingDecimals,
        ),
      )
    : 0;
  const receiptPerUnderlying = entry.convertToShares
    ? Number(
        ethers.formatUnits(BigInt(entry.convertToShares), lendDecimals),
      )
    : 0;
  const rate =
    underlyingPerReceipt && receiptPerUnderlying
      ? { underlyingPerReceipt, receiptPerUnderlying }
      : await getVenusFluxExchangeRate({
          vault: new ethers.Contract(
            normalizedLendAddress,
            venusErc4626Abi,
            provider,
          ),
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
  if (!venusFluxChains.includes(chain)) return [];

  const chainId = 56;
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

export async function clearVenusFluxRuntimeCache() {
  clearDiscoveryCacheMap(venusFluxMarketCacheM);

  return { ok: true };
}

export async function getVenusFluxAllMarkets({
  chain = "",
  refresh = false,
} = {}) {
  if (!venusFluxChains.includes(chain)) {
    return { ok: true, chain, markets: [] };
  }

  const cacheKey = String(chain || "");
  const cached = !refresh
    ? getDiscoveryCacheMapEntry(venusFluxMarketCacheM, cacheKey)
    : null;
  if (cached?.markets) {
    return {
      ok: true,
      chain,
      markets: cached.markets,
      cache: makeDiscoveryCacheMeta({
        source: "cache",
        at: cached.at,
        ttlMs: discoveryCacheMs,
      }),
    };
  }

  const now = Date.now();
  const savedMarkets = getVenusFluxMarkets(chain);
  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Venus Flux",
  });

  try {
    const apiMarkets = await fetchVenusFluxApiMarkets(chain).catch(() => []);
    const markets = [
      ...(
        await mapWithConcurrency(apiMarkets, 4, (entry) =>
          buildVenusFluxApiMarketEntry({ provider, chain, entry }).catch(
            () => null,
          ),
        )
      ).filter(Boolean),
      ...(
        await Promise.all(
          savedMarkets.map(([lendCoin, lendE]) =>
            buildVenusFluxMarketEntry({
              provider,
              chain,
              lendCoin,
              lendE,
            }).catch(() => null),
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
    setDiscoveryCacheMapEntry(venusFluxMarketCacheM, cacheKey, {
      at: now,
      markets: uniqueMarkets,
    });

    return {
      ok: true,
      chain,
      markets: uniqueMarkets,
      cache: makeDiscoveryCacheMeta({
        source: "api",
        at: now,
        ttlMs: discoveryCacheMs,
      }),
    };
  } finally {
    provider.destroy?.();
  }
}
