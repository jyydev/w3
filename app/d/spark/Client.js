"use client";

import { useState } from "react";
import { pc } from "@/fn/basic";
import { getSparkSavingsUrl } from "@/app/_shared/spark";
import { reloadSparkMarkets } from "@/app/_shared/spark/actions";
import {
  DiscoveryCacheInfo,
  HoverInfoCard,
  TableSortHeader,
} from "@/components/Shared";
import ProtocolChainLink from "../ProtocolChainLink";

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatApy(value) {
  const number = toFiniteNumber(value);
  if (number === null) return "";
  return `${pc(number)}%`;
}

function sortChainsByMarket(chainNames = [], marketsM = {}, market = "") {
  if (!market) return chainNames;

  return chainNames
    .map((chain, index) => ({
      chain,
      index,
      apy: toFiniteNumber(marketsM?.[chain]?.[market]?.supplyApr),
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

export default function SparkClient({
  cacheMeta,
  chains,
  error,
  markets,
  marketsM,
  rates,
  linkPath = "/d/spark",
}) {
  const [sortMarket, setSortMarket] = useState("");
  const [reloadingCache, setReloadingCache] = useState(false);
  const [cacheError, setCacheError] = useState("");
  const [reloadedView, setReloadedView] = useState(null);
  const selectedChains = Object.keys(chains);
  const viewKey = selectedChains.join("|");
  const activeView =
    reloadedView?.viewKey == viewKey
      ? reloadedView
      : { cacheMeta, error, markets, marketsM, rates };
  const activeSortMarket = activeView.markets.includes(sortMarket)
    ? sortMarket
    : "";
  const chainNames = sortChainsByMarket(
    selectedChains,
    activeView.marketsM,
    activeSortMarket,
  );

  async function reloadCache() {
    if (reloadingCache) return;

    setReloadingCache(true);
    setCacheError("");
    try {
      const result = await reloadSparkMarkets(selectedChains);
      if (!result?.ok) throw new Error("Spark cache reset failed");
      setReloadedView({
        viewKey: result.chainNames.join("|"),
        cacheMeta: result.cacheMeta,
        error: result.error,
        markets: result.markets,
        marketsM: result.marketsM,
        rates: result.rates,
      });
    } catch (reloadError) {
      setCacheError(reloadError?.message || "Spark cache reset failed");
    } finally {
      setReloadingCache(false);
    }
  }

  return (
    <table>
      <caption>
        <span className="tableCaptionRow">
          <span>Spark savings</span>
          <HoverInfoCard>
            <span className="infoIcon">i</span>
            <span className="infoCard">
              <DiscoveryCacheInfo
                cacheMeta={activeView.cacheMeta}
                description="Spark markets use local configuration and savings APR loaded from the Sky savings-rate API."
                extraRows={[
                  activeView.rates?.ssr != null
                    ? `SSR: ${formatApy(activeView.rates.ssr)}`
                    : "",
                  activeView.rates?.dsr != null
                    ? `DSR: ${formatApy(activeView.rates.dsr)}`
                    : "",
                  activeView.error ? `error: ${activeView.error}` : "",
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
          {activeView.markets.map((market) => (
            <th key={market}>
              <TableSortHeader
                activeSort={activeSortMarket}
                setSort={setSortMarket}
                sortKey={market}
              >
                {market}
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
                officialUrl={getSparkSavingsUrl(chain)}
                protocolName="Spark"
              />
            </td>
            {activeView.markets.map((market) => {
              const marketE = activeView.marketsM?.[chain]?.[market];
              return (
                <td
                  key={market}
                  title={
                    marketE
                      ? `${marketE.name || marketE.lendCoin} (${marketE.lendAddress})`
                      : ""
                  }
                >
                  {marketE ? formatApy(marketE.supplyApr) : ""}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
