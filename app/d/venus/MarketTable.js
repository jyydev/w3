"use client";

import { useState } from "react";
import {
  reloadVenusFluxMarkets,
  reloadVenusLendingMarkets,
} from "@/app/_shared/venus/actions";
import {
  getVenusFluxUrl,
  getVenusMarketUrl,
} from "@/app/_shared/venus";
import {
  DiscoveryCacheInfo,
  HoverInfoCard,
  TableSortHeader,
} from "@/components/Shared";
import ProtocolChainLink from "../ProtocolChainLink";

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatApy(value) {
  const number = toFiniteNumber(value);
  if (number === null) return "";
  if (number > 0 && number < 0.01) return "<0.01%";

  return `${number
    .toFixed(number >= 10 ? 2 : 4)
    .replace(/0+$/, "")
    .replace(/\.$/, "")}%`;
}

function getCacheSourceLabel(cacheMeta = {}) {
  if (cacheMeta.source == "cache") return "cache";
  if (cacheMeta.source == "mixed") return "cache + fresh api";
  return cacheMeta.source ? "fresh api" : "-";
}

function getCombinedCacheMeta(cacheM = {}) {
  const entries = Object.entries(cacheM).filter(([, cache]) => cache?.source);
  if (!entries.length) return { cacheMeta: null, cacheRows: [] };

  const metas = entries.map(([, cache]) => cache);
  const sources = new Set(metas.map((cache) => cache.source));
  const timestamps = metas.map((cache) => Number(cache.at || 0)).filter(Boolean);
  const expirations = metas
    .map((cache) => Number(cache.expiresAt || 0))
    .filter(Boolean);
  const ttls = metas.map((cache) => Number(cache.ttlMs || 0)).filter(Boolean);
  const first = metas[0];

  return {
    cacheMeta: {
      ...first,
      source: sources.size == 1 ? first.source : "mixed",
      at: timestamps.length ? Math.min(...timestamps) : first.at,
      expiresAt: expirations.length
        ? Math.min(...expirations)
        : first.expiresAt,
      ttlMs: ttls.length ? Math.min(...ttls) : first.ttlMs,
    },
    cacheRows:
      entries.length > 1
        ? entries.map(
            ([chain, cache]) => `${chain}: ${getCacheSourceLabel(cache)}`,
          )
        : [],
  };
}

function sortChainsByCoin(chainNames = [], marketsM = {}, coin = "") {
  if (!coin) return chainNames;

  return chainNames
    .map((chain, index) => ({
      chain,
      index,
      apy: toFiniteNumber(marketsM?.[chain]?.[coin]?.supplyApr),
    }))
    .sort((first, second) => {
      if (first.apy === null && second.apy !== null) return 1;
      if (first.apy !== null && second.apy === null) return -1;
      if (
        first.apy !== null &&
        second.apy !== null &&
        first.apy != second.apy
      ) {
        return second.apy - first.apy;
      }
      return first.index - second.index;
    })
    .map(({ chain }) => chain);
}

export default function VenusMarketTable({
  cacheM,
  chains,
  coins,
  errorsM,
  marketsM,
  linkPath = "/d/venus",
  protocol = "lend",
}) {
  const [sortCoin, setSortCoin] = useState("");
  const [reloadingCache, setReloadingCache] = useState(false);
  const [cacheError, setCacheError] = useState("");
  const [reloadedView, setReloadedView] = useState(null);
  const selectedChains = Object.keys(chains);
  const viewKey = selectedChains.join("|");
  const activeView =
    reloadedView?.viewKey == viewKey
      ? reloadedView
      : { cacheM, coins, errorsM, marketsM };
  const activeSortCoin = activeView.coins.includes(sortCoin) ? sortCoin : "";
  const chainNames = sortChainsByCoin(
    selectedChains,
    activeView.marketsM,
    activeSortCoin,
  );
  const { cacheMeta, cacheRows } = getCombinedCacheMeta(activeView.cacheM);
  const isFlux = protocol == "flux";
  const title = isFlux ? "Venus Flux" : "Venus lending";
  const description = isFlux
    ? "Venus Flux markets loaded from the Fluid API and on-chain vault metadata."
    : "Venus lending markets loaded from configured comptrollers through on-chain RPC.";

  async function reloadCache() {
    if (reloadingCache) return;

    setReloadingCache(true);
    setCacheError("");
    try {
      const reload = isFlux
        ? reloadVenusFluxMarkets
        : reloadVenusLendingMarkets;
      const result = await reload(selectedChains);
      if (!result?.ok) throw new Error(`${title} cache reset failed`);
      setReloadedView({
        viewKey: result.chainNames.join("|"),
        cacheM: result.cacheM,
        coins: result.coins,
        errorsM: result.errorsM,
        marketsM: result.marketsM,
      });
    } catch (error) {
      setCacheError(error?.message || `${title} cache reset failed`);
    } finally {
      setReloadingCache(false);
    }
  }

  return (
    <table>
      <caption>
        <span className="tableCaptionRow">
          <span>{title}</span>
          <HoverInfoCard>
            <span className="infoIcon">i</span>
            <span className="infoCard">
              <DiscoveryCacheInfo
                cacheMeta={cacheMeta}
                description={description}
                extraRows={[
                  ...cacheRows,
                  ...Object.entries(activeView.errorsM || {}).map(
                    ([chain, error]) => `${chain}: ${error}`,
                  ),
                  reloadingCache ? "resetting cache..." : "",
                  cacheError ? `error: ${cacheError}` : "",
                ].filter(Boolean)}
                onReload={reloadCache}
              />
            </span>
          </HoverInfoCard>
        </span>
      </caption>
      <thead>
        <tr>
          <th className="stickyA">chain</th>
          {activeView.coins.map((coin) => (
            <th key={coin}>
              <TableSortHeader
                activeSort={activeSortCoin}
                setSort={setSortCoin}
                sortKey={coin}
              >
                {coin}
              </TableSortHeader>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {chainNames.map((chain) => (
          <tr key={chain}>
            <td className="stickyL">
              <ProtocolChainLink
                chain={chain}
                filterPath={linkPath}
                officialUrl={
                  isFlux
                    ? getVenusFluxUrl(chain)
                    : getVenusMarketUrl(chain)
                }
                protocolName={isFlux ? "Venus Flux" : "Venus"}
              />
            </td>
            {activeView.coins.map((coin) => {
              const market = activeView.marketsM?.[chain]?.[coin];
              return (
                <td
                  key={coin}
                  title={
                    market
                      ? `${market.underlyingCoin}-${market.lendCoin}`
                      : ""
                  }
                >
                  {market ? formatApy(market.supplyApr) : ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
