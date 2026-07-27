import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  getSharedDiscoveryCacheMap,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";
import { toCleanError } from "@/app/_fn/shared";

const sparkSavingsRateApi =
  "https://info-sky.blockanalitica.com/api/v1/savings-rate/";
const sparkSavingsRateTimeoutMs = 8000;
const sparkSavingsRateCacheM = getSharedDiscoveryCacheMap(
  "spark:savings-rates",
);
const sparkSavingsRateCacheKey = "rates";

function toSparkAprPercent(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate <= 1 ? rate * 100 : rate;
}

function withTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ])
    .catch((error) => {
      throw toCleanError(error, message);
    })
    .finally(() => clearTimeout(timer));
}

export function clearSparkSavingsRateCache() {
  clearDiscoveryCacheMap(sparkSavingsRateCacheM);
}

export async function loadSparkSavingsRates({ refresh = false } = {}) {
  const cached = !refresh
    ? getDiscoveryCacheMapEntry(
        sparkSavingsRateCacheM,
        sparkSavingsRateCacheKey,
      )
    : null;
  if (cached?.rates) {
    return {
      rates: cached.rates,
      cache: makeDiscoveryCacheMeta({
        source: "cache",
        at: cached.at,
        ttlMs: discoveryCacheMs,
      }),
    };
  }

  const response = await withTimeout(
    fetch(sparkSavingsRateApi, { cache: "no-store" }),
    sparkSavingsRateTimeoutMs,
    "Spark savings rate timeout",
  );
  if (!response.ok) {
    throw new Error(`Spark savings rate HTTP ${response.status}`);
  }

  const json = await response.json();
  const rows = Array.isArray(json) ? json : [json];
  const latest =
    rows.find(
      (entry) =>
        entry?.ssr_rate != null ||
        entry?.dsr_rate != null ||
        entry?.rate != null,
    ) || {};
  const rates = {
    ssr: toSparkAprPercent(latest.ssr_rate ?? latest.rate),
    dsr: toSparkAprPercent(latest.dsr_rate ?? latest.rate),
  };
  const at = Date.now();

  setDiscoveryCacheMapEntry(
    sparkSavingsRateCacheM,
    sparkSavingsRateCacheKey,
    { at, rates },
  );

  return {
    rates,
    cache: makeDiscoveryCacheMeta({
      source: "api",
      at,
      ttlMs: discoveryCacheMs,
    }),
  };
}

export async function getSparkSavingsRates(options = {}) {
  try {
    return (await loadSparkSavingsRates(options)).rates;
  } catch {
    return { ssr: 0, dsr: 0 };
  }
}
