"use client";
import "ygb/react";
import { useState } from "react";
import { pc } from "@/fn/basic";
import Toggle from "@/components/Toggle";
import Link from "next/link";
import { HoverInfoCard, TableSortHeader } from "@/components/Shared";
import { getAaveMarketUrl } from "@/app/_shared/aave";
import ProtocolChainLink from "../../ProtocolChainLink";

const supplyIncentiveTypes = new Set([
  "AaveSupplyIncentive",
  "MeritSupplyIncentive",
  "MerklSupplyIncentive",
  "SupplyPointsIncentive",
]);

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatApy(value) {
  const number = toFiniteNumber(value);
  if (number === null) return "";
  return number.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function getPointsLabel(incentive = {}) {
  const pointsPerThousandUsd = toFiniteNumber(incentive.pointsPerThousandUsd);
  if (pointsPerThousandUsd !== null) {
    return `${pc(pointsPerThousandUsd)} points/$1k`;
  }
  const dailyPoints = toFiniteNumber(incentive.dailyPoints);
  if (dailyPoints !== null) {
    return `${pc(dailyPoints)} points/day`;
  }
  const multiplier = toFiniteNumber(incentive.multiplier);
  if (multiplier !== null) {
    return `${pc(multiplier)}x points`;
  }

  return "points";
}

function formatBonusDate(value) {
  if (!value) return "";
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year <= 1971 || year >= 2099) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function getSupplyBonuses(incentives) {
  if (!Array.isArray(incentives)) return [];
  return incentives.filter((incentive) =>
    supplyIncentiveTypes.has(incentive?.__typename),
  );
}

function getBonusApy(incentives) {
  return getSupplyBonuses(incentives).reduce(
    (sum, incentive) =>
      sum + (toFiniteNumber(incentive.extraSupplyApr?.formatted) || 0),
    0,
  );
}

function getEffectiveApy(coinE) {
  const protocolApy = toFiniteNumber(coinE?.supply?.apy);
  if (protocolApy === null) return null;
  return protocolApy + getBonusApy(coinE?.incentives);
}

function sortChainsByCoin(chainNames, coinsM, coin) {
  if (!coin) return chainNames;

  return chainNames
    .map((chain, index) => ({
      chain,
      index,
      apy: getEffectiveApy(coinsM?.[chain]?.[coin]),
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

function getIncentiveName(incentive = {}) {
  if (incentive.__typename == "SupplyPointsIncentive") {
    return incentive.name || incentive.program?.name || "Points";
  }

  return (
    {
      AaveSupplyIncentive: "Aave rewards",
      MeritSupplyIncentive: "Merit rewards",
      MerklSupplyIncentive: "Merkl rewards",
    }[incentive.__typename] || incentive.__typename
  );
}

function getIncentiveLinks(incentive = {}) {
  const links = [
    { href: incentive.claimLink, label: "claim" },
    {
      href: incentive.program?.externalUrl,
      label: incentive.program?.name || "program",
    },
    { href: incentive.customForumLink, label: "details" },
  ];
  const seen = new Set();
  return links.filter(({ href }) => {
    if (!href || seen.has(href)) return false;
    seen.add(href);
    return true;
  });
}

function shortAddress(address = "") {
  const value = String(address);
  return value.length > 14
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : value;
}

function SupplyIncentiveInfo({ incentive = {} }) {
  const type = incentive.__typename;
  const apr = toFiniteNumber(incentive.extraSupplyApr?.formatted);
  const selfApr = toFiniteNumber(incentive.selfApr?.formatted);
  const pointsLabel =
    type == "SupplyPointsIncentive" ? getPointsLabel(incentive) : "";
  const rewardSymbol =
    incentive.rewardTokenSymbol || incentive.payoutToken?.symbol || "";
  const rewardName = incentive.payoutToken?.name || "";
  const rewardAddress =
    incentive.rewardTokenAddress || incentive.payoutToken?.address || "";
  const startDate = formatBonusDate(incentive.startDate);
  const endDate = formatBonusDate(incentive.endDate);
  const criteria = Array.isArray(incentive.criteria) ? incentive.criteria : [];
  const messages = [
    incentive.description,
    incentive.customMessage,
    incentive.customClaimMessage,
  ].filter((message, index, all) => message && all.indexOf(message) == index);
  const links = getIncentiveLinks(incentive);

  return (
    <span className="aaveBonusInfoEntry">
      <span className="infoCardTitle">{getIncentiveName(incentive)}</span>
      <span>
        <span className="gray">type: </span>
        {type}
      </span>
      {apr !== null && (
        <span>
          <span className="gray">bonus APY: </span>
          {formatApy(apr)}%
        </span>
      )}
      {selfApr !== null && (
        <span>
          <span className="gray">self APY: </span>
          {formatApy(selfApr)}%
        </span>
      )}
      {pointsLabel && (
        <span>
          <span className="gray">points: </span>
          {pointsLabel}
        </span>
      )}
      {incentive.kind && (
        <span>
          <span className="gray">kind: </span>
          {String(incentive.kind).toLowerCase()}
        </span>
      )}
      {incentive.actionKey && (
        <span>
          <span className="gray">action: </span>
          {incentive.actionKey}
        </span>
      )}
      {rewardSymbol && (
        <span>
          <span className="gray">reward: </span>
          {rewardSymbol}
          {rewardName && rewardName != rewardSymbol ? ` - ${rewardName}` : ""}
        </span>
      )}
      {rewardAddress && (
        <span title={rewardAddress}>
          <span className="gray">reward address: </span>
          {shortAddress(rewardAddress)}
        </span>
      )}
      {(startDate || endDate) && (
        <span>
          <span className="gray">period: </span>
          {startDate || "now"} {endDate ? `- ${endDate}` : ""}
        </span>
      )}
      {typeof incentive.userEligible == "boolean" && (
        <span>
          <span className="gray">eligible: </span>
          <span className={incentive.userEligible ? "green" : "red"}>
            {incentive.userEligible ? "yes" : "no"}
          </span>
        </span>
      )}
      {criteria.map((criterion, index) => (
        <span key={criterion.id || index}>
          <span className="gray">criteria: </span>
          {criterion.text}
          {typeof criterion.userPassed == "boolean" && (
            <span className={criterion.userPassed ? "green" : "red"}>
              {criterion.userPassed ? " (passed)" : " (not passed)"}
            </span>
          )}
        </span>
      ))}
      {messages.map((message) => (
        <span key={message}>{message}</span>
      ))}
      {links.length > 0 && (
        <span className="aaveBonusInfoLinks">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} target="_blank" rel="noreferrer">
              {label} <span className="gray externalLinkIcon">↗</span>
            </Link>
          ))}
        </span>
      )}
    </span>
  );
}

function SupplyBonusInfo({ incentives, protocolApy }) {
  const bonuses = getSupplyBonuses(incentives);
  if (!bonuses.length) return null;

  const bonusApy = getBonusApy(bonuses);
  const protocolApyNumber = toFiniteNumber(protocolApy);
  const hasPoints = bonuses.some(
    (incentive) => incentive.__typename == "SupplyPointsIncentive",
  );
  const trigger = bonusApy > 0 ? formatApy(bonusApy) : "points";

  return (
    <>
      <span className="gray">+</span>
      <HoverInfoCard className="aaveBonusInfoHover">
        <span className="info">{trigger}</span>
        <span className="infoCard aaveBonusInfoCard">
          <span className="infoCardTitle">Supply bonuses</span>
          {protocolApyNumber !== null && (
            <span>
              <span className="gray">protocol APY: </span>
              {formatApy(protocolApyNumber)}%
            </span>
          )}
          {bonusApy > 0 && (
            <>
              <span>
                <span className="gray">bonus APY: </span>
                {formatApy(bonusApy)}%
              </span>
              {protocolApyNumber !== null && (
                <span>
                  <span className="gray">combined APY: </span>
                  {formatApy(protocolApyNumber + bonusApy)}%
                </span>
              )}
            </>
          )}
          {hasPoints && bonusApy <= 0 && (
            <span>
              <span className="gray">bonus: </span>
              points
            </span>
          )}
          {bonuses.map((incentive, index) => (
            <SupplyIncentiveInfo
              key={`${incentive.__typename}_${incentive.id || index}`}
              incentive={incentive}
            />
          ))}
        </span>
      </HoverInfoCard>
    </>
  );
}

const Chain = ({
  chains,
  coins,
  coinsM,
  linkPath = "/d/aave/lend",
}) => {
  let chainNames = Object.keys(chains);
  const [show, setShow] = useState(false);
  const [sortCoin, setSortCoin] = useState("");
  if (!show)
    coins = coins.filter(
      (coin) => /(USD|DAI|ETH|BTC|BNB|EUR)/.test(coin) && !/^PT-/.test(coin),
    ); //filter PT-sUSDE-25SEP2025
  const activeSortCoin = coins.includes(sortCoin) ? sortCoin : "";
  chainNames = sortChainsByCoin(chainNames, coinsM, activeSortCoin);

  return (
    <table>
      <caption>Aave lending</caption>
      <thead>
        <tr>
          <th className="stickyA">
            <Toggle {...{ show, setShow }} />
          </th>
          {coins.map((coin) => (
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
        {chainNames.map((chain) => {
          return (
            <tr key={chain}>
              <td className="stickyL">
                <ProtocolChainLink
                  chain={chain}
                  filterPath={linkPath}
                  officialUrl={getAaveMarketUrl(chain)}
                  protocolName="Aave"
                />
              </td>
              {coins.map((coin) => {
                let coinE = coinsM[chain][coin];
                let bonuses = coinE?.incentives;
                let protocolApy = coinE?.supply?.apy;
                return (
                  <td key={coin}>
                    {protocolApy && (
                      <div>
                        {protocolApy}
                        <SupplyBonusInfo
                          incentives={bonuses}
                          protocolApy={protocolApy}
                        />
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
export default Chain;
