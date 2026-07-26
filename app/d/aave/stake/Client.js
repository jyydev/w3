"use client";

import { useState } from "react";
import Link from "next/link";
import { pc } from "@/fn/basic";
import { getAaveStakingUrl } from "@/app/_shared/aave";
import { reloadAaveStakingMarkets } from "@/app/_shared/aave/stakingActions";
import {
  DiscoveryCacheInfo,
  HoverInfoCard,
  TableSortHeader,
} from "@/components/Shared";
import ProtocolChainLink from "../../ProtocolChainLink";

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatApy(value) {
  return pc(toFiniteNumber(value));
}

function formatTokenAmount(raw = "0", decimals = 18, digits = 4) {
  const value = Number(raw) / 10 ** Number(decimals || 0);
  if (!Number.isFinite(value)) return "";

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function hasRawAmount(raw = "0") {
  try {
    return BigInt(raw) > 0n;
  } catch {
    return false;
  }
}

function formatDuration(seconds = 0) {
  const value = Number(seconds);
  if (!(value > 0)) return "";
  if (value % 86400 == 0) return `${value / 86400}d`;
  if (value % 3600 == 0) return `${value / 3600}h`;
  if (value % 60 == 0) return `${value / 60}m`;
  return `${value}s`;
}

function formatEndTime(seconds = 0) {
  const value = Number(seconds);
  if (!(value > 0)) return "";
  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortAddress(address = "") {
  const value = String(address);
  return value.length > 14
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : value;
}

function getCombinedApy(pool = {}) {
  return toFiniteNumber(pool.baseApr) + toFiniteNumber(pool.rewardApr);
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

function sortChainsByCoin(chainNames = [], poolsM = {}, coin = "") {
  if (!coin) return chainNames;

  return chainNames
    .map((chain, index) => ({
      chain,
      index,
      apy: poolsM?.[chain]?.[coin]
        ? getCombinedApy(poolsM[chain][coin])
        : null,
    }))
    .sort((a, b) => {
      if (a.apy === null && b.apy !== null) return 1;
      if (a.apy !== null && b.apy === null) return -1;
      if (a.apy !== null && b.apy !== null && a.apy != b.apy) {
        return b.apy - a.apy;
      }
      return a.index - b.index;
    })
    .map(({ chain }) => chain);
}

function RewardInfo({ reward = {}, chain = "Ethereum" }) {
  const rewardApy = toFiniteNumber(reward.apy);
  const emission = hasRawAmount(reward.currentEmissionPerSecondRaw)
    ? formatTokenAmount(reward.currentEmissionPerSecondRaw, 18, 8)
    : "";
  const endTime = formatEndTime(reward.distributionEnd);
  const explorerUrl =
    chain == "Ethereum" && reward.rewardAddress
      ? `https://etherscan.io/address/${reward.rewardAddress}`
      : "";

  return (
    <span className="aaveBonusInfoEntry">
      <span className="infoCardTitle">
        {reward.rewardSymbol || reward.rewardName || "reward"}
      </span>
      {reward.rewardName &&
        reward.rewardName != reward.rewardSymbol && (
          <span>
            <span className="gray">name: </span>
            {reward.rewardName}
          </span>
        )}
      <span>
        <span className="gray">reward APY: </span>
        {formatApy(rewardApy)}%
      </span>
      {emission && (
        <span>
          <span className="gray">emission: </span>
          {emission} {reward.rewardSymbol}/s
        </span>
      )}
      {endTime && (
        <span>
          <span className="gray">ends: </span>
          {endTime}
        </span>
      )}
      {explorerUrl && (
        <Link
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          title={reward.rewardAddress}
        >
          <span className="gray">address: </span>
          {shortAddress(reward.rewardAddress)}{" "}
          <span className="gray externalLinkIcon">↗</span>
        </Link>
      )}
    </span>
  );
}

function StakeRewardInfo({ pool = {}, chain = "" }) {
  const rewards = Array.isArray(pool.stakingRewards)
    ? pool.stakingRewards
    : [];
  const rewardApr = toFiniteNumber(pool.rewardApr);
  if (!rewards.length && rewardApr <= 0) return null;

  const baseApr = toFiniteNumber(pool.baseApr);
  const combinedApy = getCombinedApy(pool);
  const totalAssets = formatTokenAmount(
    pool.totalAssetsRaw,
    pool.wrapperDecimals,
  );
  const targetLiquidity = formatTokenAmount(
    pool.targetLiquidityRaw,
    pool.wrapperDecimals,
  );
  const cooldown = formatDuration(pool.cooldownSeconds);
  const unstakeWindow = formatDuration(pool.unstakeWindowSeconds);

  return (
    <>
      <span className="gray">+</span>
      <HoverInfoCard className="aaveBonusInfoHover">
        <span className="info">{formatApy(rewardApr)}</span>
        <span className="infoCard aaveBonusInfoCard">
          <span className="infoCardTitle">
            {pool.underlyingCoin} Umbrella staking
          </span>
          <span>
            <span className="gray">base APY: </span>
            {formatApy(baseApr)}%
          </span>
          <span>
            <span className="gray">reward APY: </span>
            {formatApy(rewardApr)}%
          </span>
          <span>
            <span className="gray">combined APY: </span>
            {formatApy(combinedApy)}%
          </span>
          {totalAssets && (
            <span>
              <span className="gray">staked: </span>
              {totalAssets} {pool.wrapperCoin || pool.underlyingCoin}
            </span>
          )}
          {targetLiquidity && (
            <span>
              <span className="gray">target: </span>
              {targetLiquidity} {pool.wrapperCoin || pool.underlyingCoin}
            </span>
          )}
          {(cooldown || unstakeWindow) && (
            <span>
              <span className="gray">unstake: </span>
              {cooldown ? `${cooldown} cooldown` : ""}
              {cooldown && unstakeWindow ? ", " : ""}
              {unstakeWindow ? `${unstakeWindow} window` : ""}
            </span>
          )}
          {rewards.map((reward, index) => (
            <RewardInfo
              key={`${reward.rewardAddress || reward.rewardSymbol}_${index}`}
              reward={reward}
              chain={chain}
            />
          ))}
          <span className="aaveBonusInfoLinks">
            <Link
              href={getAaveStakingUrl(chain)}
              target="_blank"
              rel="noreferrer"
            >
              stake <span className="gray externalLinkIcon">↗</span>
            </Link>
          </span>
        </span>
      </HoverInfoCard>
    </>
  );
}

export default function AaveStakeClient({
  cacheM,
  chains,
  coins,
  poolsM,
  linkPath = "/d/aave/stake",
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
      : { cacheM, coins, poolsM };
  const activeSortCoin = activeView.coins.includes(sortCoin) ? sortCoin : "";
  const chainNames = sortChainsByCoin(
    selectedChains,
    activeView.poolsM,
    activeSortCoin,
  );
  const { cacheMeta, cacheRows } = getCombinedCacheMeta(activeView.cacheM);

  async function reloadCache() {
    if (reloadingCache) return;

    setReloadingCache(true);
    setCacheError("");
    try {
      const result = await reloadAaveStakingMarkets(selectedChains);
      if (!result?.ok) throw new Error("Aave Staking cache reset failed");
      setReloadedView({
        viewKey: result.chainNames.join("|"),
        cacheM: result.cacheM,
        coins: result.coins,
        poolsM: result.poolsM,
      });
    } catch (error) {
      setCacheError(error?.message || "Aave Staking cache reset failed");
    } finally {
      setReloadingCache(false);
    }
  }

  return (
    <table>
      <caption>
        <span className="tableCaptionRow">
          <span>Aave staking</span>
          <HoverInfoCard>
            <span className="infoIcon">i</span>
            <span className="infoCard">
              <DiscoveryCacheInfo
                cacheMeta={cacheMeta}
                description="Aave Umbrella staking markets loaded through on-chain RPC."
                extraRows={[
                  ...cacheRows,
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
                officialUrl={getAaveStakingUrl(chain)}
                protocolName="Aave"
              />
            </td>
            {activeView.coins.map((coin) => {
              const pool = activeView.poolsM?.[chain]?.[coin];
              return (
                <td key={coin}>
                  {pool && (
                    <div>
                      {formatApy(pool.baseApr)}
                      <StakeRewardInfo pool={pool} chain={chain} />
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
