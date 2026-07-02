"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import {
  MarketCoinBalance,
  YieldMarketPicker,
  getBalanceQty,
  getCoinTypeOptions,
  getInitialCookie,
  getInitialYieldDefi,
  getLendingMarkets,
  getLockUntilMs,
  getMarketCoinBalance,
  getMarketLabel,
  getMarketSupplyApr,
  getProtocolCookie,
  getSelectedBalance,
  getTokenAddressKey,
  getYieldMarketChains,
  formatLockUntil,
  hasLoadedBalance,
  isUsdLikeYieldCoin,
  isYieldProtocolSupportedForWallet,
  useYieldAllMarkets,
  useYieldDirectMarketBalance,
  withClientTimeout,
} from "./Client";
import {
  buildHyperliquidAgentApproval,
  buildHyperliquidLendTxs,
  buildHyperliquidSpotDepositTxs,
  buildHyperliquidSpotWithdrawTxs,
  executeHyperliquidLend,
  executeHyperliquidSpotDeposit,
  executeHyperliquidSpotWithdraw,
  getHyperliquidLendPreview,
  submitHyperliquidAgentApproval,
  submitHyperliquidLendSignature,
  submitHyperliquidSpotWithdrawSignature,
} from "./hyperliquid/sv";
import HyperliquidClient, {
  HyperliquidChainSelect,
  HyperliquidCoinSelect,
  getFallbackHyperliquidCoinsForChain,
  getHyperliquidAddedCoinsForChain,
  getHyperliquidAllCoinsForChain,
  getHyperliquidAgentCookie,
  getInitialHyperliquidMode,
  getInitialHyperliquidRouteCookie,
  useHyperliquidBridgeDiscovery,
  useHyperliquidBridgeSelection,
} from "./hyperliquid/Client";
import {
  buildSparkLendTxs,
  executeSparkLend,
  getSparkAllMarkets,
  getSparkLendPreview,
  getSparkMarketBalance,
} from "./spark/sv";
import SparkClient from "./spark/Client";
import {
  buildVenusFluxLendTxs,
  executeVenusFluxLend,
  getVenusFluxAllMarkets,
  getVenusFluxLendPreview,
  getVenusFluxMarketBalance,
} from "./venusFlux/sv";
import VenusFluxClient from "./venusFlux/Client";
import { getTradeCoinBalance, getTradeCoinPrice } from "./sv";
import { addCustomCoin, previewCustomCoin } from "../../w/coinActions";
import {
  addLocalCustomCoin,
  useLocalStorageEditor,
} from "../../browserEditorStorage";
import {
  cleanTradeInput,
  cookieMaxAge,
  createTradeLoopResult,
  createTradeToast,
  CustomCoinConfirmModal,
  emitTradeChainSelect,
  fmt,
  fmtPrice,
  fmtRate,
  formatComputedTradeQty,
  formatTradeQty,
  getBrowserEvmChainId,
  getInitialAutoApproval,
  getQtyDecimals,
  getHyperliquidBrowserAgent,
  getSignedTradeReceiptQty,
  getSignedTradeUnderlyingQty,
  getTradeEndDiffQty,
  getTradeEndInputValue,
  getTradeMarketCoinEntry,
  getTradeModeCookie,
  getTradeReceiptQty,
  getTradeUnderlyingQty,
  getTradeWalletMarketBalance,
  limitQtyInputDecimals,
  yieldOptions as lendingOptions,
  nextValue,
  noYield as noLending,
  normalizeSignedQtyInput,
  priceKey,
  qtyInputSize,
  qtyInputStyle,
  rangeQtyInput,
  runTradeWalletLoop,
  sendBrowserTradeTx,
  subtractTradeQtyText,
  signHyperliquidBrowserAgentTypedData,
  signBrowserTypedData,
  SwapTxLink,
  tradeAutoApprovalCookie,
  tradeYieldChainCookie,
  tradeYieldDefiCookie,
  tradeYieldHyperliquidChainCookie,
  tradeYieldHyperliquidCoinCookie,
  tradeYieldHyperliquidDepositCoinCookie,
  tradeYieldHyperliquidModeCookie,
  tradeYieldHyperliquidWithdrawCoinCookie,
  tradeYieldMarketCookie,
  toNum,
  useCustomCoinConfirm,
  useTradeFallbackPrice,
} from "../clientShared";

export default function YieldPanel({
  data = [],
  selectedWalletEntry,
  walletType = "evm",
  initialCookieM = {},
  tradeType,
  tradeTypes = [],
  onTradeTypeChange,
  onCycleTradeType,
  showGasAutoLabel = false,
  loopWallets = false,
  getLoopWalletEntries = () => [],
  onTxComplete = () => {},
}) {
  const initialDefi = getInitialYieldDefi(
    initialCookieM,
    walletType,
    tradeYieldDefiCookie,
  );
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
  const initialMarket = initialSavedMarket || initialMarkets[0]?.value || "";
  const initialHyperliquidMode = getInitialHyperliquidMode(
    initialCookieM,
    walletType,
  );
  const initialHyperliquidChain = getInitialHyperliquidRouteCookie(
    initialCookieM,
    walletType,
    tradeYieldHyperliquidChainCookie,
  );
  const initialHyperliquidCoin = getInitialHyperliquidRouteCookie(
    initialCookieM,
    walletType,
    tradeYieldHyperliquidCoinCookie,
  );
  const initialHyperliquidDepositCoin =
    getInitialHyperliquidRouteCookie(
      initialCookieM,
      walletType,
      tradeYieldHyperliquidDepositCoinCookie,
    ) || initialHyperliquidCoin;
  const initialHyperliquidWithdrawCoin =
    getInitialHyperliquidRouteCookie(
      initialCookieM,
      walletType,
      tradeYieldHyperliquidWithdrawCoinCookie,
    ) || initialHyperliquidCoin;
  const [defi, setDefi] = useState(initialDefi);
  const [chain, setChain] = useState(initialChain);
  const [market, setMarket] = useState(initialMarket);
  const [hyperliquidMode, setHyperliquidMode] = useState(
    initialHyperliquidMode,
  );
  const [hyperliquidDepositChain, setHyperliquidDepositChain] = useState(
    initialHyperliquidChain,
  );
  const [hyperliquidDepositCoin, setHyperliquidDepositCoin] = useState(
    initialHyperliquidDepositCoin,
  );
  const [hyperliquidWithdrawChain, setHyperliquidWithdrawChain] = useState(
    initialHyperliquidChain,
  );
  const [hyperliquidWithdrawCoin, setHyperliquidWithdrawCoin] = useState(
    initialHyperliquidWithdrawCoin,
  );
  const [lendQty, setLendQty] = useState("0");
  const [receiptQty, setReceiptQty] = useState("0");
  const [underlyingEndDraft, setUnderlyingEndDraft] = useState("");
  const [receiptEndDraft, setReceiptEndDraft] = useState("");
  const [lendEndWith, setLendEndWith] = useState(false);
  const [redeemEndWith, setRedeemEndWith] = useState(false);
  const [qtyInputSide, setQtyInputSide] = useState("lend");
  const [marketPreviewM, setMarketPreviewM] = useState({});
  const [marketLoadingM, setMarketLoadingM] = useState({});
  const [lendPending, setLendPending] = useState(false);
  const [lendPendingAction, setLendPendingAction] = useState("");
  const [lendResult, setLendResult] = useState(null);
  const [autoApproval, setAutoApproval] = useState(
    getInitialAutoApproval(initialCookieM),
  );
  const [showMarketMenu, setShowMarketMenu] = useState(false);
  const [addedMarketSort, setAddedMarketSort] = useState("");
  const [allMarketSort, setAllMarketSort] = useState("");
  const [showHyperliquidDepositCoinMenu, setShowHyperliquidDepositCoinMenu] =
    useState(false);
  const [showHyperliquidDepositChainMenu, setShowHyperliquidDepositChainMenu] =
    useState(false);
  const [showHyperliquidWithdrawCoinMenu, setShowHyperliquidWithdrawCoinMenu] =
    useState(false);
  const [
    showHyperliquidWithdrawChainMenu,
    setShowHyperliquidWithdrawChainMenu,
  ] = useState(false);
  const [locallyAddedAddressM, setLocallyAddedAddressM] = useState({});
  const [nowMs, setNowMs] = useState(0);
  const marketPickerRef = useRef(null);
  const hyperliquidDepositCoinPickerRef = useRef(null);
  const hyperliquidDepositChainPickerRef = useRef(null);
  const hyperliquidWithdrawCoinPickerRef = useRef(null);
  const hyperliquidWithdrawChainPickerRef = useRef(null);
  const mountedRef = useRef(false);
  const useLocalEditorStore = useLocalStorageEditor();
  const {
    customCoinPreview,
    customCoinDraft,
    setCustomCoinDraft,
    addingCoin,
    setAddingCoin,
    clearCustomCoinPreview,
    setCustomCoinPreviewData,
    confirmCustomCoin,
  } = useCustomCoinConfirm({
    useLocalEditorStore,
    addLocalCustomCoinAction: addLocalCustomCoin,
    addCustomCoinAction: addCustomCoin,
    setLocallyAddedAddressM,
    onTxComplete,
  });
  const chainMarketsM = useMemo(() => {
    return Object.fromEntries(
      chainList.map((chainE) => [
        chainE.chain,
        getLendingMarkets(chainE, defi),
      ]),
    );
  }, [chainList, defi]);
  const isHyperliquid = defi == "hyperliquid";
  const isVenusFlux = defi == "venusFlux";
  const ProtocolClient = isHyperliquid
    ? HyperliquidClient
    : isVenusFlux
      ? VenusFluxClient
      : SparkClient;
  const marketChains = useMemo(
    () => getYieldMarketChains(chainList, chainMarketsM, defi),
    [chainList, chainMarketsM, defi],
  );
  const activeChain = marketChains.includes(chain)
    ? chain
    : marketChains[0] || "";
  const chainE =
    chainList.find((entry) => entry.chain == activeChain) ||
    chainList.find((entry) => marketChains.includes(entry.chain)) ||
    chainList[0];
  const isHyperliquidDepositMode =
    isHyperliquid && hyperliquidMode == "deposit";
  const {
    bridgeE: hyperliquidBridgeE,
    retryBridge: retryHyperliquidBridge,
  } = useHyperliquidBridgeDiscovery({ enabled: isHyperliquidDepositMode });
  const {
    depositChains: hyperliquidDepositChains,
    depositAddedChains: hyperliquidDepositAddedChains,
    activeDepositChain: activeHyperliquidDepositChain,
    depositChainE: hyperliquidDepositChainE,
    depositCoins: hyperliquidDepositCoins,
    depositAddedCoins: hyperliquidDepositAddedCoins,
    activeDepositCoin: activeHyperliquidDepositCoin,
    depositAllCoinEntries: hyperliquidDepositAllCoinEntries,
    depositRouteToken: hyperliquidDepositRouteToken,
    depositRouteText: hyperliquidDepositRouteText,
    depositFeeEtaText: hyperliquidDepositFeeEtaText,
    withdrawChains: hyperliquidWithdrawChains,
    withdrawAddedChains: hyperliquidWithdrawAddedChains,
    activeWithdrawChain: activeHyperliquidWithdrawChain,
    withdrawChainE: hyperliquidWithdrawChainE,
    withdrawCoins: hyperliquidWithdrawCoins,
    withdrawAddedCoins: hyperliquidWithdrawAddedCoins,
    activeWithdrawCoin: activeHyperliquidWithdrawCoin,
    withdrawAllCoinEntries: hyperliquidWithdrawAllCoinEntries,
    withdrawRouteToken: hyperliquidWithdrawRouteToken,
    withdrawRouteText: hyperliquidWithdrawRouteText,
    withdrawFeeEtaText: hyperliquidWithdrawFeeEtaText,
  } = useHyperliquidBridgeSelection({
    chainList,
    bridgeE: hyperliquidBridgeE,
    depositChain: hyperliquidDepositChain,
    depositCoin: hyperliquidDepositCoin,
    withdrawChain: hyperliquidWithdrawChain,
    withdrawCoin: hyperliquidWithdrawCoin,
  });
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
      const addressKey = getTokenAddressKey(chainE?.chain, lendAddress);
      if (addressKey) entries[addressKey] = entry.value;
    }
    return entries;
  }, [addedMarkets, chainE?.chain, chainE?.coinInfoM]);
  const addedCoinAddressM = useMemo(() => {
    const entries = {};
    for (const coinE of Object.values(chainE?.coinInfoM || {})) {
      const addressKey = getTokenAddressKey(chainE?.chain, coinE?.address);
      if (addressKey) entries[addressKey] = true;
    }
    return entries;
  }, [chainE?.chain, chainE?.coinInfoM]);
  const sparkAllKey = chainE?.chain || "";
  const allMarketCacheKey = `${defi}:${sparkAllKey}`;
  const allProtocolLabel = isHyperliquid
    ? "Hyperliquid"
    : isVenusFlux
      ? "Venus Flux"
      : "Spark";
  const getAllYieldMarkets =
    defi == "venusFlux" ? getVenusFluxAllMarkets : getSparkAllMarkets;
  const {
    markets: rawSparkAllMarkets,
    loading: sparkAllLoading,
    error: sparkAllError,
    retry: retryAllMarkets,
  } = useYieldAllMarkets({
    enabled: defi == "spark" || defi == "venusFlux",
    cacheKey: allMarketCacheKey,
    chain: sparkAllKey,
    protocolLabel: allProtocolLabel,
    getAllMarkets: getAllYieldMarkets,
  });
  const sparkAllMarkets = rawSparkAllMarkets
    .map((entry) => {
      const addressKey = getTokenAddressKey(chainE?.chain, entry.lendAddress);
      const underlyingAddressKey = getTokenAddressKey(
        chainE?.chain,
        entry.underlyingAddress,
      );
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
  const visibleAddedMarkets = useMemo(() => {
    if (!rawSparkAllMarkets.length) return addedMarkets;

    const rawMarketByLendAddress = Object.fromEntries(
      rawSparkAllMarkets
        .filter((entry) => entry.lendAddress)
        .map((entry) => [
          getTokenAddressKey(chainE?.chain, entry.lendAddress),
          entry,
        ]),
    );

    return addedMarkets.map((entry) => {
      const lendAddress =
        entry.lendAddress || chainE?.coinInfoM?.[entry.lendCoin]?.address || "";
      const raw = rawMarketByLendAddress[
        getTokenAddressKey(chainE?.chain, lendAddress)
      ];
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
  const getYieldMarketBalance =
    defi == "venusFlux" ? getVenusFluxMarketBalance : getSparkMarketBalance;
  const { balance: directBalance, loading: directBalanceLoading } =
    useYieldDirectMarketBalance({
      enabled:
        usesDirectMarket &&
        needsDirectBalance &&
        !!directBalanceKey &&
        !!selectedWalletEntry?.address,
      cacheKey: directBalanceKey,
      walletAddress: selectedWalletEntry?.address,
      chain: chainE?.chain,
      marketE,
      getMarketBalance: getYieldMarketBalance,
      protocolLabel: allProtocolLabel,
    });
  const underlyingBalance =
    !hasLocalUnderlyingBalance && directBalance.underlying
      ? directBalance.underlying
      : localUnderlyingBalance;
  const receiptBalance =
    !hasLocalReceiptBalance && directBalance.lend
      ? directBalance.lend
      : localReceiptBalance;
  const hyperliquidDepositBalance = getSelectedBalance(
    hyperliquidDepositChainE,
    activeHyperliquidDepositCoin,
    selectedWalletEntry,
  );
  const displayUnderlyingCoin = isHyperliquidDepositMode
    ? activeHyperliquidDepositCoin
    : underlyingCoin;
  const displayReceiptCoin = isHyperliquidDepositMode
    ? underlyingCoin
    : lendCoin;
  const displayReceiptName = isHyperliquidDepositMode ? "" : lendName;
  const displayUnderlyingBalance = isHyperliquidDepositMode
    ? hyperliquidDepositBalance
    : underlyingBalance;
  const displayReceiptBalance = isHyperliquidDepositMode
    ? underlyingBalance
    : receiptBalance;
  const underlyingQtyDecimals = getQtyDecimals(
    isHyperliquidDepositMode
      ? chainList.find((entry) => entry.chain == activeHyperliquidDepositChain)
          ?.coinInfoM?.[activeHyperliquidDepositCoin]?.decimals
      : marketE?.underlyingDecimals ??
          chainE?.coinInfoM?.[underlyingCoin]?.decimals,
  );
  const receiptQtyDecimals = getQtyDecimals(
    isHyperliquidDepositMode
      ? chainE?.coinInfoM?.[underlyingCoin]?.decimals
      : marketE?.lendDecimals ?? chainE?.coinInfoM?.[lendCoin]?.decimals,
  );
  const showUnderlyingBalanceLoading =
    !isHyperliquidDepositMode &&
    directBalanceLoading &&
    needsDirectBalance &&
    !hasLocalUnderlyingBalance &&
    !directBalance.underlying;
  const showReceiptBalanceLoading =
    !isHyperliquidDepositMode &&
    directBalanceLoading &&
    needsDirectBalance &&
    !hasLocalReceiptBalance &&
    !directBalance.lend;
  const maxUnderlying = toNum(displayUnderlyingBalance.balance);
  const maxReceipt = toNum(displayReceiptBalance.balance);
  const maxUnderlyingQty = formatTradeQty(
    displayUnderlyingBalance.balance,
    underlyingQtyDecimals,
  );
  const maxReceiptQty = formatTradeQty(
    displayReceiptBalance.balance,
    receiptQtyDecimals,
  );
  const withdrawMaxReceipt =
    isHyperliquid && !isHyperliquidDepositMode
      ? Math.max(0, maxReceipt - 0.000001)
      : maxReceipt;
  const baseUnderlyingPriceKey = priceKey(chainE?.chain || "", underlyingCoin);
  const baseReceiptPriceKey = priceKey(chainE?.chain || "", lendCoin);
  const hyperliquidDepositPriceKey = priceKey(
    activeHyperliquidDepositChain,
    activeHyperliquidDepositCoin,
  );
  const underlyingPriceKey = isHyperliquidDepositMode
    ? hyperliquidDepositPriceKey
    : baseUnderlyingPriceKey;
  const receiptPriceKey = isHyperliquidDepositMode
    ? baseUnderlyingPriceKey
    : baseReceiptPriceKey;
  const marketPreviewKey = `${defi}:${chainE?.chain || ""}:${underlyingCoin}:${lendCoin}`;
  const marketPreview = marketPreviewM[marketPreviewKey];
  const marketPreviewLoaded = marketPreview !== undefined;
  const marketLoading = !!marketLoadingM[marketPreviewKey];
  const marketReceiptRate =
    defi == "spark" || defi == "venusFlux"
      ? toNum(marketPreview?.receiptPerUnderlying)
      : 0;
  const underlyingListPrice = toNum(displayUnderlyingBalance.price);
  const receiptListPrice = toNum(displayReceiptBalance.price);
  const {
    fallbackPrice: underlyingFallbackPrice,
    loading: underlyingPriceLoading,
  } = useTradeFallbackPrice({
    enabled: chainE?.chain != "Hyperliquid",
    cacheKey: underlyingPriceKey,
    chain: chainE?.chain,
    coin: underlyingCoin,
    listPrice: underlyingListPrice,
    getPrice: getTradeCoinPrice,
  });
  const {
    fallbackPrice: receiptFallbackPrice,
    loading: receiptPriceLoading,
  } = useTradeFallbackPrice({
    enabled: chainE?.chain != "Hyperliquid",
    cacheKey: receiptPriceKey,
    chain: chainE?.chain,
    coin: lendCoin,
    listPrice: receiptListPrice,
    getPrice: getTradeCoinPrice,
  });
  const underlyingPrice =
    underlyingListPrice ||
    toNum(underlyingFallbackPrice) ||
    (isHyperliquid && displayUnderlyingCoin == "USDC" ? 1 : 0) ||
    (isHyperliquidDepositMode && isUsdLikeYieldCoin(displayUnderlyingCoin)
      ? 1
      : 0);
  const receiptPrice =
    receiptListPrice ||
    toNum(receiptFallbackPrice) ||
    (isHyperliquid && displayReceiptCoin ? 1 : 0) ||
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
    isHyperliquid &&
    !isHyperliquidDepositMode &&
    nowMs > 0 &&
    vaultLockedUntilMs > nowMs;
  const vaultLockText = vaultLocked ? formatLockUntil(vaultLockedUntilMs) : "";
  const receiptRate =
    (defi == "spark" || defi == "venusFlux") && marketReceiptRate
      ? marketReceiptRate
      : underlyingPrice && receiptPrice
        ? underlyingPrice / receiptPrice
        : 1;
  const underlyingQty = toNum(lendQty);
  const receiptQtyNum = toNum(receiptQty);
  const signedLendRedeem = qtyInputSide == "lend" && underlyingQty < 0;
  const signedRedeemLend = qtyInputSide == "redeem" && receiptQtyNum < 0;
  const isRedeem =
    signedLendRedeem || (qtyInputSide == "redeem" && !signedRedeemLend);
  const lendSliderValue = Math.max(0, Math.min(underlyingQty, maxUnderlying));
  const redeemSliderValue = Math.max(0, Math.min(receiptQtyNum, withdrawMaxReceipt));
  const underlyingEndInputValue =
    underlyingEndDraft ||
    getTradeEndInputValue(
      maxUnderlyingQty,
      lendQty,
      isRedeem,
      underlyingQtyDecimals,
    );
  const receiptEndInputValue =
    receiptEndDraft ||
    getTradeEndInputValue(
      maxReceiptQty,
      receiptQty,
      !isRedeem,
      receiptQtyDecimals,
    );
  function getWalletUnderlyingBalance(walletEntry = selectedWalletEntry) {
    return getTradeWalletMarketBalance({
      chainE,
      coin: underlyingCoin,
      address: marketE?.underlyingAddress,
      walletEntry,
      selectedWalletEntry,
      selectedBalances: [displayUnderlyingBalance, directBalance.underlying],
    });
  }

  function getWalletReceiptBalance(walletEntry = selectedWalletEntry) {
    return getTradeWalletMarketBalance({
      chainE,
      coin: lendCoin,
      address: marketE?.lendAddress,
      walletEntry,
      selectedWalletEntry,
      selectedBalances: [displayReceiptBalance, directBalance.lend],
    });
  }

  function getMarketCoinE(side = "underlying") {
    const coin = side == "lend" ? lendCoin : underlyingCoin;
    const address =
      side == "lend" ? marketE?.lendAddress : marketE?.underlyingAddress;
    const decimals =
      side == "lend" ? marketE?.lendDecimals : marketE?.underlyingDecimals;

    return getTradeMarketCoinEntry({ chainE, coin, address, decimals });
  }

  async function queryWalletMarketBalance(
    walletEntry = selectedWalletEntry,
    side = "underlying",
  ) {
    if (!walletEntry?.address || !chainE?.chain) return {};

    if (usesDirectMarket && marketE?.underlyingAddress && marketE?.lendAddress) {
      const protocolLabel = defi == "venusFlux" ? "Venus Flux" : "Spark";
      const res = await withClientTimeout(
        getYieldMarketBalance({
          walletAddress: walletEntry.address,
          chain: chainE.chain,
          underlyingAddress: marketE.underlyingAddress,
          underlyingDecimals: marketE.underlyingDecimals,
          lendAddress: marketE.lendAddress,
          lendDecimals: marketE.lendDecimals,
        }),
        12000,
        `${walletEntry.name || walletEntry.label || "wallet"} ${protocolLabel} balance timeout`,
      );

      return side == "lend" ? res?.lend || {} : res?.underlying || {};
    }

    const coin = side == "lend" ? lendCoin : underlyingCoin;
    return getTradeCoinBalance({
      chain: chainE.chain,
      coin,
      address: walletEntry.address,
      coinE: getMarketCoinE(side),
    });
  }

  async function getWalletUnderlyingBalanceForEnd(walletEntry = selectedWalletEntry) {
    const balance = getWalletUnderlyingBalance(walletEntry);
    if (hasLoadedBalance(balance)) return balance;

    return queryWalletMarketBalance(walletEntry, "underlying").catch(() => ({}));
  }

  async function getWalletReceiptBalanceForEnd(walletEntry = selectedWalletEntry) {
    const balance = getWalletReceiptBalance(walletEntry);
    if (hasLoadedBalance(balance)) return balance;

    return queryWalletMarketBalance(walletEntry, "lend").catch(() => ({}));
  }

  function getLendEndTarget() {
    return toNum(getLendEndTargetText());
  }

  function getRedeemEndTarget() {
    return toNum(getRedeemEndTargetText());
  }

  function getLendEndTargetText() {
    return formatTradeQty(
      underlyingEndDraft || underlyingEndInputValue,
      underlyingQtyDecimals,
    );
  }

  function getRedeemEndTargetText() {
    return formatTradeQty(
      receiptEndDraft || receiptEndInputValue,
      receiptQtyDecimals,
    );
  }

  async function getLendQtyForWallet(walletEntry = selectedWalletEntry) {
    if (!lendEndWith) return formatTradeQty(lendQty, underlyingQtyDecimals);

    const balance = await getWalletUnderlyingBalanceForEnd(walletEntry);
    if (!hasLoadedBalance(balance)) return null;

    return formatComputedTradeQty(
      subtractTradeQtyText(
        formatTradeQty(balance.balance, underlyingQtyDecimals),
        getLendEndTargetText(),
        underlyingQtyDecimals,
      ),
      underlyingQtyDecimals,
    );
  }

  async function getRedeemQtyForWallet(walletEntry = selectedWalletEntry) {
    if (!redeemEndWith) return formatTradeQty(receiptQty, receiptQtyDecimals);

    const balance = await getWalletReceiptBalanceForEnd(walletEntry);
    if (!hasLoadedBalance(balance)) return null;

    return formatComputedTradeQty(
      subtractTradeQtyText(
        formatTradeQty(balance.balance, receiptQtyDecimals),
        getRedeemEndTargetText(),
        receiptQtyDecimals,
      ),
      receiptQtyDecimals,
    );
  }
  const underlyingUsd = underlyingPrice ? maxUnderlying * underlyingPrice : 0;
  const receiptUsd = receiptPrice ? maxReceipt * receiptPrice : 0;
  const underlyingQtyUsd = underlyingPrice
    ? underlyingQty * underlyingPrice
    : 0;
  const receiptQtyUsd = receiptPrice ? receiptQtyNum * receiptPrice : 0;
  const underlyingEndUsd = underlyingPrice
    ? toNum(underlyingEndInputValue) * underlyingPrice
    : 0;
  const receiptEndUsd = receiptPrice
    ? toNum(receiptEndInputValue) * receiptPrice
    : 0;
  const priceLoading = underlyingPriceLoading || receiptPriceLoading;
  const noPriceCoins = [
    displayUnderlyingCoin && underlyingPrice <= 0 ? displayUnderlyingCoin : "",
    displayReceiptCoin && receiptPrice <= 0 ? displayReceiptCoin : "",
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
    const savedDefi = getCookie(
      getTradeModeCookie(tradeYieldDefiCookie, walletType),
    );
    if (savedDefi && lendingOptions.some((entry) => entry.value == savedDefi)) {
      setDefi(savedDefi);
    }
  }, [walletType]);

  useEffect(() => {
    const savedMode = getCookie(
      getProtocolCookie(
        tradeYieldHyperliquidModeCookie,
        walletType,
        "hyperliquid",
      ),
    );
    const savedChain = getCookie(
      getProtocolCookie(
        tradeYieldHyperliquidChainCookie,
        walletType,
        "hyperliquid",
      ),
    );
    const savedCoin = getCookie(
      getProtocolCookie(
        tradeYieldHyperliquidCoinCookie,
        walletType,
        "hyperliquid",
      ),
    );
    const savedDepositCoin =
      getCookie(
        getProtocolCookie(
          tradeYieldHyperliquidDepositCoinCookie,
          walletType,
          "hyperliquid",
        ),
      ) || savedCoin;
    const savedWithdrawCoin =
      getCookie(
        getProtocolCookie(
          tradeYieldHyperliquidWithdrawCoinCookie,
          walletType,
          "hyperliquid",
        ),
      ) || savedCoin;

    if (savedMode == "deposit" || savedMode == "vault") {
      setHyperliquidMode(savedMode);
    }
    if (savedChain) {
      setHyperliquidDepositChain(savedChain);
      setHyperliquidWithdrawChain(savedChain);
    }
    if (savedDepositCoin) {
      setHyperliquidDepositCoin(savedDepositCoin);
    }
    if (savedWithdrawCoin) {
      setHyperliquidWithdrawCoin(savedWithdrawCoin);
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
    if (!isHyperliquid) return;
    const syncChain =
      activeHyperliquidDepositChain || activeHyperliquidWithdrawChain;

    if (syncChain && syncChain != hyperliquidDepositChain) {
      setHyperliquidDepositChain(syncChain);
    }
    if (syncChain && syncChain != hyperliquidWithdrawChain) {
      setHyperliquidWithdrawChain(syncChain);
    }
  }, [
    activeHyperliquidDepositChain,
    activeHyperliquidWithdrawChain,
    hyperliquidDepositChain,
    hyperliquidWithdrawChain,
    isHyperliquid,
  ]);

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
  }, [chainE?.chain, defi, market, marketCookieValues, markets, walletType]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    function closeMarketMenu(e) {
      const target = e.target;
      if (!marketPickerRef.current?.contains(target)) {
        setShowMarketMenu(false);
      }
      if (!hyperliquidDepositCoinPickerRef.current?.contains(target)) {
        setShowHyperliquidDepositCoinMenu(false);
      }
      if (!hyperliquidDepositChainPickerRef.current?.contains(target)) {
        setShowHyperliquidDepositChainMenu(false);
      }
      if (!hyperliquidWithdrawCoinPickerRef.current?.contains(target)) {
        setShowHyperliquidWithdrawCoinMenu(false);
      }
      if (!hyperliquidWithdrawChainPickerRef.current?.contains(target)) {
        setShowHyperliquidWithdrawChainMenu(false);
      }
    }

    document.addEventListener("mousedown", closeMarketMenu);

    return () => {
      document.removeEventListener("mousedown", closeMarketMenu);
    };
  }, []);

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
  }, [
    activeHyperliquidDepositChain,
    activeHyperliquidDepositCoin,
    activeHyperliquidWithdrawChain,
    activeHyperliquidWithdrawCoin,
    chainE?.chain,
    hyperliquidMode,
    lendCoin,
    selectedWalletEntry?.value,
  ]);

  useEffect(() => {
    if (qtyInputSide == "redeem") {
      const next = getSignedUnderlyingQty(receiptQty);
      if (next != lendQty) setLendQty(next);
      return;
    }

    const next = getSignedReceiptQty(lendQty);
    if (next != receiptQty) setReceiptQty(next);
  }, [lendQty, qtyInputSide, receiptQty, receiptRate]);

  function getReceiptQty(value) {
    return getTradeReceiptQty(value, receiptRate, receiptQtyDecimals);
  }

  function getUnderlyingQty(value) {
    return getTradeUnderlyingQty(value, receiptRate, underlyingQtyDecimals);
  }

  function getSignedReceiptQty(value) {
    return getSignedTradeReceiptQty(value, receiptRate, receiptQtyDecimals);
  }

  function getSignedUnderlyingQty(value) {
    return getSignedTradeUnderlyingQty(value, receiptRate, underlyingQtyDecimals);
  }

  function updateLendQty(value) {
    const maxRedeemUnderlying =
      receiptRate > 0 ? withdrawMaxReceipt / receiptRate : 0;
    const qty = normalizeSignedQtyInput(
      value,
      maxUnderlying,
      maxRedeemUnderlying,
      underlyingQtyDecimals,
    );
    setQtyInputSide("lend");
    setLendQty(qty);
    setReceiptQty(getSignedReceiptQty(qty));
  }

  function updateRedeemQty(value) {
    const maxLendReceipt = maxUnderlying * receiptRate;
    const qty = normalizeSignedQtyInput(
      value,
      withdrawMaxReceipt,
      maxLendReceipt,
      receiptQtyDecimals,
    );
    setQtyInputSide("redeem");
    setReceiptQty(qty);
    setLendQty(getSignedUnderlyingQty(qty));
  }

  function updateUnderlyingEnd(value) {
    const endQty = limitQtyInputDecimals(
      cleanTradeInput(value),
      underlyingQtyDecimals,
    );
    const qty = getTradeEndDiffQty(maxUnderlyingQty, endQty, underlyingQtyDecimals);
    setUnderlyingEndDraft(endQty);
    setQtyInputSide("lend");
    setLendQty(qty);
    setReceiptQty(getSignedReceiptQty(qty));
  }

  function updateReceiptEnd(value) {
    const endQty = limitQtyInputDecimals(
      cleanTradeInput(value),
      receiptQtyDecimals,
    );
    const qty = getTradeEndDiffQty(maxReceiptQty, endQty, receiptQtyDecimals);
    setReceiptEndDraft(endQty);
    setQtyInputSide("redeem");
    setReceiptQty(qty);
    setLendQty(getSignedUnderlyingQty(qty));
  }

  function updateLendEndWith(checked) {
    setLendEndWith(checked);
    if (!checked) return;

    const endQty = getLendEndTargetText();
    const qty = getTradeEndDiffQty(maxUnderlyingQty, endQty, underlyingQtyDecimals);
    setUnderlyingEndDraft(formatTradeQty(endQty, underlyingQtyDecimals));
    setQtyInputSide("lend");
    setLendQty(qty);
    setReceiptQty(getSignedReceiptQty(qty));
  }

  function updateRedeemEndWith(checked) {
    setRedeemEndWith(checked);
    if (!checked) return;

    const endQty = getRedeemEndTargetText();
    const qty = getTradeEndDiffQty(maxReceiptQty, endQty, receiptQtyDecimals);
    setReceiptEndDraft(formatTradeQty(endQty, receiptQtyDecimals));
    setQtyInputSide("redeem");
    setReceiptQty(qty);
    setLendQty(getSignedUnderlyingQty(qty));
  }

  function updateAutoApproval(checked) {
    setAutoApproval(checked);
    setCookie(tradeAutoApprovalCookie, checked ? "1" : "0", {
      maxAge: cookieMaxAge,
    });
  }

  function saveHyperliquidModeCookie(value) {
    setCookie(
      getProtocolCookie(
        tradeYieldHyperliquidModeCookie,
        walletType,
        "hyperliquid",
      ),
      value == "deposit" ? "deposit" : "vault",
      { maxAge: cookieMaxAge },
    );
  }

  function saveHyperliquidRouteCookie(route = {}) {
    const {
      chainName = "",
      depositCoin = "",
      withdrawCoin = "",
      coin = "",
    } = route;
    if ("chainName" in route) {
      setCookie(
        getProtocolCookie(
          tradeYieldHyperliquidChainCookie,
          walletType,
          "hyperliquid",
        ),
        chainName,
        { maxAge: cookieMaxAge },
      );
    }
    if ("coin" in route) {
      setCookie(
        getProtocolCookie(
          tradeYieldHyperliquidCoinCookie,
          walletType,
          "hyperliquid",
        ),
        coin,
        { maxAge: cookieMaxAge },
      );
    }
    if ("depositCoin" in route) {
      setCookie(
        getProtocolCookie(
          tradeYieldHyperliquidDepositCoinCookie,
          walletType,
          "hyperliquid",
        ),
        depositCoin,
        { maxAge: cookieMaxAge },
      );
    }
    if ("withdrawCoin" in route) {
      setCookie(
        getProtocolCookie(
          tradeYieldHyperliquidWithdrawCoinCookie,
          walletType,
          "hyperliquid",
        ),
        withdrawCoin,
        { maxAge: cookieMaxAge },
      );
    }
  }

  function getNextHyperliquidCoinForSide({
    side = "deposit",
    chainName = "",
    currentCoin = "",
  } = {}) {
    const chainEntry = chainList.find((entry) => entry.chain == chainName);
    const coins = getHyperliquidAllCoinsForChain({
      discoveryE: hyperliquidBridgeE,
      side,
      chain: chainName,
      fallbackCoins: getFallbackHyperliquidCoinsForChain(chainEntry),
    });
    const addedCoins = getHyperliquidAddedCoinsForChain({
      chainE: chainEntry,
      discoveryE: hyperliquidBridgeE,
      side,
      fallbackCoins: getFallbackHyperliquidCoinsForChain(chainEntry),
    });

    return coins.includes(currentCoin)
      ? currentCoin
      : addedCoins[0] || coins[0] || "";
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

  function nextHyperliquidMode() {
    selectHyperliquidMode(nextValue(["vault", "deposit"], hyperliquidMode));
  }

  function selectHyperliquidMode(value) {
    const nextMode = value == "deposit" ? "deposit" : "vault";
    setHyperliquidMode(nextMode);
    saveHyperliquidModeCookie(nextMode);
    setShowMarketMenu(false);
    setLendQty("0");
    setReceiptQty("0");
    setUnderlyingEndDraft("");
    setReceiptEndDraft("");
  }

  function nextHyperliquidDepositChain() {
    const next = nextValue(
      hyperliquidDepositChains,
      activeHyperliquidDepositChain,
    );
    if (next) selectHyperliquidDepositChain(next);
  }

  function selectHyperliquidDepositChain(chainName) {
    setHyperliquidDepositChain(chainName);
    setHyperliquidWithdrawChain(chainName);
    setShowHyperliquidDepositChainMenu(false);
    const nextDepositCoin = getNextHyperliquidCoinForSide({
      side: "deposit",
      chainName,
      currentCoin: hyperliquidDepositCoin,
    });
    const nextWithdrawCoin = getNextHyperliquidCoinForSide({
      side: "withdraw",
      chainName,
      currentCoin: hyperliquidWithdrawCoin,
    });
    setHyperliquidDepositCoin(nextDepositCoin);
    setHyperliquidWithdrawCoin(nextWithdrawCoin);
    saveHyperliquidRouteCookie({
      chainName,
      depositCoin: nextDepositCoin,
      withdrawCoin: nextWithdrawCoin,
    });
    emitTradeChainSelect(chainName);
  }

  function nextHyperliquidDepositCoin() {
    const next = nextValue(
      hyperliquidDepositCoins,
      activeHyperliquidDepositCoin,
    );
    if (next) selectHyperliquidDepositCoin(next);
  }

  function selectHyperliquidDepositCoin(coin) {
    setHyperliquidDepositCoin(coin);
    const route = {
      chainName: activeHyperliquidDepositChain,
      depositCoin: coin,
    };
    if (hyperliquidWithdrawCoins.includes(coin)) {
      setHyperliquidWithdrawCoin(coin);
      route.withdrawCoin = coin;
    } else {
      setHyperliquidWithdrawCoin(activeHyperliquidWithdrawCoin);
      route.withdrawCoin = activeHyperliquidWithdrawCoin;
    }
    saveHyperliquidRouteCookie({
      ...route,
    });
    setShowHyperliquidDepositCoinMenu(false);
  }

  function nextHyperliquidWithdrawChain() {
    const next = nextValue(
      hyperliquidWithdrawChains,
      activeHyperliquidWithdrawChain,
    );
    if (next) selectHyperliquidWithdrawChain(next);
  }

  function selectHyperliquidWithdrawChain(chainName) {
    setHyperliquidDepositChain(chainName);
    setHyperliquidWithdrawChain(chainName);
    setShowHyperliquidWithdrawChainMenu(false);
    const nextDepositCoin = getNextHyperliquidCoinForSide({
      side: "deposit",
      chainName,
      currentCoin: hyperliquidDepositCoin,
    });
    const nextWithdrawCoin = getNextHyperliquidCoinForSide({
      side: "withdraw",
      chainName,
      currentCoin: hyperliquidWithdrawCoin,
    });
    setHyperliquidDepositCoin(nextDepositCoin);
    setHyperliquidWithdrawCoin(nextWithdrawCoin);
    saveHyperliquidRouteCookie({
      chainName,
      depositCoin: nextDepositCoin,
      withdrawCoin: nextWithdrawCoin,
    });
    emitTradeChainSelect(chainName);
  }

  function nextHyperliquidWithdrawCoin() {
    const next = nextValue(
      hyperliquidWithdrawCoins,
      activeHyperliquidWithdrawCoin,
    );
    if (next) selectHyperliquidWithdrawCoin(next);
  }

  function selectHyperliquidWithdrawCoin(coin) {
    setHyperliquidWithdrawCoin(coin);
    const route = {
      chainName: activeHyperliquidWithdrawChain,
      withdrawCoin: coin,
    };
    if (hyperliquidDepositCoins.includes(coin)) {
      setHyperliquidDepositCoin(coin);
      route.depositCoin = coin;
    } else {
      setHyperliquidDepositCoin(activeHyperliquidDepositCoin);
      route.depositCoin = activeHyperliquidDepositCoin;
    }
    saveHyperliquidRouteCookie({
      ...route,
    });
    setShowHyperliquidWithdrawCoinMenu(false);
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
    setCookie(
      getProtocolCookie(tradeYieldChainCookie, walletType, defi),
      chain,
      {
        maxAge: cookieMaxAge,
      },
    );
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
      getProtocolCookie(tradeYieldMarketCookie, walletType, defi, chainE.chain),
      value,
      { maxAge: cookieMaxAge },
    );
  }

  function getMarketTableRow(entry = {}) {
    const underlyingBalance = getMarketCoinBalance(
      chainE,
      entry.underlyingCoin,
      entry.underlyingAddress,
      selectedWalletEntry,
    );
    const lendBalance = getMarketCoinBalance(
      chainE,
      entry.lendCoin,
      entry.lendAddress,
      selectedWalletEntry,
    );

    return {
      ...entry,
      underlyingBalance,
      lendBalance,
      underlyingQty: getBalanceQty(underlyingBalance),
      lendQty: getBalanceQty(lendBalance),
      aprValue: toNum(entry.supplyApr),
    };
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

  function setMaxLend() {
    updateLendQty(maxUnderlyingQty);
  }

  function setMaxRedeem() {
    updateRedeemQty(formatTradeQty(withdrawMaxReceipt, receiptQtyDecimals));
  }

  async function runHyperliquidSpotTransferForWallet(
    action = "deposit",
    walletEntry = selectedWalletEntry,
    { skipConfirm = false, loopRun = false } = {},
  ) {
    const tradeToast = createTradeToast(walletEntry, loopRun);
    const deposit = action == "deposit";
    const actionLabel = deposit ? "deposit" : "withdraw";
    const rawQty = deposit
      ? formatTradeQty(lendQty, underlyingQtyDecimals)
      : formatTradeQty(receiptQty, receiptQtyDecimals);
    const qty = rawQty.replace(/^-/, "");
    const bridgeChain = deposit
      ? activeHyperliquidDepositChain
      : activeHyperliquidWithdrawChain;
    const bridgeCoin = deposit
      ? activeHyperliquidDepositCoin
      : activeHyperliquidWithdrawCoin;

    if (!walletEntry?.address) {
      tradeToast.error("wallet missing");
      return;
    }
    if (
      walletEntry?.isBrowserWallet &&
      walletEntry.type != "evm"
    ) {
      tradeToast.error("Hyperliquid needs an EVM browser wallet");
      return;
    }
    if (
      !walletEntry?.isBrowserWallet &&
      !walletEntry?.hasPrivateKey
    ) {
      tradeToast.error("no private key");
      return;
    }
    if (!bridgeChain || !bridgeCoin) {
      tradeToast.error("Hyperliquid bridge coin missing");
      return;
    }
    const routeToken = deposit
      ? hyperliquidDepositRouteToken
      : hyperliquidWithdrawRouteToken;
    if (routeToken && !routeToken.actionSupported) {
      const routeText = routeToken.routes?.[0]?.label || routeToken.chain;
      tradeToast.error(
        `Hyperliquid ${actionLabel} route not wired yet: ${routeText} ${routeToken.coin}`,
      );
      return;
    }
    if (toNum(rawQty) < 0) {
      tradeToast.error(`${actionLabel} qty cannot be negative`);
      return;
    }
    if (!toNum(qty)) {
      tradeToast.error(`${actionLabel} qty is 0`);
      return;
    }
    if (deposit && toNum(qty) < 5) {
      tradeToast.error("Hyperliquid deposits must be at least $5");
      return;
    }

    const useBrowserWallet = !!walletEntry?.isBrowserWallet;
    if (!useBrowserWallet && !skipConfirm) {
      const ok = window.confirm(
        `Execute Hyperliquid spot ${actionLabel}?\n\nwallet: ${
          walletEntry.name || walletEntry.label
        }\nchain: ${bridgeChain}\namount: ${qty} ${bridgeCoin}`,
      );
      if (!ok) return;
    }

    const toastId = tradeToast.loading(`Hyperliquid: preparing ${actionLabel}...`);
    setLendPending(true);
    setLendPendingAction(deposit ? "lend" : "redeem");
    setLendResult(null);

    try {
      let res;

      if (useBrowserWallet && deposit) {
        const built = await buildHyperliquidSpotDepositTxs({
          walletAddress: walletEntry.address,
          chain: bridgeChain,
          coin: bridgeCoin,
          amount: qty,
        });
        const txs = [];

        for (const tx of built.txs || []) {
          txs.push(
            await sendBrowserTradeTx({
              tx,
              walletEntry,
              tradeToast,
              toastId,
              message: `Hyperliquid: confirm ${tx.chain} deposit...`,
            }),
          );
        }
        res = { ...built, txs };
      } else if (useBrowserWallet) {
        const browserChainId = await getBrowserEvmChainId(
          walletEntry.browserWallet,
        );
        const built = await buildHyperliquidSpotWithdrawTxs({
          walletAddress: walletEntry.address,
          chain: bridgeChain,
          coin: bridgeCoin,
          amount: qty,
          signatureChainId: browserChainId,
        });
        const tx = built.txs?.[0];
        if (!tx?.sign) throw new Error("Hyperliquid withdraw action missing");

        tradeToast.loading("Hyperliquid: sign withdraw...", {
          id: toastId,
        });
        const signature = await signBrowserTypedData({
          sign: tx.sign,
          wallet: walletEntry.browserWallet,
          address: walletEntry.address,
          chainId: tx.sign.chainId,
        });
        tradeToast.loading("Hyperliquid: submitting withdraw...", {
          id: toastId,
        });
        const submitted = await submitHyperliquidSpotWithdrawSignature({
          walletAddress: walletEntry.address,
          tx,
          signature,
        });
        res = { ...built, txs: [submitted] };
      } else if (deposit) {
        tradeToast.loading("Hyperliquid: submitting deposit...", {
          id: toastId,
        });
        res = await executeHyperliquidSpotDeposit({
          walletName: walletEntry.name,
          walletAddress: walletEntry.address,
          chain: bridgeChain,
          coin: bridgeCoin,
          amount: qty,
        });
      } else {
        tradeToast.loading("Hyperliquid: submitting withdraw...", {
          id: toastId,
        });
        res = await executeHyperliquidSpotWithdraw({
          walletName: walletEntry.name,
          walletAddress: walletEntry.address,
          chain: bridgeChain,
          coin: bridgeCoin,
          amount: qty,
        });
      }

      setLendResult(res);
      tradeToast.success(`Hyperliquid ${actionLabel} submitted`, {
        id: toastId,
      });
      onTxComplete({
        ...res,
        refreshTargets: [
          {
            chain: bridgeChain,
            coin: bridgeCoin,
            address: walletEntry.address,
          },
          {
            chain: "Hyperliquid",
            coin: "USDC",
            address: walletEntry.address,
          },
        ],
      });
      return res;
    } catch (e) {
      const message = e?.message || `Hyperliquid ${actionLabel} failed`;
      const errorResult = {
        ok: false,
        error: message,
        defi: "Hyperliquid",
        action: actionLabel,
      };
      setLendResult(errorResult);
      tradeToast.error(message, { id: toastId });
      return errorResult;
    } finally {
      setLendPending(false);
      setLendPendingAction("");
    }
  }

  async function runHyperliquidSpotTransfer(action = "deposit") {
    const qty =
      action == "deposit"
        ? formatTradeQty(lendQty, underlyingQtyDecimals)
        : formatTradeQty(receiptQty, receiptQtyDecimals);
    const result = await runTradeWalletLoop({
      loopWallets,
      getLoopWalletEntries,
      selectedWalletEntry,
      actionLabel: `Hyperliquid spot ${action} ${qty}`,
      runOne: (walletEntry, options) =>
        runHyperliquidSpotTransferForWallet(action, walletEntry, options),
    });
    if (Array.isArray(result)) {
      const loopResult = createTradeLoopResult(result, {
        defi: "Hyperliquid",
        action,
      });
      if (loopResult) setLendResult(loopResult);
    }

    return result;
  }

  async function runLendForWallet(
    action,
    walletEntry = selectedWalletEntry,
    { skipConfirm = false, loopRun = false } = {},
  ) {
    const tradeToast = createTradeToast(walletEntry, loopRun);

    if (!lendCoin || !underlyingCoin) {
      tradeToast.error(
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
      tradeToast.show(`${lendingE.label}: lending not wired yet`);
      return;
    }
    const protocol = isHyperliquidAction
      ? "Hyperliquid"
      : isVenusFluxAction
        ? "Venus Flux"
        : "Spark";
    if (!walletEntry?.address) {
      tradeToast.error("wallet missing");
      return;
    }
    if (
      walletEntry?.isBrowserWallet &&
      walletEntry.type != "evm"
    ) {
      tradeToast.error(`${protocol} needs an EVM browser wallet`);
      return;
    }
    if (
      !walletEntry?.isBrowserWallet &&
      !walletEntry?.hasPrivateKey
    ) {
      tradeToast.error("no private key");
      return;
    }

    const redeem = action == "redeem";
    const signedQty = redeem
      ? await getRedeemQtyForWallet(walletEntry)
      : await getLendQtyForWallet(walletEntry);
    if (signedQty === null) {
      const errorResult = {
        ok: false,
        error: "end balance missing",
        defi: protocol,
        action,
      };
      setLendResult(errorResult);
      tradeToast.error("end balance missing");
      return errorResult;
    }
    const signedQtyNum = toNum(signedQty);
    const submitRedeem = redeem ? signedQtyNum >= 0 : signedQtyNum < 0;
    const submitAction = submitRedeem ? "redeem" : "lend";
    const actionLabel = isHyperliquidAction
      ? submitRedeem
        ? "withdraw"
        : "deposit"
      : submitAction;
    const signedQtyAbs = Math.abs(signedQtyNum);
    const qty = redeem
      ? submitRedeem
        ? formatComputedTradeQty(signedQty, receiptQtyDecimals).replace(/^-/, "")
        : getUnderlyingQty(signedQtyAbs)
      : submitRedeem
        ? getReceiptQty(signedQtyAbs)
        : formatComputedTradeQty(signedQty, underlyingQtyDecimals).replace(/^-/, "");
    const autoApprovalAmount =
      !submitRedeem && !isHyperliquidAction && autoApproval ? qty : "";
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
      tradeToast.error(`${actionLabel} qty is 0`);
      return;
    }
    if (isHyperliquidAction && !submitRedeem && toNum(qty) < 5) {
      tradeToast.error("Hyperliquid vault deposits must be at least $5");
      return;
    }
    if (isHyperliquidAction && submitRedeem && vaultLocked) {
      tradeToast.error(`Hyperliquid vault locked until ${vaultLockText}`);
      return;
    }

    const useBrowserWallet = !!walletEntry?.isBrowserWallet;
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
    const directMarketArgs = isHyperliquidAction
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
    const toastId = tradeToast.loading(`${protocol}: preparing ${actionLabel}...`);
    setLendPending(true);
    setLendPendingAction(submitAction);
    setLendResult(null);

    try {
      let res;
      if (useBrowserWallet && isHyperliquidAction) {
        tradeToast.loading(`${protocol}: checking agent approval...`, {
          id: toastId,
        });
        const browserAgent = getHyperliquidBrowserAgent(
          walletEntry.address,
        );
        const browserChainId = await getBrowserEvmChainId(
          walletEntry.browserWallet,
        );
        const agentApproval = await buildHyperliquidAgentApproval({
          walletAddress: walletEntry.address,
          agentAddress: browserAgent.address,
          signatureChainId: browserChainId,
        });
        const agentCookie = getHyperliquidAgentCookie(
          walletEntry.address,
          agentApproval.agentAddress,
        );
        const approveAgent = async () => {
          tradeToast.loading(`${protocol}: approve agent...`, {
            id: toastId,
          });
          const signature = await signBrowserTypedData({
            sign: agentApproval.sign,
            wallet: walletEntry.browserWallet,
            address: walletEntry.address,
          });
          await submitHyperliquidAgentApproval({
            walletAddress: walletEntry.address,
            approval: agentApproval.approval,
            sign: agentApproval.sign,
            signature,
          });
          setCookie(agentCookie, "1", { maxAge: cookieMaxAge });
        };
        const submitWithAgent = async () => {
          const built = await buildHyperliquidLendTxs({
            walletAddress: walletEntry.address,
            chain: chainE.chain,
            action: submitAction,
            underlyingCoin,
            lendCoin,
            amount: qty,
            ...directMarketArgs,
          });
          const tx = built.txs?.[0];
          if (!tx?.sign) throw new Error("Hyperliquid signed action missing");
          const signature = await signHyperliquidBrowserAgentTypedData({
            walletAddress: walletEntry.address,
            sign: tx.sign,
          });
          const submitted = await submitHyperliquidLendSignature({
            walletAddress: walletEntry.address,
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

        tradeToast.loading(`${protocol}: submitting ${actionLabel}...`, {
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
          tradeToast.loading(`${protocol}: submitting ${actionLabel}...`, {
            id: toastId,
          });
          res = await submitWithAgent();
        }
      } else if (useBrowserWallet) {
        tradeToast.loading(`${protocol}: building ${actionLabel} wallet prompt...`, {
          id: toastId,
        });
        const built = await buildTxs({
          walletAddress: walletEntry.address,
          chain: chainE.chain,
          action: submitAction,
          underlyingCoin,
          lendCoin,
          amount: qty,
          ...directMarketArgs,
        });
        const txs = [];

        for (const tx of built.txs || []) {
          tradeToast.loading(`${protocol}: confirm ${tx.type}...`, {
            id: toastId,
          });
          if (tx.sign) {
            const signature = await signBrowserTypedData({
              sign: tx.sign,
              wallet: walletEntry.browserWallet,
              address: walletEntry.address,
              chainId: tx.sign.chainId,
            });
            tradeToast.loading(`${protocol}: submitting ${tx.type}...`, {
              id: toastId,
            });
            txs.push(
              await submitHyperliquidLendSignature({
                walletAddress: walletEntry.address,
                tx,
                signature,
              }),
            );
          } else {
            txs.push(
              await sendBrowserTradeTx({
                tx,
                walletEntry,
                tradeToast,
                toastId,
              }),
            );
          }
        }
        res = { ...built, txs };
      } else {
        if (!skipConfirm) {
          const ok = window.confirm(
            `Execute ${protocol} ${actionLabel}?\n\nwallet: ${
              walletEntry.name || walletEntry.label
            }\nchain: ${chainE.chain}\namount: ${qty} ${
              submitRedeem ? lendCoin : underlyingCoin
            }`,
          );
          if (!ok) {
            toast.dismiss(toastId);
            return;
          }
        }

        let approvalAmount = "";
        if (!submitRedeem && !isHyperliquidAction) {
          tradeToast.loading(`${protocol}: checking allowance...`, {
            id: toastId,
          });
          const preview = await previewLend({
            walletAddress: walletEntry.address,
            chain: chainE.chain,
            action: submitAction,
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

        tradeToast.loading(`${protocol}: submitting ${actionLabel}...`, {
          id: toastId,
        });
        res = await executeLend({
          walletName: walletEntry.name,
          walletAddress: walletEntry.address,
          chain: chainE.chain,
          action: submitAction,
          underlyingCoin,
          lendCoin,
          amount: qty,
          approvalAmount,
          ...directMarketArgs,
        });
      }

      setLendResult(res);
      tradeToast.success(`${protocol} ${actionLabel} submitted`, {
        id: toastId,
      });
      onTxComplete({
        ...res,
        refreshTargets: [
          {
            chain: chainE.chain,
            coin: underlyingCoin,
            address: walletEntry.address,
          },
          {
            chain: chainE.chain,
            coin: lendCoin,
            address: walletEntry.address,
          },
        ],
      });
      return res;
    } catch (e) {
      const message = e?.message || `${protocol} ${actionLabel} failed`;
      const errorResult = {
        ok: false,
        error: message,
        defi: protocol,
        action: actionLabel,
      };
      setLendResult(errorResult);
      tradeToast.error(message, { id: toastId });
      return errorResult;
    } finally {
      setLendPending(false);
      setLendPendingAction("");
    }
  }

  async function runLend(action) {
    const result = await runTradeWalletLoop({
      loopWallets,
      getLoopWalletEntries,
      selectedWalletEntry,
      actionLabel: `${lendingE.label} ${
        action == "redeem" ? "redeem" : "lend"
      } ${
        action == "redeem"
          ? redeemEndWith
            ? `end ${formatTradeQty(getRedeemEndTarget(), receiptQtyDecimals)}`
            : formatTradeQty(receiptQty, receiptQtyDecimals)
          : lendEndWith
            ? `end ${formatTradeQty(getLendEndTarget(), underlyingQtyDecimals)}`
            : formatTradeQty(lendQty, underlyingQtyDecimals)
      }`,
      runOne: (walletEntry, options) =>
        runLendForWallet(action, walletEntry, options),
    });
    if (Array.isArray(result)) {
      const loopResult = createTradeLoopResult(result, {
        defi: lendingE.label,
        action: action == "redeem" ? "redeem" : "lend",
      });
      if (loopResult) setLendResult(loopResult);
    }

    return result;
  }

  return (
    <ProtocolClient>
    <div className="tradePane swapPane lendPane">
      <CustomCoinConfirmModal
        preview={customCoinPreview}
        draft={customCoinDraft}
        setDraft={setCustomCoinDraft}
        adding={addingCoin}
        coinTypeOptions={coinTypeOptions}
        idPrefix="yieldCoinConfirm"
        onCancel={clearCustomCoinPreview}
        onConfirm={confirmCustomCoin}
      />
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
        {isHyperliquid ? (
          <>
            <span className="selectCycle">
              <select
                value={hyperliquidMode}
                onChange={(e) => selectHyperliquidMode(e.target.value)}
              >
                <option value="vault">vault</option>
                <option value="deposit">deposit</option>
              </select>
              <button
                type="button"
                className="btn small bgGray"
                onClick={nextHyperliquidMode}
              >
                {">"}
              </button>
            </span>
          </>
        ) : (
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
        {!isHyperliquidDepositMode && hasProtocolAllMarkets ? (
          <YieldMarketPicker
            marketPickerRef={marketPickerRef}
            marketButtonWidth={marketButtonWidth}
            chainName={chainE?.chain}
            defi={defi}
            market={market}
            marketE={marketE}
            getMarketLabel={getMarketLabel}
            showMarketMenu={showMarketMenu}
            setShowMarketMenu={setShowMarketMenu}
            prevMarket={prevMarket}
            nextMarket={nextMarket}
            visibleAddedMarkets={visibleAddedMarkets}
            addedRows={visibleAddedMarkets.map(getMarketTableRow)}
            allRows={allMarkets.map(getMarketTableRow)}
            allLoading={allLoading}
            allError={allError}
            allProtocolLabel={allProtocolLabel}
            retryAllMarkets={retryAllMarkets}
            addedMarketSort={addedMarketSort}
            setAddedMarketSort={setAddedMarketSort}
            allMarketSort={allMarketSort}
            setAllMarketSort={setAllMarketSort}
            selectMarket={selectMarket}
            openProtocolCoinConfirm={openProtocolCoinConfirm}
            addingCoin={addingCoin}
            marketSupplyApr={marketSupplyApr}
            getLockedUntil={(coin) =>
              chainE?.coinInfoM?.[coin]?.lockedUntilTimestamp
            }
          />
        ) : !isHyperliquidDepositMode ? (
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
        ) : null}
      </div>

      <div className="swapRows">
        <div className="swapBox">
          <div className="swapAssetLine">
            {isHyperliquidDepositMode ? (
              <>
                <span className="gray">wallet</span>
                <HyperliquidChainSelect
                  side="deposit"
                  selectedChain={activeHyperliquidDepositChain}
                  addedChains={hyperliquidDepositAddedChains}
                  allChains={hyperliquidDepositChains}
                  bridgeE={hyperliquidBridgeE}
                  showMenu={showHyperliquidDepositChainMenu}
                  setShowMenu={setShowHyperliquidDepositChainMenu}
                  pickerRef={hyperliquidDepositChainPickerRef}
                  onSelect={selectHyperliquidDepositChain}
                  onNext={nextHyperliquidDepositChain}
                  onRetry={retryHyperliquidBridge}
                />
                <HyperliquidCoinSelect
                  side="deposit"
                  chain={activeHyperliquidDepositChain}
                  selectedCoin={activeHyperliquidDepositCoin}
                  addedCoins={hyperliquidDepositAddedCoins}
                  allCoins={hyperliquidDepositCoins}
                  allCoinEntries={hyperliquidDepositAllCoinEntries}
                  bridgeE={hyperliquidBridgeE}
                  showMenu={showHyperliquidDepositCoinMenu}
                  setShowMenu={setShowHyperliquidDepositCoinMenu}
                  pickerRef={hyperliquidDepositCoinPickerRef}
                  onSelect={selectHyperliquidDepositCoin}
                  onNext={nextHyperliquidDepositCoin}
                  onRetry={retryHyperliquidBridge}
                  getBalance={(coin) =>
                    getMarketCoinBalance(
                      hyperliquidDepositChainE,
                      coin,
                      "",
                      selectedWalletEntry,
                    )
                  }
                  MarketCoinBalance={MarketCoinBalance}
                />
                {hyperliquidDepositRouteText && (
                  <span className="gray">{hyperliquidDepositRouteText}</span>
                )}
                {hyperliquidBridgeE.loading && (
                  <span className="gray">loading routes...</span>
                )}
                {hyperliquidBridgeE.error && (
                  <button
                    type="button"
                    className="btn small bgGray"
                    onClick={retryHyperliquidBridge}
                  >
                    retry routes
                  </button>
                )}
              </>
            ) : (
              <span>{displayUnderlyingCoin || "-"}</span>
            )}
            <span className="swapCoinPrice">
              <span className="gray">{fmtPrice(underlyingPrice)}</span>
            </span>
          </div>
          <div className="swapBalanceLine">
            <button
              type="button"
              className="tradeTextButton swapAssetBalance"
              onClick={setMaxLend}
            >
              <span className="gray">{displayUnderlyingCoin}: </span>
              {showUnderlyingBalanceLoading
                ? "..."
                : maxUnderlyingQty}
              {underlyingUsd > 0 && (
                <span className="gray"> ${fmt(underlyingUsd, 2)}</span>
              )}
            </button>
          </div>
          <div className="swapAmountLine">
            <span className="gray">end</span>
            <label className="switch small lendEndSwitch">
              <input
                type="checkbox"
                checked={lendEndWith}
                onChange={(e) => updateLendEndWith(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              step="any"
              size={qtyInputSize(underlyingEndInputValue)}
              style={qtyInputStyle(underlyingEndInputValue)}
              value={underlyingEndInputValue}
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
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              step="any"
              size={qtyInputSize(lendQty)}
              style={qtyInputStyle(lendQty)}
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
              onChange={(e) =>
                updateLendQty(
                  rangeQtyInput(
                    e.target.value,
                    maxUnderlying,
                    maxUnderlyingQty,
                    underlyingQtyDecimals,
                  ),
                )
              }
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
              onClick={() =>
                isHyperliquidDepositMode
                  ? runHyperliquidSpotTransfer("deposit")
                  : runLend("lend")
              }
              disabled={
                lendPending ||
                (isHyperliquidDepositMode &&
                  (!activeHyperliquidDepositCoin ||
                    hyperliquidDepositRouteToken?.actionSupported === false))
              }
            >
              {lendPendingAction == "lend"
                ? `${depositButtonLabel}ING`
                : depositButtonLabel}
            </button>
          </div>
          {isHyperliquidDepositMode && hyperliquidDepositFeeEtaText && (
            <div className="hyperliquidFeeEtaLine gray">
              {hyperliquidDepositFeeEtaText}
            </div>
          )}
        </div>

        <div className="swapMiddle">
          {showGasAutoLabel && (
            <label className="swapGasSelect">
              <span className="gray">gas:</span>
              <select value="default" disabled>
                <option value="default">auto</option>
              </select>
            </label>
          )}
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
          {!isHyperliquidDepositMode && (
            <span className="swapRateLine">
              <span className="gray">rate:</span>{" "}
              {displayUnderlyingCoin && displayReceiptCoin
                ? `1 ${displayUnderlyingCoin} = ${fmtRate(receiptRate)} ${displayReceiptCoin}`
                : "-"}
              {priceStatus && <span className="gray"> {priceStatus}</span>}
            </span>
          )}
        </div>

        <div className="swapBox">
          <div className="swapAssetLine">
            {isHyperliquidDepositMode ? (
              <>
                <span className="gray">spot</span>
                <HyperliquidChainSelect
                  side="withdraw"
                  selectedChain={activeHyperliquidWithdrawChain}
                  addedChains={hyperliquidWithdrawAddedChains}
                  allChains={hyperliquidWithdrawChains}
                  bridgeE={hyperliquidBridgeE}
                  showMenu={showHyperliquidWithdrawChainMenu}
                  setShowMenu={setShowHyperliquidWithdrawChainMenu}
                  pickerRef={hyperliquidWithdrawChainPickerRef}
                  onSelect={selectHyperliquidWithdrawChain}
                  onNext={nextHyperliquidWithdrawChain}
                  onRetry={retryHyperliquidBridge}
                />
                <HyperliquidCoinSelect
                  side="withdraw"
                  chain={activeHyperliquidWithdrawChain}
                  selectedCoin={activeHyperliquidWithdrawCoin}
                  addedCoins={hyperliquidWithdrawAddedCoins}
                  allCoins={hyperliquidWithdrawCoins}
                  allCoinEntries={hyperliquidWithdrawAllCoinEntries}
                  bridgeE={hyperliquidBridgeE}
                  showMenu={showHyperliquidWithdrawCoinMenu}
                  setShowMenu={setShowHyperliquidWithdrawCoinMenu}
                  pickerRef={hyperliquidWithdrawCoinPickerRef}
                  onSelect={selectHyperliquidWithdrawCoin}
                  onNext={nextHyperliquidWithdrawCoin}
                  onRetry={retryHyperliquidBridge}
                  getBalance={(coin) =>
                    getMarketCoinBalance(
                      hyperliquidWithdrawChainE,
                      coin,
                      "",
                      selectedWalletEntry,
                    )
                  }
                  MarketCoinBalance={MarketCoinBalance}
                />
                {hyperliquidWithdrawRouteText && (
                  <span className="gray">{hyperliquidWithdrawRouteText}</span>
                )}
                {hyperliquidBridgeE.error && (
                  <button
                    type="button"
                    className="btn small bgGray"
                    onClick={retryHyperliquidBridge}
                  >
                    retry routes
                  </button>
                )}
              </>
            ) : (
              <span>{displayReceiptCoin || "-"}</span>
            )}
            {displayReceiptName && displayReceiptName != displayReceiptCoin && (
              <span className="gray">({displayReceiptName})</span>
            )}
            <span className="swapCoinPrice">
              <span className="gray">{fmtPrice(receiptPrice)}</span>
            </span>
          </div>
          <div className="swapBalanceLine">
            <span className="swapAssetBalance">
              <span className="gray">{displayReceiptCoin}: </span>
              {showReceiptBalanceLoading
                ? "..."
                : maxReceiptQty}
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
            <label className="switch small lendEndSwitch">
              <input
                type="checkbox"
                checked={redeemEndWith}
                onChange={(e) => updateRedeemEndWith(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              step="any"
              size={qtyInputSize(receiptEndInputValue)}
              style={qtyInputStyle(receiptEndInputValue)}
              value={receiptEndInputValue}
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
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              step="any"
              size={qtyInputSize(receiptQty)}
              style={qtyInputStyle(receiptQty)}
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
              onChange={(e) =>
                updateRedeemQty(
                  rangeQtyInput(
                    e.target.value,
                    withdrawMaxReceipt,
                    maxReceiptQty,
                    receiptQtyDecimals,
                  ),
                )
              }
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
              onClick={() =>
                isHyperliquidDepositMode
                  ? runHyperliquidSpotTransfer("withdraw")
                  : runLend("redeem")
              }
              disabled={
                lendPending ||
                vaultLocked ||
                (isHyperliquidDepositMode &&
                  (!activeHyperliquidWithdrawCoin ||
                    hyperliquidWithdrawRouteToken?.actionSupported === false))
              }
            >
              {lendPendingAction == "redeem"
                ? isHyperliquid
                  ? "WITHDRAWING"
                  : "REDEEMING"
                : withdrawButtonLabel}
            </button>
          </div>
          {isHyperliquidDepositMode && hyperliquidWithdrawFeeEtaText && (
            <div className="hyperliquidFeeEtaLine gray">
              {hyperliquidWithdrawFeeEtaText}
            </div>
          )}
        </div>
      </div>
      {lendResult && (
        <div className="swapResult">
          {lendResult.ok ? (
            <>
              <span className="gray">
                {lendResult.defi || lendingE.label} {lendResult.action}:
              </span>{" "}
              {lendResult.txs?.map((tx, index) => (
                <SwapTxLink key={`${tx.walletLabel || ""}_${tx.hash}_${index}`} tx={tx} />
              ))}
              {lendResult.loopErrors?.map((entry) => (
                <span key={`${entry.walletLabel}_${entry.error}`} className="red">
                  {" "}
                  {entry.walletLabel}: {entry.error}
                </span>
              ))}
            </>
          ) : (
            <span className="red">{lendResult.error}</span>
          )}
        </div>
      )}
    </div>
    </ProtocolClient>
  );
}
