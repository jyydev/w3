import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";

const justLendMarketUrl = "https://openapi.just.network/lend/jtoken";
const justLendContractsUrl =
  "https://docs.justlend.org/developers/contracts.json";
const justLendMarketDataCacheM = {};
const justLendLegacySymbols = new Set([
  "jBUSDOLD",
  "jSUNOLD",
  "jUSDCOLD",
  "jUSDDOLD",
  "jUSDJ",
  "jWBTT",
]);

async function fetchJustLendJson(url = "", timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("JustLend returned invalid JSON");
    }
    if (!res.ok) {
      throw new Error(
        data?.message || `JustLend request failed: ${res.status}`,
      );
    }

    return data;
  } catch (error) {
    if (error?.name == "AbortError") {
      throw new Error("JustLend market request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getJustLendActiveSymbols(contracts = {}) {
  const entries = contracts?.networks?.mainnet?.jtokens;
  if (!entries || typeof entries != "object") return null;

  return new Set(
    Object.entries(entries)
      .filter(([, entry]) => entry?.status == "active")
      .map(([symbol]) => symbol),
  );
}

export function clearJustLendMarketDataCache() {
  clearDiscoveryCacheMap(justLendMarketDataCacheM);
}

export async function getJustLendMarketData({ refresh = false } = {}) {
  const cacheKey = "Tron";
  const cached = !refresh
    ? getDiscoveryCacheMapEntry(justLendMarketDataCacheM, cacheKey)
    : null;
  if (cached?.entries) {
    return {
      entries: cached.entries,
      cache: makeDiscoveryCacheMeta({
        source: "cache",
        at: cached.at,
        ttlMs: discoveryCacheMs,
      }),
    };
  }

  const [marketData, contracts] = await Promise.all([
    fetchJustLendJson(justLendMarketUrl),
    fetchJustLendJson(justLendContractsUrl).catch(() => null),
  ]);
  if (Number(marketData?.code) != 0) {
    throw new Error(marketData?.message || "JustLend markets failed");
  }

  const activeSymbols = getJustLendActiveSymbols(contracts);
  const entries = (Array.isArray(marketData?.data?.tokenList)
    ? marketData.data.tokenList
    : []
  ).filter((entry) => {
    const symbol = String(entry?.symbol || "").trim();
    if (!symbol) return false;

    return activeSymbols
      ? activeSymbols.has(symbol)
      : !justLendLegacySymbols.has(symbol);
  });
  if (!entries.length) throw new Error("JustLend returned no active markets");

  const at = Date.now();
  setDiscoveryCacheMapEntry(justLendMarketDataCacheM, cacheKey, {
    at,
    entries,
  });

  return {
    entries,
    cache: makeDiscoveryCacheMeta({
      source: "api",
      at,
      ttlMs: discoveryCacheMs,
    }),
  };
}
