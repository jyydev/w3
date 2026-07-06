"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import { CycleButton } from "@/components/Shared";
import {
  encodeGroupedSelectionOrder,
  encodeSelectionOrder,
  normalizeSelectionOrder,
  parseGroupedSelectionOrder,
  parseSelectionOrder,
  rememberGroupedSelectionValue,
  rememberSelectionValue,
  sortByGroupedSelectionOrder,
  sortBySelectionOrder,
} from "@/fn/selectionOrder";
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
import {
  buildAaveStakingLendTxs,
  executeAaveStakingLend,
  getAaveStakingAllMarkets,
  getAaveStakingLendPreview,
  getAaveStakingMarketBalance,
} from "./aaveStaking/sv";
import AaveStakingClient from "./aaveStaking/Client";
import HyperliquidClient, {
  HyperliquidChainSelect,
  HyperliquidCoinSelect,
  getHyperliquidAgentCookie,
  getInitialHyperliquidMode,
  getInitialHyperliquidRouteCookie,
  getNextHyperliquidCoinForSide,
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
} from "../../_editorData/browserEditorStorage";
import {
  applyTradeMarketEndState,
  applyTradeMarketQtyState,
  canonicalizeTradeMarketEntry,
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
  getTradeMarketEndTarget,
  getTradeMarketEndTargetText,
  getTradeMarketEndPair,
  getTradeMarketPriceSummary,
  getTradeModeCookie,
  getTradeMarketQtyConverters,
  getTradeMarketQtyForWallet,
  getTradeMarketQtyPair,
  getTradeMarketSideState,
  getTradeMarketSideCoinEntry,
  getTradeMarketSyncedQty,
  getTradePickerButtonWidth,
  getTradeWalletMarketBalance,
  yieldOptions,
  nextValue,
  noYield,
  prevValue,
  priceKey,
  qtyInputSize,
  qtyInputStyle,
  rangeQtyInput,
  runTradeWalletLoop,
  sendBrowserTradeTx,
  signHyperliquidBrowserAgentTypedData,
  signBrowserTypedData,
  SwapTxLink,
  tradeAutoApprovalCookie,
  tradeYieldChainCookie,
  tradeYieldChainOrderCookie,
  tradeYieldDefiCookie,
  tradeYieldDefiOrderCookie,
  tradeYieldHyperliquidChainCookie,
  tradeYieldHyperliquidChainOrderCookie,
  tradeYieldHyperliquidCoinCookie,
  tradeYieldHyperliquidCoinOrderCookie,
  tradeYieldHyperliquidDepositCoinCookie,
  tradeYieldHyperliquidDepositCoinOrderCookie,
  tradeYieldHyperliquidModeCookie,
  tradeYieldHyperliquidModeOrderCookie,
  tradeYieldHyperliquidWithdrawCoinCookie,
  tradeYieldHyperliquidWithdrawCoinOrderCookie,
  tradeYieldMarketCookie,
  tradeYieldMarketOrderCookie,
  toNum,
  useCustomCoinConfirm,
  useTradeFallbackPrice,
} from "../clientShared";

function formatCooldownDuration(seconds = 0) {
  const value = Number(seconds || 0);
  if (!(value > 0)) return "";

  const daySeconds = 86400;
  const hourSeconds = 3600;
  if (value % daySeconds == 0) {
    const days = value / daySeconds;
    return `${days} day${days == 1 ? "" : "s"}`;
  }
  if (value % hourSeconds == 0) {
    const hours = value / hourSeconds;
    return `${hours} hour${hours == 1 ? "" : "s"}`;
  }

  return `${value} seconds`;
}

function formatRemainingTime(targetMs = 0, nowMs = Date.now()) {
  const diffMs = Number(targetMs || 0) - Number(nowMs || Date.now());
  if (!(diffMs > 0)) return "";

  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours > 0) return `${hours}h${minutes ? ` ${minutes}m` : ""}`;

  return `${minutes}m`;
}

function formatShortDateTime(value = 0) {
  const timestamp = Number(value || 0);
  if (!(timestamp > 0)) return "";

  const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const suffix = hours >= 12 ? "PM" : "AM";

  return [
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(
      date.getFullYear(),
    ).slice(-2)}`,
    `${hour12}:${pad(date.getMinutes())} ${suffix}`,
  ].join(" ");
}

function hasPositiveRawAmount(value = "0") {
  try {
    return BigInt(String(value || "0")) > 0n;
  } catch {
    return toNum(value) > 0;
  }
}

export default function YieldPanel({
  data = [],
  selectedWalletEntry,
  walletType = "evm",
  initialCookieM = {},
  tradeType,
  tradeTypes = [],
  onTradeTypeChange,
  onPrevTradeType = () => {},
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
  const initialDefiOrder = normalizeSelectionOrder(
    parseSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getTradeModeCookie(tradeYieldDefiOrderCookie, walletType),
      ),
    ),
    yieldOptions.map((entry) => entry.value),
  );
  const initialChainOrder = normalizeSelectionOrder(
    parseSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getProtocolCookie(tradeYieldChainOrderCookie, walletType, initialDefi),
      ),
    ),
    initialMarketChains,
  );
  const initialOrderedMarketChains = sortBySelectionOrder(
    initialMarketChains,
    initialChainOrder,
  );
  const initialSavedChain =
    getInitialCookie(
      initialCookieM,
      getProtocolCookie(tradeYieldChainCookie, walletType, initialDefi),
    ) || "";
  const initialChain = initialOrderedMarketChains.includes(initialSavedChain)
    ? initialSavedChain
    : initialOrderedMarketChains[0] || "";
  const initialChainE =
    chainList.find((entry) => entry.chain == initialChain) || chainList[0];
  const initialMarkets = initialChainMarketsM[initialChainE?.chain] || [];
  const initialMarketOrder = parseGroupedSelectionOrder(
    getInitialCookie(
      initialCookieM,
      getProtocolCookie(
        initialDefi == "hyperliquid"
          ? tradeYieldHyperliquidCoinOrderCookie
          : tradeYieldMarketOrderCookie,
        walletType,
        initialDefi == "hyperliquid" ? "hyperliquid" : initialDefi,
      ),
    ),
  );
  const initialOrderedMarkets = sortByGroupedSelectionOrder(
    initialMarkets,
    initialMarketOrder,
    initialDefi == "hyperliquid" ? "vault" : initialChain,
    (entry) => entry.value,
  );
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
  const initialMarket = initialOrderedMarkets.some(
    (entry) => entry.value == initialSavedMarket,
  )
    ? initialSavedMarket
    : initialOrderedMarkets[0]?.value || "";
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
  const [defiOrder, setDefiOrder] = useState(initialDefiOrder);
  const [chainOrder, setChainOrder] = useState(initialChainOrder);
  const [marketOrder, setMarketOrder] = useState(initialMarketOrder);
  const [hyperliquidModeOrder, setHyperliquidModeOrder] = useState(() =>
    normalizeSelectionOrder(
      parseSelectionOrder(
        getInitialCookie(
          initialCookieM,
          getProtocolCookie(
            tradeYieldHyperliquidModeOrderCookie,
            walletType,
            "hyperliquid",
          ),
        ),
      ),
      ["vault", "deposit"],
    ),
  );
  const [hyperliquidChainOrder, setHyperliquidChainOrder] = useState(() =>
    normalizeSelectionOrder(
      parseSelectionOrder(
        getInitialCookie(
          initialCookieM,
          getProtocolCookie(
            tradeYieldHyperliquidChainOrderCookie,
            walletType,
            "hyperliquid",
          ),
        ),
      ),
    ),
  );
  const [hyperliquidDepositCoinOrder, setHyperliquidDepositCoinOrder] = useState(
    () =>
      parseGroupedSelectionOrder(
        getInitialCookie(
          initialCookieM,
          getProtocolCookie(
            tradeYieldHyperliquidDepositCoinOrderCookie,
            walletType,
            "hyperliquid",
          ),
        ),
      ),
  );
  const [hyperliquidWithdrawCoinOrder, setHyperliquidWithdrawCoinOrder] = useState(
    () =>
      parseGroupedSelectionOrder(
        getInitialCookie(
          initialCookieM,
          getProtocolCookie(
            tradeYieldHyperliquidWithdrawCoinOrderCookie,
            walletType,
            "hyperliquid",
          ),
        ),
      ),
  );
  const [hyperliquidVaultOrder, setHyperliquidVaultOrder] = useState(() =>
    parseGroupedSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getProtocolCookie(
          tradeYieldHyperliquidCoinOrderCookie,
          walletType,
          "hyperliquid",
        ),
      ),
    ),
  );
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
  const isAaveStaking = defi == "aaveStaking";
  const isVenusFlux = defi == "venusFlux";
  const isErc4626Yield = defi == "spark" || isAaveStaking || isVenusFlux;
  const ProtocolClient = isHyperliquid
    ? HyperliquidClient
    : isAaveStaking
      ? AaveStakingClient
      : isVenusFlux
        ? VenusFluxClient
        : SparkClient;
  const marketChains = useMemo(
    () => getYieldMarketChains(chainList, chainMarketsM, defi),
    [chainList, chainMarketsM, defi],
  );
  const orderedMarketChains = useMemo(
    () => sortBySelectionOrder(marketChains, chainOrder),
    [chainOrder, marketChains],
  );
  const activeChain = orderedMarketChains.includes(chain)
    ? chain
    : orderedMarketChains[0] || "";
  const chainE =
    chainList.find((entry) => entry.chain == activeChain) ||
    chainList.find((entry) => orderedMarketChains.includes(entry.chain)) ||
    chainList[0];
  const activeMarketOrder = isHyperliquid ? hyperliquidVaultOrder : marketOrder;
  const activeMarketOrderGroup = isHyperliquid ? "vault" : chainE?.chain;
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
  const orderedHyperliquidModes = useMemo(
    () => sortBySelectionOrder(["vault", "deposit"], hyperliquidModeOrder),
    [hyperliquidModeOrder],
  );
  const orderedHyperliquidDepositChains = useMemo(
    () =>
      sortBySelectionOrder(
        hyperliquidDepositChains,
        hyperliquidChainOrder,
      ),
    [hyperliquidChainOrder, hyperliquidDepositChains],
  );
  const orderedHyperliquidDepositAddedChains = useMemo(
    () =>
      sortBySelectionOrder(
        hyperliquidDepositAddedChains,
        hyperliquidChainOrder,
      ),
    [hyperliquidChainOrder, hyperliquidDepositAddedChains],
  );
  const orderedHyperliquidWithdrawChains = useMemo(
    () =>
      sortBySelectionOrder(
        hyperliquidWithdrawChains,
        hyperliquidChainOrder,
      ),
    [hyperliquidChainOrder, hyperliquidWithdrawChains],
  );
  const orderedHyperliquidWithdrawAddedChains = useMemo(
    () =>
      sortBySelectionOrder(
        hyperliquidWithdrawAddedChains,
        hyperliquidChainOrder,
      ),
    [hyperliquidChainOrder, hyperliquidWithdrawAddedChains],
  );
  const orderedHyperliquidDepositAddedCoins = useMemo(
    () =>
      sortByGroupedSelectionOrder(
        hyperliquidDepositAddedCoins,
        hyperliquidDepositCoinOrder,
        activeHyperliquidDepositChain,
      ),
    [
      activeHyperliquidDepositChain,
      hyperliquidDepositAddedCoins,
      hyperliquidDepositCoinOrder,
    ],
  );
  const orderedHyperliquidDepositCoins = useMemo(
    () =>
      sortByGroupedSelectionOrder(
        hyperliquidDepositCoins,
        hyperliquidDepositCoinOrder,
        activeHyperliquidDepositChain,
      ),
    [
      activeHyperliquidDepositChain,
      hyperliquidDepositCoinOrder,
      hyperliquidDepositCoins,
    ],
  );
  const orderedHyperliquidDepositAllCoinEntries = useMemo(
    () =>
      sortByGroupedSelectionOrder(
        hyperliquidDepositAllCoinEntries,
        hyperliquidDepositCoinOrder,
        activeHyperliquidDepositChain,
        (entry) => entry.coin || entry.symbol || entry.name,
      ),
    [
      activeHyperliquidDepositChain,
      hyperliquidDepositAllCoinEntries,
      hyperliquidDepositCoinOrder,
    ],
  );
  const orderedHyperliquidWithdrawAddedCoins = useMemo(
    () =>
      sortByGroupedSelectionOrder(
        hyperliquidWithdrawAddedCoins,
        hyperliquidWithdrawCoinOrder,
        activeHyperliquidWithdrawChain,
      ),
    [
      activeHyperliquidWithdrawChain,
      hyperliquidWithdrawAddedCoins,
      hyperliquidWithdrawCoinOrder,
    ],
  );
  const orderedHyperliquidWithdrawCoins = useMemo(
    () =>
      sortByGroupedSelectionOrder(
        hyperliquidWithdrawCoins,
        hyperliquidWithdrawCoinOrder,
        activeHyperliquidWithdrawChain,
      ),
    [
      activeHyperliquidWithdrawChain,
      hyperliquidWithdrawCoinOrder,
      hyperliquidWithdrawCoins,
    ],
  );
  const orderedHyperliquidWithdrawAllCoinEntries = useMemo(
    () =>
      sortByGroupedSelectionOrder(
        hyperliquidWithdrawAllCoinEntries,
        hyperliquidWithdrawCoinOrder,
        activeHyperliquidWithdrawChain,
        (entry) => entry.coin || entry.symbol || entry.name,
      ),
    [
      activeHyperliquidWithdrawChain,
      hyperliquidWithdrawAllCoinEntries,
      hyperliquidWithdrawCoinOrder,
    ],
  );
  const availableYieldOptions = useMemo(
    () => {
      const options = yieldOptions.filter((option) =>
        isYieldProtocolSupportedForWallet(option, walletType),
      );

      return sortBySelectionOrder(options, defiOrder, (option) => option.value);
    },
    [defiOrder, walletType],
  );
  const yieldE =
    availableYieldOptions.find((entry) => entry.value == defi) || noYield;
  const markets = sortByGroupedSelectionOrder(
    chainMarketsM[chainE?.chain] || [],
    activeMarketOrder,
    activeMarketOrderGroup,
    (entry) => entry.value,
  );
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
  const allMarketChain = chainE?.chain || "";
  const allMarketCacheKey = `${defi}:${allMarketChain}`;
  const allProtocolLabel = isHyperliquid
    ? "Hyperliquid"
    : isAaveStaking
      ? "Aave Staking"
    : isVenusFlux
      ? "Venus Flux"
      : "Spark";
  const getAllYieldMarkets = isAaveStaking
    ? getAaveStakingAllMarkets
    : isVenusFlux
      ? getVenusFluxAllMarkets
      : getSparkAllMarkets;
  const {
    markets: rawProtocolAllMarkets,
    loading: allMarketsLoading,
    error: allMarketsError,
    retry: retryAllMarkets,
  } = useYieldAllMarkets({
    enabled: isErc4626Yield,
    cacheKey: allMarketCacheKey,
    chain: allMarketChain,
    protocolLabel: allProtocolLabel,
    getAllMarkets: getAllYieldMarkets,
  });
  const canonicalAllMarkets = useMemo(
    () =>
      rawProtocolAllMarkets.map((entry) =>
        canonicalizeTradeMarketEntry(chainE, entry),
      ),
    [chainE, rawProtocolAllMarkets],
  );
  const protocolMarketRows = useMemo(
    () =>
      canonicalAllMarkets.map((entry) => {
        const addressKey = getTokenAddressKey(chainE?.chain, entry.lendAddress);
        const underlyingAddressKey = getTokenAddressKey(
          chainE?.chain,
          entry.underlyingAddress,
        );
        const addedValue = addedMarketAddressM[addressKey] || "";
        const addedUnderlying =
          entry.addedUnderlying ||
          !!addedCoinAddressM[underlyingAddressKey] ||
          !!locallyAddedAddressM[`${allMarketChain}:${underlyingAddressKey}`];
        const addedLend =
          entry.addedLend ||
          !!addedValue ||
          !!locallyAddedAddressM[`${allMarketChain}:${addressKey}`];

        return {
          ...entry,
          addedUnderlying,
          addedLend,
          addedValue,
        };
      }),
    [
      addedCoinAddressM,
      addedMarketAddressM,
      allMarketChain,
      canonicalAllMarkets,
      chainE?.chain,
      locallyAddedAddressM,
    ],
  );
  const protocolAllMarkets = sortByGroupedSelectionOrder(
    protocolMarketRows.filter(
      (entry) => !entry.addedUnderlying || !entry.addedLend,
    ),
    activeMarketOrder,
    activeMarketOrderGroup,
    (entry) => entry.value,
  );
  const visibleAddedMarkets = useMemo(() => {
    if (protocolMarketRows.length) {
      return sortByGroupedSelectionOrder(
        protocolMarketRows.filter(
          (entry) => entry.addedUnderlying && entry.addedLend,
        ),
        activeMarketOrder,
        activeMarketOrderGroup,
        (entry) => entry.value,
      );
    }

    if (!canonicalAllMarkets.length) {
      return sortByGroupedSelectionOrder(
        addedMarkets,
        activeMarketOrder,
        activeMarketOrderGroup,
        (entry) => entry.value,
      );
    }

    return [];
  }, [
    addedMarkets,
    canonicalAllMarkets,
    protocolMarketRows,
    activeMarketOrder,
    activeMarketOrderGroup,
  ]);
  const allMarkets = isHyperliquid ? [] : protocolAllMarkets;
  const allLoading = isHyperliquid ? false : allMarketsLoading;
  const allError = isHyperliquid ? "" : allMarketsError;
  const hasProtocolAllMarkets = !isHyperliquid;
  const marketE =
    visibleAddedMarkets.find((entry) => entry.value == market) ||
    allMarkets.find((entry) => entry.value == market) ||
    visibleAddedMarkets[0];
  const marketSupplyApr = getMarketSupplyApr({
    chainE,
    defi,
    marketE,
    rawMarkets: canonicalAllMarkets,
  });
  const marketButtonWidth = useMemo(
    () =>
      getTradePickerButtonWidth(
        visibleAddedMarkets.map((entry) => getMarketLabel(entry)),
      ),
    [visibleAddedMarkets],
  );
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
  const getYieldMarketBalance = isAaveStaking
    ? getAaveStakingMarketBalance
    : isVenusFlux
      ? getVenusFluxMarketBalance
      : getSparkMarketBalance;
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
  const marketPreviewKey = [
    defi,
    chainE?.chain || "",
    marketE?.routeMode || "",
    underlyingCoin,
    lendCoin,
  ].join(":");
  const marketPreview = marketPreviewM[marketPreviewKey];
  const marketPreviewLoaded = marketPreview !== undefined;
  const marketLoading = !!marketLoadingM[marketPreviewKey];
  const marketReceiptRate =
    isErc4626Yield
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
    (isErc4626Yield && underlyingPrice && marketReceiptRate
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
  const aaveStakingCooldown = isAaveStaking
    ? marketPreview?.cooldown || {}
    : {};
  const aaveStakingCooldownStatus = aaveStakingCooldown.status || "";
  const aaveStakingCooldownEndMs = getLockUntilMs(
    aaveStakingCooldown.cooldownEnd,
  );
  const aaveStakingWindowEndMs = getLockUntilMs(aaveStakingCooldown.windowEnd);
  const aaveStakingNeedsCooldown =
    isAaveStaking &&
    (aaveStakingCooldownStatus == "none" ||
      aaveStakingCooldownStatus == "expired");
  const aaveStakingCooldownPending =
    isAaveStaking && aaveStakingCooldownStatus == "cooldown";
  const aaveStakingCanUnstake =
    isAaveStaking && aaveStakingCooldownStatus == "ready";
  const aaveStakingCooldownDurationText =
    formatCooldownDuration(aaveStakingCooldown.cooldownSeconds) || "20 days";
  const aaveStakingUnstakeWindowText =
    formatCooldownDuration(aaveStakingCooldown.unstakeWindow) || "2 days";
  const aaveStakingCooldownRemainingText = aaveStakingCooldownPending
    ? formatRemainingTime(aaveStakingCooldownEndMs, nowMs)
    : "";
  const aaveStakingWindowRemainingText = aaveStakingCanUnstake
    ? formatRemainingTime(aaveStakingWindowEndMs, nowMs)
    : "";
  const aaveStakingCooldownText = aaveStakingCooldownPending
    ? `cooldown ends ${formatShortDateTime(aaveStakingCooldownEndMs)}${
        aaveStakingCooldownRemainingText
          ? ` (in ${aaveStakingCooldownRemainingText})`
          : ""
      }`
    : aaveStakingCanUnstake
      ? `unstake by ${formatShortDateTime(aaveStakingWindowEndMs)}${
          aaveStakingWindowRemainingText
            ? ` (${aaveStakingWindowRemainingText} left)`
            : ""
        }`
      : aaveStakingCooldownStatus == "expired"
        ? "unstake window expired"
        : "";
  const aaveStakingCooldownStatusText =
    !isAaveStaking
      ? ""
      : !marketPreviewLoaded || marketLoading
        ? "checking cooldown status..."
        : aaveStakingCooldownPending
          ? `current: cooldown ends ${formatShortDateTime(
              aaveStakingCooldownEndMs,
            )}${
              aaveStakingCooldownRemainingText
                ? `, in ${aaveStakingCooldownRemainingText}`
              : ""
            }`
          : aaveStakingCanUnstake
            ? `current: unstake available until ${formatShortDateTime(
                aaveStakingWindowEndMs,
              )}${
                aaveStakingWindowRemainingText
                  ? `, ${aaveStakingWindowRemainingText} left`
                  : ""
              }`
            : aaveStakingCooldownStatus == "expired"
              ? "current: unstake window expired"
              : "current: cooldown not active";
  const aaveStakingRewards = isAaveStaking
    ? marketPreview?.rewards?.rewards || []
    : [];
  const aaveStakingClaimableRewards = aaveStakingRewards.filter((entry) =>
    hasPositiveRawAmount(entry.amount),
  );
  const aaveStakingRewardsLoading =
    isAaveStaking && (!marketPreviewLoaded || marketLoading);
  const aaveStakingRewardText = aaveStakingRewardsLoading
    ? "..."
    : aaveStakingClaimableRewards.length
      ? aaveStakingClaimableRewards
          .map(
            (entry) =>
              `${formatTradeQty(entry.amountFormatted, entry.decimals)} ${entry.coin}`,
          )
          .join(", ")
      : "0";
  const receiptRate =
    isErc4626Yield && marketReceiptRate
      ? marketReceiptRate
      : underlyingPrice && receiptPrice
        ? underlyingPrice / receiptPrice
        : 1;
  const {
    underlyingQtyNum: underlyingQty,
    receiptQtyNum,
    isRedeem,
    underlyingEndInputValue: calculatedUnderlyingEndInputValue,
    receiptEndInputValue: calculatedReceiptEndInputValue,
  } = getTradeMarketSideState({
    qtyInputSide,
    underlyingQty: lendQty,
    receiptQty,
    maxUnderlyingQty,
    maxReceiptQty,
    underlyingDecimals: underlyingQtyDecimals,
    receiptDecimals: receiptQtyDecimals,
  });
  const lendSliderValue = Math.max(0, Math.min(underlyingQty, maxUnderlying));
  const redeemSliderValue = Math.max(0, Math.min(receiptQtyNum, withdrawMaxReceipt));
  const underlyingEndInputValue =
    underlyingEndDraft || calculatedUnderlyingEndInputValue;
  const receiptEndInputValue =
    receiptEndDraft || calculatedReceiptEndInputValue;
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
    return getTradeMarketSideCoinEntry({
      chainE,
      side,
      marketE,
      underlyingCoin,
      lendCoin,
    });
  }

  async function queryWalletMarketBalance(
    walletEntry = selectedWalletEntry,
    side = "underlying",
  ) {
    if (!walletEntry?.address || !chainE?.chain) return {};

    if (usesDirectMarket && marketE?.underlyingAddress && marketE?.lendAddress) {
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
        `${walletEntry.name || walletEntry.label || "wallet"} ${allProtocolLabel} balance timeout`,
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
    return getTradeMarketEndTarget({
      draft: underlyingEndDraft,
      value: underlyingEndInputValue,
      decimals: underlyingQtyDecimals,
    });
  }

  function getRedeemEndTarget() {
    return getTradeMarketEndTarget({
      draft: receiptEndDraft,
      value: receiptEndInputValue,
      decimals: receiptQtyDecimals,
    });
  }

  function getLendEndTargetText() {
    return getTradeMarketEndTargetText({
      draft: underlyingEndDraft,
      value: underlyingEndInputValue,
      decimals: underlyingQtyDecimals,
    });
  }

  function getRedeemEndTargetText() {
    return getTradeMarketEndTargetText({
      draft: receiptEndDraft,
      value: receiptEndInputValue,
      decimals: receiptQtyDecimals,
    });
  }

  async function getLendQtyForWallet(walletEntry = selectedWalletEntry) {
    return getTradeMarketQtyForWallet({
      endWith: lendEndWith,
      qty: lendQty,
      decimals: underlyingQtyDecimals,
      getWalletBalance: () => getWalletUnderlyingBalanceForEnd(walletEntry),
      getEndTargetText: getLendEndTargetText,
      hasBalance: hasLoadedBalance,
    });
  }

  async function getRedeemQtyForWallet(walletEntry = selectedWalletEntry) {
    return getTradeMarketQtyForWallet({
      endWith: redeemEndWith,
      qty: receiptQty,
      decimals: receiptQtyDecimals,
      getWalletBalance: () => getWalletReceiptBalanceForEnd(walletEntry),
      getEndTargetText: getRedeemEndTargetText,
      hasBalance: hasLoadedBalance,
    });
  }
  const {
    underlyingUsd,
    receiptUsd,
    underlyingQtyUsd,
    receiptQtyUsd,
    underlyingEndUsd,
    receiptEndUsd,
    priceStatus,
  } = getTradeMarketPriceSummary({
    underlyingPrice,
    receiptPrice,
    maxUnderlying,
    maxReceipt,
    underlyingQty,
    receiptQty: receiptQtyNum,
    underlyingEndQty: underlyingEndInputValue,
    receiptEndQty: receiptEndInputValue,
    underlyingLoading: underlyingPriceLoading,
    receiptLoading: receiptPriceLoading,
    marketLoading,
    underlyingLabel: displayUnderlyingCoin,
    receiptLabel: displayReceiptCoin,
  });
  const depositLabel = isHyperliquid
    ? "deposit"
    : isAaveStaking
      ? "stake"
      : "lend";
  const withdrawLabel = isHyperliquid
    ? "withdraw"
    : isAaveStaking
      ? "unstake"
      : "redeem";
  const depositButtonLabel = isHyperliquid
    ? "DEPOSIT"
    : isAaveStaking
      ? "STAKE"
      : "LEND";
  const withdrawButtonLabel = isHyperliquid
    ? "WITHDRAW"
    : isAaveStaking
      ? aaveStakingNeedsCooldown
        ? "ACTIVATE COOLDOWN"
        : "UNSTAKE"
      : "REDEEM";
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
    if (savedDefi && yieldOptions.some((entry) => entry.value == savedDefi)) {
      setDefi(savedDefi);
    }
    setDefiOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(getTradeModeCookie(tradeYieldDefiOrderCookie, walletType)),
        ),
        yieldOptions.map((entry) => entry.value),
      ),
    );
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
    setHyperliquidModeOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(
            getProtocolCookie(
              tradeYieldHyperliquidModeOrderCookie,
              walletType,
              "hyperliquid",
            ),
          ),
        ),
        ["vault", "deposit"],
      ),
    );
    setHyperliquidChainOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(
            getProtocolCookie(
              tradeYieldHyperliquidChainOrderCookie,
              walletType,
              "hyperliquid",
            ),
          ),
        ),
      ),
    );
    setHyperliquidDepositCoinOrder(
      parseGroupedSelectionOrder(
        getCookie(
          getProtocolCookie(
            tradeYieldHyperliquidDepositCoinOrderCookie,
            walletType,
            "hyperliquid",
          ),
        ),
      ),
    );
    setHyperliquidWithdrawCoinOrder(
      parseGroupedSelectionOrder(
        getCookie(
          getProtocolCookie(
            tradeYieldHyperliquidWithdrawCoinOrderCookie,
            walletType,
            "hyperliquid",
          ),
        ),
      ),
    );
    setHyperliquidVaultOrder(
      parseGroupedSelectionOrder(
        getCookie(
          getProtocolCookie(
            tradeYieldHyperliquidCoinOrderCookie,
            walletType,
            "hyperliquid",
          ),
        ),
      ),
    );
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
    setChainOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(getProtocolCookie(tradeYieldChainOrderCookie, walletType, defi)),
        ),
        marketChains,
      ),
    );
    setMarketOrder(
      parseGroupedSelectionOrder(
        getCookie(getProtocolCookie(tradeYieldMarketOrderCookie, walletType, defi)),
      ),
    );
  }, [defi, marketChains, walletType]);

  useEffect(() => {
    if (orderedMarketChains.length) {
      const savedChain = getCookie(
        getProtocolCookie(tradeYieldChainCookie, walletType, defi),
      );
      const nextChain = orderedMarketChains.includes(savedChain)
        ? savedChain
        : orderedMarketChains.includes(chain)
          ? chain
          : orderedMarketChains[0];
      if (nextChain != chain) setChain(nextChain);
    } else if (!orderedMarketChains.length && chain) {
      setChain("");
    }
  }, [chain, defi, orderedMarketChains, walletType]);

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
      !isErc4626Yield ||
      !chainE?.chain ||
      !underlyingCoin ||
      !lendCoin ||
      !selectedWalletEntry?.address
    ) {
      return;
    }
    if (marketPreviewLoaded) return;

    let cancelled = false;
    const getPreview = isAaveStaking
      ? getAaveStakingLendPreview
      : isVenusFlux
        ? getVenusFluxLendPreview
        : getSparkLendPreview;
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
            wrapperAddress: marketE.wrapperAddress,
            routeMode: marketE.routeMode,
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
    isAaveStaking,
    isErc4626Yield,
    isVenusFlux,
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

  const {
    getReceiptQty,
    getUnderlyingQty,
    getSignedReceiptQty,
    getSignedUnderlyingQty,
  } = useMemo(
    () =>
      getTradeMarketQtyConverters({
        receiptRate,
        underlyingDecimals: underlyingQtyDecimals,
        receiptDecimals: receiptQtyDecimals,
      }),
    [receiptQtyDecimals, receiptRate, underlyingQtyDecimals],
  );

  useEffect(() => {
    const next = getTradeMarketSyncedQty({
      qtyInputSide,
      lendQty,
      receiptQty,
      getSignedReceiptQty,
      getSignedUnderlyingQty,
    });
    if (next?.side == "lend") setLendQty(next.value);
    if (next?.side == "receipt") setReceiptQty(next.value);
  }, [
    getSignedReceiptQty,
    getSignedUnderlyingQty,
    lendQty,
    qtyInputSide,
    receiptQty,
  ]);

  function updateLendQty(value) {
    const next = getTradeMarketQtyPair({
      side: "lend",
      value,
      maxUnderlying,
      maxReceipt: withdrawMaxReceipt,
      receiptRate,
      underlyingDecimals: underlyingQtyDecimals,
      receiptDecimals: receiptQtyDecimals,
    });
    applyTradeMarketQtyState(next, {
      setQtyInputSide,
      setLendQty,
      setReceiptQty,
    });
  }

  function updateRedeemQty(value) {
    const next = getTradeMarketQtyPair({
      side: "redeem",
      value,
      maxUnderlying,
      maxReceipt: withdrawMaxReceipt,
      receiptRate,
      underlyingDecimals: underlyingQtyDecimals,
      receiptDecimals: receiptQtyDecimals,
    });
    applyTradeMarketQtyState(next, {
      setQtyInputSide,
      setLendQty,
      setReceiptQty,
    });
  }

  function updateUnderlyingEnd(value) {
    const next = getTradeMarketEndPair({
      side: "lend",
      value,
      maxQty: maxUnderlyingQty,
      receiptRate,
      underlyingDecimals: underlyingQtyDecimals,
      receiptDecimals: receiptQtyDecimals,
    });
    applyTradeMarketEndState(next, {
      setEndDraft: setUnderlyingEndDraft,
      setQtyInputSide,
      setLendQty,
      setReceiptQty,
    });
  }

  function updateReceiptEnd(value) {
    const next = getTradeMarketEndPair({
      side: "redeem",
      value,
      maxQty: maxReceiptQty,
      receiptRate,
      underlyingDecimals: underlyingQtyDecimals,
      receiptDecimals: receiptQtyDecimals,
    });
    applyTradeMarketEndState(next, {
      setEndDraft: setReceiptEndDraft,
      setQtyInputSide,
      setLendQty,
      setReceiptQty,
    });
  }

  function updateLendEndWith(checked) {
    setLendEndWith(checked);
    if (!checked) return;

    const endQty = getLendEndTargetText();
    const next = getTradeMarketEndPair({
      side: "lend",
      value: endQty,
      maxQty: maxUnderlyingQty,
      receiptRate,
      underlyingDecimals: underlyingQtyDecimals,
      receiptDecimals: receiptQtyDecimals,
    });
    applyTradeMarketEndState(next, {
      setEndDraft: setUnderlyingEndDraft,
      formatEnd: true,
      decimals: underlyingQtyDecimals,
      setQtyInputSide,
      setLendQty,
      setReceiptQty,
    });
  }

  function updateRedeemEndWith(checked) {
    setRedeemEndWith(checked);
    if (!checked) return;

    const endQty = getRedeemEndTargetText();
    const next = getTradeMarketEndPair({
      side: "redeem",
      value: endQty,
      maxQty: maxReceiptQty,
      receiptRate,
      underlyingDecimals: underlyingQtyDecimals,
      receiptDecimals: receiptQtyDecimals,
    });
    applyTradeMarketEndState(next, {
      setEndDraft: setReceiptEndDraft,
      formatEnd: true,
      decimals: receiptQtyDecimals,
      setQtyInputSide,
      setLendQty,
      setReceiptQty,
    });
  }

  function updateAutoApproval(checked) {
    setAutoApproval(checked);
    setCookie(tradeAutoApprovalCookie, checked ? "1" : "0", {
      maxAge: cookieMaxAge,
    });
  }

  function saveHyperliquidModeCookie(value, { rememberOrder = true } = {}) {
    const cleanValue = value == "deposit" ? "deposit" : "vault";
    setCookie(
      getProtocolCookie(
        tradeYieldHyperliquidModeCookie,
        walletType,
        "hyperliquid",
      ),
      cleanValue,
      { maxAge: cookieMaxAge },
    );
    if (!rememberOrder) return;
    const nextOrder = rememberSelectionValue(
      hyperliquidModeOrder,
      cleanValue,
      ["vault", "deposit"],
    );
    setHyperliquidModeOrder(nextOrder);
    setCookie(
      getProtocolCookie(
        tradeYieldHyperliquidModeOrderCookie,
        walletType,
        "hyperliquid",
      ),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function saveHyperliquidRouteCookie(route = {}, { rememberOrder = true } = {}) {
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
      if (rememberOrder) {
        const validChains = [
          ...new Set([
            ...hyperliquidDepositChains,
            ...hyperliquidWithdrawChains,
          ]),
        ];
        const nextOrder = rememberSelectionValue(
          hyperliquidChainOrder,
          chainName,
          validChains,
        );
        setHyperliquidChainOrder(nextOrder);
        setCookie(
          getProtocolCookie(
            tradeYieldHyperliquidChainOrderCookie,
            walletType,
            "hyperliquid",
          ),
          encodeSelectionOrder(nextOrder),
          { maxAge: cookieMaxAge },
        );
      }
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
      if (rememberOrder) {
        const nextOrder = rememberGroupedSelectionValue(
          hyperliquidVaultOrder,
          "vault",
          coin,
          { validGroups: ["vault"] },
        );
        setHyperliquidVaultOrder(nextOrder);
        setCookie(
          getProtocolCookie(
            tradeYieldHyperliquidCoinOrderCookie,
            walletType,
            "hyperliquid",
          ),
          encodeGroupedSelectionOrder(nextOrder),
          { maxAge: cookieMaxAge },
        );
      }
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
      if (rememberOrder) {
        const nextOrder = rememberGroupedSelectionValue(
          hyperliquidDepositCoinOrder,
          chainName || activeHyperliquidDepositChain,
          depositCoin,
          {
            validGroups: hyperliquidDepositChains,
            validValues: hyperliquidDepositCoins,
          },
        );
        setHyperliquidDepositCoinOrder(nextOrder);
        setCookie(
          getProtocolCookie(
            tradeYieldHyperliquidDepositCoinOrderCookie,
            walletType,
            "hyperliquid",
          ),
          encodeGroupedSelectionOrder(nextOrder),
          { maxAge: cookieMaxAge },
        );
      }
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
      if (rememberOrder) {
        const nextOrder = rememberGroupedSelectionValue(
          hyperliquidWithdrawCoinOrder,
          chainName || activeHyperliquidWithdrawChain,
          withdrawCoin,
          {
            validGroups: hyperliquidWithdrawChains,
            validValues: hyperliquidWithdrawCoins,
          },
        );
        setHyperliquidWithdrawCoinOrder(nextOrder);
        setCookie(
          getProtocolCookie(
            tradeYieldHyperliquidWithdrawCoinOrderCookie,
            walletType,
            "hyperliquid",
          ),
          encodeGroupedSelectionOrder(nextOrder),
          { maxAge: cookieMaxAge },
        );
      }
    }
  }

  function nextDefi() {
    const next = nextValue(
      availableYieldOptions.map((option) => option.value),
      defi,
    );
    if (next) selectDefi(next, { rememberOrder: false });
  }

  function prevDefi() {
    const prev = prevValue(
      availableYieldOptions.map((option) => option.value),
      defi,
    );
    if (prev) selectDefi(prev, { rememberOrder: false });
  }

  function selectDefi(value, { rememberOrder = true } = {}) {
    setDefi(value);
    if (!value) return;
    setCookie(getTradeModeCookie(tradeYieldDefiCookie, walletType), value, {
      maxAge: cookieMaxAge,
    });
    if (!rememberOrder) return;
    const nextOrder = rememberSelectionValue(
      defiOrder,
      value,
      yieldOptions.map((entry) => entry.value),
    );
    setDefiOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeYieldDefiOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function nextChain() {
    const next = nextValue(orderedMarketChains, chainE?.chain || chain);
    if (next) selectChain(next, { rememberOrder: false });
  }

  function prevChain() {
    const prev = prevValue(orderedMarketChains, chainE?.chain || chain);
    if (prev) selectChain(prev, { rememberOrder: false });
  }

  function nextHyperliquidMode() {
    selectHyperliquidMode(nextValue(orderedHyperliquidModes, hyperliquidMode), {
      rememberOrder: false,
    });
  }

  function prevHyperliquidMode() {
    selectHyperliquidMode(prevValue(orderedHyperliquidModes, hyperliquidMode), {
      rememberOrder: false,
    });
  }

  function selectHyperliquidMode(value, options = {}) {
    const nextMode = value == "deposit" ? "deposit" : "vault";
    setHyperliquidMode(nextMode);
    saveHyperliquidModeCookie(nextMode, options);
    setShowMarketMenu(false);
    setLendQty("0");
    setReceiptQty("0");
    setUnderlyingEndDraft("");
    setReceiptEndDraft("");
  }

  function nextHyperliquidDepositChain() {
    const next = nextValue(
      orderedHyperliquidDepositChains,
      activeHyperliquidDepositChain,
    );
    if (next) selectHyperliquidDepositChain(next, { rememberOrder: false });
  }

  function prevHyperliquidDepositChain() {
    const prev = prevValue(
      orderedHyperliquidDepositChains,
      activeHyperliquidDepositChain,
    );
    if (prev) selectHyperliquidDepositChain(prev, { rememberOrder: false });
  }

  function selectHyperliquidDepositChain(chainName, options = {}) {
    setHyperliquidDepositChain(chainName);
    setHyperliquidWithdrawChain(chainName);
    setShowHyperliquidDepositChainMenu(false);
    const nextDepositCoin = getNextHyperliquidCoinForSide({
      chainList,
      discoveryE: hyperliquidBridgeE,
      side: "deposit",
      chainName,
      currentCoin: hyperliquidDepositCoin,
    });
    const nextWithdrawCoin = getNextHyperliquidCoinForSide({
      chainList,
      discoveryE: hyperliquidBridgeE,
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
    }, options);
    emitTradeChainSelect(chainName);
  }

  function nextHyperliquidDepositCoin() {
    const next = nextValue(
      orderedHyperliquidDepositCoins,
      activeHyperliquidDepositCoin,
    );
    if (next) selectHyperliquidDepositCoin(next, { rememberOrder: false });
  }

  function prevHyperliquidDepositCoin() {
    const prev = prevValue(
      orderedHyperliquidDepositCoins,
      activeHyperliquidDepositCoin,
    );
    if (prev) selectHyperliquidDepositCoin(prev, { rememberOrder: false });
  }

  function selectHyperliquidDepositCoin(coin, options = {}) {
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
    }, options);
    setShowHyperliquidDepositCoinMenu(false);
  }

  function nextHyperliquidWithdrawChain() {
    const next = nextValue(
      orderedHyperliquidWithdrawChains,
      activeHyperliquidWithdrawChain,
    );
    if (next) selectHyperliquidWithdrawChain(next, { rememberOrder: false });
  }

  function prevHyperliquidWithdrawChain() {
    const prev = prevValue(
      orderedHyperliquidWithdrawChains,
      activeHyperliquidWithdrawChain,
    );
    if (prev) selectHyperliquidWithdrawChain(prev, { rememberOrder: false });
  }

  function selectHyperliquidWithdrawChain(chainName, options = {}) {
    setHyperliquidDepositChain(chainName);
    setHyperliquidWithdrawChain(chainName);
    setShowHyperliquidWithdrawChainMenu(false);
    const nextDepositCoin = getNextHyperliquidCoinForSide({
      chainList,
      discoveryE: hyperliquidBridgeE,
      side: "deposit",
      chainName,
      currentCoin: hyperliquidDepositCoin,
    });
    const nextWithdrawCoin = getNextHyperliquidCoinForSide({
      chainList,
      discoveryE: hyperliquidBridgeE,
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
    }, options);
    emitTradeChainSelect(chainName);
  }

  function nextHyperliquidWithdrawCoin() {
    const next = nextValue(
      orderedHyperliquidWithdrawCoins,
      activeHyperliquidWithdrawCoin,
    );
    if (next) selectHyperliquidWithdrawCoin(next, { rememberOrder: false });
  }

  function prevHyperliquidWithdrawCoin() {
    const prev = prevValue(
      orderedHyperliquidWithdrawCoins,
      activeHyperliquidWithdrawCoin,
    );
    if (prev) selectHyperliquidWithdrawCoin(prev, { rememberOrder: false });
  }

  function selectHyperliquidWithdrawCoin(coin, options = {}) {
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
    }, options);
    setShowHyperliquidWithdrawCoinMenu(false);
  }

  function selectChain(chain, options = {}) {
    setChain(chain);
    saveYieldChainCookie(chain, options);
    emitTradeChainSelect(chain);
  }

  function focusSelectedChain() {
    const currentChain = chainE?.chain || chain;
    if (currentChain) emitTradeChainSelect(currentChain);
  }

  function saveYieldChainCookie(chain, { rememberOrder = true } = {}) {
    if (!defi || !chain || !orderedMarketChains.includes(chain)) return;
    setCookie(
      getProtocolCookie(tradeYieldChainCookie, walletType, defi),
      chain,
      {
        maxAge: cookieMaxAge,
      },
    );
    if (!rememberOrder) return;
    const nextOrder = rememberSelectionValue(chainOrder, chain, marketChains);
    setChainOrder(nextOrder);
    setCookie(
      getProtocolCookie(tradeYieldChainOrderCookie, walletType, defi),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function nextMarket() {
    const cycleMarkets = hasProtocolAllMarkets ? visibleAddedMarkets : markets;
    const next = nextValue(
      cycleMarkets.map((entry) => entry.value),
      market,
    );
    if (next) selectMarket(next, { rememberOrder: false });
  }

  function prevMarket() {
    const cycleMarkets = hasProtocolAllMarkets ? visibleAddedMarkets : markets;
    const values = cycleMarkets.map((entry) => entry.value);
    const index = values.indexOf(market);
    const next = values.length
      ? values[(index - 1 + values.length) % values.length]
      : "";
    if (next) selectMarket(next, { rememberOrder: false });
  }

  function selectMarket(value, options = {}) {
    setMarket(value);
    saveYieldMarketCookie(value, options);
    setShowMarketMenu(false);
  }

  function saveYieldMarketCookie(value, { rememberOrder = true } = {}) {
    if (!defi || !chainE?.chain || !marketCookieValues.includes(value)) return;
    setCookie(
      getProtocolCookie(tradeYieldMarketCookie, walletType, defi, chainE.chain),
      value,
      { maxAge: cookieMaxAge },
    );
    if (!rememberOrder) return;
    if (isHyperliquid) {
      const nextVaultOrder = rememberGroupedSelectionValue(
        hyperliquidVaultOrder,
        "vault",
        value,
        {
          validGroups: ["vault"],
          validValues: marketCookieValues,
        },
      );
      setHyperliquidVaultOrder(nextVaultOrder);
      setCookie(
        getProtocolCookie(
          tradeYieldHyperliquidCoinOrderCookie,
          walletType,
          "hyperliquid",
        ),
        encodeGroupedSelectionOrder(nextVaultOrder),
        { maxAge: cookieMaxAge },
      );
      return;
    }
    const nextOrder = rememberGroupedSelectionValue(
      marketOrder,
      chainE.chain,
      value,
      {
        validGroups: marketChains,
        validValues: marketCookieValues,
      },
    );
    setMarketOrder(nextOrder);
    setCookie(
      getProtocolCookie(tradeYieldMarketOrderCookie, walletType, defi),
      encodeGroupedSelectionOrder(nextOrder),
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
          : `${yieldE.label}: no yield market selected`,
      );
      return;
    }
    const isSpark = defi == "spark";
    const isAaveStakingAction = defi == "aaveStaking";
    const isVenusFluxAction = defi == "venusFlux";
    const isHyperliquidAction = defi == "hyperliquid";

    if (
      !isSpark &&
      !isAaveStakingAction &&
      !isVenusFluxAction &&
      !isHyperliquidAction
    ) {
      tradeToast.show(`${yieldE.label}: yield market not wired yet`);
      return;
    }
    const protocol = isHyperliquidAction
      ? "Hyperliquid"
      : isAaveStakingAction
        ? "Aave Staking"
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
            wrapperAddress: marketE.wrapperAddress,
            routeMode: marketE.routeMode,
          }
        : {};
    let cooldownSubmitAction = "";
    if (isAaveStakingAction && action == "redeem") {
      const cooldownPreview = await getAaveStakingLendPreview({
        walletAddress: walletEntry.address,
        chain: chainE.chain,
        action: "cooldown",
        underlyingCoin,
        lendCoin,
        amount: "0",
        ...directMarketArgs,
      });
      const cooldown = cooldownPreview?.cooldown || {};

      if (cooldown.status == "cooldown") {
        const text = formatShortDateTime(getLockUntilMs(cooldown.cooldownEnd));
        const errorResult = {
          ok: false,
          error: `cooldown ends ${text}`,
          defi: protocol,
          action: "cooldown",
        };
        setLendResult(errorResult);
        tradeToast.error(errorResult.error);
        return errorResult;
      }
      if (cooldown.needsCooldown) cooldownSubmitAction = "cooldown";
    }

    const redeem = action == "redeem";
    const signedQty = cooldownSubmitAction
      ? "0"
      : redeem
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
    const submitAction =
      cooldownSubmitAction ||
      (redeem
        ? signedQtyNum >= 0
          ? "redeem"
          : "lend"
        : signedQtyNum < 0
          ? "redeem"
          : "lend");
    const submitRedeem = submitAction == "redeem" || submitAction == "cooldown";
    const actionLabel = isHyperliquidAction
      ? submitRedeem
        ? "withdraw"
        : "deposit"
      : isAaveStakingAction
        ? submitAction == "cooldown"
          ? "activate cooldown"
          : submitRedeem
            ? "unstake"
            : "stake"
        : submitAction;
    const signedQtyAbs = Math.abs(signedQtyNum);
    const qty =
      submitAction == "cooldown"
        ? "0"
        : redeem
          ? submitRedeem
            ? formatComputedTradeQty(signedQty, receiptQtyDecimals).replace(
                /^-/,
                "",
              )
            : getUnderlyingQty(signedQtyAbs)
          : submitRedeem
            ? getReceiptQty(signedQtyAbs)
            : formatComputedTradeQty(signedQty, underlyingQtyDecimals).replace(
                /^-/,
                "",
              );
    const autoApprovalAmount =
      !submitRedeem && !isHyperliquidAction && autoApproval ? qty : "";
    const getApprovalAmount = (approvalNeeded) => {
      if (!approvalNeeded) return "";
      return (
        autoApprovalAmount ||
        window.prompt(
          `Approval needed for ${underlyingCoin}.\n\nEnter approval qty.\n${actionLabel} qty: ${qty}`,
          qty,
        )
      );
    };
    if (submitAction != "cooldown" && !toNum(qty)) {
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
      : isAaveStakingAction
        ? buildAaveStakingLendTxs
        : isVenusFluxAction
          ? buildVenusFluxLendTxs
          : buildSparkLendTxs;
    const executeLend = isHyperliquidAction
      ? executeHyperliquidLend
      : isAaveStakingAction
        ? executeAaveStakingLend
        : isVenusFluxAction
          ? executeVenusFluxLend
          : executeSparkLend;
    const previewLend = isHyperliquidAction
      ? getHyperliquidLendPreview
      : isAaveStakingAction
        ? getAaveStakingLendPreview
        : isVenusFluxAction
          ? getVenusFluxLendPreview
          : getSparkLendPreview;
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
            }\nchain: ${chainE.chain}${
              submitAction == "cooldown"
                ? ""
                : `\namount: ${qty} ${submitRedeem ? lendCoin : underlyingCoin}`
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

          if (preview.approvalAmountNeeded ?? preview.approvalNeeded) {
            approvalAmount = getApprovalAmount(true);
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

      const displayRes = isAaveStakingAction
        ? { ...res, action: actionLabel }
        : res;
      setLendResult(displayRes);
      tradeToast.success(`${protocol} ${actionLabel} submitted`, {
        id: toastId,
      });
      onTxComplete({
        ...displayRes,
        refreshTargets: [
          {
            chain: chainE.chain,
            coin: underlyingCoin,
            address: walletEntry.address,
            coinE: getMarketCoinE("underlying"),
          },
          {
            chain: chainE.chain,
            coin: lendCoin,
            address: walletEntry.address,
            coinE: getMarketCoinE("lend"),
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

  async function runAaveStakingClaimForWallet(
    walletEntry = selectedWalletEntry,
    { skipConfirm = false, loopRun = false } = {},
  ) {
    const protocol = "Aave Staking";
    const actionLabel = "claim rewards";
    const tradeToast = createTradeToast(walletEntry, loopRun);

    if (!walletEntry?.address) {
      tradeToast.error("wallet missing");
      return;
    }
    if (walletEntry?.isBrowserWallet && walletEntry.type != "evm") {
      tradeToast.error(`${protocol} needs an EVM browser wallet`);
      return;
    }
    if (!walletEntry?.isBrowserWallet && !walletEntry?.hasPrivateKey) {
      tradeToast.error("no private key");
      return;
    }
    if (!isAaveStaking || !lendCoin || !underlyingCoin) {
      tradeToast.error(`${protocol}: no staking market selected`);
      return;
    }

    const directMarketArgs = usesDirectMarket
      ? {
          underlyingAddress: marketE.underlyingAddress,
          underlyingDecimals: marketE.underlyingDecimals,
          lendAddress: marketE.lendAddress,
          lendDecimals: marketE.lendDecimals,
          wrapperAddress: marketE.wrapperAddress,
          routeMode: marketE.routeMode,
        }
      : {};
    const toastId = tradeToast.loading(`${protocol}: checking rewards...`);
    setLendPending(true);
    setLendPendingAction("claim");
    setLendResult(null);

    try {
      const preview = await getAaveStakingLendPreview({
        walletAddress: walletEntry.address,
        chain: chainE.chain,
        action: "claim",
        underlyingCoin,
        lendCoin,
        amount: "0",
        ...directMarketArgs,
      });
      const claimableRewards = (preview.rewards?.rewards || []).filter((entry) =>
        hasPositiveRawAmount(entry.amount),
      );
      const rewardText = claimableRewards.length
        ? claimableRewards
            .map(
              (entry) =>
                `${formatTradeQty(entry.amountFormatted, entry.decimals)} ${entry.coin}`,
            )
            .join(", ")
        : "";

      if (!claimableRewards.length) {
        const errorResult = {
          ok: false,
          error: "no rewards to claim",
          defi: protocol,
          action: actionLabel,
        };
        setLendResult(errorResult);
        tradeToast.error(errorResult.error, { id: toastId });
        return errorResult;
      }

      if (!skipConfirm && !walletEntry?.isBrowserWallet) {
        const ok = window.confirm(
          `Execute ${protocol} ${actionLabel}?\n\nwallet: ${
            walletEntry.name || walletEntry.label
          }\nchain: ${chainE.chain}\nrewards: ${rewardText}`,
        );
        if (!ok) {
          toast.dismiss(toastId);
          return;
        }
      }

      let res;
      if (walletEntry?.isBrowserWallet) {
        tradeToast.loading(`${protocol}: building claim wallet prompt...`, {
          id: toastId,
        });
        const built = await buildAaveStakingLendTxs({
          walletAddress: walletEntry.address,
          chain: chainE.chain,
          action: "claim",
          underlyingCoin,
          lendCoin,
          amount: "0",
          ...directMarketArgs,
        });
        const txs = [];

        for (const tx of built.txs || []) {
          tradeToast.loading(`${protocol}: confirm ${tx.type}...`, {
            id: toastId,
          });
          txs.push(
            await sendBrowserTradeTx({
              tx,
              walletEntry,
              tradeToast,
              toastId,
            }),
          );
        }
        res = { ...built, txs };
      } else {
        tradeToast.loading(`${protocol}: submitting claim...`, {
          id: toastId,
        });
        res = await executeAaveStakingLend({
          walletName: walletEntry.name,
          walletAddress: walletEntry.address,
          chain: chainE.chain,
          action: "claim",
          underlyingCoin,
          lendCoin,
          amount: "0",
          ...directMarketArgs,
        });
      }

      const displayRes = { ...res, action: actionLabel };
      setLendResult(displayRes);
      setMarketPreviewM((previewM) => {
        const next = { ...previewM };
        delete next[marketPreviewKey];
        return next;
      });
      tradeToast.success(`${protocol} ${actionLabel} submitted`, {
        id: toastId,
      });
      onTxComplete({
        ...displayRes,
        refreshTargets: [
          ...(res.rewards?.rewards || preview.rewards?.rewards || []).map(
            (entry) => ({
              chain: chainE.chain,
              coin: entry.coin,
              address: walletEntry.address,
              coinE: {
                address: entry.address,
                decimals: entry.decimals,
                name: entry.name,
                type: "yield",
              },
            }),
          ),
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

  async function runAaveStakingClaim() {
    const result = await runTradeWalletLoop({
      loopWallets,
      getLoopWalletEntries,
      selectedWalletEntry,
      actionLabel: "Aave Staking claim rewards",
      runOne: (walletEntry, options) =>
        runAaveStakingClaimForWallet(walletEntry, options),
    });
    if (Array.isArray(result)) {
      const loopResult = createTradeLoopResult(result, {
        defi: "Aave Staking",
        action: "claim rewards",
      });
      if (loopResult) setLendResult(loopResult);
    }

    return result;
  }

  async function runLend(action) {
    const result = await runTradeWalletLoop({
      loopWallets,
      getLoopWalletEntries,
      selectedWalletEntry,
      actionLabel: `${yieldE.label} ${
        action == "redeem" ? withdrawLabel : depositLabel
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
        defi: yieldE.label,
        action: action == "redeem" ? withdrawLabel : depositLabel,
      });
      if (loopResult) setLendResult(loopResult);
    }

    return result;
  }

  return (
    <ProtocolClient>
    <div className="tradePane tradeWidePane yieldPane">
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
          <CycleButton size="nx" direction="prev" onClick={onPrevTradeType} />
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
          <CycleButton size="nx" onClick={onCycleTradeType} />
        </label>
        <label htmlFor="lendDefi">
          <span className="gray">DeFi:</span>
          <CycleButton
            size="nx"
            direction="prev"
            onClick={prevDefi}
            disabled={availableYieldOptions.length < 2}
          />
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
          <CycleButton
            size="nx"
            onClick={nextDefi}
            disabled={availableYieldOptions.length < 2}
          />
        </label>
        {isHyperliquid ? (
          <>
            <span className="selectCycle">
              <CycleButton
                direction="prev"
                onClick={prevHyperliquidMode}
                disabled={orderedHyperliquidModes.length < 2}
              />
              <select
                value={hyperliquidMode}
                onChange={(e) => selectHyperliquidMode(e.target.value)}
              >
                {orderedHyperliquidModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
              <CycleButton onClick={nextHyperliquidMode} />
            </span>
          </>
        ) : (
          <span className="selectCycle">
            <CycleButton
              direction="prev"
              onClick={prevChain}
              disabled={orderedMarketChains.length < 2}
            />
            <select
              value={orderedMarketChains.length ? chainE?.chain || "" : ""}
              onChange={(e) => selectChain(e.target.value)}
              onClick={focusSelectedChain}
              onFocus={focusSelectedChain}
              disabled={!orderedMarketChains.length}
            >
              {!orderedMarketChains.length && <option value="">no chain</option>}
              {orderedMarketChains.map((chainName) => (
                <option key={chainName} value={chainName}>
                  {chainName}
                </option>
              ))}
            </select>
            <CycleButton
              onClick={nextChain}
              disabled={orderedMarketChains.length < 2}
            />
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
            <CycleButton
              direction="prev"
              onClick={prevMarket}
              disabled={markets.length < 2}
            />
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
            <CycleButton
              onClick={nextMarket}
              disabled={markets.length < 2}
            />
          </span>
        ) : null}
      </div>

      <div className="tradeRows">
        <div className="tradeBox">
          <div className="tradeAssetLine">
            {isHyperliquidDepositMode ? (
              <>
                <span className="gray">wallet</span>
                <HyperliquidChainSelect
                  side="deposit"
                  selectedChain={activeHyperliquidDepositChain}
                  addedChains={orderedHyperliquidDepositAddedChains}
                  allChains={orderedHyperliquidDepositChains}
                  bridgeE={hyperliquidBridgeE}
                  showMenu={showHyperliquidDepositChainMenu}
                  setShowMenu={setShowHyperliquidDepositChainMenu}
                  pickerRef={hyperliquidDepositChainPickerRef}
                  onSelect={selectHyperliquidDepositChain}
                  onPrev={prevHyperliquidDepositChain}
                  onNext={nextHyperliquidDepositChain}
                  onRetry={retryHyperliquidBridge}
                />
                <HyperliquidCoinSelect
                  side="deposit"
                  chain={activeHyperliquidDepositChain}
                  selectedCoin={activeHyperliquidDepositCoin}
                  addedCoins={orderedHyperliquidDepositAddedCoins}
                  allCoins={orderedHyperliquidDepositCoins}
                  allCoinEntries={orderedHyperliquidDepositAllCoinEntries}
                  bridgeE={hyperliquidBridgeE}
                  showMenu={showHyperliquidDepositCoinMenu}
                  setShowMenu={setShowHyperliquidDepositCoinMenu}
                  pickerRef={hyperliquidDepositCoinPickerRef}
                  onSelect={selectHyperliquidDepositCoin}
                  onPrev={prevHyperliquidDepositCoin}
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
                  <span
                    className="gray hyperliquidRouteText"
                    title={hyperliquidDepositRouteText}
                  >
                    {hyperliquidDepositRouteText}
                  </span>
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
            <span className="tradeCoinPrice">
              <span className="gray">{fmtPrice(underlyingPrice)}</span>
            </span>
          </div>
          <div className="tradeBalanceLine">
            <button
              type="button"
              className="tradeTextButton tradeAssetBalance"
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
          <div className="tradeAmountLine">
            <span className="gray">end</span>
            <label className="switch small tradeEndSwitch">
              <input
                type="checkbox"
                checked={lendEndWith}
                onChange={(e) => updateLendEndWith(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <input
              className="tradeQtyInput"
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
          <div className="tradeAmountLine">
            <span className="gray">{depositLabel}</span>
            <input
              className="tradeQtyInput"
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
          <div className="tradeBoxControls">
            <input
              className="tradeMiddleRange"
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
              className="btn tradeActionButton bgCyan"
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

        <div className="tradeMiddle">
          {isAaveStaking && (
            <div className="tradeClaimRewardsLine">
              <span className="gray">claim:</span>
              <span>{aaveStakingRewardText}</span>
              <button
                type="button"
                className="btn small bgCyan"
                onClick={runAaveStakingClaim}
                disabled={
                  lendPending ||
                  aaveStakingRewardsLoading ||
                  !aaveStakingClaimableRewards.length
                }
              >
                {lendPendingAction == "claim" ? "CLAIMING" : "CLAIM"}
              </button>
            </div>
          )}
          {showGasAutoLabel && (
            <label className="tradeGasSelect">
              <span className="gray">gas:</span>
              <select value="default" disabled>
                <option value="default">auto</option>
              </select>
            </label>
          )}
          {!isHyperliquid && !selectedWalletEntry?.isBrowserWallet && (
            <label className="tradeAutoApproval">
              <input
                type="checkbox"
                checked={autoApproval}
                onChange={(e) => updateAutoApproval(e.target.checked)}
              />
              <span className="gray">auto approve</span>
            </label>
          )}
          {!isHyperliquidDepositMode && (
            <span className="tradeRateLine">
              <span className="gray">rate:</span>{" "}
              {displayUnderlyingCoin && displayReceiptCoin
                ? `1 ${displayUnderlyingCoin} = ${fmtRate(receiptRate)} ${displayReceiptCoin}`
                : "-"}
              {priceStatus && <span className="gray"> {priceStatus}</span>}
            </span>
          )}
        </div>

        <div className="tradeBox">
          <div className="tradeAssetLine">
            {isHyperliquidDepositMode ? (
              <>
                <span className="gray">spot</span>
                <HyperliquidChainSelect
                  side="withdraw"
                  selectedChain={activeHyperliquidWithdrawChain}
                  addedChains={orderedHyperliquidWithdrawAddedChains}
                  allChains={orderedHyperliquidWithdrawChains}
                  bridgeE={hyperliquidBridgeE}
                  showMenu={showHyperliquidWithdrawChainMenu}
                  setShowMenu={setShowHyperliquidWithdrawChainMenu}
                  pickerRef={hyperliquidWithdrawChainPickerRef}
                  onSelect={selectHyperliquidWithdrawChain}
                  onPrev={prevHyperliquidWithdrawChain}
                  onNext={nextHyperliquidWithdrawChain}
                  onRetry={retryHyperliquidBridge}
                />
                <HyperliquidCoinSelect
                  side="withdraw"
                  chain={activeHyperliquidWithdrawChain}
                  selectedCoin={activeHyperliquidWithdrawCoin}
                  addedCoins={orderedHyperliquidWithdrawAddedCoins}
                  allCoins={orderedHyperliquidWithdrawCoins}
                  allCoinEntries={orderedHyperliquidWithdrawAllCoinEntries}
                  bridgeE={hyperliquidBridgeE}
                  showMenu={showHyperliquidWithdrawCoinMenu}
                  setShowMenu={setShowHyperliquidWithdrawCoinMenu}
                  pickerRef={hyperliquidWithdrawCoinPickerRef}
                  onSelect={selectHyperliquidWithdrawCoin}
                  onPrev={prevHyperliquidWithdrawCoin}
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
                  <span
                    className="gray hyperliquidRouteText"
                    title={hyperliquidWithdrawRouteText}
                  >
                    {hyperliquidWithdrawRouteText}
                  </span>
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
            <span className="tradeCoinPrice">
              <span className="gray">{fmtPrice(receiptPrice)}</span>
            </span>
          </div>
          <div className="tradeBalanceLine">
            <span className="tradeAssetBalance">
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
          <div className="tradeAmountLine">
            <span className="gray">end</span>
            <label className="switch small tradeEndSwitch">
              <input
                type="checkbox"
                checked={redeemEndWith}
                onChange={(e) => updateRedeemEndWith(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <input
              className="tradeQtyInput"
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
          <div className="tradeAmountLine">
            <span className="gray">{withdrawLabel}</span>
            <input
              className="tradeQtyInput"
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
          <div className="tradeBoxControls">
            <input
              className="tradeMiddleRange"
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
              disabled={
                !withdrawMaxReceipt || vaultLocked || aaveStakingCooldownPending
              }
            />
            <button
              type="button"
              className="btn small bgGray"
              onClick={setMaxRedeem}
              disabled={
                !withdrawMaxReceipt || vaultLocked || aaveStakingCooldownPending
              }
            >
              max
            </button>
            <button
              type="button"
              className="btn tradeActionButton bgCyan"
              onClick={() =>
                isHyperliquidDepositMode
                  ? runHyperliquidSpotTransfer("withdraw")
                  : runLend("redeem")
              }
              disabled={
                lendPending ||
                vaultLocked ||
                aaveStakingCooldownPending ||
                (aaveStakingNeedsCooldown && !maxReceipt) ||
                (isHyperliquidDepositMode &&
                  (!activeHyperliquidWithdrawCoin ||
                    hyperliquidWithdrawRouteToken?.actionSupported === false))
              }
            >
              {lendPendingAction == "cooldown"
                ? "ACTIVATING"
                : lendPendingAction == "redeem"
                  ? isHyperliquid
                    ? "WITHDRAWING"
                    : isAaveStaking
                      ? "UNSTAKING"
                      : "REDEEMING"
                : withdrawButtonLabel}
            </button>
            {isAaveStaking && (
              <span className="tradeCooldownStatus">
                <span className="infoHover hoverOnlyInfo">
                  <span className="infoIcon">i</span>
                  <span className="infoCard">
                    <span className="infoCardTitle">
                      Aave Staking unstake
                    </span>
                    <span>{aaveStakingCooldownStatusText}</span>
                    <span>
                      1. Click <span className="gray">ACTIVATE COOLDOWN</span>{" "}
                      to request unstake.
                    </span>
                    <span>
                      2. Wait{" "}
                      <span className="gray">
                        {aaveStakingCooldownDurationText}
                      </span>
                      .
                    </span>
                    <span>
                      3. Unstake during the{" "}
                      <span className="gray">
                        {aaveStakingUnstakeWindowText}
                      </span>{" "}
                      unstake window.
                    </span>
                    <span>
                      4. If the window expires, activate cooldown again.
                    </span>
                  </span>
                </span>
                {aaveStakingCooldownText && (
                  <span
                    className={
                      aaveStakingCooldownStatus == "expired" ? "red" : "gray"
                    }
                  >
                    {aaveStakingCooldownText}
                  </span>
                )}
              </span>
            )}
          </div>
          {isHyperliquidDepositMode && hyperliquidWithdrawFeeEtaText && (
            <div className="hyperliquidFeeEtaLine gray">
              {hyperliquidWithdrawFeeEtaText}
            </div>
          )}
        </div>
      </div>
      {lendResult && (
        <div className="tradeResult">
          {lendResult.ok ? (
            <>
              <span className="gray">
                {lendResult.defi || yieldE.label} {lendResult.action}:
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
