"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import { CycleButton } from "@/components/Shared";
import {
  SwapChainSelect,
  SwapCoinSelect,
  emptyTokenDiscoveryE,
  emptySwapSupportE,
  getDexLabel,
  getDiscoveryTokenDedupeKey,
  getDiscoveryTokenKey,
  getInitialSwapDex,
  getTokenDiscoveryKey,
  getSwapRouteCookie,
  isDexSupportedForChain,
  relayCurrencyCacheM,
  relayCurrencyPromiseM,
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
  getJupiterSupportedSwap,
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
import RelayClient from "./relay/Client";
import {
  buildUniswapSwapTxs,
  executeUniswapSwap,
  getUniswapSupportedSwap,
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
} from "../../browserEditorStorage";
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
  getInitialCookie,
  getInitialAutoApproval,
  getSelectedBalance as getWalletSelectedBalance,
  getTokenAddressKey,
  getTradeEndDiffQty,
  getTradeEndInputValue,
  getTradeModeCookie,
  getTradePickerButtonWidth,
  getWalletOptions,
  hasLoadedBalance,
  inputQty,
  limitQtyInputDecimals,
  nextValue,
  noDex,
  normalizeSignedQtyInput,
  priceKey,
  qtyInputSize,
  qtyInputStyle,
  rangeQtyInput,
  runTradeWalletLoop,
  sameAddress,
  sendBrowserTradeTx,
  shortAddress,
  signBrowserRelayItem,
  subtractTradeQtyText,
  SwapTxLink,
  tradeAutoApprovalCookie,
  tradeSwapDexCookie,
  tradeSwapFromChainCookie,
  tradeSwapFromCoinCookie,
  tradeSwapToChainCookie,
  tradeSwapToCoinCookie,
  toNum,
  useCustomCoinConfirm,
  useTradeFallbackPrice,
  walletBalancePatchEvent,
} from "../clientShared";

function getSwapSupport(defi = "") {
  if (defi == "relay") return getRelaySupportedBridge();
  if (defi == "jumper") return getJumperSupportedBridge();
  if (defi == "across") return getAcrossSupportedBridge();
  if (defi == "uniswap") return getUniswapSupportedSwap();
  if (defi == "jupiter") return getJupiterSupportedSwap();
  return Promise.resolve(emptySwapSupportE);
}

export default function SwapPanel({
  data = [],
  walletEntriesM = {},
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
  const initialSelectedFromChain = sellChainNames.includes(initialFromChain)
    ? initialFromChain
    : sellChainNames[0] || "";
  const initialSelectedToChain = chainNames.includes(initialToChain)
    ? initialToChain
    : chainNames[0] || "";
  const initialFromChainE =
    chainList.find((chainE) => chainE.chain == initialSelectedFromChain) ||
    chainList[0];
  const initialToChainE =
    chainList.find((chainE) => chainE.chain == initialSelectedToChain) ||
    initialFromChainE;
  const initialFromCoins = getChainCoins(initialFromChainE);
  const initialToCoins = getChainCoins(initialToChainE);
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
  const initialFromCoin = initialFromCoins.includes(initialSavedFromCoin)
    ? initialSavedFromCoin
    : initialFromCoins[0] || "";
  const initialToCoin = initialToCoins.includes(initialSavedToCoin)
    ? initialSavedToCoin
    : initialToCoins[0] || "";
  const [defi, setDefi] = useState(initialDefi);
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
  const [showFromChainMenu, setShowFromChainMenu] = useState(false);
  const [showToChainMenu, setShowToChainMenu] = useState(false);
  const [showFromCoinMenu, setShowFromCoinMenu] = useState(false);
  const [showToCoinMenu, setShowToCoinMenu] = useState(false);
  const [pickerSortM, setPickerSortM] = useState({});
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
  const [relayCurrencyM, setRelayCurrencyM] = useState({});
  const [relayTokenSearchM, setRelayTokenSearchM] = useState({
    from: "",
    to: "",
  });
  const fromChainE =
    chainList.find((chainE) => chainE.chain == fromChain) || chainList[0];
  const toChainE =
    chainList.find((chainE) => chainE.chain == toChain) || fromChainE;
  const availableDexOptions = useMemo(
    () =>
      dexOptions.filter((option) =>
        isDexSupportedForChain(option, fromChain),
      ),
    [fromChain],
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
  const fromCoins = useMemo(() => getChainCoins(fromChainE), [fromChainE]);
  const toCoins = useMemo(() => getChainCoins(toChainE), [toChainE]);
  const fromCoinInfo = fromChainE?.coinInfoM?.[fromCoin] || {};
  const fromCoinDecimals = Number.isInteger(fromCoinInfo.decimals)
    ? fromCoinInfo.decimals
    : 18;
  const toCoinInfo = toChainE?.coinInfoM?.[toCoin] || {};
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
  const sellSliderValue = Math.min(toNum(fromQty), maxSell);
  const fromPriceKey = priceKey(fromChain, fromCoin);
  const toPriceKey = priceKey(toChain, toCoin);
  const fromListPrice = toNum(fromBalance.price);
  const toListPrice = toNum(toBalance.price);
  const {
    fallbackPrice: fromFallbackPrice,
    loading: fromPriceLoading,
  } = useTradeFallbackPrice({
    cacheKey: fromPriceKey,
    chain: fromChain,
    coin: fromCoin,
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
      toNum(toQty) >= 0,
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
  const fromRelayCurrencyKey = getTokenDiscoveryKey(
    defi,
    fromChain,
    relayTokenSearchM.from,
  );
  const toRelayCurrencyKey = getTokenDiscoveryKey(
    defi,
    toChain,
    relayTokenSearchM.to,
  );
  const fromRelayCurrencyE =
    relayCurrencyM[fromRelayCurrencyKey] || emptyTokenDiscoveryE;
  const toRelayCurrencyE =
    relayCurrencyM[toRelayCurrencyKey] || emptyTokenDiscoveryE;
  const usesLazyTokenDiscovery =
    defi == "relay" || defi == "jumper" || defi == "jupiter";
  const fromTokenDiscoveryE =
    usesLazyTokenDiscovery
      ? fromRelayCurrencyE
      : { ...swapSupportE, tokens: fromDiscoveryTokenEntries };
  const toTokenDiscoveryE =
    usesLazyTokenDiscovery
      ? toRelayCurrencyE
      : { ...swapSupportE, tokens: toDiscoveryTokenEntries };
  const fromSwapTokenEntries =
    usesLazyTokenDiscovery
      ? fromRelayCurrencyE.tokens
      : fromDiscoveryTokenEntries;
  const toSwapTokenEntries =
    usesLazyTokenDiscovery ? toRelayCurrencyE.tokens : toDiscoveryTokenEntries;
  const fromChainButtonWidth = useMemo(
    () =>
      getTradePickerButtonWidth([fromChain, ...sellChainNames], {
        minLength: 5,
        maxLength: Infinity,
        offset: 2,
      }),
    [fromChain, sellChainNames],
  );
  const toChainButtonWidth = useMemo(
    () =>
      getTradePickerButtonWidth([toChain, ...chainNames], {
        minLength: 5,
        maxLength: Infinity,
        offset: 2,
      }),
    [chainNames, toChain],
  );
  const fromCoinButtonWidth = useMemo(
    () =>
      getTradePickerButtonWidth([fromCoin, ...fromCoins], {
        minLength: 5,
        maxLength: 18,
        offset: 2,
      }),
    [fromCoin, fromCoins],
  );
  const toCoinButtonWidth = useMemo(
    () =>
      getTradePickerButtonWidth([toCoin, ...toCoins], {
        minLength: 5,
        maxLength: 18,
        offset: 2,
      }),
    [toCoin, toCoins],
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
  }, [walletType]);

  useEffect(() => {
    const savedFromChain = getCookie(
      getSwapRouteCookie(tradeSwapFromChainCookie, walletType, defi),
    );
    if (sellChainNames.length) {
      setFromChain(
        sellChainNames.includes(savedFromChain)
          ? savedFromChain
          : sellChainNames[0],
      );
    }

    const savedToChain = getCookie(
      getSwapRouteCookie(tradeSwapToChainCookie, walletType, defi),
    );
    if (chainNames.length) {
      setToChain(
        chainNames.includes(savedToChain)
          ? savedToChain
          : chainNames[0],
      );
    }
  }, [chainNames, defi, sellChainNames, walletType]);

  useEffect(() => {
    if (!chainNames.length) return;
    if (sellChainNames.length && !sellChainNames.includes(fromChain)) {
      setFromChain(sellChainNames[0]);
    }
    if (!chainNames.includes(toChain)) setToChain(chainNames[0]);
  }, [chainNames, fromChain, sellChainNames, toChain]);

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
        fromChainPickerRef.current?.contains(target) ||
        toChainPickerRef.current?.contains(target) ||
        fromCoinPickerRef.current?.contains(target) ||
        toCoinPickerRef.current?.contains(target)
      ) {
        return;
      }

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
      const nextCoin = fromCoins.includes(savedCoin)
        ? savedCoin
        : fromCoins[0];
      if (nextCoin != fromCoin) setFromCoin(nextCoin);
    } else if (!fromCoins.length && fromCoin) {
      setFromCoin("");
    }
  }, [defi, fromChain, fromCoins, walletType]);

  useEffect(() => {
    if (toCoins.length) {
      const savedCoin = getCookie(
        getSwapRouteCookie(tradeSwapToCoinCookie, walletType, defi, toChain),
      );
      const nextCoin = toCoins.includes(savedCoin)
        ? savedCoin
        : toCoins[0];
      if (nextCoin != toCoin) setToCoin(nextCoin);
    } else if (!toCoins.length && toCoin) {
      setToCoin("");
    }
  }, [defi, toChain, toCoins, walletType]);

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
      setFromQty(getSellQty(toQty));
    } else {
      setToQty(inputQty(toNum(fromQty) * swapRate));
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

  function getRefreshTarget(chain = "", coin = "", address = "") {
    const chainE = chainList.find((entry) => entry.chain == chain);
    const coinE = chainE?.coinInfoM?.[coin];
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
    return !!(isSolanaBridge && recipient && toChain && toCoin);
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
        chain: toChain,
        coin: toCoin,
        address: cleanRecipient,
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
    { skipConfirm = false, loopRun = false } = {},
  ) {
    const tradeToast = createTradeToast(walletEntry, loopRun);

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
      const keyPrefix = walletEntry?.type == "solana" ? "pk_sol" : "pk";
      tradeToast.error(`private key missing: ${keyPrefix}_${walletEntry?.name || ""}`);
      return;
    }
    if (defi == "jupiter" && (fromChain != "Solana" || toChain != "Solana")) {
      tradeToast.error("Jupiter is for Solana swaps only");
      return;
    }
    if (fromChain == "Solana" && !["jupiter", "jumper", "relay", "across"].includes(defi)) {
      tradeToast.error(`${defiE.label} is not available for Solana-origin swaps`);
      return;
    }
    if (defi == "across" && fromChain == toChain) {
      tradeToast.error("Across is for cross-chain swaps; choose a different buy chain");
      return;
    }
    if (fromChain == toChain && fromCoin == toCoin) {
      tradeToast.error("sell coin and buy coin are the same");
      return;
    }
    let amount = "0";
    try {
      amount = await getSwapSellAmountForWallet(walletEntry);
    } catch (e) {
      tradeToast.error(e?.message || "sell qty query failed");
      return;
    }

    if (toNum(amount) < 0) {
      tradeToast.error("sell qty cannot be negative; switch sell/buy coins");
      return;
    }
    if (!toNum(amount)) {
      tradeToast.error("sell qty is 0");
      return;
    }

    const autoApprovalAmount = autoApproval ? amount : "";
    const getApprovalAmount = (approvalNeeded) => {
      if (!approvalNeeded) return "";
      return (
        autoApprovalAmount ||
        window.prompt(
          `Approval needed for ${fromCoin}.\n\nEnter approval qty.\nSell qty: ${amount}`,
          amount,
        )
      );
    };
    const toAddress = isSolanaBridge ? recipient : walletEntry.address;
    if (!useBrowserWallet && !skipConfirm) {
      const ok = window.confirm(
        `Execute ${defiE.label} swap?\n\nwallet: ${
          walletEntry.label || walletEntry.name || swapWalletLabel
        }\nsell: ${amount} ${fromCoin} on ${fromChain}\nbuy: ${toCoin} on ${toChain}\nrecipient: ${toAddress}`,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
            amount,
          });

          tradeToast.loading("Jupiter: submitting swap...", {
            id: toastId,
          });
          res = await executeJupiterSwap({
            walletName: walletEntry.name,
            walletAddress: walletEntry.address,
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            fromChain,
            toChain,
            fromCoin,
            toCoin,
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
            chain: fromChain,
            fromCoin,
            toCoin,
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
            chain: fromChain,
            fromCoin,
            toCoin,
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
            chain: fromChain,
            fromCoin,
            toCoin,
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
          getRefreshTarget(fromChain, fromCoin, walletEntry.address),
          getRefreshTarget(toChain, toCoin, toAddress),
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

  async function runSwap() {
    const result = await runTradeWalletLoop({
      loopWallets,
      getLoopWalletEntries,
      selectedWalletEntry,
      actionLabel: `${defiE.label} swap ${
        sellEndWith
          ? `end ${formatTradeQty(sellEndInputValue, fromCoinDecimals)}`
          : formatTradeQty(fromQty, fromCoinDecimals)
      } ${fromCoin}`,
      runOne: runSwapForWallet,
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
    );
    setQtyInputSide("sell");
    setFromQty(qty);
    setToQty(getBuyQty(qty));
  }

  function updateBuyQty(value) {
    const qty = normalizeSignedQtyInput(
      value,
      maxBuyInput,
      maxBuy,
      toCoinDecimals,
    );
    setQtyInputSide("buy");
    setToQty(qty);
    setFromQty(getSellQty(qty));
  }

  function updateSellEnd(value) {
    const endQty = limitQtyInputDecimals(cleanTradeInput(value), fromCoinDecimals);
    setSellEndDraft(endQty);
    updateSellQty(getTradeEndDiffQty(maxSellQty, endQty, fromCoinDecimals));
  }

  function updateBuyEnd(value) {
    const endQty = limitQtyInputDecimals(cleanTradeInput(value), toCoinDecimals);
    setBuyEndDraft(endQty);
    updateBuyQty(
      formatComputedTradeQty(
        subtractTradeQtyText(endQty, maxBuyQty, toCoinDecimals),
        toCoinDecimals,
      ),
    );
  }

  async function getSwapSellAmountForWallet(walletEntry = selectedWalletEntry) {
    if (!sellEndWith && !buyEndWith) {
      return formatTradeQty(fromQty, fromCoinDecimals);
    }

    if (sellEndWith) {
      const targetEnd = formatTradeQty(sellEndInputValue, fromCoinDecimals);
      if (!walletEntry?.address) return "0";
      if (sameAddress(walletEntry.address, selectedWalletEntry?.address)) {
        return getTradeEndDiffQty(maxSellQty, targetEnd, fromCoinDecimals);
      }

      const balance = await getTradeCoinBalance({
        chain: fromChain,
        coin: fromCoin,
        address: walletEntry.address,
      });

      return formatComputedTradeQty(
        subtractTradeQtyText(
          formatTradeQty(balance?.balance, fromCoinDecimals),
          targetEnd,
          fromCoinDecimals,
        ),
        fromCoinDecimals,
      );
    }

    const buyAmount = formatComputedTradeQty(
      subtractTradeQtyText(buyEndInputValue, maxBuyQty, toCoinDecimals),
      toCoinDecimals,
    );
    return getSellQty(buyAmount);
  }

  function nextFromChain() {
    const next = nextValue(sellChainNames, fromChain);
    if (next) selectFromChain(next);
  }

  function nextToChain() {
    const next = nextValue(chainNames, toChain);
    if (next) selectToChain(next);
  }

  function requestRelayCurrencies(chain = "", term = "", { force = false } = {}) {
    const currentDefi = defi;
    if (!chain || !["relay", "jumper", "jupiter"].includes(currentDefi)) return;
    const key = getTokenDiscoveryKey(currentDefi, chain, term);
    const current = relayCurrencyM[key] || emptyTokenDiscoveryE;
    if (!force && (current.loading || current.loaded)) return;

    if (!force && relayCurrencyCacheM[key]) {
      setRelayCurrencyM((currencyM) => ({
        ...currencyM,
        [key]: relayCurrencyCacheM[key],
      }));
      return;
    }

    setRelayCurrencyM((currencyM) => ({
      ...currencyM,
      [key]: {
        ...current,
        loading: true,
        loaded: false,
        error: "",
      },
    }));

    if (!force && relayCurrencyPromiseM[key]) {
      relayCurrencyPromiseM[key]
        .then((entry) => {
          setRelayCurrencyM((currencyM) => ({
            ...currencyM,
            [key]: entry,
          }));
        })
        .catch((e) => {
          setRelayCurrencyM((currencyM) => ({
            ...currencyM,
            [key]: {
              ...(currencyM[key] || emptyTokenDiscoveryE),
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
        ? getJupiterTokenDiscovery({ chain, term })
        : currentDefi == "jumper"
          ? getJumperTokenDiscovery({ chain, term })
        : getRelayCurrencyDiscovery({ chain, term });

    relayCurrencyPromiseM[key] = discoveryRequest
      .then((res) => {
        const entry = {
          tokens: Array.isArray(res?.tokens) ? res.tokens : [],
          loading: false,
          loaded: true,
          error: "",
        };
        relayCurrencyCacheM[key] = entry;
        setRelayCurrencyM((currencyM) => ({
          ...currencyM,
          [key]: entry,
        }));
        return entry;
      })
      .catch((e) => {
        delete relayCurrencyPromiseM[key];
        const entry = {
          tokens: [],
          loading: false,
          loaded: true,
          error:
            e?.message || `${getDexLabel(currentDefi)} token discovery failed`,
        };
        setRelayCurrencyM((currencyM) => ({
          ...currencyM,
          [key]: entry,
        }));
        return entry;
      });
  }

  function changeRelayTokenSearch(side = "from", value = "") {
    setRelayTokenSearchM((searchM) => ({
      ...searchM,
      [side]: value,
    }));
  }

  function submitRelayTokenSearch(e, side = "from", chain = "") {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    requestRelayCurrencies(chain, relayTokenSearchM[side] || "");
  }

  function retryRelayCurrencies(e, side = "from", chain = "") {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const term = relayTokenSearchM[side] || "";
    const key = getTokenDiscoveryKey(defi, chain, term);
    delete relayCurrencyCacheM[key];
    delete relayCurrencyPromiseM[key];
    setRelayCurrencyM((currencyM) => ({
      ...currencyM,
      [key]: emptyTokenDiscoveryE,
    }));
    requestRelayCurrencies(chain, term, { force: true });
  }

  function openRelayCoinMenu(side = "from", chain = "") {
    if (!["relay", "jumper", "jupiter"].includes(defi)) return;
    requestRelayCurrencies(chain, relayTokenSearchM[side] || "");
  }

  function showManualChain(entry = {}) {
    const name = entry.name || entry.chain || "this chain";
    toast(`${name}: add chain manually in sets.js and data/coins first`);
  }

  function showUnsupportedChain(chain = "") {
    toast(`${chain}: ${defiE.label || "DEX"} does not support this chain`);
  }

  function selectDiscoveryChain(entry = {}, side = "from") {
    const chain = entry.chain || "";
    const addedChains = side == "from" ? sellChainNames : chainNames;
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

  function showUnsupportedCoin(chain = "", coin = "") {
    toast(`${chain} ${coin}: ${defiE.label || "DEX"} does not support this coin`);
  }

  function selectDiscoveryCoin(entry = {}, side = "from") {
    const chain = side == "from" ? fromChain : toChain;
    const localCoin = findLocalCoinForDiscovery(chain, entry);
    if (!localCoin) {
      toast(`${chain} ${entry.symbol || "token"}: add coin first`);
      return;
    }

    if (side == "from") {
      selectFromCoin(localCoin);
      setShowFromCoinMenu(false);
    } else {
      selectToCoin(localCoin);
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

  function selectFromChain(chain) {
    setFromChain(chain);
    saveSwapChainCookie(tradeSwapFromChainCookie, chain);
    emitTradeChainSelect(chain);
  }

  function selectToChain(chain) {
    setToChain(chain);
    saveSwapChainCookie(tradeSwapToChainCookie, chain);
    emitTradeChainSelect(chain);
  }

  function saveSwapChainCookie(base, chain) {
    if (!defi || !chain) return;
    setCookie(getSwapRouteCookie(base, walletType, defi), chain, {
      maxAge: cookieMaxAge,
    });
  }

  function nextFromCoin() {
    const next = nextValue(fromCoins, fromCoin);
    if (next) selectFromCoin(next);
  }

  function nextToCoin() {
    const next = nextValue(toCoins, toCoin);
    if (next) selectToCoin(next);
  }

  function selectFromCoin(coin) {
    setFromCoin(coin);
    saveSwapCoinCookie(tradeSwapFromCoinCookie, fromChain, coin);
  }

  function selectToCoin(coin) {
    setToCoin(coin);
    saveSwapCoinCookie(tradeSwapToCoinCookie, toChain, coin);
  }

  function saveSwapCoinCookie(base, chain, coin) {
    if (!defi || !chain || !coin) return;
    setCookie(getSwapRouteCookie(base, walletType, defi, chain), coin, {
      maxAge: cookieMaxAge,
    });
  }

  function nextDex() {
    const next = nextValue(
      availableDexOptions.map((option) => option.value),
      defi,
    );
    if (next) selectDex(next);
  }

  function selectDex(value) {
    setDefi(value);
    if (!value) return;
    setCookie(getTradeModeCookie(tradeSwapDexCookie, walletType), value, {
      maxAge: cookieMaxAge,
    });
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
        <label htmlFor="tradeTypeSwap">
          <select
            id="tradeTypeSwap"
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
        <label htmlFor="swapDefi">
          <span className="gray">DEX:</span>
          <select
            id="swapDefi"
            value={availableDexOptions.length ? defi : ""}
            onChange={(e) => selectDex(e.target.value)}
            disabled={!availableDexOptions.length}
          >
            {!availableDexOptions.length && <option value="">no DEX</option>}
            {availableDexOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <CycleButton
            size="nx"
            onClick={nextDex}
            disabled={availableDexOptions.length < 2}
          />
        </label>
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
              addedChains={sellChainNames}
              allChains={fromDiscoveryChainEntries}
              buttonWidth={fromChainButtonWidth}
              onSelect={selectFromChain}
              onNext={nextFromChain}
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
              showUnsupportedChain={showUnsupportedChain}
              showManualChain={showManualChain}
              retrySwapSupport={retrySwapSupport}
            />
            <SwapCoinSelect
              side="from"
              chain={fromChain}
              selectedCoin={fromCoin}
              addedCoins={fromCoins}
              allTokens={fromSwapTokenEntries}
              tokenDiscoveryE={fromTokenDiscoveryE}
              strictSupport={!usesLazyTokenDiscovery}
              searchTerm={relayTokenSearchM.from}
              onSearchChange={(value) => changeRelayTokenSearch("from", value)}
              onSearchSubmit={(e) => submitRelayTokenSearch(e, "from", fromChain)}
              onRetryTokens={(e) => retryRelayCurrencies(e, "from", fromChain)}
              onOpen={() => openRelayCoinMenu("from", fromChain)}
              showSearch={usesLazyTokenDiscovery}
              buttonWidth={fromCoinButtonWidth}
              onSelect={selectFromCoin}
              onNext={nextFromCoin}
              showMenu={showFromCoinMenu}
              setShowMenu={setShowFromCoinMenu}
              pickerRef={fromCoinPickerRef}
              hasDiscovery={swapHasDiscovery}
              defi={defi}
              defiLabel={defiE.label}
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
              getSwapCoinBalance={getSwapCoinBalance}
              isDiscoveryCoinSupported={isDiscoveryCoinSupported}
              selectDiscoveryCoin={selectDiscoveryCoin}
              showUnsupportedCoin={showUnsupportedCoin}
              findLocalCoinForDiscovery={findLocalCoinForDiscovery}
              getTokenAddressKey={getTokenAddressKey}
              locallyAddedAddressM={locallyAddedAddressM}
              openDiscoveryCoinConfirm={openDiscoveryCoinConfirm}
              addingCoin={addingCoin}
              getDiscoveryTokenKey={getDiscoveryTokenKey}
            />
            <span className="swapCoinPrice">
              <span className="gray">{fmtPrice(fromPrice)}</span>
            </span>
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
          <input
            className="swapMiddleRange"
            type="range"
            min="0"
            max={maxSell || 0}
            step="any"
            value={sellSliderValue}
            onChange={(e) =>
              updateSellQty(
                rangeQtyInput(
                  e.target.value,
                  maxSell,
                  maxSellQty,
                  fromCoinDecimals,
                ),
              )
            }
            disabled={!maxSell}
          />
          <button
            type="button"
            className="btn small bgGray"
            onClick={setMaxSell}
            disabled={!maxSell}
          >
            max
          </button>
          <button
            type="button"
            className="btn swapActionButton bgCyan"
            onClick={runSwap}
            disabled={swapPending || !swapCanExecute}
          >
            {swapPending ? "SWAPPING" : "SWAP"}
          </button>
          <button
            type="button"
            className="swapDownButton"
            onClick={reverseRoute}
          >
            {"→"}
          </button>
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
              addedChains={chainNames}
              allChains={toDiscoveryChainEntries}
              disabled={!defiE.bridge}
              buttonWidth={toChainButtonWidth}
              title={defiE.bridge ? "" : "DEX swap uses the same chain"}
              onSelect={selectToChain}
              onNext={nextToChain}
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
              showUnsupportedChain={showUnsupportedChain}
              showManualChain={showManualChain}
              retrySwapSupport={retrySwapSupport}
            />
            <SwapCoinSelect
              side="to"
              chain={toChain}
              selectedCoin={toCoin}
              addedCoins={toCoins}
              allTokens={toSwapTokenEntries}
              tokenDiscoveryE={toTokenDiscoveryE}
              strictSupport={!usesLazyTokenDiscovery}
              searchTerm={relayTokenSearchM.to}
              onSearchChange={(value) => changeRelayTokenSearch("to", value)}
              onSearchSubmit={(e) => submitRelayTokenSearch(e, "to", toChain)}
              onRetryTokens={(e) => retryRelayCurrencies(e, "to", toChain)}
              onOpen={() => openRelayCoinMenu("to", toChain)}
              showSearch={usesLazyTokenDiscovery}
              buttonWidth={toCoinButtonWidth}
              onSelect={selectToCoin}
              onNext={nextToCoin}
              showMenu={showToCoinMenu}
              setShowMenu={setShowToCoinMenu}
              pickerRef={toCoinPickerRef}
              hasDiscovery={swapHasDiscovery}
              defi={defi}
              defiLabel={defiE.label}
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
              getSwapCoinBalance={getSwapCoinBalance}
              isDiscoveryCoinSupported={isDiscoveryCoinSupported}
              selectDiscoveryCoin={selectDiscoveryCoin}
              showUnsupportedCoin={showUnsupportedCoin}
              findLocalCoinForDiscovery={findLocalCoinForDiscovery}
              getTokenAddressKey={getTokenAddressKey}
              locallyAddedAddressM={locallyAddedAddressM}
              openDiscoveryCoinConfirm={openDiscoveryCoinConfirm}
              addingCoin={addingCoin}
              getDiscoveryTokenKey={getDiscoveryTokenKey}
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
            <span className="gray">buy</span>
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              max={maxBuyInput || 0}
              step="any"
              value={toQty}
              size={qtyInputSize(toQty)}
              style={qtyInputStyle(toQty)}
              placeholder="quote"
              onChange={(e) => updateBuyQty(e.target.value)}
            />
            {toPrice > 0 && <span className="gray">${fmt(buyQtyUsd, 2)}</span>}
          </div>
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
