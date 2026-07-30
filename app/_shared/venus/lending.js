import { ethers } from "ethers";
import { chainIds } from "@/data/basic";
import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  getSharedDiscoveryCacheMap,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";
import { logRpcFailure } from "@/app/_fn/shared";
import {
  getVenusExchangeRate,
  venusApiBase,
  venusBlocksPerYearM,
  venusComptrollerAbi,
  venusComptrollerSeedsM,
  venusLendingChains,
  venusTokenAbi,
} from "./index";
import {
  createJsonRpcProvider,
  getCoinByAddress,
  getTokenMeta,
  getUsableChainRpcs,
  mapWithConcurrency,
  withTimeout,
} from "./shared";

const venusMarketFetchTimeoutMs = 15000;
const venusTokenMetaTimeoutMs = 8000;
const venusMarketFetchConcurrency = 8;
const venusGoodMarketRatio = 0.8;
const venusMaxTotalSupplyApyPercent = 10000;
const venusMarketCacheM = getSharedDiscoveryCacheMap(
  "venus:lending:markets:v3",
);

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
  if (timestampRate !== null) {
    return getVenusRateApr(timestampRate, 31536000);
  }

  return 0;
}

function getVenusApiSupplyApy(entry = {}) {
  const totalApyDecimal = Number(entry.totalSupplyApyDecimal);
  const totalApyPercent = totalApyDecimal * 100;
  if (
    Number.isFinite(totalApyPercent) &&
    totalApyPercent >= 0 &&
    totalApyPercent <= venusMaxTotalSupplyApyPercent
  ) {
    return totalApyPercent;
  }

  const supplyApy = Number(entry.supplyApy);
  if (Number.isFinite(supplyApy) && supplyApy >= 0) return supplyApy;

  const supplyApyDecimal = Number(entry.supplyApyDecimal);
  return Number.isFinite(supplyApyDecimal) && supplyApyDecimal >= 0
    ? supplyApyDecimal * 100
    : null;
}

async function getVenusApiSupplyApyM(chain = "") {
  const chainId = chainIds[chain];
  if (!chainId) return new Map();

  const limit = 100;
  const entries = [];
  let page = 0;
  let total = 0;

  do {
    const response = await withTimeout(
      fetch(
        `${venusApiBase}/markets?chainId=${encodeURIComponent(chainId)}&limit=${limit}&page=${page}`,
        {
          cache: "no-store",
          headers: { "accept-version": "stable" },
        },
      ),
      venusMarketFetchTimeoutMs,
      `${chain} Venus market rates timeout`,
    );
    if (!response.ok) {
      throw new Error(`${chain} Venus market rates HTTP ${response.status}`);
    }

    const json = await response.json();
    const pageEntries = Array.isArray(json?.result) ? json.result : [];
    if (!pageEntries.length) break;
    entries.push(...pageEntries);
    total = Math.max(0, Number(json?.total) || pageEntries.length);
    page += 1;
  } while (entries.length < total);

  return new Map(
    entries
      .map((entry) => {
        if (!ethers.isAddress(entry?.address || "")) return null;
        const supplyApy = getVenusApiSupplyApy(entry);
        return supplyApy === null
          ? null
          : [ethers.getAddress(entry.address).toLowerCase(), supplyApy];
      })
      .filter(Boolean),
  );
}

function getVenusComptrollerSeeds(chain = "") {
  return [
    ...new Set(
      (venusComptrollerSeedsM[chain] || [])
        .filter((address) => ethers.isAddress(address))
        .map((address) => ethers.getAddress(address)),
    ),
  ];
}

export function getVenusSupportedChainRows() {
  return venusLendingChains
    .filter((chain) => chainIds[chain])
    .sort((a, b) => a.localeCompare(b))
    .map((chain) => ({
      chain,
      chainId: chainIds[chain],
    }));
}

export async function getVenusSupportedChains() {
  return {
    ok: true,
    chains: getVenusSupportedChainRows(),
  };
}

export async function clearVenusRuntimeCache() {
  clearDiscoveryCacheMap(venusMarketCacheM);

  return { ok: true };
}

export async function getVenusAllMarkets({
  chain = "",
  refresh = false,
} = {}) {
  if (!venusComptrollerSeedsM[chain]) {
    return { ok: true, chain, markets: [] };
  }

  const cacheKey = String(chain || "");
  const cached = !refresh
    ? getDiscoveryCacheMapEntry(venusMarketCacheM, cacheKey)
    : null;
  if (cached?.markets) {
    return {
      ok: true,
      chain,
      rpc: cached.rpc || "",
      markets: cached.markets,
      cache: makeDiscoveryCacheMeta({
        source: "cache",
        at: cached.at,
        ttlMs: discoveryCacheMs,
      }),
    };
  }

  const seedComptrollers = getVenusComptrollerSeeds(chain);
  const rpcList = getUsableChainRpcs(chain);
  if (!rpcList.length) throw new Error(`rpc not configured: ${chain}`);
  const apiSupplyApyM = await getVenusApiSupplyApyM(chain).catch(() => new Map());

  let bestResult = null;
  let lastError = null;

  async function fetchMarkets(rpc) {
    const provider = createJsonRpcProvider(rpc, {
      chain,
      scope: "Venus",
    });

    try {
      const marketAddresses = [
        ...new Set(
          (
            await Promise.all(
              seedComptrollers.map((comptroller) =>
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
            const vToken = new ethers.Contract(
              lendAddress,
              venusTokenAbi,
              provider,
            );
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
              apiSupplyApyM.has(lendAddress.toLowerCase())
                ? apiSupplyApyM.get(lendAddress.toLowerCase())
                : getVenusSupplyApr(vToken, chain),
            ]);
            const [underlyingMeta, lendMeta] = await Promise.all([
              getTokenMeta(provider, underlyingAddress, chain),
              getTokenMeta(provider, lendAddress, chain),
            ]);
            const addedUnderlying = getCoinByAddress(
              chain,
              underlyingMeta.address,
            );
            const addedLend = getCoinByAddress(chain, lendMeta.address);
            const underlyingPerReceipt = getVenusExchangeRate({
              rateRaw: BigInt(exchangeRateRaw),
              underlyingDecimals: underlyingMeta.decimals,
              receiptDecimals: lendMeta.decimals,
            });
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
    } catch (error) {
      lastError = error;
      logRpcFailure({ scope: "Venus", chain, rpc, error });
    }
  }

  if (!bestResult) {
    throw new Error(
      lastError?.shortMessage ||
        lastError?.message ||
        `${chain} Venus markets failed`,
    );
  }

  const markets = bestResult.markets.sort((a, b) =>
    a.underlyingCoin.localeCompare(b.underlyingCoin),
  );
  const at = Date.now();
  setDiscoveryCacheMapEntry(venusMarketCacheM, cacheKey, {
    at,
    rpc: bestResult.rpc,
    markets,
  });

  return {
    ok: true,
    chain,
    rpc: bestResult.rpc,
    markets,
    cache: makeDiscoveryCacheMeta({
      source: "api",
      at,
      ttlMs: discoveryCacheMs,
    }),
  };
}
