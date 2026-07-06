"use client";

import {
  getChainCoins,
  getCoinTypeOptions,
  getExplorerAddressUrl,
  getInitialCookie,
  getProtocolCookie,
  getSelectedBalance,
  getTokenAddressKey,
  getTradeModeCookie,
  getTradeMarketBalanceQty,
  getTradeMarketCoinBalance,
  TradeMarketAprText,
  TradeMarketCoinBalance,
  TradeMarketCoinInfoCard,
  TradeMarketPicker,
  formatTradeMarketApr,
  hasLoadedBalance,
  sameAddressText,
  toNum,
  useTradeAllMarkets,
  useTradeDirectMarketBalance,
  withClientTimeout,
  yieldOptions,
} from "../clientShared";
import {
  isHyperliquidChainAvailable,
  isHyperliquidCoin,
} from "./hyperliquid/Client";
import {
  isAaveStakingChainAvailable,
  isAaveStakingCoin,
} from "./aaveStaking/Client";
import {
  isSparkChainAvailable,
  isSparkCoin,
} from "./spark/Client";
import {
  isVenusFluxChainAvailable,
  isVenusFluxCoin,
} from "./venusFlux/Client";

export {
  getCoinTypeOptions,
  getExplorerAddressUrl,
  getInitialCookie,
  getProtocolCookie,
  getSelectedBalance,
  getTokenAddressKey,
  hasLoadedBalance,
  sameAddressText,
  withClientTimeout,
};

export function isYieldProtocolSupportedForWallet(option = {}, walletType = "evm") {
  if (walletType == "solana") return false;
  if (option.value == "spark") return true;
  if (option.value == "aaveStaking") return true;
  if (option.value == "venusFlux") return true;
  if (option.value == "hyperliquid") return true;

  return false;
}

export function getInitialYieldDefi(
  initialCookieM = {},
  walletType = "evm",
  cookieName = "",
) {
  const savedDefi = getInitialCookie(
    initialCookieM,
    getTradeModeCookie(cookieName, walletType),
  );
  const options = yieldOptions.filter((option) =>
    isYieldProtocolSupportedForWallet(option, walletType),
  );

  return options.some((entry) => entry.value == savedDefi)
    ? savedDefi
    : options[0]?.value || "";
}

export function useYieldAllMarkets({
  enabled = false,
  cacheKey = "",
  chain = "",
  protocolLabel = "Yield",
  getAllMarkets,
  timeoutMs = 25000,
} = {}) {
  return useTradeAllMarkets({
    enabled,
    cacheKey,
    chain,
    protocolLabel,
    getAllMarkets,
    timeoutMs,
  });
}

export function useYieldDirectMarketBalance({
  enabled = false,
  cacheKey = "",
  walletAddress = "",
  chain = "",
  marketE = {},
  getMarketBalance,
  protocolLabel = "Yield",
  timeoutMs = 12000,
} = {}) {
  return useTradeDirectMarketBalance({
    enabled,
    cacheKey,
    walletAddress,
    chain,
    marketE,
    getMarketBalance,
    protocolLabel,
    timeoutMs,
  });
}

export function getMarketSupplyApr({
  chainE,
  defi,
  marketE,
  rawMarkets = [],
} = {}) {
  if (!["spark", "aaveStaking", "venusFlux"].includes(defi)) return 0;
  if (marketE?.supplyApr) return toNum(marketE.supplyApr);

  const lendAddress =
    marketE?.lendAddress ||
    chainE?.coinInfoM?.[marketE?.lendCoin]?.address ||
    "";
  const underlyingAddress =
    marketE?.underlyingAddress ||
    chainE?.coinInfoM?.[marketE?.underlyingCoin]?.address ||
    "";
  const match = rawMarkets.find(
    (entry) =>
      (lendAddress && sameAddressText(entry.lendAddress, lendAddress)) ||
      (underlyingAddress &&
        sameAddressText(entry.underlyingAddress, underlyingAddress)) ||
      (entry.underlyingCoin == marketE?.underlyingCoin &&
        entry.lendCoin == marketE?.lendCoin),
  );

  return toNum(match?.supplyApr);
}

export function isUsdLikeYieldCoin(coin = "") {
  return /USD/i.test(String(coin || ""));
}

export function isProtocolCoin(protocol, coin, coinE = {}) {
  if (protocol == "hyperliquid") return isHyperliquidCoin(coin, coinE);
  if (protocol == "spark") return isSparkCoin(coin, coinE);
  if (protocol == "aaveStaking") return isAaveStakingCoin(coin, coinE);
  if (protocol == "venusFlux") return isVenusFluxCoin(coin, coinE);

  return false;
}

export function getYieldMarketChains(chainList = [], chainMarketsM = {}, defi = "") {
  return chainList
    .filter((chainE) => {
      const chainMarkets = chainMarketsM[chainE.chain] || [];
      if (defi == "hyperliquid") {
        return isHyperliquidChainAvailable(chainE.chain, chainMarkets);
      }
      if (defi == "spark") {
        return isSparkChainAvailable(chainE.chain, chainMarkets);
      }
      if (defi == "aaveStaking") {
        return isAaveStakingChainAvailable(chainE.chain, chainMarkets);
      }

      return isVenusFluxChainAvailable(chainE.chain, chainMarkets);
    })
    .map((chainE) => chainE.chain);
}

export function getUnderlyingCoin(chainE, lendCoin) {
  if (chainE?.chain == "Hyperliquid") return "USDC";

  const coinInfoM = chainE?.coinInfoM || {};
  const lendE = coinInfoM[lendCoin] || {};
  const text = `${lendCoin} ${lendE.name || ""}`.toLowerCase();
  const savingsNameMatch = String(lendE.name || "").match(
    /\bsavings\s+([a-z0-9.]+)/i,
  );
  if (savingsNameMatch?.[1]) return savingsNameMatch[1].toUpperCase();
  if (/^stk/i.test(lendCoin)) {
    const aaveStakingMatch = String(lendCoin).match(
      /^stkwaEth([a-z0-9.]+?)(?:\.v\d+)?$/i,
    );
    if (aaveStakingMatch?.[1]) {
      const baseCoin = aaveStakingMatch[1].toUpperCase();
      if (coinInfoM[baseCoin]) return baseCoin;

      const aTokenCoin = `aEth${baseCoin}`;
      if (coinInfoM[aTokenCoin]) return aTokenCoin;

      return baseCoin;
    }

    const wrapped = lendCoin.replace(/^stk/i, "").replace(/\.v\d+$/i, "");
    if (wrapped) return wrapped;
  }
  if (/^sp[A-Z0-9.]{2,}$/.test(lendCoin)) return lendCoin.slice(2);
  if (/^f[A-Z0-9.]{2,}$/.test(lendCoin)) return lendCoin.slice(1);
  if (/^s[A-Z0-9.]{2,}$/.test(lendCoin)) return lendCoin.slice(1);

  const candidates = getChainCoins(chainE)
    .filter((coin) => coin != lendCoin)
    .filter((coin) => coinInfoM[coin]?.type != "lend")
    .sort((a, b) => b.length - a.length);

  return (
    candidates.find((coin) => text.includes(coin.toLowerCase())) ||
    candidates.find((coin) => ["USDT", "USDC", "DAI"].includes(coin)) ||
    candidates[0] ||
    ""
  );
}

export function getLendingMarkets(chainE, protocol) {
  if (!chainE || !protocol) return [];

  return getChainCoins(chainE)
    .filter((coin) => isProtocolCoin(protocol, coin, chainE.coinInfoM?.[coin]))
    .map((lendCoin) => {
      const lendE = chainE.coinInfoM?.[lendCoin] || {};
      const underlyingCoin = getUnderlyingCoin(chainE, lendCoin);

      return {
        value: lendCoin,
        protocol,
        lendCoin,
        lendName: lendE.name || lendCoin,
        underlyingCoin,
      };
    })
    .filter((entry) => entry.underlyingCoin);
}

export function getMarketLabel(entry = {}) {
  if (entry.protocol == "hyperliquid") return entry.lendCoin || "vault";

  if (entry?.underlyingCoin && entry?.lendCoin) {
    return `${entry.underlyingCoin}-${entry.lendCoin}`;
  }

  return entry?.underlyingCoin || entry?.lendCoin || "coin";
}

export const formatApr = formatTradeMarketApr;

export function getLockUntilMs(value) {
  const timestamp = Number(value);
  if (!(timestamp > 0)) return 0;

  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

export function formatLockUntil(value) {
  const ms = getLockUntilMs(value);
  if (!ms) return "";

  return new Date(ms).toLocaleString();
}

export function LendCoinInfoCard({ coin, name, lockedUntilTimestamp = 0 }) {
  return (
    <TradeMarketCoinInfoCard
      coin={coin}
      name={name}
      lockedUntilTimestamp={lockedUntilTimestamp}
      formatLockedUntil={formatLockUntil}
    />
  );
}

export const AprText = TradeMarketAprText;
export const getMarketCoinBalance = getTradeMarketCoinBalance;
export const MarketCoinBalance = TradeMarketCoinBalance;
export const getBalanceQty = getTradeMarketBalanceQty;

export function YieldMarketPicker(props) {
  const visibleAddedMarkets = props.visibleAddedMarkets || [];

  return (
    <TradeMarketPicker
      {...props}
      allEmptyText={visibleAddedMarkets.length ? "all added" : "-"}
      showAllEmptyRetry={!visibleAddedMarkets.length}
      showAllAddedOnError
      formatLockedUntil={formatLockUntil}
    />
  );
}
