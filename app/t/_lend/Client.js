"use client";

import {
  getChainCoins,
  getCoinTypeOptions,
  getExplorerAddressUrl,
  getInitialCookie,
  getProtocolCookie,
  getSelectedBalance,
  getTradeModeCookie,
  getTokenAddressKey,
  getTradeMarketBalanceQty,
  getTradeMarketCoinBalance,
  TradeMarketAprText,
  TradeMarketCoinBalance,
  TradeMarketCoinInfoCard,
  TradeMarketPicker,
  formatTradeMarketApr,
  hasLoadedBalance,
  lendingOptions,
  sameAddressText,
  toNum,
  useTradeAllMarkets,
  useTradeDirectMarketBalance,
  withClientTimeout,
} from "../clientShared";
import {
  getAaveUnderlyingCoin,
  isAaveChainAvailable,
  isAaveCoin,
} from "./aave/Client";
import {
  getJupiterUnderlyingCoin,
  isJupiterChainAvailable,
  isJupiterCoin,
} from "./jupiter/Client";
import {
  isMorphoChainAvailable,
  isMorphoCoin,
} from "./morpho/Client";
import {
  isVenusChainAvailable,
  isVenusCoin,
} from "./venus/Client";

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

export const formatApr = formatTradeMarketApr;
export const AprText = TradeMarketAprText;
export const LendCoinInfoCard = TradeMarketCoinInfoCard;

export function getUnderlyingCoin(chainE, lendCoin, protocol = "") {
  const coinInfoM = chainE?.coinInfoM || {};
  const lendE = coinInfoM[lendCoin] || {};
  const text = `${lendCoin} ${lendE.name || ""}`.toLowerCase();
  const protocolUnderlying =
    protocol == "aave" ? getAaveUnderlyingCoin(lendCoin) : "";
  const candidates = getChainCoins(chainE)
    .filter((coin) => coin != lendCoin)
    .filter((coin) => coinInfoM[coin]?.type != "lend")
    .sort((a, b) => b.length - a.length);

  if (protocolUnderlying && coinInfoM[protocolUnderlying]) {
    return protocolUnderlying;
  }

  return (
    candidates.find((coin) => coin.toLowerCase() == protocolUnderlying.toLowerCase()) ||
    candidates.find((coin) => text.includes(coin.toLowerCase())) ||
    candidates.find((coin) =>
      ["USDT", "USDC", "USDS", "EURC", "DAI", "USD1"].includes(coin),
    ) ||
    ""
  );
}

export function isProtocolCoin(protocol, coin, coinE = {}) {
  if (protocol == "aave") return isAaveCoin(coin, coinE);
  if (protocol == "venus") return isVenusCoin(coin, coinE);
  if (protocol == "jupiter") return isJupiterCoin(coin, coinE);
  if (protocol == "morpho") return isMorphoCoin(coin, coinE);

  return false;
}

export function getLendingMarkets(chainE, protocol) {
  if (!chainE || !protocol) return [];

  return getChainCoins(chainE)
    .filter((coin) => isProtocolCoin(protocol, coin, chainE.coinInfoM?.[coin]))
    .map((lendCoin) => {
      const lendE = chainE.coinInfoM?.[lendCoin] || {};
      const underlyingCoin =
        protocol == "jupiter"
          ? getJupiterUnderlyingCoin(chainE, lendCoin) ||
            getUnderlyingCoin(chainE, lendCoin, protocol)
          : getUnderlyingCoin(chainE, lendCoin, protocol);

      return {
        value: lendCoin,
        lendCoin,
        lendName: lendE.name || lendCoin,
        lendAddress: lendE.address || "",
        lendDecimals: lendE.decimals,
        underlyingCoin,
        underlyingAddress: chainE.coinInfoM?.[underlyingCoin]?.address || "",
        underlyingDecimals: chainE.coinInfoM?.[underlyingCoin]?.decimals,
      };
    })
    .filter((entry) => protocol == "jupiter" || entry.underlyingCoin);
}

export function getMarketLabel(entry = {}) {
  if (entry?.underlyingCoin && entry?.lendCoin) {
    return `${entry.underlyingCoin}-${entry.lendCoin}`;
  }

  return entry?.underlyingCoin || entry?.lendCoin || "coin";
}

export function getInitialLendDefi(
  initialCookieM = {},
  walletType = "evm",
  cookieName = "",
) {
  const savedDefi = getInitialCookie(
    initialCookieM,
    getTradeModeCookie(cookieName, walletType),
  );
  const options = lendingOptions.filter((option) =>
    isLendingProtocolSupportedForWallet(option, walletType),
  );

  return options.some((entry) => entry.value == savedDefi)
    ? savedDefi
    : options[0]?.value || "";
}

export function getMarketSupplyApr({ chainE, defi, marketE, rawMarkets = [] } = {}) {
  if (defi != "aave" && defi != "venus" && defi != "jupiter") return 0;
  if (marketE?.supplyApr) return toNum(marketE.supplyApr);

  const lendAddress =
    marketE?.lendAddress || chainE?.coinInfoM?.[marketE?.lendCoin]?.address || "";
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

export function useLendAllMarkets({
  enabled = false,
  cacheKey = "",
  chain = "",
  protocolLabel = "Lend",
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

export function useLendDirectMarketBalance({
  enabled = false,
  cacheKey = "",
  walletAddress = "",
  chain = "",
  marketE = {},
  getMarketBalance,
  protocolLabel = "Lend",
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

export function isLendingProtocolSupportedForWallet(option = {}, walletType = "evm") {
  if (walletType == "solana") return option.value == "jupiter";
  if (option.value == "jupiter") return false;

  return true;
}

export function getLendMarketChains(chainList = [], chainMarketsM = {}, defi = "") {
  return chainList
    .filter((chainE) => {
      const chainMarkets = chainMarketsM[chainE.chain] || [];
      if (defi == "aave") {
        return isAaveChainAvailable(chainE.chain, chainMarkets);
      }
      if (defi == "jupiter") return isJupiterChainAvailable(chainE.chain);
      if (defi == "morpho") {
        return isMorphoChainAvailable(chainE.chain, chainMarkets);
      }

      return isVenusChainAvailable(chainE.chain, chainMarkets);
    })
    .map((chainE) => chainE.chain);
}

export const getMarketCoinBalance = getTradeMarketCoinBalance;
export const MarketCoinBalance = TradeMarketCoinBalance;
export const getBalanceQty = getTradeMarketBalanceQty;

function getAllMarketSelectValue(entry = {}) {
  return entry.addedUnderlying && entry.addedLend && entry.addedValue
    ? entry.addedValue
    : entry.value;
}

export function LendMarketPicker(props) {
  const { defi = "", rawAllMarkets = [], jupiterAllKey = "" } = props;
  const allEmptyText =
    defi == "jupiter" && !jupiterAllKey
      ? "Solana not loaded"
      : rawAllMarkets.length
        ? "all added"
        : "-";
  const showAllEmptyRetry =
    !rawAllMarkets.length && (defi != "jupiter" || jupiterAllKey);

  return (
    <TradeMarketPicker
      {...props}
      allEmptyText={allEmptyText}
      showAllEmptyRetry={showAllEmptyRetry}
      getAllMarketSelectValue={getAllMarketSelectValue}
    />
  );
}
