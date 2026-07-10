"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import {
  encodeGroupedSelectionOrder,
  encodeSelectionOrder,
  getGroupedSelectionItems,
  normalizeSelectionOrder,
  parseGroupedSelectionOrder,
  parseSelectionOrder,
  removeGroupedSelectionValue,
  removeSelectionValue,
  rememberGroupedSelectionValue,
  rememberSelectionValue,
  sortByGroupedSelectionOrder,
  sortBySelectionOrder,
} from "@/fn/selectionOrder";
import {
  discoveryCacheMs,
  isDiscoveryCacheFresh,
  makeDiscoveryCacheMeta,
} from "@/fn/discoveryCache";
import {
  SwapChainSelect,
  SwapCoinSelect,
  emptyTokenDiscoveryE,
  emptySwapSupportE,
  getDexLabel,
  getDiscoveryTokenDedupeKey,
  hasCoinDiscovery,
  getInitialSwapDex,
  getSwapLocalChainOptions,
  getTokenDiscoveryKey,
  getSwapRouteCookie,
  isDexSupportedForChain,
  tokenDiscoveryCacheM,
  tokenDiscoveryPromiseM,
  trimQtyToDecimals,
  useSwapSupport,
} from "./Client";
import {
  buildAcrossSwapTxs,
  executeAcrossSwap,
  getAcrossSupportedBridge,
  getAcrossSwapPreview,
} from "./across/sv";
import AcrossClient from "./across/Client";
import {
  buildJupiterSwapTxs,
  executeJupiterSwap,
  getJupiterSwapPreview,
  getJupiterTokenDiscovery,
} from "./jupiter/sv";
import JupiterSwapClient from "./jupiter/Client";
import {
  buildJumperSwapTxs,
  executeJumperSwap,
  getJumperSupportedBridge,
  getJumperSwapPreview,
  getJumperTokenDiscovery,
} from "./jumper/sv";
import JumperClient from "./jumper/Client";
import {
  buildRelaySwapSteps,
  executeRelaySwap,
  getRelayCurrencyDiscovery,
  getRelaySupportedBridge,
  getRelaySwapPreview,
} from "./relay/sv";
import RelayClient, { signBrowserRelayItem } from "./relay/Client";
import {
  buildUniswapSwapTxs,
  executeUniswapSwap,
  getUniswapSwapPreview,
} from "./uniswap/sv";
import UniswapClient from "./uniswap/Client";
import {
  getTradeCoinBalance,
  getTradeCoinPrice,
} from "./sv";
import { addCustomCoin, previewCustomCoin } from "../../w/coinActions";
import {
  addLocalCustomCoin,
  useLocalStorageEditor,
} from "../../_editorData/browserEditorStorage";
import {
  cleanTradeInput,
  cookieMaxAge,
  createTradeLoopResult,
  createTradeToast,
  CustomCoinConfirmModal,
  dexOptions,
  emitTradeChainSelect,
  fmt,
  fmtPrice,
  fmtRate,
  formatComputedTradeQty,
  formatTradeQty,
  getChainCoins,
  getCoinByAddress,
  getCoinBalanceByAddress,
  getCoinTypeOptions,
  getHistoryCycleValues,
  getInitialCookie,
  getInitialAutoApproval,
  getSelectedBalance as getWalletSelectedBalance,
  getTokenAddressKey,
  getTradeEndDiffQty,
  getTradeEndInputValue,
  getTradeModeCookie,
  getWalletOptions,
  hasLoadedBalance,
  limitQtyInputDecimals,
  nextValue,
  noDex,
  normalizeSignedQtyInput,
  prevValue,
  priceKey,
  qtyInputSize,
  qtyInputStyle,
  rangeQtyInput,
  runTradeWalletLoop,
  sameAddress,
  sendBrowserTradeTx,
  shortAddress,
  subtractTradeQtyText,
  SwapTxLink,
  tradeAutoApprovalCookie,
  tradeSwapDexCookie,
  tradeSwapDexOrderCookie,
  tradeSwapFromChainCookie,
  tradeSwapFromChainOrderCookie,
  tradeSwapFromCoinCookie,
  tradeSwapFromCoinOrderCookie,
  tradeSwapToChainCookie,
  tradeSwapToChainOrderCookie,
  tradeSwapToCoinCookie,
  tradeSwapToCoinOrderCookie,
  TradeSelectionPicker,
  toNum,
  useCustomCoinConfirm,
  useTradeFallbackPrice,
  walletBalancePatchEvent,
} from "../clientShared";

function getSwapSupport(defi = "", options = {}) {
  if (defi == "relay") return getRelaySupportedBridge(options);
  if (defi == "jumper") return getJumperSupportedBridge(options);
  if (defi == "across") return getAcrossSupportedBridge(options);
  return Promise.resolve(emptySwapSupportE);
}

function getDexUrl(defi = "") {
  if (defi == "relay") return "https://relay.link/";
  if (defi == "jumper") return "https://jumper.exchange/";
  if (defi == "jupiter") return "https://jup.ag/swap";
  if (defi == "across") return "https://app.across.to/";
  if (defi == "uniswap") return "https://app.uniswap.org/";
  return "";
}

function isSwapRecipientAddressForChain(chain = "", address = "") {
  const clean = String(address || "").trim();
  if (!clean) return false;
  if (chain == "Solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean);

  return /^0x[0-9a-fA-F]{40}$/.test(clean);
}

export default function SwapPanel({
  data = [],
  walletEntriesM = {},
  selectedWalletEntry,
  walletType = "evm",
  initialCookieM = {},
  tradeType,
  tradeTypes = [],
  tradeHistoryTypes = [],
  allTradeTypes = [],
  onTradeTypeChange,
  onTradeTypeHistoryRemove = () => {},
  onPrevTradeType = () => {},
  onCycleTradeType,
  showGasAutoLabel = false,
  inputMaxOff = false,
  loopWallets = false,
  getLoopWalletEntries = () => [],
  onTxComplete = () => {},
}) {
  const chainList = useMemo(
    () => (Array.isArray(data) ? data : data ? [data] : []).filter(Boolean),
    [data],
  );
  const chainNames = useMemo(
    () => chainList.map((chainE) => chainE.chain),
    [chainList],
  );
  const sellChainNames = useMemo(
    () =>
      walletType == "solana"
        ? chainNames.filter((chain) => chain == "Solana")
        : chainNames.filter((chain) => chain != "Solana"),
    [chainNames, walletType],
  );
  const initialDefi = getInitialSwapDex(initialCookieM, walletType);
  const initialSellChainValues = getSwapLocalChainOptions(
    initialDefi,
    sellChainNames,
  );
  const initialChainValues = getSwapLocalChainOptions(initialDefi, chainNames);
  const initialDexOrder = normalizeSelectionOrder(
    parseSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getTradeModeCookie(tradeSwapDexOrderCookie, walletType),
      ),
    ),
    dexOptions.map((entry) => entry.value),
  );
  const initialFromChainOrder = normalizeSelectionOrder(
    parseSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getSwapRouteCookie(
          tradeSwapFromChainOrderCookie,
          walletType,
          initialDefi,
        ),
      ),
    ),
    initialSellChainValues,
  );
  const initialToChainOrder = normalizeSelectionOrder(
    parseSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getSwapRouteCookie(
          tradeSwapToChainOrderCookie,
          walletType,
          initialDefi,
        ),
      ),
    ),
    initialChainValues,
  );
  const initialSellChainNames = sortBySelectionOrder(
    initialSellChainValues,
    initialFromChainOrder,
  );
  const initialBuyChainNames = sortBySelectionOrder(
    initialChainValues,
    initialToChainOrder,
  );
  const initialFromChain =
    getInitialCookie(
      initialCookieM,
      getSwapRouteCookie(tradeSwapFromChainCookie, walletType, initialDefi),
    ) || "";
  const initialToChain =
    getInitialCookie(
      initialCookieM,
      getSwapRouteCookie(tradeSwapToChainCookie, walletType, initialDefi),
    ) || "";
  const initialSelectedFromChain = initialSellChainNames.includes(initialFromChain)
    ? initialFromChain
    : initialSellChainNames[0] || "";
  const initialSelectedToChain = initialBuyChainNames.includes(initialToChain)
    ? initialToChain
    : initialBuyChainNames[0] || "";
  const initialFromChainE =
    chainList.find((chainE) => chainE.chain == initialSelectedFromChain) ||
    chainList[0];
  const initialToChainE =
    chainList.find((chainE) => chainE.chain == initialSelectedToChain) ||
    initialFromChainE;
  const initialFromCoins = getChainCoins(initialFromChainE);
  const initialToCoins = getChainCoins(initialToChainE);
  const initialFromCoinOrder = parseGroupedSelectionOrder(
    getInitialCookie(
      initialCookieM,
      getSwapRouteCookie(
        tradeSwapFromCoinOrderCookie,
        walletType,
        initialDefi,
      ),
    ),
  );
  const initialToCoinOrder = parseGroupedSelectionOrder(
    getInitialCookie(
      initialCookieM,
      getSwapRouteCookie(
        tradeSwapToCoinOrderCookie,
        walletType,
        initialDefi,
      ),
    ),
  );
  const initialOrderedFromCoins = sortByGroupedSelectionOrder(
    initialFromCoins,
    initialFromCoinOrder,
    initialSelectedFromChain,
  );
  const initialOrderedToCoins = sortByGroupedSelectionOrder(
    initialToCoins,
    initialToCoinOrder,
    initialSelectedToChain,
  );
  const initialSavedFromCoin =
    getInitialCookie(
      initialCookieM,
      getSwapRouteCookie(
        tradeSwapFromCoinCookie,
        walletType,
        initialDefi,
        initialSelectedFromChain,
      ),
    ) || "";
  const initialSavedToCoin =
    getInitialCookie(
      initialCookieM,
      getSwapRouteCookie(
        tradeSwapToCoinCookie,
        walletType,
        initialDefi,
        initialSelectedToChain,
      ),
    ) || "";
  const initialFromCoin = initialOrderedFromCoins.includes(initialSavedFromCoin)
    ? initialSavedFromCoin
    : initialOrderedFromCoins[0] || "";
  const initialToCoin = initialOrderedToCoins.includes(initialSavedToCoin)
    ? initialSavedToCoin
    : initialOrderedToCoins[0] || "";
  const [defi, setDefi] = useState(initialDefi);
  const [dexOrder, setDexOrder] = useState(initialDexOrder);
  const [fromChainOrder, setFromChainOrder] = useState(initialFromChainOrder);
  const [toChainOrder, setToChainOrder] = useState(initialToChainOrder);
  const [fromCoinOrder, setFromCoinOrder] = useState(initialFromCoinOrder);
  const [toCoinOrder, setToCoinOrder] = useState(initialToCoinOrder);
  const [fromChain, setFromChain] = useState(initialSelectedFromChain);
  const [toChain, setToChain] = useState(initialSelectedToChain);
  const [fromCoin, setFromCoin] = useState(initialFromCoin);
  const [toCoin, setToCoin] = useState(initialToCoin);
  const [fromQty, setFromQty] = useState("0");
  const [toQty, setToQty] = useState("0");
  const [sellEndDraft, setSellEndDraft] = useState("");
  const [buyEndDraft, setBuyEndDraft] = useState("");
  const [sellEndWith, setSellEndWith] = useState(false);
  const [buyEndWith, setBuyEndWith] = useState(false);
  const [qtyInputSide, setQtyInputSide] = useState("sell");
  const [swapPending, setSwapPending] = useState(false);
  const [swapResult, setSwapResult] = useState(null);
  const [recipient, setRecipient] = useState(
    selectedWalletEntry?.address || "",
  );
  const [recipientMode, setRecipientMode] = useState("wallet");
  const [recipientWallet, setRecipientWallet] = useState("");
  const [autoApproval, setAutoApproval] = useState(
    getInitialAutoApproval(initialCookieM),
  );
  const recipientDefaultKeyRef = useRef("");
  const [recipientBalanceE, setRecipientBalanceE] = useState({
    key: "",
    balance: {},
    loading: false,
    error: "",
  });
  const [showDexMenu, setShowDexMenu] = useState(false);
  const [showTradeTypeMenu, setShowTradeTypeMenu] = useState(false);
  const [showFromChainMenu, setShowFromChainMenu] = useState(false);
  const [showToChainMenu, setShowToChainMenu] = useState(false);
  const [showFromCoinMenu, setShowFromCoinMenu] = useState(false);
  const [showToCoinMenu, setShowToCoinMenu] = useState(false);
  const [pickerSortM, setPickerSortM] = useState({});
  const tradeTypePickerRef = useRef(null);
  const dexPickerRef = useRef(null);
  const fromChainPickerRef = useRef(null);
  const toChainPickerRef = useRef(null);
  const fromCoinPickerRef = useRef(null);
  const toCoinPickerRef = useRef(null);
  const useLocalEditorStore = useLocalStorageEditor();
  const [locallyAddedAddressM, setLocallyAddedAddressM] = useState({});
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
  const [tokenDiscoveryM, setTokenDiscoveryM] = useState({});
  const [tokenSearchM, setTokenSearchM] = useState({
    from: "",
    to: "",
  });
  const [selectedDiscoveryCoinM, setSelectedDiscoveryCoinM] = useState({});
  const fromChainE =
    chainList.find((chainE) => chainE.chain == fromChain) || chainList[0];
  const toChainE =
    chainList.find((chainE) => chainE.chain == toChain) || fromChainE;
  const selectableSellChainNames = useMemo(
    () => getSwapLocalChainOptions(defi, sellChainNames),
    [defi, sellChainNames],
  );
  const selectableChainNames = useMemo(
    () => getSwapLocalChainOptions(defi, chainNames),
    [chainNames, defi],
  );
  const orderedSellChainNames = useMemo(
    () => sortBySelectionOrder(selectableSellChainNames, fromChainOrder),
    [fromChainOrder, selectableSellChainNames],
  );
  const fromChainHistoryOptions = useMemo(
    () =>
      fromChainOrder.filter((chainName) =>
        selectableSellChainNames.includes(chainName),
      ),
    [fromChainOrder, selectableSellChainNames],
  );
  const orderedChainNames = useMemo(
    () => sortBySelectionOrder(selectableChainNames, toChainOrder),
    [selectableChainNames, toChainOrder],
  );
  const toChainHistoryOptions = useMemo(
    () =>
      toChainOrder.filter((chainName) => selectableChainNames.includes(chainName)),
    [selectableChainNames, toChainOrder],
  );
  const supportedDexOptions = useMemo(
    () => {
      return dexOptions.filter((option) =>
        isDexSupportedForChain(option, fromChain),
      );
    },
    [fromChain],
  );
  const availableDexOptions = useMemo(
    () =>
      sortBySelectionOrder(
        supportedDexOptions,
        dexOrder,
        (option) => option.value,
      ),
    [dexOrder, supportedDexOptions],
  );
  const dexHistoryOptions = useMemo(
    () =>
      dexOrder
        .map((value) =>
          supportedDexOptions.find((option) => option.value == value),
        )
        .filter(Boolean),
    [dexOrder, supportedDexOptions],
  );
  const defiE =
    availableDexOptions.find((entry) => entry.value == defi) || noDex;
  const ProtocolClient =
    defi == "across"
      ? AcrossClient
      : defi == "jumper"
        ? JumperClient
        : defi == "jupiter"
          ? JupiterSwapClient
          : defi == "uniswap"
            ? UniswapClient
            : RelayClient;
  const fromDiscoveryCoinE =
    selectedDiscoveryCoinM.from?.chain == fromChain
      ? selectedDiscoveryCoinM.from
      : null;
  const toDiscoveryCoinE =
    selectedDiscoveryCoinM.to?.chain == toChain
      ? selectedDiscoveryCoinM.to
      : null;
  const fromCoins = useMemo(() => {
    const coins = sortByGroupedSelectionOrder(
      getChainCoins(fromChainE),
      fromCoinOrder,
      fromChain,
    );
    const discoveryCoin = fromDiscoveryCoinE?.coin || "";

    return discoveryCoin && !coins.includes(discoveryCoin)
      ? [discoveryCoin, ...coins]
      : coins;
  }, [fromChain, fromChainE, fromCoinOrder, fromDiscoveryCoinE?.coin]);
  const fromCoinHistoryOptions = useMemo(
    () =>
      getGroupedSelectionItems(fromCoinOrder, fromChain).filter((coinName) =>
        fromCoins.includes(coinName),
      ),
    [fromChain, fromCoinOrder, fromCoins],
  );
  const toCoins = useMemo(() => {
    const coins = sortByGroupedSelectionOrder(
      getChainCoins(toChainE),
      toCoinOrder,
      toChain,
    );
    const discoveryCoin = toDiscoveryCoinE?.coin || "";

    return discoveryCoin && !coins.includes(discoveryCoin)
      ? [discoveryCoin, ...coins]
      : coins;
  }, [toChain, toChainE, toCoinOrder, toDiscoveryCoinE?.coin]);
  const toCoinHistoryOptions = useMemo(
    () =>
      getGroupedSelectionItems(toCoinOrder, toChain).filter((coinName) =>
        toCoins.includes(coinName),
      ),
    [toChain, toCoinOrder, toCoins],
  );
  const fromCoinInfo =
    fromChainE?.coinInfoM?.[fromCoin] ||
    (fromDiscoveryCoinE?.coin == fromCoin ? fromDiscoveryCoinE : {});
  const fromCoinDecimals = Number.isInteger(fromCoinInfo.decimals)
    ? fromCoinInfo.decimals
    : 18;
  const toCoinInfo =
    toChainE?.coinInfoM?.[toCoin] ||
    (toDiscoveryCoinE?.coin == toCoin ? toDiscoveryCoinE : {});
  const toCoinDecimals = Number.isInteger(toCoinInfo.decimals)
    ? toCoinInfo.decimals
    : 18;
  const isSolanaBridge =
    !!fromChain &&
    !!toChain &&
    fromChain != toChain &&
    (fromChain == "Solana" || toChain == "Solana");
  const fromBalance = getWalletSelectedBalance(
    fromChainE,
    fromCoin,
    selectedWalletEntry,
  );
  const selectedToBalance = getWalletSelectedBalance(
    toChainE,
    toCoin,
    selectedWalletEntry,
  );
  const recipientBalanceKey = getRecipientBalanceKey();
  const recipientBalance =
    recipientBalanceE.key == recipientBalanceKey
      ? recipientBalanceE.balance
      : {};
  const toBalance = isRecipientBalanceMode()
    ? recipientBalance
    : selectedToBalance;
  const recipientBalanceLoading =
    isRecipientBalanceMode() &&
    recipientBalanceE.key == recipientBalanceKey &&
    recipientBalanceE.loading;
  const recipientBalanceError =
    isRecipientBalanceMode() && recipientBalanceE.key == recipientBalanceKey
      ? recipientBalanceE.error
      : "";
  const maxSell = toNum(fromBalance.balance);
  const maxSellQty = formatTradeQty(fromBalance.balance, fromCoinDecimals);
  const maxBuy = toNum(toBalance.balance);
  const maxBuyQty = formatTradeQty(toBalance.balance, toCoinDecimals);
  const sellQty = toNum(fromQty);
  const buyQty = toNum(toQty);
  const sellSliderValue = Math.max(0, Math.min(sellQty, maxSell));
  const buySliderValue = Math.max(0, Math.min(buyQty, maxBuy));
  const fromPriceKey = fromCoinInfo.address
    ? priceKey(fromChain, fromCoinInfo.address)
    : priceKey(fromChain, fromCoin);
  const toPriceKey = toCoinInfo.address
    ? priceKey(toChain, toCoinInfo.address)
    : priceKey(toChain, toCoin);
  const fromListPrice = toNum(fromBalance.price);
  const toListPrice = toNum(toBalance.price);
  const {
    fallbackPrice: fromFallbackPrice,
    loading: fromPriceLoading,
  } = useTradeFallbackPrice({
    cacheKey: fromPriceKey,
    chain: fromChain,
    coin: fromCoin,
    coinE: getSelectedSwapCoinE(fromChain, fromCoin, "from"),
    listPrice: fromListPrice,
    getPrice: getTradeCoinPrice,
  });
  const {
    fallbackPrice: toFallbackPrice,
    loading: toPriceLoading,
  } = useTradeFallbackPrice({
    cacheKey: toPriceKey,
    chain: toChain,
    coin: toCoin,
    coinE: getSelectedSwapCoinE(toChain, toCoin, "to"),
    listPrice: toListPrice,
    getPrice: getTradeCoinPrice,
  });
  const fromPrice = fromListPrice || toNum(fromFallbackPrice);
  const toPrice = toListPrice || toNum(toFallbackPrice);
  const fromUsd = fromPrice ? maxSell * fromPrice : 0;
  const toUsd = toPrice ? maxBuy * toPrice : 0;
  const swapRate = fromPrice && toPrice ? fromPrice / toPrice : 0;
  const maxBuyInput = swapRate > 0 ? maxSell * swapRate : undefined;
  const maxBuyEnd = Number.isFinite(maxBuyInput)
    ? maxBuy + maxBuyInput
    : maxBuy;
  const priceLoading = fromPriceLoading || toPriceLoading;
  const noPriceCoins = [
    fromCoin && fromListPrice <= 0 && fromFallbackPrice === 0 ? fromCoin : "",
    toCoin && toListPrice <= 0 && toFallbackPrice === 0 ? toCoin : "",
  ].filter(Boolean);
  const priceStatus = priceLoading
    ? "querying price..."
    : noPriceCoins.length
      ? `price n/a: ${[...new Set(noPriceCoins)].join(", ")}`
      : "";
  const sellEndInputValue =
    sellEndDraft ||
    getTradeEndInputValue(
      maxSellQty,
      fromQty,
      toNum(fromQty) < 0,
      fromCoinDecimals,
    );
  const buyEndInputValue =
    buyEndDraft ||
    getTradeEndInputValue(
      maxBuyQty,
      toQty,
      toNum(toQty) < 0,
      toCoinDecimals,
    );
  const sellQtyUsd = fromPrice ? sellQty * fromPrice : 0;
  const sellEndUsd = fromPrice ? toNum(sellEndInputValue) * fromPrice : 0;
  const buyQtyUsd = toPrice ? buyQty * toPrice : 0;
  const buyEndUsd = toPrice ? toNum(buyEndInputValue) * toPrice : 0;
  const swapWalletLabel = selectedWalletEntry?.isBrowserWallet
    ? `${selectedWalletEntry.label || "connected wallet"} (${shortAddress(
        selectedWalletEntry.address,
      )})`
    : selectedWalletEntry?.name || selectedWalletEntry?.label || "";
  const needsPrivateKey = ["jupiter", "jumper", "relay", "uniswap", "across"].includes(defi);
  const canBrowserSignEvm =
    selectedWalletEntry?.isBrowserWallet && selectedWalletEntry?.type == "evm";
  const canBrowserSignSolana =
    selectedWalletEntry?.isBrowserWallet &&
    selectedWalletEntry?.type == "solana" &&
    ["relay", "jumper", "across", "jupiter"].includes(defi);
  const canBrowserSign = canBrowserSignEvm || canBrowserSignSolana;
  const swapCanExecute =
    !needsPrivateKey || !!selectedWalletEntry?.hasPrivateKey || canBrowserSign;
  const canAutoApprove =
    !selectedWalletEntry?.isBrowserWallet &&
    fromChain != "Solana" &&
    !!fromCoin &&
    !fromCoinInfo.native;
  const recipientWalletType = toChain == "Solana" ? "solana" : "evm";
  const recipientWallets = useMemo(
    () =>
      getWalletOptions(
        walletEntriesM[recipientWalletType] || [],
        {},
        recipientWalletType,
      ),
    [recipientWalletType, walletEntriesM],
  );
  const selectedWalletMatchName =
    selectedWalletEntry?.savedName || selectedWalletEntry?.name || "";
  const {
    support: swapSupportE,
    hasDiscovery: swapHasDiscovery,
    retry: retrySwapSupport,
  } = useSwapSupport({
    defi,
    getSupport: getSwapSupport,
  });
  const swapHasCoinDiscovery = hasCoinDiscovery(defi);
  const discoveryChainEntries = useMemo(() => {
    const seen = new Set();
    return (swapSupportE.chains || []).filter((entry) => {
      const key = entry.chainId || entry.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [swapSupportE.chains]);
  const fromDiscoveryChainEntries = useMemo(
    () =>
      discoveryChainEntries.filter((entry) =>
        walletType == "solana" ? entry.chain == "Solana" : entry.chain != "Solana",
      ),
    [discoveryChainEntries, walletType],
  );
  const toDiscoveryChainEntries = discoveryChainEntries;
  const discoveryTokenEntries = useMemo(() => {
    const seen = new Set();
    return (swapSupportE.tokens || []).filter((entry) => {
      const key = getDiscoveryTokenDedupeKey(entry);
      if (!entry.chain || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [swapSupportE.tokens]);
  const fromDiscoveryTokenEntries = useMemo(
    () => discoveryTokenEntries.filter((entry) => entry.chain == fromChain),
    [discoveryTokenEntries, fromChain],
  );
  const toDiscoveryTokenEntries = useMemo(
    () => discoveryTokenEntries.filter((entry) => entry.chain == toChain),
    [discoveryTokenEntries, toChain],
  );
  const fromTokenDiscoveryKey = getTokenDiscoveryKey(
    defi,
    fromChain,
    tokenSearchM.from,
  );
  const toTokenDiscoveryKey = getTokenDiscoveryKey(
    defi,
    toChain,
    tokenSearchM.to,
  );
  const fromLazyTokenDiscoveryE =
    tokenDiscoveryM[fromTokenDiscoveryKey] || emptyTokenDiscoveryE;
  const toLazyTokenDiscoveryE =
    tokenDiscoveryM[toTokenDiscoveryKey] || emptyTokenDiscoveryE;
  const usesLazyTokenDiscovery =
    defi == "relay" || defi == "jumper" || defi == "jupiter";
  const fromTokenDiscoveryE =
    usesLazyTokenDiscovery
      ? fromLazyTokenDiscoveryE
      : { ...swapSupportE, tokens: fromDiscoveryTokenEntries };
  const toTokenDiscoveryE =
    usesLazyTokenDiscovery
      ? toLazyTokenDiscoveryE
      : { ...swapSupportE, tokens: toDiscoveryTokenEntries };
  const fromSwapTokenEntries =
    sortByGroupedSelectionOrder(
      usesLazyTokenDiscovery
        ? fromLazyTokenDiscoveryE.tokens
        : fromDiscoveryTokenEntries,
      fromCoinOrder,
      fromChain,
      (entry) => entry.symbol || entry.name || entry.address,
    );
  const toSwapTokenEntries =
    sortByGroupedSelectionOrder(
      usesLazyTokenDiscovery
        ? toLazyTokenDiscoveryE.tokens
        : toDiscoveryTokenEntries,
      toCoinOrder,
      toChain,
      (entry) => entry.symbol || entry.name || entry.address,
    );
  const coinTypeOptions = useMemo(
    () =>
      getCoinTypeOptions(
        chainList,
        customCoinDraft.customType || customCoinDraft.type,
      ),
    [chainList, customCoinDraft.customType, customCoinDraft.type],
  );

  useEffect(() => {
    const savedDefi = getCookie(getTradeModeCookie(tradeSwapDexCookie, walletType));
    if (savedDefi && dexOptions.some((entry) => entry.value == savedDefi)) {
      setDefi(savedDefi);
    }
    setDexOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(getTradeModeCookie(tradeSwapDexOrderCookie, walletType)),
        ),
        dexOptions.map((entry) => entry.value),
      ),
    );
  }, [walletType]);

  useEffect(() => {
    setFromChainOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(
            getSwapRouteCookie(
              tradeSwapFromChainOrderCookie,
              walletType,
              defi,
            ),
          ),
        ),
        selectableSellChainNames,
      ),
    );
    setToChainOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(
            getSwapRouteCookie(tradeSwapToChainOrderCookie, walletType, defi),
          ),
        ),
        selectableChainNames,
      ),
    );
    setFromCoinOrder(
      parseGroupedSelectionOrder(
        getCookie(
          getSwapRouteCookie(tradeSwapFromCoinOrderCookie, walletType, defi),
        ),
      ),
    );
    setToCoinOrder(
      parseGroupedSelectionOrder(
        getCookie(
          getSwapRouteCookie(tradeSwapToCoinOrderCookie, walletType, defi),
        ),
      ),
    );
  }, [defi, selectableChainNames, selectableSellChainNames, walletType]);

  useEffect(() => {
    const savedFromChain = getCookie(
      getSwapRouteCookie(tradeSwapFromChainCookie, walletType, defi),
    );
    if (orderedSellChainNames.length) {
      setFromChain(
        orderedSellChainNames.includes(savedFromChain)
          ? savedFromChain
          : orderedSellChainNames[0],
      );
    }

    const savedToChain = getCookie(
      getSwapRouteCookie(tradeSwapToChainCookie, walletType, defi),
    );
    if (orderedChainNames.length) {
      setToChain(
        orderedChainNames.includes(savedToChain)
          ? savedToChain
          : orderedChainNames[0],
      );
    }
  }, [defi, orderedChainNames, orderedSellChainNames, walletType]);

  useEffect(() => {
    if (!selectableChainNames.length) return;
    if (
      selectableSellChainNames.length &&
      !selectableSellChainNames.includes(fromChain)
    ) {
      setFromChain(orderedSellChainNames[0] || selectableSellChainNames[0]);
    }
    if (!selectableChainNames.includes(toChain)) {
      setToChain(orderedChainNames[0] || selectableChainNames[0]);
    }
  }, [
    fromChain,
    orderedChainNames,
    orderedSellChainNames,
    selectableChainNames,
    selectableSellChainNames,
    toChain,
  ]);

  useEffect(() => {
    if (
      availableDexOptions.length &&
      !availableDexOptions.some((entry) => entry.value == defi)
    ) {
      setDefi(availableDexOptions[0].value);
    } else if (!availableDexOptions.length && defi) {
      setDefi("");
    }
  }, [availableDexOptions, defi]);

  useEffect(() => {
    function handlePointerDown(e) {
      const target = e.target;
      if (
        tradeTypePickerRef.current?.contains(target) ||
        dexPickerRef.current?.contains(target) ||
        fromChainPickerRef.current?.contains(target) ||
        toChainPickerRef.current?.contains(target) ||
        fromCoinPickerRef.current?.contains(target) ||
        toCoinPickerRef.current?.contains(target)
      ) {
        return;
      }

      setShowTradeTypeMenu(false);
      setShowDexMenu(false);
      setShowFromChainMenu(false);
      setShowToChainMenu(false);
      setShowFromCoinMenu(false);
      setShowToCoinMenu(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!defiE.bridge && fromChain && toChain != fromChain) {
      setToChain(fromChain);
    }
  }, [defiE.bridge, fromChain, toChain]);

  function updateAutoApproval(checked) {
    setAutoApproval(checked);
    setCookie(tradeAutoApprovalCookie, checked ? "1" : "0", {
      maxAge: cookieMaxAge,
    });
  }

  useEffect(() => {
    if (fromCoins.length) {
      const savedCoin = getCookie(
        getSwapRouteCookie(tradeSwapFromCoinCookie, walletType, defi, fromChain),
      );
      const nextCoin = fromCoins.includes(fromCoin)
        ? fromCoin
        : fromCoins.includes(savedCoin)
          ? savedCoin
          : fromCoins[0];
      if (nextCoin != fromCoin) setFromCoin(nextCoin);
    } else if (!fromCoins.length && fromCoin) {
      setFromCoin("");
    }
  }, [defi, fromChain, fromCoin, fromCoins, walletType]);

  useEffect(() => {
    if (toCoins.length) {
      const savedCoin = getCookie(
        getSwapRouteCookie(tradeSwapToCoinCookie, walletType, defi, toChain),
      );
      const nextCoin = toCoins.includes(toCoin)
        ? toCoin
        : toCoins.includes(savedCoin)
          ? savedCoin
          : toCoins[0];
      if (nextCoin != toCoin) setToCoin(nextCoin);
    } else if (!toCoins.length && toCoin) {
      setToCoin("");
    }
  }, [defi, toChain, toCoin, toCoins, walletType]);

  useEffect(() => {
    const qty = "0";
    setQtyInputSide("sell");
    setFromQty(qty);
    setToQty("0");
  }, [selectedWalletEntry?.value, fromChain, fromCoin]);

  useEffect(() => {
    if (swapRate <= 0) {
      if (qtyInputSide == "buy") setFromQty("0");
      else setToQty("0");
      return;
    }

    if (qtyInputSide == "buy") {
      setFromQty(invertSwapQty(getSellQty(toQty), fromCoinDecimals));
    } else {
      setToQty(invertSwapQty(getBuyQty(fromQty), toCoinDecimals));
    }
  }, [fromChain, fromCoin, fromCoinDecimals, qtyInputSide, swapRate, toChain, toCoin]);

  useEffect(() => {
    if (isSolanaBridge) return;
    setRecipient(selectedWalletEntry?.address || "");
  }, [isSolanaBridge, selectedWalletEntry?.address]);

  useEffect(() => {
    if (!isSolanaBridge || recipientMode == "manual") return;

    const defaultKey = `${recipientWalletType}:${selectedWalletMatchName}`;
    const current = recipientWallets.find(
      (entry) => entry.value == recipientWallet,
    );
    const matchingName = recipientWallets.find(
      (entry) =>
        selectedWalletMatchName && entry.name == selectedWalletMatchName,
    );
    const shouldDefault = recipientDefaultKeyRef.current != defaultKey;
    recipientDefaultKeyRef.current = defaultKey;
    const next = shouldDefault
      ? matchingName || current || recipientWallets[0]
      : current || matchingName || recipientWallets[0];

    setRecipientWallet(next?.value || "");
    setRecipient(next?.address || "");
  }, [
    isSolanaBridge,
    recipientMode,
    recipientWallet,
    recipientWalletType,
    recipientWallets,
    selectedWalletMatchName,
  ]);

  useEffect(() => {
    if (!isRecipientBalanceMode()) {
      setRecipientBalanceE({ key: "", balance: {}, loading: false, error: "" });
      return;
    }
    if (recipientMode == "manual") return;

    loadRecipientBalance({ silent: true });
  }, [isSolanaBridge, recipientMode, recipient, toChain, toCoin]);

  useEffect(() => {
    function handleBalancePatch(e) {
      const patches = Array.isArray(e?.detail?.balances)
        ? e.detail.balances
        : [];
      const match = patches.find(
        (patch) =>
          patch?.chain == toChain &&
          patch?.coin == toCoin &&
          sameAddress(patch?.address, recipient),
      );
      if (!match?.balance) return;

      setRecipientBalanceE({
        key: getRecipientBalanceKey(),
        balance: match.balance,
        loading: false,
        error: "",
      });
    }

    window.addEventListener(walletBalancePatchEvent, handleBalancePatch);
    return () => {
      window.removeEventListener(walletBalancePatchEvent, handleBalancePatch);
    };
  }, [recipient, toChain, toCoin]);

  function getSwapCoinBalance(chain = "", coin = "", address = "") {
    const chainE = chainList.find((entry) => entry.chain == chain);

    return getCoinBalanceByAddress(
      chainE,
      coin,
      address,
      selectedWalletEntry,
    );
  }

  function getDiscoveryCoinSymbol(entry = {}) {
    const symbol = String(entry.symbol || "").trim();
    if (symbol) return symbol;

    const cleanAddress = String(entry.address || "").replace(/^0x/i, "");
    return cleanAddress
      ? `TOKEN_${cleanAddress.slice(-6).toUpperCase()}`
      : "token";
  }

  function getDiscoveryCoinE(chain = "", entry = {}) {
    const decimals = Number(entry.decimals);

    return {
      chain,
      coin: getDiscoveryCoinSymbol(entry),
      address: String(entry.address || "").trim(),
      decimals: Number.isInteger(decimals) ? decimals : undefined,
      name: entry.name || getDiscoveryCoinSymbol(entry),
      type: "token",
    };
  }

  function getSelectedSwapCoinE(chain = "", coin = "", side = "from") {
    const chainE = chainList.find((entry) => entry.chain == chain);
    const localCoinE = chainE?.coinInfoM?.[coin];
    if (localCoinE) {
      return {
        address: localCoinE.address || "",
        decimals: localCoinE.decimals,
        native: !!localCoinE.native,
      };
    }

    const discoveryCoinE = selectedDiscoveryCoinM[side];
    if (discoveryCoinE?.chain != chain || discoveryCoinE?.coin != coin) {
      return undefined;
    }

    return {
      address: discoveryCoinE.address || "",
      decimals: discoveryCoinE.decimals,
      native: !!discoveryCoinE.native,
    };
  }

  function getRefreshTarget(chain = "", coin = "", address = "") {
    const chainE = chainList.find((entry) => entry.chain == chain);
    const side = chain == fromChain && coin == fromCoin ? "from" : "to";
    const coinE = getSelectedSwapCoinE(chain, coin, side);
    const localCoin = coinE?.address ? getCoinByAddress(chainE, coinE.address) : "";
    const refreshCoin = localCoin || coin;

    return {
      chain,
      coin: refreshCoin,
      address,
      ...(coinE
        ? {
            coinE: {
              address: coinE.address || "",
              decimals: coinE.decimals,
              native: !!coinE.native,
            },
          }
        : {}),
    };
  }

  function isRecipientBalanceMode() {
    return !!(
      isSolanaBridge &&
      recipient &&
      toChain &&
      toCoin &&
      isSwapRecipientAddressForChain(toChain, recipient)
    );
  }

  function getRecipientBalanceKey() {
    const cleanRecipient = String(recipient || "").trim();
    return cleanRecipient && toChain && toCoin
      ? `${toChain}:${toCoin}:${cleanRecipient}`
      : "";
  }

  async function loadRecipientBalance({ silent = false } = {}) {
    const cleanRecipient = String(recipient || "").trim();
    const key = getRecipientBalanceKey();
    if (!isRecipientBalanceMode() || !key) return;

    setRecipientBalanceE((prev) => ({
      key,
      balance: prev.key == key ? prev.balance : {},
      loading: true,
      error: "",
    }));

    try {
      const balance = await getTradeCoinBalance({
        ...getRefreshTarget(toChain, toCoin, cleanRecipient),
      });

      setRecipientBalanceE({
        key,
        balance,
        loading: false,
        error: "",
      });
    } catch (e) {
      const error = e?.message || "recipient balance failed";
      setRecipientBalanceE({
        key,
        balance: {},
        loading: false,
        error,
      });
      if (!silent) toast.error(error);
    }
  }

  async function runSwapForWallet(
    walletEntry = selectedWalletEntry,
    { skipConfirm = false, loopRun = false, side = "from" } = {},
  ) {
    const tradeToast = createTradeToast(walletEntry, loopRun);
    let sellSide = side == "to" ? "to" : "from";
    let buySide;
    let sellChain;
    let buyChain;
    let sellCoin;
    let buyCoin;
    let sellCoinE;
    let buyCoinE;
    let routeIsSolanaBridge;

    const setSwapRoute = (nextSellSide) => {
      sellSide = nextSellSide == "to" ? "to" : "from";
      buySide = sellSide == "to" ? "from" : "to";
      sellChain = sellSide == "to" ? toChain : fromChain;
      buyChain = sellSide == "to" ? fromChain : toChain;
      sellCoin = sellSide == "to" ? toCoin : fromCoin;
      buyCoin = sellSide == "to" ? fromCoin : toCoin;
      sellCoinE = getSelectedSwapCoinE(sellChain, sellCoin, sellSide);
      buyCoinE = getSelectedSwapCoinE(buyChain, buyCoin, buySide);
      routeIsSolanaBridge =
        !!sellChain &&
        !!buyChain &&
        sellChain != buyChain &&
        (sellChain == "Solana" || buyChain == "Solana");
    };

    setSwapRoute(sellSide);

    if (!["jupiter", "jumper", "relay", "uniswap", "across"].includes(defi)) {
      tradeToast.show(`${defiE.label}: swap not wired yet`);
      return;
    }
    const useBrowserEvmWallet =
      walletEntry?.isBrowserWallet &&
      walletEntry?.type == "evm";
    const useBrowserSolanaWallet =
      walletEntry?.isBrowserWallet &&
      walletEntry?.type == "solana" &&
      ["jupiter", "jumper", "relay"].includes(defi);
    const useBrowserWallet = useBrowserEvmWallet || useBrowserSolanaWallet;
    if (!walletEntry?.hasPrivateKey && !useBrowserWallet) {
      if (walletEntry?.isBrowserWallet) {
        tradeToast.error(
          `${defiE.label} is not available for this browser wallet`,
        );
        return;
      }
      const walletName = walletEntry?.name || "";
      const keyLabel =
        walletEntry?.type == "solana"
          ? `pk_sol_raw_${walletName} or pk_sol_${walletName}`
          : `pk_raw_${walletName} or pk_${walletName}`;
      tradeToast.error(`private key missing: ${keyLabel}`);
      return;
    }
    const getSwapRouteError = () => {
      if (defi == "jupiter" && (sellChain != "Solana" || buyChain != "Solana")) {
        return "Jupiter is for Solana swaps only";
      }
      if (
        sellChain == "Solana" &&
        !["jupiter", "jumper", "relay", "across"].includes(defi)
      ) {
        return `${defiE.label} is not available for Solana-origin swaps`;
      }
      if (defi == "across" && sellChain == buyChain) {
        return "Across is for cross-chain swaps; choose a different buy chain";
      }
      if (sellChain == buyChain && sellCoin == buyCoin) {
        return "sell coin and buy coin are the same";
      }

      return "";
    };
    let amount = "0";
    try {
      amount = await getSwapSellAmountForWallet(walletEntry, {
        forceBalanceQuery: loopRun,
        side: sellSide,
      });
      if (toNum(amount) < 0) {
        const nextSellSide = sellSide == "to" ? "from" : "to";
        setSwapRoute(nextSellSide);
        amount = loopRun
          ? await getSwapSellAmountForWallet(walletEntry, {
              forceBalanceQuery: true,
              side: sellSide,
            })
          : formatTradeQty(
              nextSellSide == "to" ? toQty : fromQty,
              nextSellSide == "to" ? toCoinDecimals : fromCoinDecimals,
            );
      }
    } catch (e) {
      tradeToast.error(e?.message || "sell qty query failed");
      return;
    }

    const routeError = getSwapRouteError();
    if (routeError) {
      tradeToast.error(routeError);
      return;
    }
    if (toNum(amount) < 0) {
      tradeToast.error("sell qty cannot be negative");
      return;
    }
    if (!toNum(amount)) {
      tradeToast.error("sell qty is 0");
      return;
    }

    let sellBalanceQty = "0";
    const sellDecimals = sellSide == "to" ? toCoinDecimals : fromCoinDecimals;
    try {
      sellBalanceQty = await getSwapBalanceQtyForSide(walletEntry, sellSide, {
        forceBalanceQuery: loopRun,
      });
    } catch (e) {
      tradeToast.error(e?.message || "sell balance query failed");
      return;
    }
    if (isTradeQtyGreater(amount, sellBalanceQty, sellDecimals)) {
      tradeToast.error(
        `${sellCoin} balance ${formatTradeQty(
          sellBalanceQty,
          sellDecimals,
        )} < sell qty ${formatTradeQty(amount, sellDecimals)}`,
      );
      return;
    }

    const autoApprovalAmount =
      autoApproval && sellChain != "Solana" && !sellCoinE?.native ? amount : "";
    const getApprovalAmount = (approvalNeeded) => {
      if (!approvalNeeded) return "";
      return (
        autoApprovalAmount ||
        window.prompt(
          `Approval needed for ${sellCoin}.\n\nEnter approval qty.\nSell qty: ${amount}`,
          amount,
        )
      );
    };
    const toAddress =
      routeIsSolanaBridge && sellSide == "from" ? recipient : walletEntry.address;
    if (!useBrowserWallet && !skipConfirm) {
      const ok = window.confirm(
        `Execute ${defiE.label} swap?\n\nwallet: ${
          walletEntry.label || walletEntry.name || swapWalletLabel
        }\nsell: ${amount} ${sellCoin} on ${sellChain}\nbuy: ${buyCoin} on ${buyChain}\nrecipient: ${toAddress}`,
      );
      if (!ok) return;
    }

    setSwapPending(true);
    setSwapResult(null);
    const toastId = tradeToast.loading(`${defiE.label}: preparing swap...`);
    try {
      let res;
      if (defi == "jupiter") {
        tradeToast.loading("Jupiter: submitting tx...", { id: toastId });
        if (useBrowserWallet) {
          tradeToast.loading("Jupiter: building wallet prompt...", {
            id: toastId,
          });
          const built = await buildJupiterSwapTxs({
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
          });
          const txs = [];

          for (const tx of built.txs || []) {
            txs.push(
              await sendBrowserTradeTx({
                tx,
                walletEntry,
                tradeToast,
                toastId,
                message: `Jupiter: confirm ${tx.type}...`,
                solana: true,
              }),
            );
          }
          res = { ...built, txs };
        } else {
          tradeToast.loading("Jupiter: checking quote...", {
            id: toastId,
          });
          await getJupiterSwapPreview({
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
          });

          tradeToast.loading("Jupiter: submitting swap...", {
            id: toastId,
          });
          res = await executeJupiterSwap({
            walletName: walletEntry.name,
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
          });
        }
      } else if (defi == "jumper") {
        if (useBrowserWallet) {
          tradeToast.loading("Jumper: building wallet prompts...", {
            id: toastId,
          });
          const built = await buildJumperSwapTxs({
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
            recipient: toAddress,
          });
          const txs = [];

          for (const tx of built.txs || []) {
            txs.push(
              await sendBrowserTradeTx({
                tx,
                walletEntry,
                tradeToast,
                toastId,
                message: `Jumper: confirm ${tx.type}...`,
              }),
            );
          }
          res = { ...built, txs };
        } else {
          tradeToast.loading("Jumper: checking quote and allowance...", {
            id: toastId,
          });
          const preview = await getJumperSwapPreview({
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
            recipient: toAddress,
          });
          let approvalAmount = "";

          if (preview.approvalNeeded) {
            approvalAmount = getApprovalAmount(preview.approvalNeeded);
            if (!approvalAmount) {
              setSwapPending(false);
              toast.dismiss(toastId);
              return;
            }
          }

          tradeToast.loading(
            preview.approvalNeeded
              ? "Jumper: approving then swapping..."
              : "Jumper: submitting swap...",
            { id: toastId },
          );
          res = await executeJumperSwap({
            walletName: walletEntry.name,
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
            recipient: toAddress,
            approvalAmount,
          });
        }
      } else if (defi == "relay") {
        tradeToast.loading(`${defiE.label}: submitting tx...`, {
          id: toastId,
        });
        if (useBrowserWallet) {
          tradeToast.loading("Relay: building wallet prompts...", {
            id: toastId,
          });
          const built = await buildRelaySwapSteps({
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            fromCoinE: sellCoinE,
            toCoinE: buyCoinE,
            amount,
            recipient: toAddress,
          });
          const txs = [];
          const signatures = [];

          for (const item of built.items || []) {
            if (item.kind == "transaction") {
              txs.push(
                await sendBrowserTradeTx({
                  tx: item.tx,
                  walletEntry,
                  tradeToast,
                  toastId,
                  message: `Relay: confirm ${item.tx.chain} ${item.tx.type}...`,
                }),
              );
            } else if (item.kind == "signature") {
              tradeToast.loading("Relay: sign message...", {
                id: toastId,
              });
              signatures.push(
                await signBrowserRelayItem({
                  item,
                  wallet: walletEntry.browserWallet,
                  address: walletEntry.address,
                }),
              );
            }
          }
          res = { ...built, txs, signatures };
        } else {
          tradeToast.loading("Relay: checking quote and allowance...", {
            id: toastId,
          });
          const preview = await getRelaySwapPreview({
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            fromCoinE: sellCoinE,
            toCoinE: buyCoinE,
            amount,
            recipient: toAddress,
          });
          let approvalAmount = "";

          if (preview.approvalNeeded) {
            approvalAmount = getApprovalAmount(preview.approvalNeeded);
            if (!approvalAmount) {
              setSwapPending(false);
              toast.dismiss(toastId);
              return;
            }
          }

          tradeToast.loading(
            preview.approvalNeeded
              ? "Relay: approving then swapping..."
              : "Relay: submitting swap...",
            { id: toastId },
          );
          res = await executeRelaySwap({
            walletName: walletEntry.name,
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            fromCoinE: sellCoinE,
            toCoinE: buyCoinE,
            amount,
            recipient: toAddress,
            approvalAmount,
          });
        }
      } else if (defi == "across") {
        if (useBrowserWallet) {
          tradeToast.loading("Across: building wallet prompts...", {
            id: toastId,
          });
          const built = await buildAcrossSwapTxs({
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
            recipient: toAddress,
          });
          const txs = [];

          for (const tx of built.txs || []) {
            txs.push(
              await sendBrowserTradeTx({
                tx,
                walletEntry,
                tradeToast,
                toastId,
                message: `Across: confirm ${tx.type}...`,
              }),
            );
          }
          res = { ...built, txs };
        } else {
          tradeToast.loading("Across: checking quote and allowance...", {
            id: toastId,
          });
          const preview = await getAcrossSwapPreview({
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
            recipient: toAddress,
          });
          let approvalAmount = "";

          if (preview.approvalNeeded) {
            approvalAmount = getApprovalAmount(preview.approvalNeeded);
            if (!approvalAmount) {
              setSwapPending(false);
              toast.dismiss(toastId);
              return;
            }
          }

          tradeToast.loading(
            preview.approvalNeeded
              ? "Across: approving then swapping..."
              : "Across: submitting swap...",
            { id: toastId },
          );
          res = await executeAcrossSwap({
            walletName: walletEntry.name,
            walletAddress: walletEntry.address,
            fromChain: sellChain,
            toChain: buyChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
            recipient: toAddress,
            approvalAmount,
          });
        }
      } else {
        if (useBrowserWallet) {
          tradeToast.loading("Uniswap: building wallet prompts...", {
            id: toastId,
          });
          const built = await buildUniswapSwapTxs({
            walletAddress: walletEntry.address,
            chain: sellChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
          });
          const txs = [];

          for (const tx of built.txs || []) {
            txs.push(
              await sendBrowserTradeTx({
                tx,
                walletEntry,
                tradeToast,
                toastId,
                message: `Uniswap: confirm ${tx.type}...`,
              }),
            );
          }
          res = { ...built, txs };
        } else {
          tradeToast.loading("Uniswap: checking quote and allowance...", {
            id: toastId,
          });
          const preview = await getUniswapSwapPreview({
            walletAddress: walletEntry.address,
            chain: sellChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
          });
          let approvalAmount = "";

          if (preview.approvalNeeded) {
            approvalAmount = getApprovalAmount(preview.approvalNeeded);
            if (!approvalAmount) {
              setSwapPending(false);
              toast.dismiss(toastId);
              return;
            }
          }

          tradeToast.loading(
            preview.approvalNeeded
              ? "Uniswap: approving then swapping..."
              : "Uniswap: submitting swap...",
            { id: toastId },
          );
          res = await executeUniswapSwap({
            walletName: walletEntry.name,
            walletAddress: walletEntry.address,
            chain: sellChain,
            fromCoin: sellCoin,
            toCoin: buyCoin,
            amount,
            approvalAmount,
          });
        }
      }

      if (res?.ok === false) {
        throw new Error(res.error || `${defiE.label} swap failed`);
      }

      setSwapResult(res);
      tradeToast.success(
        `${res.dex || defiE.label} submitted ${res.txs?.length || 0} tx`,
        {
          id: toastId,
        },
      );
      onTxComplete({
        ...res,
        refreshTargets: [
          getRefreshTarget(sellChain, sellCoin, walletEntry.address),
          getRefreshTarget(buyChain, buyCoin, toAddress),
        ],
      });
      return res;
    } catch (e) {
      const message = e?.message || `${defiE.label} swap failed`;
      const errorResult = {
        ok: false,
        error: message,
        dex: defiE.label,
      };
      setSwapResult(errorResult);
      tradeToast.error(message, { id: toastId });
      return errorResult;
    } finally {
      setSwapPending(false);
    }
  }

  async function runSwap(side = "from") {
    const sellSide = side == "to" ? "to" : "from";
    const sideEndWith = sellSide == "to" ? buyEndWith : sellEndWith;
    const sideEndInputValue =
      sellSide == "to" ? buyEndInputValue : sellEndInputValue;
    const sideQty = sellSide == "to" ? toQty : fromQty;
    const sideCoin = sellSide == "to" ? toCoin : fromCoin;
    const sideDecimals = sellSide == "to" ? toCoinDecimals : fromCoinDecimals;
    const result = await runTradeWalletLoop({
      loopWallets,
      getLoopWalletEntries,
      selectedWalletEntry,
      actionLabel: `${defiE.label} swap ${
        sideEndWith
          ? `end ${formatTradeQty(sideEndInputValue, sideDecimals)}`
          : formatTradeQty(sideQty, sideDecimals)
      } ${sideCoin}`,
      runOne: (walletEntry, options) =>
        runSwapForWallet(walletEntry, { ...options, side: sellSide }),
    });
    if (Array.isArray(result)) {
      const loopResult = createTradeLoopResult(result, { dex: defiE.label });
      if (loopResult) {
        loopResult.requestIds = result.flatMap((entry) => entry?.requestIds || []);
        setSwapResult(loopResult);
      }
    }

    return result;
  }

  function setMaxSell() {
    updateSellQty(formatTradeQty(fromBalance.balance, fromCoinDecimals));
  }

  function setMaxBuy() {
    updateBuyQty(formatTradeQty(toBalance.balance, toCoinDecimals));
  }

  function invertSwapQty(value, decimals) {
    const qty = formatComputedTradeQty(value, decimals);
    if (!toNum(qty)) return "0";
    return String(qty).startsWith("-") ? qty.slice(1) : `-${qty}`;
  }

  function getBuyQty(value) {
    return swapRate > 0
      ? formatComputedTradeQty(toNum(value) * swapRate, toCoinDecimals)
      : "0";
  }

  function getSellQty(value) {
    return swapRate > 0
      ? formatComputedTradeQty(toNum(value) / swapRate, fromCoinDecimals)
      : "0";
  }

  function updateSellQty(value) {
    const maxReverseSell = swapRate > 0 ? maxBuy / swapRate : 0;
    const qty = normalizeSignedQtyInput(
      value,
      maxSell,
      maxReverseSell,
      fromCoinDecimals,
      { allowNegativeZero: true, inputMaxOff },
    );
    setQtyInputSide("sell");
    setFromQty(qty);
    setToQty(invertSwapQty(getBuyQty(qty), toCoinDecimals));
  }

  function updateBuyQty(value) {
    const qty = normalizeSignedQtyInput(
      value,
      maxBuy,
      maxBuyInput,
      toCoinDecimals,
      { allowNegativeZero: true, inputMaxOff },
    );
    setQtyInputSide("buy");
    setToQty(qty);
    setFromQty(invertSwapQty(getSellQty(qty), fromCoinDecimals));
  }

  function updateSellEnd(value) {
    const endQty = limitQtyInputDecimals(cleanTradeInput(value), fromCoinDecimals);
    setSellEndDraft(endQty);
    updateSellQty(getTradeEndDiffQty(maxSellQty, endQty, fromCoinDecimals));
  }

  function updateBuyEnd(value) {
    const endQty = limitQtyInputDecimals(cleanTradeInput(value), toCoinDecimals);
    setBuyEndDraft(endQty);
    updateBuyQty(getTradeEndDiffQty(maxBuyQty, endQty, toCoinDecimals));
  }

  function renderSwapControls({
    showGas = false,
    side = "from",
    txLabel = "SWAP",
  } = {}) {
    const isBuySide = side == "to";
    const maxValue = isBuySide ? maxBuy : maxSell;
    const maxQty = isBuySide ? maxBuyQty : maxSellQty;
    const decimals = isBuySide ? toCoinDecimals : fromCoinDecimals;
    const sliderValue = isBuySide ? buySliderValue : sellSliderValue;
    const updateSideQty = isBuySide ? updateBuyQty : updateSellQty;
    const setMaxSide = isBuySide ? setMaxBuy : setMaxSell;

    return (
      <div className="tradeBoxControls sendQtyControl">
        {showGas && showGasAutoLabel && (
          <label className="tradeGasSelect">
            <span className="gray">gas:</span>
            <select value="default" disabled>
              <option value="default">auto</option>
            </select>
          </label>
        )}
        <input
          className="tradeMiddleRange"
          type="range"
          min="0"
          max={maxValue || 0}
          step="any"
          value={sliderValue}
          onChange={(e) =>
            updateSideQty(
              rangeQtyInput(e.target.value, maxValue, maxQty, decimals),
            )
          }
          disabled={!maxValue}
        />
        <button
          type="button"
          className="btn small bgGray"
          onClick={setMaxSide}
          disabled={!maxValue}
        >
          max
        </button>
        <button
          type="button"
          className="btn bgCyan sendTransferButton"
          onClick={() => runSwap(side)}
          disabled={swapPending || !swapCanExecute}
        >
          {swapPending ? "SWAPPING" : <>&nbsp;{txLabel}&nbsp;</>}
        </button>
      </div>
    );
  }

  function isTradeQtyGreater(left, right, decimals = 18) {
    return toNum(subtractTradeQtyText(left, right, decimals)) > 0;
  }

  async function getSwapBalanceQtyForSide(
    walletEntry = selectedWalletEntry,
    side = "from",
    { forceBalanceQuery = false, address = "" } = {},
  ) {
    const isToSide = side == "to";
    const chain = isToSide ? toChain : fromChain;
    const coin = isToSide ? toCoin : fromCoin;
    const decimals = isToSide ? toCoinDecimals : fromCoinDecimals;
    const localQty = isToSide ? maxBuyQty : maxSellQty;
    const owner = String(address || walletEntry?.address || "").trim();

    if (!owner) return "0";
    if (
      !forceBalanceQuery &&
      sameAddress(owner, selectedWalletEntry?.address)
    ) {
      return formatTradeQty(localQty, decimals);
    }

    const balance = await getTradeCoinBalance({
      chain,
      coin,
      address: owner,
      coinE: getSelectedSwapCoinE(chain, coin, side),
    });

    return formatTradeQty(balance?.balance, decimals);
  }

  async function getSwapSellAmountForWallet(
    walletEntry = selectedWalletEntry,
    { forceBalanceQuery = false, side = "from" } = {},
  ) {
    if (side == "to") {
      if (!buyEndWith) {
        return formatTradeQty(toQty, toCoinDecimals);
      }

      const targetEnd = formatTradeQty(buyEndInputValue, toCoinDecimals);
      if (!walletEntry?.address) return "0";
      return getTradeEndDiffQty(
        await getSwapBalanceQtyForSide(walletEntry, "to", {
          forceBalanceQuery,
        }),
        targetEnd,
        toCoinDecimals,
      );
    }

    if (!sellEndWith && !buyEndWith) {
      return formatTradeQty(fromQty, fromCoinDecimals);
    }

    if (sellEndWith) {
      const targetEnd = formatTradeQty(sellEndInputValue, fromCoinDecimals);
      if (!walletEntry?.address) return "0";
      return getTradeEndDiffQty(
        await getSwapBalanceQtyForSide(walletEntry, "from", {
          forceBalanceQuery,
        }),
        targetEnd,
        fromCoinDecimals,
      );
    }

    const targetEnd = formatTradeQty(buyEndInputValue, toCoinDecimals);
    const buyAddress = isRecipientBalanceMode()
      ? String(recipient || "").trim()
      : walletEntry?.address;
    if (!buyAddress) return "0";
    const buyBalanceQty = await getSwapBalanceQtyForSide(walletEntry, "to", {
      forceBalanceQuery,
      address: buyAddress,
    });

    const buyAmount = formatComputedTradeQty(
      subtractTradeQtyText(targetEnd, buyBalanceQty, toCoinDecimals),
      toCoinDecimals,
    );
    return getSellQty(buyAmount);
  }

  function nextFromChain() {
    const values = getHistoryCycleValues(
      fromChainHistoryOptions,
      selectableSellChainNames,
    );
    const next = nextValue(values, fromChain);
    if (next) selectFromChain(next, { rememberOrder: false });
  }

  function prevFromChain() {
    const values = getHistoryCycleValues(
      fromChainHistoryOptions,
      selectableSellChainNames,
    );
    const prev = prevValue(values, fromChain);
    if (prev) selectFromChain(prev, { rememberOrder: false });
  }

  function nextToChain() {
    const values = getHistoryCycleValues(
      toChainHistoryOptions,
      selectableChainNames,
    );
    const next = nextValue(values, toChain);
    if (next) selectToChain(next, { rememberOrder: false });
  }

  function prevToChain() {
    const values = getHistoryCycleValues(
      toChainHistoryOptions,
      selectableChainNames,
    );
    const prev = prevValue(values, toChain);
    if (prev) selectToChain(prev, { rememberOrder: false });
  }

  function requestTokenDiscovery(chain = "", term = "", { force = false } = {}) {
    const currentDefi = defi;
    if (!chain || !["relay", "jumper", "jupiter"].includes(currentDefi)) return;
    const key = getTokenDiscoveryKey(currentDefi, chain, term);
    const current = tokenDiscoveryM[key] || emptyTokenDiscoveryE;
    if (!force && (current.loading || current.loaded)) return;

    if (!force && isDiscoveryCacheFresh(tokenDiscoveryCacheM[key], discoveryCacheMs)) {
      setTokenDiscoveryM((discoveryM) => ({
        ...discoveryM,
        [key]: {
          ...tokenDiscoveryCacheM[key],
          cache: makeDiscoveryCacheMeta({
            ...(tokenDiscoveryCacheM[key].cache || {}),
            source: "cache",
            location: "client",
          }),
        },
      }));
      return;
    }

    setTokenDiscoveryM((discoveryM) => ({
      ...discoveryM,
      [key]: {
        ...current,
        loading: true,
        loaded: false,
        error: "",
      },
    }));

    if (!force && tokenDiscoveryPromiseM[key]) {
      tokenDiscoveryPromiseM[key]
        .then((entry) => {
          setTokenDiscoveryM((discoveryM) => ({
            ...discoveryM,
            [key]: entry,
          }));
        })
        .catch((e) => {
          setTokenDiscoveryM((discoveryM) => ({
            ...discoveryM,
            [key]: {
              ...(discoveryM[key] || emptyTokenDiscoveryE),
              loading: false,
              loaded: true,
              error:
                e?.message ||
                `${getDexLabel(currentDefi)} token discovery failed`,
            },
          }));
        });
      return;
    }

    const discoveryRequest =
      currentDefi == "jupiter"
        ? getJupiterTokenDiscovery({ chain, term, refresh: force })
        : currentDefi == "jumper"
          ? getJumperTokenDiscovery({ chain, term, refresh: force })
        : getRelayCurrencyDiscovery({ chain, term, refresh: force });

    tokenDiscoveryPromiseM[key] = discoveryRequest
      .then((res) => {
        const cache =
          res?.cache ||
          makeDiscoveryCacheMeta({ source: "api", location: "client" });
        const entry = {
          tokens: Array.isArray(res?.tokens) ? res.tokens : [],
          loading: false,
          loaded: true,
          error: "",
          cache,
        };
        tokenDiscoveryCacheM[key] = {
          ...entry,
          at: Number(cache.at || Date.now()),
        };
        setTokenDiscoveryM((discoveryM) => ({
          ...discoveryM,
          [key]: entry,
        }));
        return entry;
      })
      .catch((e) => {
        delete tokenDiscoveryPromiseM[key];
        const entry = {
          tokens: [],
          loading: false,
          loaded: true,
          error:
            e?.message || `${getDexLabel(currentDefi)} token discovery failed`,
        };
        setTokenDiscoveryM((discoveryM) => ({
          ...discoveryM,
          [key]: entry,
        }));
        return entry;
      });
  }

  function changeTokenSearch(side = "from", value = "") {
    setTokenSearchM((searchM) => ({
      ...searchM,
      [side]: value,
    }));
  }

  function submitTokenSearch(e, side = "from", chain = "") {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    requestTokenDiscovery(chain, tokenSearchM[side] || "");
  }

  function retryTokenDiscovery(e, side = "from", chain = "") {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const term = tokenSearchM[side] || "";
    const key = getTokenDiscoveryKey(defi, chain, term);
    delete tokenDiscoveryCacheM[key];
    delete tokenDiscoveryPromiseM[key];
    setTokenDiscoveryM((discoveryM) => ({
      ...discoveryM,
      [key]: emptyTokenDiscoveryE,
    }));
    requestTokenDiscovery(chain, term, { force: true });
  }

  function openTokenDiscoveryMenu(side = "from", chain = "") {
    if (!["relay", "jumper", "jupiter"].includes(defi)) return;
    requestTokenDiscovery(chain, tokenSearchM[side] || "");
  }

  function showManualChain(entry = {}) {
    const name = entry.name || entry.chain || "this chain";
    toast(`${name}: add chain manually in sets.js and data/coins first`);
  }

  function selectDiscoveryChain(entry = {}, side = "from") {
    const chain = entry.chain || "";
    const addedChains = side == "from" ? orderedSellChainNames : orderedChainNames;
    if (!chain || !addedChains.includes(chain)) {
      showManualChain(entry);
      return;
    }

    if (side == "from") {
      selectFromChain(chain);
      setShowFromChainMenu(false);
    } else {
      selectToChain(chain);
      setShowToChainMenu(false);
    }
  }

  function findLocalCoinForDiscovery(chain = "", entry = {}) {
    const chainE = chainList.find((chainEntry) => chainEntry.chain == chain);
    const coins = getChainCoins(chainE);
    const symbol = String(entry.symbol || "").trim();
    const address = getTokenAddressKey(chain, entry.address);

    if (address) {
      return (
        coins.find((coin) => {
          const coinAddress = getTokenAddressKey(
            chain,
            chainE?.coinInfoM?.[coin]?.address,
          );
          return coinAddress && coinAddress == address;
        }) || ""
      );
    }

    return symbol && coins.includes(symbol) ? symbol : "";
  }

  function isDiscoveryCoinSupported(chain = "", coin = "", allTokens = []) {
    const chainE = chainList.find((chainEntry) => chainEntry.chain == chain);
    const coinE = chainE?.coinInfoM?.[coin] || {};
    const coinAddress = getTokenAddressKey(chain, coinE.address);
    return allTokens.some((entry) => {
      if (entry.chain != chain) return false;
      const tokenAddress = getTokenAddressKey(chain, entry.address);

      if (tokenAddress || coinAddress) {
        return tokenAddress && coinAddress && tokenAddress == coinAddress;
      }

      return entry.symbol && entry.symbol == coin;
    });
  }

  function selectDiscoveryCoin(entry = {}, side = "from") {
    const chain = side == "from" ? fromChain : toChain;
    const localCoin = findLocalCoinForDiscovery(chain, entry);
    const discoveryCoinE = getDiscoveryCoinE(chain, entry);
    const selectedCoin = localCoin || discoveryCoinE.coin;
    if (!selectedCoin) return;
    if (!localCoin && !discoveryCoinE.address) {
      toast(`${chain} ${selectedCoin}: token address missing`);
      return;
    }

    if (side == "from") {
      if (!localCoin) {
        setSelectedDiscoveryCoinM((coinM) => ({
          ...coinM,
          from: discoveryCoinE,
        }));
        setFromCoin(selectedCoin);
      } else {
        selectFromCoin(localCoin);
      }
      setShowFromCoinMenu(false);
    } else {
      if (!localCoin) {
        setSelectedDiscoveryCoinM((coinM) => ({
          ...coinM,
          to: discoveryCoinE,
        }));
        setToCoin(selectedCoin);
      } else {
        selectToCoin(localCoin);
      }
      setShowToCoinMenu(false);
    }
  }

  async function openDiscoveryCoinConfirm(e, chain = "", entry = {}) {
    e.preventDefault();
    e.stopPropagation();
    const address = String(entry.address || "").trim();
    if (!chain || addingCoin) return;
    if (!address) {
      toast(`${chain} ${entry.symbol || "token"} has no addable address`);
      return;
    }

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

  function selectFromChain(chain, options = {}) {
    setFromChain(chain);
    saveSwapChainCookie(tradeSwapFromChainCookie, chain, options);
    emitTradeChainSelect(chain);
  }

  function selectToChain(chain, options = {}) {
    setToChain(chain);
    saveSwapChainCookie(tradeSwapToChainCookie, chain, options);
    emitTradeChainSelect(chain);
  }

  function saveSwapChainCookie(base, chain, { rememberOrder = true } = {}) {
    if (!defi || !chain) return;
    setCookie(getSwapRouteCookie(base, walletType, defi), chain, {
      maxAge: cookieMaxAge,
    });
    if (!rememberOrder) return;
    if (base == tradeSwapFromChainCookie) {
      const nextOrder = rememberSelectionValue(fromChainOrder, chain, chainNames);
      setFromChainOrder(nextOrder);
      setCookie(
        getSwapRouteCookie(tradeSwapFromChainOrderCookie, walletType, defi),
        encodeSelectionOrder(nextOrder),
        { maxAge: cookieMaxAge },
      );
    } else if (base == tradeSwapToChainCookie) {
      const nextOrder = rememberSelectionValue(toChainOrder, chain, chainNames);
      setToChainOrder(nextOrder);
      setCookie(
        getSwapRouteCookie(tradeSwapToChainOrderCookie, walletType, defi),
        encodeSelectionOrder(nextOrder),
        { maxAge: cookieMaxAge },
      );
    }
  }

  function nextFromCoin() {
    const values = getHistoryCycleValues(
      fromCoinHistoryOptions,
      getChainCoins(fromChainE),
    );
    const next = nextValue(values, fromCoin);
    if (next) selectFromCoin(next, { rememberOrder: false });
  }

  function prevFromCoin() {
    const values = getHistoryCycleValues(
      fromCoinHistoryOptions,
      getChainCoins(fromChainE),
    );
    const prev = prevValue(values, fromCoin);
    if (prev) selectFromCoin(prev, { rememberOrder: false });
  }

  function nextToCoin() {
    const values = getHistoryCycleValues(
      toCoinHistoryOptions,
      getChainCoins(toChainE),
    );
    const next = nextValue(values, toCoin);
    if (next) selectToCoin(next, { rememberOrder: false });
  }

  function prevToCoin() {
    const values = getHistoryCycleValues(
      toCoinHistoryOptions,
      getChainCoins(toChainE),
    );
    const prev = prevValue(values, toCoin);
    if (prev) selectToCoin(prev, { rememberOrder: false });
  }

  function selectFromCoin(coin, options = {}) {
    if (
      selectedDiscoveryCoinM.from?.chain != fromChain ||
      selectedDiscoveryCoinM.from?.coin != coin
    ) {
      setSelectedDiscoveryCoinM((coinM) => ({ ...coinM, from: null }));
    }
    setFromCoin(coin);
    saveSwapCoinCookie(tradeSwapFromCoinCookie, fromChain, coin, options);
  }

  function selectToCoin(coin, options = {}) {
    if (
      selectedDiscoveryCoinM.to?.chain != toChain ||
      selectedDiscoveryCoinM.to?.coin != coin
    ) {
      setSelectedDiscoveryCoinM((coinM) => ({ ...coinM, to: null }));
    }
    setToCoin(coin);
    saveSwapCoinCookie(tradeSwapToCoinCookie, toChain, coin, options);
  }

  function saveSwapCoinCookie(base, chain, coin, { rememberOrder = true } = {}) {
    if (!defi || !chain || !coin) return;
    setCookie(getSwapRouteCookie(base, walletType, defi, chain), coin, {
      maxAge: cookieMaxAge,
    });
    if (!rememberOrder) return;
    const chainE = chainList.find((entry) => entry.chain == chain);
    const validCoins = getChainCoins(chainE);
    if (base == tradeSwapFromCoinCookie) {
      const nextOrder = rememberGroupedSelectionValue(
        fromCoinOrder,
        chain,
        coin,
        { validGroups: chainNames, validValues: validCoins },
      );
      setFromCoinOrder(nextOrder);
      setCookie(
        getSwapRouteCookie(tradeSwapFromCoinOrderCookie, walletType, defi),
        encodeGroupedSelectionOrder(nextOrder),
        { maxAge: cookieMaxAge },
      );
    } else if (base == tradeSwapToCoinCookie) {
      const nextOrder = rememberGroupedSelectionValue(
        toCoinOrder,
        chain,
        coin,
        { validGroups: chainNames, validValues: validCoins },
      );
      setToCoinOrder(nextOrder);
      setCookie(
        getSwapRouteCookie(tradeSwapToCoinOrderCookie, walletType, defi),
        encodeGroupedSelectionOrder(nextOrder),
        { maxAge: cookieMaxAge },
      );
    }
  }

  function nextDex() {
    const values = getHistoryCycleValues(dexHistoryOptions, availableDexOptions);
    const next = nextValue(values, defi);
    if (next) selectDex(next, { rememberOrder: false });
  }

  function prevDex() {
    const values = getHistoryCycleValues(dexHistoryOptions, availableDexOptions);
    const prev = prevValue(values, defi);
    if (prev) selectDex(prev, { rememberOrder: false });
  }

  function selectDex(value, { rememberOrder = true } = {}) {
    setDefi(value);
    if (!value) return;
    setCookie(getTradeModeCookie(tradeSwapDexCookie, walletType), value, {
      maxAge: cookieMaxAge,
    });
    if (!rememberOrder) return;
    const nextOrder = rememberSelectionValue(
      dexOrder,
      value,
      dexOptions.map((entry) => entry.value),
    );
    setDexOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeSwapDexOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function removeDexHistory(value) {
    const nextOrder = removeSelectionValue(dexOrder, value);
    setDexOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeSwapDexOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function removeSwapChainHistory(base, value) {
    const isFrom = base == "from";
    const nextOrder = removeSelectionValue(
      isFrom ? fromChainOrder : toChainOrder,
      value,
    );
    if (isFrom) {
      setFromChainOrder(nextOrder);
      setCookie(
        getSwapRouteCookie(tradeSwapFromChainOrderCookie, walletType, defi),
        encodeSelectionOrder(nextOrder),
        { maxAge: cookieMaxAge },
      );
    } else {
      setToChainOrder(nextOrder);
      setCookie(
        getSwapRouteCookie(tradeSwapToChainOrderCookie, walletType, defi),
        encodeSelectionOrder(nextOrder),
        { maxAge: cookieMaxAge },
      );
    }
  }

  function removeSwapCoinHistory(base, chain, value) {
    const isFrom = base == "from";
    const nextOrder = removeGroupedSelectionValue(
      isFrom ? fromCoinOrder : toCoinOrder,
      chain,
      value,
    );
    if (isFrom) {
      setFromCoinOrder(nextOrder);
      setCookie(
        getSwapRouteCookie(tradeSwapFromCoinOrderCookie, walletType, defi),
        encodeGroupedSelectionOrder(nextOrder),
        { maxAge: cookieMaxAge },
      );
    } else {
      setToCoinOrder(nextOrder);
      setCookie(
        getSwapRouteCookie(tradeSwapToCoinOrderCookie, walletType, defi),
        encodeGroupedSelectionOrder(nextOrder),
        { maxAge: cookieMaxAge },
      );
    }
  }

  function reverseRoute() {
    if (defiE.bridge) {
      setFromChain(toChain);
      setToChain(fromChain);
      saveSwapChainCookie(tradeSwapFromChainCookie, toChain);
      saveSwapChainCookie(tradeSwapToChainCookie, fromChain);
    }
    setFromCoin(toCoin);
    setToCoin(fromCoin);
    saveSwapCoinCookie(tradeSwapFromCoinCookie, defiE.bridge ? toChain : fromChain, toCoin);
    saveSwapCoinCookie(tradeSwapToCoinCookie, defiE.bridge ? fromChain : toChain, fromCoin);
    setQtyInputSide("sell");
    setFromQty("0");
    setToQty("0");
  }

  function selectRecipientWallet(value) {
    if (!value) {
      setRecipientMode("manual");
      setRecipientWallet("");
      return;
    }

    const wallet = recipientWallets.find((entry) => entry.value == value);
    setRecipientMode("wallet");
    setRecipientWallet(value);
    setRecipient(wallet?.address || "");
  }

  function changeRecipient(value) {
    setRecipientMode("manual");
    setRecipientWallet("");
    setRecipient(value);
  }

  function handleRecipientKeyDown(e) {
    if (e.key != "Enter") return;

    e.preventDefault();
    loadRecipientBalance();
  }

  return (
    <ProtocolClient>
      <div className="tradePane swapPane">
      <CustomCoinConfirmModal
        preview={customCoinPreview}
        draft={customCoinDraft}
        setDraft={setCustomCoinDraft}
        adding={addingCoin}
        coinTypeOptions={coinTypeOptions}
        idPrefix="swapCoinConfirm"
        onCancel={clearCustomCoinPreview}
        onConfirm={confirmCustomCoin}
      />
      <div className="flex tradePaneTop">
        <TradeSelectionPicker
          selectedValue={tradeType}
          historyOptions={tradeHistoryTypes}
          allOptions={allTradeTypes.length ? allTradeTypes : tradeTypes}
          showMenu={showTradeTypeMenu}
          setShowMenu={setShowTradeTypeMenu}
          pickerRef={tradeTypePickerRef}
          pickerSortM={pickerSortM}
          setPickerSortM={setPickerSortM}
          sortKeyPrefix="tradePane"
          header="pane"
          className="tradeTypeCycle"
          menuClassName="tradeTypeMenu"
          cycleSize="nx"
          onSelect={onTradeTypeChange}
          onRemoveHistory={onTradeTypeHistoryRemove}
          onPrev={onPrevTradeType}
          onNext={onCycleTradeType}
        />
        <span>
          <span className="gray">DEX:</span>
          <TradeSelectionPicker
            selectedValue={defi}
            selectedLabel={defiE.label}
            historyOptions={dexHistoryOptions}
            allOptions={supportedDexOptions}
            showMenu={showDexMenu}
            setShowMenu={setShowDexMenu}
            pickerRef={dexPickerRef}
            pickerSortM={pickerSortM}
            setPickerSortM={setPickerSortM}
            sortKeyPrefix="swapDex"
            header="DEX"
            className="tradeDexCycle"
            menuClassName="tradeDexMenu"
            cycleSize="nx"
            getOptionLink={(option) => option?.url || getDexUrl(option?.value)}
            onSelect={(value) => {
              selectDex(value);
            }}
            onRemoveHistory={removeDexHistory}
            onPrev={prevDex}
            onNext={nextDex}
          />
        </span>
        <span className="gray">
          {defiE.bridge ? "bridge swap" : "same-chain swap"}
        </span>
      </div>

      <div className="swapRows">
        <div className="swapBox">
          <div className="swapAssetLine">
            <SwapChainSelect
              side="from"
              selectedChain={fromChain}
              addedChains={orderedSellChainNames}
              historyChains={fromChainHistoryOptions}
              allChainOptions={selectableSellChainNames}
              allChains={fromDiscoveryChainEntries}
              onSelect={selectFromChain}
              onPrev={prevFromChain}
              onNext={nextFromChain}
              onRemoveHistory={(value) => removeSwapChainHistory("from", value)}
              onFocusChain={() => fromChain && emitTradeChainSelect(fromChain)}
              showMenu={showFromChainMenu}
              setShowMenu={setShowFromChainMenu}
              pickerRef={fromChainPickerRef}
              hasDiscovery={swapHasDiscovery}
              swapSupportE={swapSupportE}
              defi={defi}
              defiLabel={defiE.label}
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
              selectDiscoveryChain={selectDiscoveryChain}
              showManualChain={showManualChain}
              retrySwapSupport={retrySwapSupport}
            />
            <SwapCoinSelect
              side="from"
              chain={fromChain}
              selectedCoin={fromCoin}
              addedCoins={fromCoins}
              historyCoins={fromCoinHistoryOptions}
              allCoinOptions={getChainCoins(fromChainE)}
              allTokens={fromSwapTokenEntries}
              tokenDiscoveryE={fromTokenDiscoveryE}
              strictSupport={!usesLazyTokenDiscovery}
              searchTerm={tokenSearchM.from}
              onSearchChange={(value) => changeTokenSearch("from", value)}
              onSearchSubmit={(e) => submitTokenSearch(e, "from", fromChain)}
              onRetryTokens={(e) => retryTokenDiscovery(e, "from", fromChain)}
              onOpen={() => openTokenDiscoveryMenu("from", fromChain)}
              showSearch={usesLazyTokenDiscovery}
              onSelect={selectFromCoin}
              onPrev={prevFromCoin}
              onNext={nextFromCoin}
              onRemoveHistory={(value) =>
                removeSwapCoinHistory("from", fromChain, value)
              }
              showMenu={showFromCoinMenu}
              setShowMenu={setShowFromCoinMenu}
              pickerRef={fromCoinPickerRef}
              hasDiscovery={swapHasCoinDiscovery}
              defi={defi}
              defiLabel={defiE.label}
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
              getSwapCoinBalance={getSwapCoinBalance}
              isDiscoveryCoinSupported={isDiscoveryCoinSupported}
              selectDiscoveryCoin={selectDiscoveryCoin}
              findLocalCoinForDiscovery={findLocalCoinForDiscovery}
              getTokenAddressKey={getTokenAddressKey}
              locallyAddedAddressM={locallyAddedAddressM}
              openDiscoveryCoinConfirm={openDiscoveryCoinConfirm}
              addingCoin={addingCoin}
            />
            <span className="swapCoinPrice">
              <span className="gray">{fmtPrice(fromPrice)}</span>
            </span>
            <button
              type="button"
              className="tradeSwitchButton"
              onClick={reverseRoute}
            >
              {"⇆"}
            </button>
          </div>
          <div className="swapBalanceLine">
            <button
              type="button"
              className="tradeTextButton swapAssetBalance"
              onClick={setMaxSell}
            >
              <span className="gray">{fromCoin}: </span>
              {fmt(fromBalance.balance)}
              {fromUsd > 0 && <span className="gray"> ${fmt(fromUsd, 2)}</span>}
            </button>
          </div>
          <div className="swapAmountLine">
            <span className="gray">end</span>
            <label className="switch small tradeEndSwitch">
              <input
                type="checkbox"
                checked={sellEndWith}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSellEndWith(checked);
                  if (checked) setBuyEndWith(false);
                }}
              />
              <span className="slider" />
            </label>
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              max={maxSell || 0}
              step="any"
              value={sellEndInputValue}
              size={qtyInputSize(sellEndInputValue)}
              style={qtyInputStyle(sellEndInputValue)}
              onChange={(e) => updateSellEnd(e.target.value)}
              onBlur={() => setSellEndDraft("")}
            />
            {fromPrice > 0 && (
              <span className="gray">${fmt(sellEndUsd, 2)}</span>
            )}
          </div>
          <div className="swapAmountLine">
            <span className="gray">sell</span>
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              max={maxSell || 0}
              step="any"
              value={fromQty}
              size={qtyInputSize(fromQty)}
              style={qtyInputStyle(fromQty)}
              onChange={(e) => updateSellQty(e.target.value)}
            />
            {fromPrice > 0 && (
              <span className="gray">${fmt(sellQtyUsd, 2)}</span>
            )}
          </div>
          {renderSwapControls({ showGas: true, side: "from", txLabel: "→" })}
        </div>

        <div className="swapMiddle">
          {canAutoApprove && (
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
            {swapRate > 0
              ? `1 ${fromCoin} = ${fmtRate(swapRate)} ${toCoin}`
              : "-"}
            {priceStatus && <span className="gray"> {priceStatus}</span>}
          </span>
        </div>

        <div className="swapBox">
          <div className="swapAssetLine">
            <SwapChainSelect
              side="to"
              selectedChain={toChain}
              addedChains={orderedChainNames}
              historyChains={toChainHistoryOptions}
              allChainOptions={selectableChainNames}
              allChains={toDiscoveryChainEntries}
              disabled={!defiE.bridge}
              title={defiE.bridge ? "" : "DEX swap uses the same chain"}
              onSelect={selectToChain}
              onPrev={prevToChain}
              onNext={nextToChain}
              onRemoveHistory={(value) => removeSwapChainHistory("to", value)}
              onFocusChain={() => toChain && emitTradeChainSelect(toChain)}
              showMenu={showToChainMenu}
              setShowMenu={setShowToChainMenu}
              pickerRef={toChainPickerRef}
              hasDiscovery={swapHasDiscovery}
              swapSupportE={swapSupportE}
              defi={defi}
              defiLabel={defiE.label}
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
              selectDiscoveryChain={selectDiscoveryChain}
              showManualChain={showManualChain}
              retrySwapSupport={retrySwapSupport}
            />
            <SwapCoinSelect
              side="to"
              chain={toChain}
              selectedCoin={toCoin}
              addedCoins={toCoins}
              historyCoins={toCoinHistoryOptions}
              allCoinOptions={getChainCoins(toChainE)}
              allTokens={toSwapTokenEntries}
              tokenDiscoveryE={toTokenDiscoveryE}
              strictSupport={!usesLazyTokenDiscovery}
              searchTerm={tokenSearchM.to}
              onSearchChange={(value) => changeTokenSearch("to", value)}
              onSearchSubmit={(e) => submitTokenSearch(e, "to", toChain)}
              onRetryTokens={(e) => retryTokenDiscovery(e, "to", toChain)}
              onOpen={() => openTokenDiscoveryMenu("to", toChain)}
              showSearch={usesLazyTokenDiscovery}
              onSelect={selectToCoin}
              onPrev={prevToCoin}
              onNext={nextToCoin}
              onRemoveHistory={(value) =>
                removeSwapCoinHistory("to", toChain, value)
              }
              showMenu={showToCoinMenu}
              setShowMenu={setShowToCoinMenu}
              pickerRef={toCoinPickerRef}
              hasDiscovery={swapHasCoinDiscovery}
              defi={defi}
              defiLabel={defiE.label}
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
              getSwapCoinBalance={getSwapCoinBalance}
              isDiscoveryCoinSupported={isDiscoveryCoinSupported}
              selectDiscoveryCoin={selectDiscoveryCoin}
              findLocalCoinForDiscovery={findLocalCoinForDiscovery}
              getTokenAddressKey={getTokenAddressKey}
              locallyAddedAddressM={locallyAddedAddressM}
              openDiscoveryCoinConfirm={openDiscoveryCoinConfirm}
              addingCoin={addingCoin}
            />
            <span className="swapCoinPrice">
              <span className="gray">{fmtPrice(toPrice)}</span>
            </span>
          </div>
          <div className="swapBalanceLine">
            <span className="swapAssetBalance">
              <span className="gray">{toCoin}:</span>
              {fmt(toBalance.balance)}
              {toUsd > 0 && <span className="gray"> ${fmt(toUsd, 2)}</span>}
            </span>
          </div>
          <div className="swapAmountLine">
            <span className="gray">end</span>
            <label className="switch small tradeEndSwitch">
              <input
                type="checkbox"
                checked={buyEndWith}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setBuyEndWith(checked);
                  if (checked) setSellEndWith(false);
                }}
              />
              <span className="slider" />
            </label>
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              max={maxBuyEnd || maxBuy || 0}
              step="any"
              value={buyEndInputValue}
              size={qtyInputSize(buyEndInputValue)}
              style={qtyInputStyle(buyEndInputValue)}
              onChange={(e) => updateBuyEnd(e.target.value)}
              onBlur={() => setBuyEndDraft("")}
            />
            {toPrice > 0 && <span className="gray">${fmt(buyEndUsd, 2)}</span>}
          </div>
          <div className="swapAmountLine">
            <span className="gray">sell</span>
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              max={maxBuy || 0}
              step="any"
              value={toQty}
              size={qtyInputSize(toQty)}
              style={qtyInputStyle(toQty)}
              onChange={(e) => updateBuyQty(e.target.value)}
            />
            {toPrice > 0 && <span className="gray">${fmt(buyQtyUsd, 2)}</span>}
          </div>
          {renderSwapControls({ side: "to", txLabel: "←" })}
        </div>
      </div>

      {isSolanaBridge && (
        <label className="swapRecipient" htmlFor="swapRecipient">
          <span className="gray">recipient:</span>
          <select
            value={recipientMode == "manual" ? "" : recipientWallet}
            onChange={(e) => selectRecipientWallet(e.target.value)}
          >
            <option value="">manual</option>
            {recipientWallets.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <input
            id="swapRecipient"
            type="text"
            value={recipient}
            onChange={(e) => changeRecipient(e.target.value)}
            onBlur={() => {
              if (recipientMode == "manual") loadRecipientBalance();
            }}
            onKeyDown={handleRecipientKeyDown}
            placeholder={toChain == "Solana" ? "Solana address" : "0x..."}
            style={{
              width: `${
                Math.max(recipient.length || 0, toChain == "Solana" ? 32 : 12) +
                2
              }ch`,
            }}
          />
          {recipientBalanceLoading && (
            <span className="yellow">loading balance...</span>
          )}
          {recipientBalanceError && (
            <span className="red">{recipientBalanceError}</span>
          )}
        </label>
      )}
      {swapResult && (
        <div className="swapResult">
          {swapResult.ok ? (
            <>
              <span className="gray">{swapResult.dex || defiE.label}:</span>{" "}
              {swapResult.txs?.map((tx, index) => (
                <SwapTxLink key={`${tx.walletLabel || ""}_${tx.hash}_${index}`} tx={tx} />
              ))}
              {!!swapResult.requestIds?.length && (
                <span className="gray">
                  {" "}
                  request: {swapResult.requestIds[0].slice(0, 10)}...
                </span>
              )}
              {swapResult.loopErrors?.map((entry) => (
                <span key={`${entry.walletLabel}_${entry.error}`} className="red">
                  {" "}
                  {entry.walletLabel}: {entry.error}
                </span>
              ))}
            </>
          ) : (
            <span className="red">{swapResult.error}</span>
          )}
        </div>
      )}
      </div>
    </ProtocolClient>
  );
}
