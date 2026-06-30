"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import { scanners } from "@/sets";
import {
  buildHyperliquidAgentApproval,
  buildHyperliquidLendTxs,
  executeHyperliquidLend,
  getHyperliquidLendPreview,
  submitHyperliquidAgentApproval,
  submitHyperliquidLendSignature,
} from "./svHyperliquid";
import {
  buildSparkLendTxs,
  executeSparkLend,
  getSparkAllMarkets,
  getSparkLendPreview,
  getSparkMarketBalance,
} from "./svSpark";
import {
  buildVenusFluxLendTxs,
  executeVenusFluxLend,
  getVenusFluxAllMarkets,
  getVenusFluxLendPreview,
  getVenusFluxMarketBalance,
} from "./svVenusFlux";
import { getTradeCoinPrice } from "./sv";
import { addCustomCoin, previewCustomCoin } from "../../w/coinActions";
import {
  addLocalCustomCoin,
  useLocalStorageEditor,
} from "../../browserEditorStorage";
import {
  clampInputValue,
  cookieMaxAge,
  emitTradeChainSelect,
  fmt,
  fmtPrice,
  fmtRate,
  getChainCoins,
  getBrowserEvmChainId,
  getHyperliquidBrowserAgent,
  getTradeModeCookie,
  inputQty,
  yieldOptions as lendingOptions,
  nextValue,
  noYield as noLending,
  normalizeQtyInput,
  priceKey,
  readQtyInput,
  sameAddress,
  sendBrowserTx,
  signHyperliquidBrowserAgentTypedData,
  signBrowserTypedData,
  SwapTxLink,
  tradeAutoApprovalCookie,
  tradeYieldChainCookie,
  tradeYieldDefiCookie,
  tradeYieldMarketCookie,
  toNum,
} from "../clientShared";

function isProtocolCoin(protocol, coin, coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  if (protocol == "hyperliquid") return coinE.type == "vault";
  if (protocol == "spark") {
    return (
      coinE.type == "yield" &&
      (text.includes("spark") ||
        text.includes("savings") ||
        text.includes("susds") ||
        /^sp[A-Z]/.test(coin))
    );
  }
  if (protocol == "venusFlux") {
    return (
      !!coinE?.address &&
      /^f[A-Z0-9]/.test(coin) &&
      (text.includes("venus") ||
        text.includes("fluid") ||
        text.includes("flux"))
    );
  }

  return false;
}

const sparkSupportedChains = new Set([
  "Ethereum",
  "Arbitrum",
  "Avalanche",
  "Base",
  "Optimism",
]);

function isYieldProtocolSupportedForWallet(option = {}, walletType = "evm") {
  if (walletType == "solana") return false;
  if (option.value == "spark") return true;
  if (option.value == "venusFlux") return true;
  if (option.value == "hyperliquid") return true;

  return false;
}

function getProtocolCookie(base = "", walletType = "evm", defi = "", chain = "") {
  return [
    getTradeModeCookie(base, walletType),
    defi || "defi",
    chain || "",
  ]
    .filter(Boolean)
    .join("_");
}

function getInitialCookie(initialCookieM = {}, name = "") {
  const value = initialCookieM?.[name];
  return value === undefined ? undefined : String(value);
}

function getInitialYieldDefi(initialCookieM = {}, walletType = "evm") {
  const savedDefi = getInitialCookie(
    initialCookieM,
    getTradeModeCookie(tradeYieldDefiCookie, walletType),
  );
  const options = lendingOptions.filter((option) =>
    isYieldProtocolSupportedForWallet(option, walletType),
  );

  return options.some((entry) => entry.value == savedDefi)
    ? savedDefi
    : options[0]?.value || "";
}

function getInitialAutoApproval(initialCookieM = {}) {
  return getInitialCookie(initialCookieM, tradeAutoApprovalCookie) == "1";
}

function getYieldMarketChains(chainList = [], chainMarketsM = {}, defi = "") {
  const isHyperliquid = defi == "hyperliquid";

  return chainList
    .filter(
      (chainE) =>
        (isHyperliquid
          ? chainE.chain == "Hyperliquid" && chainMarketsM[chainE.chain]?.length
          : chainMarketsM[chainE.chain]?.length) ||
        (defi == "spark" && sparkSupportedChains.has(chainE.chain)),
    )
    .map((chainE) => chainE.chain);
}

function getUnderlyingCoin(chainE, lendCoin) {
  if (chainE?.chain == "Hyperliquid") return "USDC";

  const coinInfoM = chainE?.coinInfoM || {};
  const lendE = coinInfoM[lendCoin] || {};
  const text = `${lendCoin} ${lendE.name || ""}`.toLowerCase();
  const savingsNameMatch = String(lendE.name || "").match(
    /\bsavings\s+([a-z0-9.]+)/i,
  );
  if (savingsNameMatch?.[1]) return savingsNameMatch[1].toUpperCase();
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

function getLendingMarkets(chainE, protocol) {
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

function getMarketLabel(entry = {}) {
  if (entry.protocol == "hyperliquid") return entry.lendCoin || "vault";

  return entry?.underlyingCoin
    ? `${entry.underlyingCoin} (${entry.lendCoin})`
    : "coin";
}

function formatApr(apr) {
  const value = toNum(apr);
  if (value <= 0) return "";
  if (value < 0.01) return "<0.01%";
  return `${fmt(value, value >= 10 ? 1 : 2)}%`;
}

function getLockUntilMs(value) {
  const timestamp = Number(value);
  if (!(timestamp > 0)) return 0;

  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

function formatLockUntil(value) {
  const ms = getLockUntilMs(value);
  if (!ms) return "";

  return new Date(ms).toLocaleString();
}

function sameAddressText(a = "", b = "") {
  return (
    String(a || "").trim().toLowerCase() ==
    String(b || "").trim().toLowerCase()
  );
}

function getHyperliquidAgentCookie(walletAddress = "", agentAddress = "") {
  const walletKey = String(walletAddress || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const agentKey = String(agentAddress || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return `w3_hl_agent_${walletKey}_${agentKey}`;
}

function getMarketSupplyApr({ chainE, defi, marketE, rawMarkets = [] } = {}) {
  if (defi != "spark" && defi != "venusFlux") return 0;
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

function AprText({ apr, label = true }) {
  const text = formatApr(apr);
  return text ? (
    <span className="lendApr">
      {label && <span className="gray">apr: </span>}
      {text}
    </span>
  ) : null;
}

function LendCoinInfoCard({ coin, name, lockedUntilTimestamp = 0 }) {
  const cleanCoin = String(coin || "").trim();
  const cleanName = String(name || "").trim();
  const lockText = formatLockUntil(lockedUntilTimestamp);
  if ((!cleanName || cleanName == cleanCoin) && !lockText) return null;

  return (
    <span className="infoCard">
      <span className="infoCardTitle">{cleanCoin}</span>
      {cleanName && cleanName != cleanCoin && <span>{cleanName}</span>}
      {lockText && (
        <span>
          locked until <span className="gray">{lockText}</span>
        </span>
      )}
    </span>
  );
}

function getCoinTypeOptions(chainList = [], extraType = "") {
  const types = new Set(["token"]);

  for (const chainE of chainList || []) {
    for (const coinE of Object.values(chainE?.coinInfoM || {})) {
      if (coinE?.type) types.add(String(coinE.type));
    }
  }
  if (extraType) types.add(String(extraType));

  return [...types].sort((a, b) => a.localeCompare(b));
}

function withClientTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function getSelectedBalance(chainE, coin, selectedWalletEntry) {
  if (!chainE || !coin || !selectedWalletEntry) return {};

  const row = chainE.rows?.find(
    (entry) =>
      sameAddress(entry.address, selectedWalletEntry.address) ||
      entry.name == selectedWalletEntry.name,
  );

  return row?.balances?.[coin] || {};
}

function hasLoadedBalance(balance = {}) {
  return Object.prototype.hasOwnProperty.call(balance || {}, "balance");
}

function getExplorerAddressUrl(chain = "", address = "") {
  const scanner = scanners?.[chain];
  if (!scanner || !address) return "";

  return `${String(scanner).replace(/\/+$/, "")}/address/${address}`;
}

export default function YieldPanel({
  data = [],
  selectedWalletEntry,
  walletType = "evm",
  initialCookieM = {},
  tradeType,
  tradeTypes = [],
  onTradeTypeChange,
  onCycleTradeType,
  onTxComplete = () => {},
}) {
  const initialDefi = getInitialYieldDefi(initialCookieM, walletType);
  const chainList = useMemo(
    () =>
      (Array.isArray(data) ? data : data ? [data] : [])
        .filter(Boolean)
        .filter((chainE) =>
          walletType == "solana"
            ? chainE.chain == "Solana"
            : chainE.chain != "Solana",
      ),
    [data, walletType],
  );
  const initialChainMarketsM = useMemo(() => {
    return Object.fromEntries(
      chainList.map((chainE) => [
        chainE.chain,
        getLendingMarkets(chainE, initialDefi),
      ]),
    );
  }, [chainList, initialDefi]);
  const initialMarketChains = useMemo(
    () => getYieldMarketChains(chainList, initialChainMarketsM, initialDefi),
    [chainList, initialChainMarketsM, initialDefi],
  );
  const initialSavedChain =
    getInitialCookie(
      initialCookieM,
      getProtocolCookie(tradeYieldChainCookie, walletType, initialDefi),
    ) || "";
  const initialChain = initialMarketChains.includes(initialSavedChain)
    ? initialSavedChain
    : initialMarketChains[0] || "";
  const initialChainE =
    chainList.find((entry) => entry.chain == initialChain) || chainList[0];
  const initialMarkets = initialChainMarketsM[initialChainE?.chain] || [];
  const initialSavedMarket =
    getInitialCookie(
      initialCookieM,
      getProtocolCookie(
        tradeYieldMarketCookie,
        walletType,
        initialDefi,
        initialChain,
      ),
    ) || "";
  const initialMarket =
    initialSavedMarket || initialMarkets[0]?.value || "";
  const [defi, setDefi] = useState(initialDefi);
  const [chain, setChain] = useState(initialChain);
  const [market, setMarket] = useState(initialMarket);
  const [lendQty, setLendQty] = useState("0");
  const [receiptQty, setReceiptQty] = useState("0");
  const [underlyingEndDraft, setUnderlyingEndDraft] = useState("");
  const [receiptEndDraft, setReceiptEndDraft] = useState("");
  const [qtyInputSide, setQtyInputSide] = useState("lend");
  const [fallbackPriceM, setFallbackPriceM] = useState({});
  const [priceLoadingM, setPriceLoadingM] = useState({});
  const [marketPreviewM, setMarketPreviewM] = useState({});
  const [marketLoadingM, setMarketLoadingM] = useState({});
  const [lendPending, setLendPending] = useState(false);
  const [lendPendingAction, setLendPendingAction] = useState("");
  const [lendResult, setLendResult] = useState(null);
  const [autoApproval, setAutoApproval] = useState(
    getInitialAutoApproval(initialCookieM),
  );
  const [showMarketMenu, setShowMarketMenu] = useState(false);
  const [sparkAllMarketM, setSparkAllMarketM] = useState({});
  const [sparkAllLoadingM, setSparkAllLoadingM] = useState({});
  const [sparkAllErrorM, setSparkAllErrorM] = useState({});
  const [sparkAllRetryTick, setSparkAllRetryTick] = useState(0);
  const [directBalanceM, setDirectBalanceM] = useState({});
  const [directBalanceLoadingM, setDirectBalanceLoadingM] = useState({});
  const [customCoinPreview, setCustomCoinPreview] = useState(null);
  const [customCoinDraft, setCustomCoinDraft] = useState({
    coin: "",
    name: "",
    type: "",
    customType: "",
  });
  const [addingCoin, setAddingCoin] = useState(false);
  const [locallyAddedAddressM, setLocallyAddedAddressM] = useState({});
  const [nowMs, setNowMs] = useState(0);
  const marketPickerRef = useRef(null);
  const mountedRef = useRef(false);
  const useLocalEditorStore = useLocalStorageEditor();
  const chainMarketsM = useMemo(() => {
    return Object.fromEntries(
      chainList.map((chainE) => [chainE.chain, getLendingMarkets(chainE, defi)]),
    );
  }, [chainList, defi]);
  const isHyperliquid = defi == "hyperliquid";
  const isVenusFlux = defi == "venusFlux";
  const marketChains = useMemo(
    () => getYieldMarketChains(chainList, chainMarketsM, defi),
    [chainList, chainMarketsM, defi],
  );
  const activeChain = marketChains.includes(chain) ? chain : marketChains[0] || "";
  const chainE =
    chainList.find((entry) => entry.chain == activeChain) ||
    chainList.find((entry) => marketChains.includes(entry.chain)) ||
    chainList[0];
  const availableYieldOptions = useMemo(
    () =>
      lendingOptions.filter((option) =>
        isYieldProtocolSupportedForWallet(option, walletType),
      ),
    [walletType],
  );
  const lendingE =
    availableYieldOptions.find((entry) => entry.value == defi) || noLending;
  const markets = chainMarketsM[chainE?.chain] || [];
  const addedMarkets = markets;
  const addedMarketAddressM = useMemo(() => {
    const entries = {};
    for (const entry of addedMarkets) {
      const lendAddress = chainE?.coinInfoM?.[entry.lendCoin]?.address;
      if (lendAddress) entries[String(lendAddress).toLowerCase()] = entry.value;
    }
    return entries;
  }, [addedMarkets, chainE?.coinInfoM]);
  const addedCoinAddressM = useMemo(() => {
    const entries = {};
    for (const coinE of Object.values(chainE?.coinInfoM || {})) {
      if (coinE?.address) entries[String(coinE.address).toLowerCase()] = true;
    }
    return entries;
  }, [chainE?.coinInfoM]);
  const sparkAllKey = chainE?.chain || "";
  const allMarketCacheKey = `${defi}:${sparkAllKey}`;
  const rawSparkAllMarkets = sparkAllMarketM[allMarketCacheKey] || [];
  const sparkAllMarkets = rawSparkAllMarkets
    .map((entry) => {
      const addressKey = String(entry.lendAddress || "").toLowerCase();
      const underlyingAddressKey = String(entry.underlyingAddress || "").toLowerCase();
      const addedValue = addedMarketAddressM[addressKey] || "";
      const addedUnderlying =
        entry.addedUnderlying ||
        !!addedCoinAddressM[underlyingAddressKey] ||
        !!locallyAddedAddressM[`${sparkAllKey}:${underlyingAddressKey}`];
      const addedLend =
        entry.addedLend ||
        !!addedValue ||
        !!locallyAddedAddressM[`${sparkAllKey}:${addressKey}`];

      return {
        ...entry,
        addedUnderlying,
        addedLend,
        addedValue,
      };
    })
    .filter((entry) => !entry.addedUnderlying || !entry.addedLend);
  const sparkAllLoading = !!sparkAllLoadingM[allMarketCacheKey];
  const sparkAllError = sparkAllErrorM[allMarketCacheKey] || "";
  const visibleAddedMarkets = useMemo(() => {
    if (!rawSparkAllMarkets.length) return addedMarkets;

    const rawMarketByLendAddress = Object.fromEntries(
      rawSparkAllMarkets
        .filter((entry) => entry.lendAddress)
        .map((entry) => [String(entry.lendAddress).toLowerCase(), entry]),
    );

    return addedMarkets.map((entry) => {
      const lendAddress =
        entry.lendAddress || chainE?.coinInfoM?.[entry.lendCoin]?.address || "";
      const raw = rawMarketByLendAddress[String(lendAddress).toLowerCase()];
      if (!raw) return entry;

      return {
        ...entry,
        ...raw,
        value: entry.value,
        underlyingCoin: entry.underlyingCoin,
        lendCoin: entry.lendCoin,
        lendName: entry.lendName || raw.lendName,
        underlyingAddress: entry.underlyingAddress || raw.underlyingAddress,
        underlyingDecimals: Number.isInteger(entry.underlyingDecimals)
          ? entry.underlyingDecimals
          : raw.underlyingDecimals,
        lendAddress: entry.lendAddress || raw.lendAddress,
        lendDecimals: Number.isInteger(entry.lendDecimals)
          ? entry.lendDecimals
          : raw.lendDecimals,
        addedValue: entry.value,
        addedLend: true,
      };
    });
  }, [addedMarkets, chainE?.coinInfoM, rawSparkAllMarkets]);
  const allMarkets = isHyperliquid ? [] : sparkAllMarkets;
  const allLoading = isHyperliquid ? false : sparkAllLoading;
  const allError = isHyperliquid ? "" : sparkAllError;
  const hasProtocolAllMarkets = !isHyperliquid;
  const allProtocolLabel = isHyperliquid
    ? "Hyperliquid"
    : isVenusFlux
      ? "Venus Flux"
      : "Spark";
  const marketE =
    visibleAddedMarkets.find((entry) => entry.value == market) ||
    allMarkets.find((entry) => entry.value == market) ||
    visibleAddedMarkets[0];
  const marketSupplyApr = getMarketSupplyApr({
    chainE,
    defi,
    marketE,
    rawMarkets: rawSparkAllMarkets,
  });
  const marketButtonWidth = useMemo(() => {
    const maxLabelLength = Math.max(
      8,
      ...visibleAddedMarkets.map((entry) => getMarketLabel(entry).length),
    );

    return `${Math.min(Math.max(maxLabelLength - 1, 1), 32)}ch`;
  }, [visibleAddedMarkets]);
  const coinTypeOptions = useMemo(
    () =>
      getCoinTypeOptions(
        chainList,
        customCoinDraft.customType || customCoinDraft.type,
      ),
    [chainList, customCoinDraft.customType, customCoinDraft.type],
  );
  const underlyingCoin = marketE?.underlyingCoin || "";
  const lendCoin = marketE?.lendCoin || "";
  const lendName = marketE?.lendName || lendCoin;
  const marketMatchesActiveChain =
    !marketE?.chain || marketE.chain == chainE?.chain;
  const usesDirectMarket =
    hasProtocolAllMarkets &&
    marketMatchesActiveChain &&
    !!marketE?.underlyingAddress &&
    !!marketE?.lendAddress;
  const directBalanceKey = usesDirectMarket
    ? [
        defi,
        chainE?.chain || "",
        selectedWalletEntry?.address || "",
        marketE.underlyingAddress,
        marketE.lendAddress,
      ].join(":")
    : "";
  const directBalance = directBalanceM[directBalanceKey] || {};
  const directBalanceLoading = !!directBalanceLoadingM[directBalanceKey];
  const localUnderlyingBalance = getSelectedBalance(
    chainE,
    underlyingCoin,
    selectedWalletEntry,
  );
  const localReceiptBalance = getSelectedBalance(
    chainE,
    lendCoin,
    selectedWalletEntry,
  );
  const hasLocalUnderlyingBalance = hasLoadedBalance(localUnderlyingBalance);
  const hasLocalReceiptBalance = hasLoadedBalance(localReceiptBalance);
  const needsDirectBalance =
    usesDirectMarket && (!hasLocalUnderlyingBalance || !hasLocalReceiptBalance);
  const underlyingBalance =
    !hasLocalUnderlyingBalance && directBalance.underlying
      ? directBalance.underlying
      : localUnderlyingBalance;
  const receiptBalance =
    !hasLocalReceiptBalance && directBalance.lend
      ? directBalance.lend
      : localReceiptBalance;
  const showUnderlyingBalanceLoading =
    directBalanceLoading &&
    needsDirectBalance &&
    !hasLocalUnderlyingBalance &&
    !directBalance.underlying;
  const showReceiptBalanceLoading =
    directBalanceLoading &&
    needsDirectBalance &&
    !hasLocalReceiptBalance &&
    !directBalance.lend;
  const maxUnderlying = toNum(underlyingBalance.balance);
  const maxReceipt = toNum(receiptBalance.balance);
  const withdrawMaxReceipt = isHyperliquid
    ? Math.max(0, maxReceipt - 0.000001)
    : maxReceipt;
  const underlyingPriceKey = priceKey(chainE?.chain || "", underlyingCoin);
  const receiptPriceKey = priceKey(chainE?.chain || "", lendCoin);
  const marketPreviewKey = `${defi}:${chainE?.chain || ""}:${underlyingCoin}:${lendCoin}`;
  const marketPreview = marketPreviewM[marketPreviewKey];
  const marketPreviewLoaded = marketPreview !== undefined;
  const marketLoading = !!marketLoadingM[marketPreviewKey];
  const marketReceiptRate =
    defi == "spark" || defi == "venusFlux"
      ? toNum(marketPreview?.receiptPerUnderlying)
      : 0;
  const underlyingListPrice = toNum(underlyingBalance.price);
  const receiptListPrice = toNum(receiptBalance.price);
  const underlyingFallbackPrice = fallbackPriceM[underlyingPriceKey];
  const receiptFallbackPrice = fallbackPriceM[receiptPriceKey];
  const underlyingPrice =
    underlyingListPrice ||
    toNum(underlyingFallbackPrice) ||
    (isHyperliquid && underlyingCoin == "USDC" ? 1 : 0);
  const receiptPrice =
    receiptListPrice ||
    toNum(receiptFallbackPrice) ||
    (isHyperliquid && lendCoin ? 1 : 0) ||
    ((defi == "spark" || defi == "venusFlux") &&
    underlyingPrice &&
    marketReceiptRate
      ? underlyingPrice / marketReceiptRate
      : 0);
  const vaultLockedUntil =
    receiptBalance.lockedUntilTimestamp ||
    chainE?.coinInfoM?.[lendCoin]?.lockedUntilTimestamp ||
    0;
  const vaultLockedUntilMs = getLockUntilMs(vaultLockedUntil);
  const vaultLocked =
    isHyperliquid && nowMs > 0 && vaultLockedUntilMs > nowMs;
  const vaultLockText = vaultLocked ? formatLockUntil(vaultLockedUntilMs) : "";
  const receiptRate =
    (defi == "spark" || defi == "venusFlux") && marketReceiptRate
      ? marketReceiptRate
      : underlyingPrice && receiptPrice
        ? underlyingPrice / receiptPrice
        : 1;
  const underlyingQty = toNum(lendQty);
  const receiptQtyNum = toNum(receiptQty);
  const isRedeem = qtyInputSide == "redeem";
  const lendSliderValue = Math.min(underlyingQty, maxUnderlying);
  const redeemSliderValue = Math.min(receiptQtyNum, withdrawMaxReceipt);
  const underlyingEnd = isRedeem
    ? maxUnderlying + underlyingQty
    : Math.max(0, maxUnderlying - underlyingQty);
  const receiptEnd = isRedeem
    ? Math.max(0, maxReceipt - receiptQtyNum)
    : maxReceipt + receiptQtyNum;
  const underlyingUsd = underlyingPrice ? maxUnderlying * underlyingPrice : 0;
  const receiptUsd = receiptPrice ? maxReceipt * receiptPrice : 0;
  const underlyingQtyUsd = underlyingPrice ? underlyingQty * underlyingPrice : 0;
  const receiptQtyUsd = receiptPrice ? receiptQtyNum * receiptPrice : 0;
  const underlyingEndUsd = underlyingPrice
    ? underlyingEnd * underlyingPrice
    : 0;
  const receiptEndUsd = receiptPrice ? receiptEnd * receiptPrice : 0;
  const priceLoading =
    !!priceLoadingM[underlyingPriceKey] || !!priceLoadingM[receiptPriceKey];
  const noPriceCoins = [
    underlyingCoin && underlyingPrice <= 0 ? underlyingCoin : "",
    lendCoin && receiptPrice <= 0 ? lendCoin : "",
  ].filter(Boolean);
  const priceStatus = marketLoading
    ? "querying market..."
    : priceLoading
      ? "querying price..."
      : noPriceCoins.length
        ? `price n/a: ${[...new Set(noPriceCoins)].join(", ")}`
        : "";
  const depositLabel = isHyperliquid ? "deposit" : "lend";
  const withdrawLabel = isHyperliquid ? "withdraw" : "redeem";
  const depositButtonLabel = isHyperliquid ? "DEPOSIT" : "LEND";
  const withdrawButtonLabel = isHyperliquid ? "WITHDRAW" : "REDEEM";
  const marketCookieValues = useMemo(() => {
    const values = hasProtocolAllMarkets
      ? [
          ...visibleAddedMarkets.map((entry) => entry.value),
          ...allMarkets.map((entry) => entry.addedValue || entry.value),
        ]
      : markets.map((entry) => entry.value);

    return [...new Set(values.filter(Boolean))];
  }, [allMarkets, hasProtocolAllMarkets, markets, visibleAddedMarkets]);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedDefi = getCookie(getTradeModeCookie(tradeYieldDefiCookie, walletType));
    if (savedDefi && lendingOptions.some((entry) => entry.value == savedDefi)) {
      setDefi(savedDefi);
    }
  }, [walletType]);

  useEffect(() => {
    if (
      availableYieldOptions.length &&
      !availableYieldOptions.some((entry) => entry.value == defi)
    ) {
      setDefi(availableYieldOptions[0].value);
    } else if (!availableYieldOptions.length && defi) {
      setDefi("");
    }
  }, [availableYieldOptions, defi]);

  useEffect(() => {
    if (marketChains.length) {
      const savedChain = getCookie(
        getProtocolCookie(tradeYieldChainCookie, walletType, defi),
      );
      const nextChain = marketChains.includes(savedChain)
        ? savedChain
        : marketChains.includes(chain)
          ? chain
          : marketChains[0];
      if (nextChain != chain) setChain(nextChain);
    } else if (!marketChains.length && chain) {
      setChain("");
    }
  }, [defi, marketChains, walletType]);

  useEffect(() => {
    const marketExists = marketCookieValues.includes(market);

    if (marketCookieValues.length && !marketExists) {
      const savedMarket = getCookie(
        getProtocolCookie(
          tradeYieldMarketCookie,
          walletType,
          defi,
          chainE?.chain,
        ),
      );
      const nextMarket = marketCookieValues.includes(savedMarket)
        ? savedMarket
        : marketCookieValues[0];
      setMarket(nextMarket || "");
    } else if (!markets.length && !allMarkets.length && market) {
      setMarket("");
    }
  }, [
    chainE?.chain,
    defi,
    market,
    marketCookieValues,
    markets,
    walletType,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    function closeMarketMenu(e) {
      if (!marketPickerRef.current?.contains(e.target)) {
        setShowMarketMenu(false);
      }
    }

    document.addEventListener("mousedown", closeMarketMenu);

    return () => {
      document.removeEventListener("mousedown", closeMarketMenu);
    };
  }, []);

  useEffect(() => {
    if ((defi != "spark" && defi != "venusFlux") || !sparkAllKey) return;
    if (
      sparkAllMarketM[allMarketCacheKey] !== undefined ||
      sparkAllLoadingM[allMarketCacheKey]
    ) {
      return;
    }

    const getAllMarkets =
      defi == "venusFlux" ? getVenusFluxAllMarkets : getSparkAllMarkets;
    const protocolLabel = defi == "venusFlux" ? "Venus Flux" : "Spark";

    setSparkAllLoadingM((loadingM) => ({
      ...loadingM,
      [allMarketCacheKey]: true,
    }));
    setSparkAllErrorM((errorM) => ({ ...errorM, [allMarketCacheKey]: "" }));
    withClientTimeout(
      getAllMarkets({ chain: sparkAllKey }),
      25000,
      `${sparkAllKey} ${protocolLabel} loading timeout`,
    )
      .then((res) => {
        if (!mountedRef.current) return;
        setSparkAllMarketM((marketM) => ({
          ...marketM,
          [allMarketCacheKey]: Array.isArray(res?.markets) ? res.markets : [],
        }));
      })
      .catch((e) => {
        if (!mountedRef.current) return;
        setSparkAllMarketM((marketM) => ({
          ...marketM,
          [allMarketCacheKey]: [],
        }));
        setSparkAllErrorM((errorM) => ({
          ...errorM,
          [allMarketCacheKey]: e?.message || `${protocolLabel} markets failed`,
        }));
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setSparkAllLoadingM((loadingM) => ({
          ...loadingM,
          [allMarketCacheKey]: false,
        }));
      });
  }, [
    allMarketCacheKey,
    defi,
    sparkAllKey,
    sparkAllRetryTick,
  ]);

  useEffect(() => {
    if (
      !usesDirectMarket ||
      !needsDirectBalance ||
      !directBalanceKey ||
      !selectedWalletEntry?.address ||
      directBalanceM[directBalanceKey] ||
      directBalanceLoadingM[directBalanceKey]
    ) {
      return;
    }

    let cancelled = false;
    const getMarketBalance =
      defi == "venusFlux" ? getVenusFluxMarketBalance : getSparkMarketBalance;
    const protocolLabel = defi == "venusFlux" ? "Venus Flux" : "Spark";
    setDirectBalanceLoadingM((loadingM) => ({
      ...loadingM,
      [directBalanceKey]: true,
    }));
    withClientTimeout(
      getMarketBalance({
        walletAddress: selectedWalletEntry.address,
        chain: chainE.chain,
        underlyingAddress: marketE.underlyingAddress,
        underlyingDecimals: marketE.underlyingDecimals,
        lendAddress: marketE.lendAddress,
        lendDecimals: marketE.lendDecimals,
      }),
      12000,
      `${chainE.chain} ${protocolLabel} balance timeout`,
    )
      .then((res) => {
        if (cancelled) return;
        setDirectBalanceM((balanceM) => ({
          ...balanceM,
          [directBalanceKey]: {
            underlying: res?.underlying || {},
            lend: res?.lend || {},
          },
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setDirectBalanceM((balanceM) => ({
          ...balanceM,
          [directBalanceKey]: { underlying: {}, lend: {} },
        }));
      })
      .finally(() => {
        if (cancelled) return;
        setDirectBalanceLoadingM((loadingM) => ({
          ...loadingM,
          [directBalanceKey]: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    chainE?.chain,
    defi,
    directBalanceKey,
    marketE?.lendAddress,
    marketE?.lendDecimals,
    marketE?.underlyingAddress,
    marketE?.underlyingDecimals,
    needsDirectBalance,
    selectedWalletEntry?.address,
    usesDirectMarket,
  ]);

  useEffect(() => {
    if (
      (defi != "spark" && defi != "venusFlux") ||
      !chainE?.chain ||
      !underlyingCoin ||
      !lendCoin ||
      !selectedWalletEntry?.address
    ) {
      return;
    }
    if (marketPreviewLoaded) return;

    let cancelled = false;
    const getPreview =
      defi == "venusFlux" ? getVenusFluxLendPreview : getSparkLendPreview;
    setMarketLoadingM((loadingM) => ({
      ...loadingM,
      [marketPreviewKey]: true,
    }));
    getPreview({
      walletAddress: selectedWalletEntry.address,
      chain: chainE.chain,
      action: "lend",
      underlyingCoin,
      lendCoin,
      ...(usesDirectMarket
        ? {
            underlyingAddress: marketE.underlyingAddress,
            underlyingDecimals: marketE.underlyingDecimals,
            lendAddress: marketE.lendAddress,
            lendDecimals: marketE.lendDecimals,
            psm3Address: marketE.psm3Address,
          }
        : {}),
      amount: "1",
    })
      .then((res) => {
        if (cancelled) return;
        setMarketPreviewM((previewM) => ({
          ...previewM,
          [marketPreviewKey]: res,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setMarketPreviewM((previewM) => ({
          ...previewM,
          [marketPreviewKey]: { receiptPerUnderlying: 0 },
        }));
      })
      .finally(() => {
        if (cancelled) return;
        setMarketLoadingM((loadingM) => ({
          ...loadingM,
          [marketPreviewKey]: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    chainE?.chain,
    defi,
    lendCoin,
    marketPreviewLoaded,
    marketPreviewKey,
    marketE?.lendAddress,
    marketE?.lendDecimals,
    marketE?.underlyingAddress,
    marketE?.underlyingDecimals,
    selectedWalletEntry?.address,
    underlyingCoin,
    usesDirectMarket,
  ]);

  useEffect(() => {
    const qty = "0";
    setQtyInputSide("lend");
    setLendQty(qty);
    setReceiptQty("0");
  }, [chainE?.chain, lendCoin, selectedWalletEntry?.value]);

  useEffect(() => {
    if (qtyInputSide == "redeem") {
      const next =
        receiptRate > 0 ? inputQty(toNum(receiptQty) / receiptRate) : "0";
      if (next != lendQty) setLendQty(next);
      return;
    }

    const next = inputQty(toNum(lendQty) * receiptRate);
    if (next != receiptQty) setReceiptQty(next);
  }, [lendQty, qtyInputSide, receiptQty, receiptRate]);

  useEffect(() => {
    if (chainE?.chain == "Hyperliquid") return;
    if (!chainE?.chain || !underlyingCoin || underlyingListPrice > 0) return;
    if (underlyingFallbackPrice !== undefined) return;

    let cancelled = false;
    setPriceLoadingM((priceM) => ({ ...priceM, [underlyingPriceKey]: true }));
    getTradeCoinPrice({ chain: chainE.chain, coin: underlyingCoin })
      .then((res) => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({
          ...priceM,
          [underlyingPriceKey]: toNum(res?.price),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({ ...priceM, [underlyingPriceKey]: 0 }));
      })
      .finally(() => {
        if (cancelled) return;
        setPriceLoadingM((priceM) => ({
          ...priceM,
          [underlyingPriceKey]: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    chainE?.chain,
    underlyingCoin,
    underlyingFallbackPrice,
    underlyingListPrice,
    underlyingPriceKey,
  ]);

  useEffect(() => {
    if (chainE?.chain == "Hyperliquid") return;
    if (!chainE?.chain || !lendCoin || receiptListPrice > 0) return;
    if (receiptFallbackPrice !== undefined) return;

    let cancelled = false;
    setPriceLoadingM((priceM) => ({ ...priceM, [receiptPriceKey]: true }));
    getTradeCoinPrice({ chain: chainE.chain, coin: lendCoin })
      .then((res) => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({
          ...priceM,
          [receiptPriceKey]: toNum(res?.price),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({ ...priceM, [receiptPriceKey]: 0 }));
      })
      .finally(() => {
        if (cancelled) return;
        setPriceLoadingM((priceM) => ({ ...priceM, [receiptPriceKey]: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    chainE?.chain,
    lendCoin,
    receiptFallbackPrice,
    receiptListPrice,
    receiptPriceKey,
  ]);

  function getReceiptQty(value) {
    return inputQty(toNum(value) * receiptRate);
  }

  function getUnderlyingQty(value) {
    return receiptRate > 0 ? inputQty(toNum(value) / receiptRate) : "0";
  }

  function updateLendQty(value) {
    const qty = normalizeQtyInput(clampInputValue(value, maxUnderlying));
    setQtyInputSide("lend");
    setLendQty(qty);
    setReceiptQty(getReceiptQty(qty));
  }

  function updateRedeemQty(value) {
    const qty = normalizeQtyInput(clampInputValue(value, withdrawMaxReceipt));
    setQtyInputSide("redeem");
    setReceiptQty(qty);
    setLendQty(getUnderlyingQty(qty));
  }

  function updateUnderlyingEnd(value) {
    const endQty = normalizeQtyInput(value);
    setUnderlyingEndDraft(readQtyInput(endQty));

    if (toNum(endQty) <= maxUnderlying) {
      updateLendQty(inputQty(maxUnderlying - toNum(endQty)));
      return;
    }

    const redeemUnderlying = toNum(endQty) - maxUnderlying;
    updateRedeemQty(getReceiptQty(redeemUnderlying));
  }

  function updateReceiptEnd(value) {
    const endQty = normalizeQtyInput(value);
    setReceiptEndDraft(readQtyInput(endQty));

    if (toNum(endQty) >= maxReceipt) {
      updateLendQty(getUnderlyingQty(toNum(endQty) - maxReceipt));
      return;
    }

    updateRedeemQty(inputQty(maxReceipt - toNum(endQty)));
  }

  function updateAutoApproval(checked) {
    setAutoApproval(checked);
    setCookie(tradeAutoApprovalCookie, checked ? "1" : "0", {
      maxAge: cookieMaxAge,
    });
  }

  function nextDefi() {
    const next = nextValue(
      availableYieldOptions.map((option) => option.value),
      defi,
    );
    if (next) selectDefi(next);
  }

  function selectDefi(value) {
    setDefi(value);
    if (!value) return;
    setCookie(getTradeModeCookie(tradeYieldDefiCookie, walletType), value, {
      maxAge: cookieMaxAge,
    });
  }

  function nextChain() {
    const next = nextValue(marketChains, chainE?.chain || chain);
    if (next) selectChain(next);
  }

  function selectChain(chain) {
    setChain(chain);
    saveYieldChainCookie(chain);
    emitTradeChainSelect(chain);
  }

  function focusSelectedChain() {
    const currentChain = chainE?.chain || chain;
    if (currentChain) emitTradeChainSelect(currentChain);
  }

  function saveYieldChainCookie(chain) {
    if (!defi || !chain || !marketChains.includes(chain)) return;
    setCookie(getProtocolCookie(tradeYieldChainCookie, walletType, defi), chain, {
      maxAge: cookieMaxAge,
    });
  }

  function nextMarket() {
    const cycleMarkets = hasProtocolAllMarkets ? visibleAddedMarkets : markets;
    const next = nextValue(
      cycleMarkets.map((entry) => entry.value),
      market,
    );
    if (next) selectMarket(next);
  }

  function prevMarket() {
    const cycleMarkets = hasProtocolAllMarkets ? visibleAddedMarkets : markets;
    const values = cycleMarkets.map((entry) => entry.value);
    const index = values.indexOf(market);
    const next = values.length
      ? values[(index - 1 + values.length) % values.length]
      : "";
    if (next) selectMarket(next);
  }

  function selectMarket(value) {
    setMarket(value);
    saveYieldMarketCookie(value);
    setShowMarketMenu(false);
  }

  function saveYieldMarketCookie(value) {
    if (!defi || !chainE?.chain || !marketCookieValues.includes(value)) return;
    setCookie(
      getProtocolCookie(
        tradeYieldMarketCookie,
        walletType,
        defi,
        chainE.chain,
      ),
      value,
      { maxAge: cookieMaxAge },
    );
  }

  function retrySparkAllMarkets(e) {
    e.preventDefault();
    e.stopPropagation();
    setSparkAllMarketM((marketM) => {
      const next = { ...marketM };
      delete next[allMarketCacheKey];
      return next;
    });
    setSparkAllErrorM((errorM) => ({ ...errorM, [allMarketCacheKey]: "" }));
    setSparkAllLoadingM((loadingM) => ({
      ...loadingM,
      [allMarketCacheKey]: false,
    }));
    setSparkAllRetryTick((tick) => tick + 1);
  }

  function retryAllMarkets(e) {
    retrySparkAllMarkets(e);
  }

  function clearCustomCoinPreview() {
    setCustomCoinPreview(null);
    setCustomCoinDraft({ coin: "", name: "", type: "", customType: "" });
  }

  function setCustomCoinPreviewData(res) {
    setCustomCoinPreview(res);
    setCustomCoinDraft({
      coin: res.coin || "",
      name: res.entry?.name || "",
      type: res.entry?.type || "token",
      customType: res.entry?.type || "token",
    });
  }

  async function openProtocolCoinConfirm(e, entry = {}, tokenKind = "lend") {
    e.preventDefault();
    e.stopPropagation();
    const chain = String(chainE?.chain || "").trim();
    const address = String(
      tokenKind == "underlying" ? entry.underlyingAddress : entry.lendAddress,
    ).trim();
    if (!chain || !address || addingCoin) return;

    setAddingCoin(true);
    try {
      const res = await previewCustomCoin({ chain, address });
      if (!res.ok) throw new Error(res.msg || "preview custom coin failed");
      if (res.exists) {
        toast(`${res.chain} ${res.coin} exists`);
        clearCustomCoinPreview();
        return;
      }

      setCustomCoinPreviewData(res);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAddingCoin(false);
    }
  }

  async function confirmCustomCoin() {
    if (!customCoinPreview || addingCoin) return;

    setAddingCoin(true);
    try {
      const coin = String(customCoinDraft.coin || customCoinPreview.coin || "").trim();
      const entry = {
        address: customCoinPreview.entry?.address,
        decimals: customCoinPreview.entry?.decimals,
        name: customCoinDraft.name || customCoinPreview.entry?.name || coin,
        type:
          customCoinDraft.customType.trim() ||
          customCoinDraft.type ||
          customCoinPreview.entry?.type ||
          "token",
      };
      const res = useLocalEditorStore
        ? addLocalCustomCoin({
            chain: customCoinPreview.chain,
            coin,
            entry,
          })
        : await addCustomCoin({
            chain: customCoinPreview.chain,
            address: entry.address,
            coin,
            name: entry.name,
            type: entry.type,
          });

      if (!res.ok) throw new Error(res.msg || "add coin failed");
      if (res.exists) {
        toast(`${res.chain} ${res.coin} exists`);
        clearCustomCoinPreview();
        return;
      }

      const addressKey = String(entry.address || "").toLowerCase();
      setLocallyAddedAddressM((addressM) => ({
        ...addressM,
        [`${customCoinPreview.chain}:${addressKey}`]: true,
      }));
      toast.success(`${res.chain} ${res.coin} added`);
      clearCustomCoinPreview();
      onTxComplete({ ok: true, type: "addCoin", chain: customCoinPreview.chain });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAddingCoin(false);
    }
  }

  function setMaxLend() {
    updateLendQty(inputQty(maxUnderlying));
  }

  function setMaxRedeem() {
    updateRedeemQty(inputQty(withdrawMaxReceipt));
  }

  async function runLend(action) {
    if (!lendCoin || !underlyingCoin) {
      toast.error(
        isHyperliquid
          ? "Hyperliquid: no vault selected"
          : `${lendingE.label}: no lending market selected`,
      );
      return;
    }
    const isSpark = defi == "spark";
    const isVenusFluxAction = defi == "venusFlux";
    const isHyperliquidAction = defi == "hyperliquid";

    if (!isSpark && !isVenusFluxAction && !isHyperliquidAction) {
      toast(`${lendingE.label}: lending not wired yet`);
      return;
    }
    const protocol = isHyperliquidAction
      ? "Hyperliquid"
      : isVenusFluxAction
        ? "Venus Flux"
        : "Spark";
    if (!selectedWalletEntry?.address) {
      toast.error("wallet missing");
      return;
    }
    if (selectedWalletEntry?.isBrowserWallet && selectedWalletEntry.type != "evm") {
      toast.error(`${protocol} needs an EVM browser wallet`);
      return;
    }
    if (!selectedWalletEntry?.isBrowserWallet && !selectedWalletEntry?.hasPrivateKey) {
      toast.error("no private key");
      return;
    }

    const redeem = action == "redeem";
    const actionLabel = isHyperliquidAction
      ? redeem
        ? "withdraw"
        : "deposit"
      : action;
    const qty = redeem ? readQtyInput(receiptQty) : readQtyInput(lendQty);
    const autoApprovalAmount = !redeem && !isHyperliquidAction && autoApproval
      ? qty
      : "";
    const getApprovalAmount = (approvalNeeded) => {
      if (!approvalNeeded) return "";
      return (
        autoApprovalAmount ||
        window.prompt(
          `Approval needed for ${underlyingCoin}.\n\nEnter approval qty.\nLend qty: ${qty}`,
          qty,
        )
      );
    };
    if (!toNum(qty)) {
      toast.error(`${actionLabel} qty is 0`);
      return;
    }
    if (isHyperliquidAction && !redeem && toNum(qty) < 5) {
      toast.error("Hyperliquid vault deposits must be at least $5");
      return;
    }
    if (isHyperliquidAction && redeem && vaultLocked) {
      toast.error(`Hyperliquid vault locked until ${vaultLockText}`);
      return;
    }

    const useBrowserWallet = !!selectedWalletEntry?.isBrowserWallet;
    const buildTxs = isHyperliquidAction
      ? buildHyperliquidLendTxs
      : isVenusFluxAction
        ? buildVenusFluxLendTxs
        : buildSparkLendTxs;
    const executeLend = isHyperliquidAction
      ? executeHyperliquidLend
      : isVenusFluxAction
        ? executeVenusFluxLend
        : executeSparkLend;
    const previewLend = isHyperliquidAction
      ? getHyperliquidLendPreview
      : isVenusFluxAction
        ? getVenusFluxLendPreview
        : getSparkLendPreview;
    const directMarketArgs =
      isHyperliquidAction
        ? {
            lendAddress: chainE?.coinInfoM?.[lendCoin]?.address,
          }
      : usesDirectMarket
        ? {
            underlyingAddress: marketE.underlyingAddress,
            underlyingDecimals: marketE.underlyingDecimals,
            lendAddress: marketE.lendAddress,
            lendDecimals: marketE.lendDecimals,
            psm3Address: marketE.psm3Address,
          }
        : {};
    const toastId = toast.loading(`${protocol}: preparing ${actionLabel}...`);
    setLendPending(true);
    setLendPendingAction(action);
    setLendResult(null);

    try {
      let res;
      if (useBrowserWallet && isHyperliquidAction) {
        toast.loading(`${protocol}: checking agent approval...`, {
          id: toastId,
        });
        const browserAgent = getHyperliquidBrowserAgent(
          selectedWalletEntry.address,
        );
        const browserChainId = await getBrowserEvmChainId(
          selectedWalletEntry.browserWallet,
        );
        const agentApproval = await buildHyperliquidAgentApproval({
          walletAddress: selectedWalletEntry.address,
          agentAddress: browserAgent.address,
          signatureChainId: browserChainId,
        });
        const agentCookie = getHyperliquidAgentCookie(
          selectedWalletEntry.address,
          agentApproval.agentAddress,
        );
        const approveAgent = async () => {
          toast.loading(`${protocol}: approve agent...`, { id: toastId });
          const signature = await signBrowserTypedData({
            sign: agentApproval.sign,
            wallet: selectedWalletEntry.browserWallet,
            address: selectedWalletEntry.address,
          });
          await submitHyperliquidAgentApproval({
            walletAddress: selectedWalletEntry.address,
            approval: agentApproval.approval,
            sign: agentApproval.sign,
            signature,
          });
          setCookie(agentCookie, "1", { maxAge: cookieMaxAge });
        };
        const submitWithAgent = async () => {
          const built = await buildHyperliquidLendTxs({
            walletAddress: selectedWalletEntry.address,
            chain: chainE.chain,
            action,
            underlyingCoin,
            lendCoin,
            amount: qty,
            ...directMarketArgs,
          });
          const tx = built.txs?.[0];
          if (!tx?.sign) throw new Error("Hyperliquid signed action missing");
          const signature = await signHyperliquidBrowserAgentTypedData({
            walletAddress: selectedWalletEntry.address,
            sign: tx.sign,
          });
          const submitted = await submitHyperliquidLendSignature({
            walletAddress: selectedWalletEntry.address,
            signerAddress: browserAgent.address,
            tx,
            signature,
          });

          return {
            ...built,
            agentAddress: browserAgent.address,
            txs: [submitted],
          };
        };

        if (getCookie(agentCookie) != "1") {
          await approveAgent();
        }

        toast.loading(`${protocol}: submitting ${actionLabel}...`, {
          id: toastId,
        });
        try {
          res = await submitWithAgent();
        } catch (e) {
          const message = String(e?.message || "");
          if (!/agent|api wallet|approve|does not exist/i.test(message)) {
            throw e;
          }

          setCookie(agentCookie, "", { maxAge: 0 });
          await approveAgent();
          toast.loading(`${protocol}: submitting ${actionLabel}...`, {
            id: toastId,
          });
          res = await submitWithAgent();
        }
      } else if (useBrowserWallet) {
        toast.loading(`${protocol}: building ${actionLabel} wallet prompt...`, {
          id: toastId,
        });
        const built = await buildTxs({
          walletAddress: selectedWalletEntry.address,
          chain: chainE.chain,
          action,
          underlyingCoin,
          lendCoin,
          amount: qty,
          ...directMarketArgs,
        });
        const txs = [];

        for (const tx of built.txs || []) {
          toast.loading(`${protocol}: confirm ${tx.type}...`, { id: toastId });
          if (tx.sign) {
            const signature = await signBrowserTypedData({
              sign: tx.sign,
              wallet: selectedWalletEntry.browserWallet,
              address: selectedWalletEntry.address,
              chainId: tx.sign.chainId,
            });
            toast.loading(`${protocol}: submitting ${tx.type}...`, {
              id: toastId,
            });
            txs.push(
              await submitHyperliquidLendSignature({
                walletAddress: selectedWalletEntry.address,
                tx,
                signature,
              }),
            );
          } else {
            txs.push(
              await sendBrowserTx({
                tx,
                wallet: selectedWalletEntry.browserWallet,
                address: selectedWalletEntry.address,
              }),
            );
          }
        }
        res = { ...built, txs };
      } else {
        const ok = window.confirm(
          `Execute ${protocol} ${actionLabel}?\n\nwallet: ${
            selectedWalletEntry.name || selectedWalletEntry.label
          }\nchain: ${chainE.chain}\namount: ${qty} ${
            redeem ? lendCoin : underlyingCoin
          }`,
        );
        if (!ok) {
          toast.dismiss(toastId);
          return;
        }

        let approvalAmount = "";
        if (!redeem && !isHyperliquidAction) {
          toast.loading(`${protocol}: checking allowance...`, { id: toastId });
          const preview = await previewLend({
            walletAddress: selectedWalletEntry.address,
            chain: chainE.chain,
            action,
            underlyingCoin,
            lendCoin,
            amount: qty,
            ...directMarketArgs,
          });

          if (preview.approvalNeeded) {
            approvalAmount = getApprovalAmount(preview.approvalNeeded);
            if (!approvalAmount) {
              toast.dismiss(toastId);
              return;
            }
          }
        }

        toast.loading(`${protocol}: submitting ${actionLabel}...`, { id: toastId });
        res = await executeLend({
          walletName: selectedWalletEntry.name,
          walletAddress: selectedWalletEntry.address,
          chain: chainE.chain,
          action,
          underlyingCoin,
          lendCoin,
          amount: qty,
          approvalAmount,
          ...directMarketArgs,
        });
      }

      setLendResult(res);
      toast.success(`${protocol} ${actionLabel} submitted`, {
        id: toastId,
      });
      onTxComplete({
        ...res,
        refreshTargets: [
          {
            chain: chainE.chain,
            coin: underlyingCoin,
            address: selectedWalletEntry.address,
          },
          {
            chain: chainE.chain,
            coin: lendCoin,
            address: selectedWalletEntry.address,
          },
        ],
      });
    } catch (e) {
      const message = e?.message || `${protocol} ${action} failed`;
      setLendResult({ ok: false, error: message });
      toast.error(message, { id: toastId });
    } finally {
      setLendPending(false);
      setLendPendingAction("");
    }
  }

  function CustomCoinConfirmModal() {
    if (!customCoinPreview) return null;

    const entry = customCoinPreview.entry || {};
    const typeSelectWidth =
      Math.max(...coinTypeOptions.map((type) => type.length), 5) + 2;
    const addressUrl = getExplorerAddressUrl(
      customCoinPreview.chain,
      entry.address,
    );

    return (
      <div className="walletCoinConfirmBackdrop">
        <form
          className="walletCoinConfirmCard"
          onSubmit={(e) => {
            e.preventDefault();
            confirmCustomCoin();
          }}
        >
          <div className="walletCoinConfirmTitle">Confirm coin</div>
          <div className="walletCoinConfirmGrid">
            <span className="gray">chain</span>
            <span className="white">{customCoinPreview.chain}</span>

            <span className="gray">address</span>
            {addressUrl ? (
              <a
                className="walletCoinConfirmAddress"
                href={addressUrl}
                target="_blank"
                rel="noreferrer"
                title={entry.address}
              >
                {entry.address}
              </a>
            ) : (
              <span className="walletCoinConfirmAddress" title={entry.address}>
                {entry.address}
              </span>
            )}

            <span className="gray">decimals</span>
            <span className="white">{entry.decimals ?? "-"}</span>

            <label className="gray" htmlFor="lendCoinConfirmKey">
              coin
            </label>
            <input
              id="lendCoinConfirmKey"
              type="text"
              value={customCoinDraft.coin}
              onChange={(e) =>
                setCustomCoinDraft((draft) => ({
                  ...draft,
                  coin: e.target.value,
                }))
              }
              disabled={addingCoin}
              style={{
                width: `${Math.max(customCoinDraft.coin.length || 0, 5) + 2}ch`,
              }}
              autoFocus
            />

            <label className="gray" htmlFor="lendCoinConfirmName">
              name
            </label>
            <input
              id="lendCoinConfirmName"
              type="text"
              value={customCoinDraft.name}
              onChange={(e) =>
                setCustomCoinDraft((draft) => ({
                  ...draft,
                  name: e.target.value,
                }))
              }
              disabled={addingCoin}
              style={{
                width: `${Math.max(customCoinDraft.name.length || 0, 10) + 2}ch`,
              }}
            />

            <label className="gray" htmlFor="lendCoinConfirmType">
              type
            </label>
            <span className="walletCoinConfirmTypeRow">
              <select
                id="lendCoinConfirmType"
                value={customCoinDraft.type}
                onChange={(e) =>
                  setCustomCoinDraft((draft) => ({
                    ...draft,
                    type: e.target.value,
                    customType: e.target.value,
                  }))
                }
                disabled={addingCoin}
                style={{ width: `${typeSelectWidth}ch` }}
              >
                {coinTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={customCoinDraft.customType}
                onChange={(e) =>
                  setCustomCoinDraft((draft) => ({
                    ...draft,
                    customType: e.target.value,
                  }))
                }
                placeholder="custom type"
                disabled={addingCoin}
                style={{
                  width: `${
                    Math.max(customCoinDraft.customType.length || 0, 11) + 2
                  }ch`,
                }}
              />
            </span>
          </div>
          <div className="walletCoinConfirmBtns">
            <button
              type="button"
              className="btn small bgGray"
              onClick={clearCustomCoinPreview}
              disabled={addingCoin}
            >
              cancel
            </button>
            <button type="submit" className="btn small bgCyan" disabled={addingCoin}>
              {addingCoin ? "..." : "confirm"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="tradePane swapPane lendPane">
      {CustomCoinConfirmModal()}
      <div className="flex tradePaneTop">
        <label htmlFor="tradeTypeLend">
          <select
            id="tradeTypeLend"
            value={tradeType}
            onChange={(e) => onTradeTypeChange(e.target.value)}
          >
            {tradeTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn nx bgGray"
            onClick={onCycleTradeType}
          >
            {">"}
          </button>
        </label>
        <label htmlFor="lendDefi">
          <span className="gray">DeFi:</span>
          <select
            id="lendDefi"
            value={availableYieldOptions.length ? defi : ""}
            onChange={(e) => selectDefi(e.target.value)}
            disabled={!availableYieldOptions.length}
          >
            {!availableYieldOptions.length && <option value="">no DeFi</option>}
            {availableYieldOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn nx bgGray"
            onClick={nextDefi}
            disabled={availableYieldOptions.length < 2}
          >
            {">"}
          </button>
        </label>
        {!isHyperliquid && (
          <span className="selectCycle">
            <select
              value={marketChains.length ? chainE?.chain || "" : ""}
              onChange={(e) => selectChain(e.target.value)}
              onClick={focusSelectedChain}
              onFocus={focusSelectedChain}
              disabled={!marketChains.length}
            >
              {!marketChains.length && <option value="">no chain</option>}
              {marketChains.map((chainName) => (
                <option key={chainName} value={chainName}>
                  {chainName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small bgGray"
              onClick={nextChain}
              disabled={marketChains.length < 2}
            >
              {">"}
            </button>
          </span>
        )}
        {hasProtocolAllMarkets ? (
          <span className="selectCycle walletCycle lendMarketCycle">
            <button
              type="button"
              className="btn small bgGray"
              onClick={prevMarket}
              disabled={visibleAddedMarkets.length < 2}
            >
              {"<"}
            </button>
            <span className="sendWalletPicker" ref={marketPickerRef}>
              <button
                type="button"
                className="sendWalletPickerButton"
                style={{ width: marketButtonWidth }}
                disabled={!chainE?.chain}
                onClick={() => setShowMarketMenu((show) => !show)}
              >
                {marketE ? getMarketLabel(marketE) : "no coin"}
              </button>
              {showMarketMenu && (
                <span className="sendWalletMenu lendMarketMenu">
                  <span className="sendWalletMenuCol">
                    <span className="sendWalletMenuTitle">added</span>
                    {visibleAddedMarkets.length ? (
                      visibleAddedMarkets.map((entry) => (
                        <button
                          key={`wallet_${entry.value}`}
                          type="button"
                          className={
                            entry.value == market
                              ? "sendWalletMenuItem lendMarketAddedItem on"
                              : "sendWalletMenuItem lendMarketAddedItem"
                          }
                          onClick={() => selectMarket(entry.value)}
                        >
                          <span>{entry.underlyingCoin}</span>
                          <span className="infoHover hoverOnlyInfo lendMarketCoinHover">
                            <span className="gray">{entry.lendCoin}</span>
                            <LendCoinInfoCard
                              coin={entry.lendCoin}
                              name={entry.lendName}
                              lockedUntilTimestamp={
                                chainE?.coinInfoM?.[entry.lendCoin]
                                  ?.lockedUntilTimestamp
                              }
                            />
                          </span>
                          <AprText apr={entry.supplyApr} label={false} />
                        </button>
                      ))
                    ) : (
                      <span className="gray">-</span>
                    )}
                  </span>
                  <span className="sendWalletMenuCol">
                    <span className="sendWalletMenuTitle">all</span>
                    {allLoading && !visibleAddedMarkets.length && (
                      <span className="gray">loading {allProtocolLabel}...</span>
                    )}
                    {!allLoading && allError && visibleAddedMarkets.length > 0 && (
                      <span className="sendWalletMenuItem lendMarketAllItem">
                        <span className="gray">all added</span>
                      </span>
                    )}
                    {!allLoading && allError && !visibleAddedMarkets.length && (
                      <span className="sendWalletMenuItem lendMarketAllItem">
                        <span className="red">{allError}</span>
                        <button
                          type="button"
                          className="btn small bgGray"
                          onClick={retryAllMarkets}
                        >
                          retry
                        </button>
                      </span>
                    )}
                    {!allLoading && !allError && !allMarkets.length && (
                      <span className="sendWalletMenuItem lendMarketAllItem">
                        <span className="gray">
                          {visibleAddedMarkets.length ? "all added" : "-"}
                        </span>
                        {!visibleAddedMarkets.length && (
                          <button
                            type="button"
                            className="btn small bgGray"
                            onClick={retryAllMarkets}
                          >
                            retry
                          </button>
                        )}
                      </span>
                    )}
                    {!allLoading &&
                      !allError &&
                      allMarkets.map((entry) => (
                        <span
                          key={`${defi}_${entry.value}`}
                          className={
                            entry.addedValue == market
                              ? "sendWalletMenuItem lendMarketAllItem on"
                              : "sendWalletMenuItem lendMarketAllItem"
                          }
                        >
                          <button
                            type="button"
                            className="lendMarketAllSelect"
                            onClick={() =>
                              selectMarket(entry.addedValue || entry.value)
                            }
                            title={entry.underlyingName}
                          >
                            <span>{entry.underlyingCoin}</span>
                          </button>
                          <button
                            type="button"
                            className={
                              entry.addedUnderlying
                                ? "btn small bgGray"
                                : "btn small bgCyan"
                            }
                            onClick={(e) =>
                              openProtocolCoinConfirm(e, entry, "underlying")
                            }
                            disabled={entry.addedUnderlying || addingCoin}
                            title={entry.underlyingName}
                          >
                            {entry.addedUnderlying ? "✓" : "+"}
                          </button>
                          <span className="infoHover hoverOnlyInfo lendMarketCoinHover">
                            <button
                              type="button"
                              className="lendMarketAllSelect lendMarketAllLendSelect"
                              onClick={() =>
                                selectMarket(entry.addedValue || entry.value)
                              }
                            >
                              <span className="gray">{entry.lendCoin}</span>
                            </button>
                            <LendCoinInfoCard
                              coin={entry.lendCoin}
                              name={entry.lendName}
                              lockedUntilTimestamp={
                                chainE?.coinInfoM?.[entry.lendCoin]
                                  ?.lockedUntilTimestamp
                              }
                            />
                          </span>
                          <button
                            type="button"
                            className={
                              entry.addedLend
                                ? "btn small bgGray"
                                : "btn small bgCyan"
                            }
                            onClick={(e) => openProtocolCoinConfirm(e, entry)}
                            disabled={entry.addedLend || addingCoin}
                          >
                            {entry.addedLend ? "✓" : "+"}
                          </button>
                          <AprText apr={entry.supplyApr} label={false} />
                        </span>
                      ))}
                  </span>
                </span>
              )}
            </span>
            <button
              type="button"
              className="btn small bgGray"
              onClick={nextMarket}
              disabled={visibleAddedMarkets.length < 2}
            >
              {">"}
            </button>
            <span className="lendSelectedApr">
              <AprText apr={marketSupplyApr} />
            </span>
          </span>
        ) : (
          <span className="selectCycle">
            <select
              value={marketE?.value || ""}
              onChange={(e) => selectMarket(e.target.value)}
              disabled={!markets.length}
            >
              {!markets.length && <option value="">no coin</option>}
              {markets.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {getMarketLabel(entry)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small bgGray"
              onClick={nextMarket}
              disabled={markets.length < 2}
            >
              {">"}
            </button>
          </span>
        )}
      </div>

      <div className="swapRows">
        <div className="swapBox">
          <div className="swapAssetLine">
            <span>{underlyingCoin || "-"}</span>
            <span className="swapCoinPrice">
              <span className="gray">{fmtPrice(underlyingPrice)}</span>
            </span>
          </div>
          <div className="swapBalanceLine">
            <button
              type="button"
              className="tradeTextButton swapAssetBalance"
              onClick={() => updateLendQty(inputQty(maxUnderlying))}
            >
              <span className="gray">{underlyingCoin}: </span>
              {showUnderlyingBalanceLoading ? "..." : fmt(underlyingBalance.balance)}
              {underlyingUsd > 0 && (
                <span className="gray"> ${fmt(underlyingUsd, 2)}</span>
              )}
            </button>
          </div>
          <div className="swapAmountLine">
            <span className="gray">end</span>
            <input
              type="number"
              min="0"
              step="any"
              value={underlyingEndDraft || inputQty(underlyingEnd)}
              onChange={(e) => updateUnderlyingEnd(e.target.value)}
              onBlur={() => setUnderlyingEndDraft("")}
            />
            {underlyingPrice > 0 && (
              <span className="gray">${fmt(underlyingEndUsd, 2)}</span>
            )}
          </div>
          <div className="swapAmountLine">
            <span className="gray">{depositLabel}</span>
            <input
              type="number"
              min="0"
              max={maxUnderlying || 0}
              step="any"
              value={lendQty}
              onChange={(e) => updateLendQty(e.target.value)}
            />
            {underlyingPrice > 0 && (
              <span className="gray">${fmt(underlyingQtyUsd, 2)}</span>
            )}
          </div>
          <div className="lendBoxControls">
            <input
              className="swapMiddleRange"
              type="range"
              min="0"
              max={maxUnderlying || 0}
              step="any"
              value={lendSliderValue}
              onChange={(e) => updateLendQty(inputQty(e.target.value))}
              disabled={!maxUnderlying}
            />
            <button
              type="button"
              className="btn small bgGray"
              onClick={setMaxLend}
              disabled={!maxUnderlying}
            >
              max
            </button>
            <button
              type="button"
              className="btn swapActionButton bgCyan"
              onClick={() => runLend("lend")}
              disabled={lendPending}
            >
              {lendPendingAction == "lend"
                ? `${depositButtonLabel}ING`
                : depositButtonLabel}
            </button>
          </div>
        </div>

        <div className="swapMiddle">
          <label className="swapGasSelect">
            <span className="gray">gas:</span>
            <select value="default" disabled>
              <option value="default">auto</option>
            </select>
          </label>
          {!isHyperliquid && !selectedWalletEntry?.isBrowserWallet && (
            <label className="swapAutoApproval">
              <input
                type="checkbox"
                checked={autoApproval}
                onChange={(e) => updateAutoApproval(e.target.checked)}
              />
              <span className="gray">auto approve</span>
            </label>
          )}
          <span className="swapRateLine">
            <span className="gray">rate:</span>{" "}
            {underlyingCoin && lendCoin
              ? `1 ${underlyingCoin} = ${fmtRate(receiptRate)} ${lendCoin}`
              : "-"}
            {priceStatus && <span className="gray"> {priceStatus}</span>}
          </span>
        </div>

        <div className="swapBox">
          <div className="swapAssetLine">
            <span>{lendCoin || "-"}</span>
            {lendName && lendName != lendCoin && (
              <span className="gray">({lendName})</span>
            )}
            <span className="swapCoinPrice">
              <span className="gray">{fmtPrice(receiptPrice)}</span>
            </span>
          </div>
          <div className="swapBalanceLine">
            <span className="swapAssetBalance">
              <span className="gray">{lendCoin}: </span>
              {showReceiptBalanceLoading ? "..." : fmt(receiptBalance.balance)}
              {receiptUsd > 0 && (
                <span className="gray"> ${fmt(receiptUsd, 2)}</span>
              )}
              {vaultLocked && (
                <span className="red"> locked until {vaultLockText}</span>
              )}
            </span>
          </div>
          <div className="swapAmountLine">
            <span className="gray">end</span>
            <input
              type="number"
              min="0"
              step="any"
              value={receiptEndDraft || inputQty(receiptEnd)}
              onChange={(e) => updateReceiptEnd(e.target.value)}
              onBlur={() => setReceiptEndDraft("")}
            />
            {receiptPrice > 0 && (
              <span className="gray">${fmt(receiptEndUsd, 2)}</span>
            )}
          </div>
          <div className="swapAmountLine">
            <span className="gray">{withdrawLabel}</span>
            <input
              type="number"
              min="0"
              max={withdrawMaxReceipt || 0}
              step="any"
              value={receiptQty}
              onChange={(e) => updateRedeemQty(e.target.value)}
            />
            {receiptPrice > 0 && (
              <span className="gray">${fmt(receiptQtyUsd, 2)}</span>
            )}
          </div>
          <div className="lendBoxControls">
            <input
              className="swapMiddleRange"
              type="range"
              min="0"
              max={withdrawMaxReceipt || 0}
              step="any"
              value={redeemSliderValue}
              onChange={(e) => updateRedeemQty(inputQty(e.target.value))}
              disabled={!withdrawMaxReceipt || vaultLocked}
            />
            <button
              type="button"
              className="btn small bgGray"
              onClick={setMaxRedeem}
              disabled={!withdrawMaxReceipt || vaultLocked}
            >
              max
            </button>
            <button
              type="button"
              className="btn swapActionButton bgCyan"
              onClick={() => runLend("redeem")}
              disabled={lendPending || vaultLocked}
            >
              {lendPendingAction == "redeem"
                ? isHyperliquid
                  ? "WITHDRAWING"
                  : "REDEEMING"
                : withdrawButtonLabel}
            </button>
          </div>
        </div>
      </div>
      {lendResult && (
        <div className="swapResult">
          {lendResult.ok ? (
            <>
              <span className="gray">
                {lendResult.defi || lendingE.label} {lendResult.action}:
              </span>{" "}
              {lendResult.txs?.map((tx) => (
                <SwapTxLink key={tx.hash} tx={tx} />
              ))}
            </>
          ) : (
            <span className="red">{lendResult.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
