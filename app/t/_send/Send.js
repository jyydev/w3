"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import { pc } from "@/fn/basic";
import { CycleButtonPair } from "@/components/Shared";
import {
  encodeGroupedSelectionOrder,
  encodeSelectionOrder,
  getGroupedSelectionItems,
  normalizeSelectionOrder,
  parseGroupedSelectionOrder,
  parseSelectionOrder,
  removeSelectionValue,
  rememberGroupedSelectionValue,
  rememberSelectionValue,
  sortByGroupedSelectionOrder,
  sortBySelectionOrder,
} from "@/fn/selectionOrder";
import {
  buildSendTx,
  executeSend,
  getTradeCoinBalance,
  getTradeCoinPrice,
} from "./sv";
import {
  PickerSortHeader,
  cycleWalletSelection,
  getBalanceKey,
  getChainCoinCookie,
  getInitialCookie,
  getSendSelectedBalance,
  hasTableBalance,
  shortTail,
  walletBalancePatchEvent,
} from "./Client";
import {
  cleanTradeInput,
  cookieMaxAge,
  createTradeLoopResult,
  createTradeToast,
  emitTradeChainSelect,
  fmt,
  fmtPrice,
  formatComputedTradeQty,
  formatTradeQty,
  getChainCoins,
  getQtyDecimals,
  getTradeEndDiffQty,
  getTradeEndInputValue,
  getTradeModeCookie,
  getTradeWalletLabel,
  getHistoryCycleValues,
  getWalletOptions,
  limitQtyInputDecimals,
  nextValue,
  normalizeSignedQtyInput,
  prevValue,
  qtyInputSize,
  qtyInputStyle,
  rangeQtyInput,
  runTradeWalletLoop,
  sameAddress,
  sendBrowserTradeTx,
  shortAddress,
  subtractTradeQtyText,
  SwapTxLink,
  TradePickerColumn,
  TradePickerMenu,
  TradeSelectionPicker,
  TradePickerTable,
  sortTradePickerRows,
  tradeSendChainCookie,
  tradeSendChainOrderCookie,
  tradeSendCoinCookie,
  tradeSendCoinOrderCookie,
  tradeSendToWalletCookie,
  tradeSendToWalletOrderCookie,
  toNum,
  useTradeFallbackPrice,
} from "../clientShared";

const sendToWalletOrderCap = 10;

export default function SendPanel({
  data = [],
  walletEntriesM = {},
  walletPkM = {},
  wallets = [],
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
  onFromWalletChange = () => {},
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
    () =>
      chainList
        .map((chainE) => chainE.chain)
        .filter((chain) =>
          walletType == "solana" ? chain == "Solana" : chain != "Solana",
        ),
    [chainList, walletType],
  );
  const initialChain = getInitialCookie(
    initialCookieM,
    getTradeModeCookie(tradeSendChainCookie, walletType),
  );
  const initialChainOrder = normalizeSelectionOrder(
    parseSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getTradeModeCookie(tradeSendChainOrderCookie, walletType),
      ),
    ),
    chainNames,
  );
  const initialOrderedChainNames = sortBySelectionOrder(
    chainNames,
    initialChainOrder,
  );
  const initialSelectedChain = initialOrderedChainNames.includes(initialChain)
    ? initialChain
    : initialOrderedChainNames[0] || "";
  const initialChainE =
    chainList.find((entry) => entry.chain == initialSelectedChain) ||
    chainList[0] ||
    {};
  const initialCoins = getChainCoins(initialChainE);
  const initialCoinOrder = parseGroupedSelectionOrder(
    getInitialCookie(
      initialCookieM,
      getTradeModeCookie(tradeSendCoinOrderCookie, walletType),
    ),
  );
  const initialOrderedCoins = sortByGroupedSelectionOrder(
    initialCoins,
    initialCoinOrder,
    initialSelectedChain,
  );
  const initialSavedCoin =
    getInitialCookie(
      initialCookieM,
      getChainCoinCookie(tradeSendCoinCookie, walletType, initialSelectedChain),
    ) || "";
  const initialCoin = initialOrderedCoins.includes(initialSavedCoin)
    ? initialSavedCoin
    : initialOrderedCoins[0] || "";
  const initialToWalletOrder = parseSelectionOrder(
    getInitialCookie(
      initialCookieM,
      getTradeModeCookie(tradeSendToWalletOrderCookie, walletType),
    ),
  );
  const [chainOrder, setChainOrder] = useState(initialChainOrder);
  const [coinOrder, setCoinOrder] = useState(initialCoinOrder);
  const [toWalletOrder, setToWalletOrder] = useState(initialToWalletOrder);
  const [chain, setChain] = useState(initialSelectedChain);
  const [coin, setCoin] = useState(initialCoin);
  const [fromQty, setFromQty] = useState("0");
  const [toQty, setToQty] = useState("0");
  const [fromEndDraft, setFromEndDraft] = useState("");
  const [toEndDraft, setToEndDraft] = useState("");
  const [fromEndWith, setFromEndWith] = useState(false);
  const [toEndWith, setToEndWith] = useState(false);
  const [fallbackBalanceM, setFallbackBalanceM] = useState({});
  const [balanceLoadingM, setBalanceLoadingM] = useState({});
  const [balanceErrorM, setBalanceErrorM] = useState({});
  const [sendPending, setSendPending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [showTradeTypeMenu, setShowTradeTypeMenu] = useState(false);
  const [showChainMenu, setShowChainMenu] = useState(false);
  const [showCoinMenu, setShowCoinMenu] = useState(false);
  const [showToWalletMenu, setShowToWalletMenu] = useState(false);
  const [simplePickerSortM, setSimplePickerSortM] = useState({});
  const [coinSort, setCoinSort] = useState("");
  const [copiedAddress, setCopiedAddress] = useState("");
  const tradeTypePickerRef = useRef(null);
  const chainPickerRef = useRef(null);
  const coinPickerRef = useRef(null);
  const toWalletPickerRef = useRef(null);
  const [fromWallet, setFromWallet] = useState(
    selectedWalletEntry?.value || "",
  );
  const [toWallet, setToWallet] = useState(
    getInitialCookie(
      initialCookieM,
      getTradeModeCookie(tradeSendToWalletCookie, walletType),
    ) || "",
  );
  const orderedChainNames = useMemo(
    () => sortBySelectionOrder(chainNames, chainOrder),
    [chainNames, chainOrder],
  );
  const chainHistoryOptions = useMemo(
    () => chainOrder.filter((chainName) => chainNames.includes(chainName)),
    [chainNames, chainOrder],
  );
  const chainE =
    chainList.find((entry) => entry.chain == chain) || chainList[0] || {};
  const coins = useMemo(
    () =>
      sortByGroupedSelectionOrder(
        getChainCoins(chainE),
        coinOrder,
        chain,
      ),
    [chain, chainE, coinOrder],
  );
  const coinHistoryOptions = useMemo(
    () =>
      getGroupedSelectionItems(coinOrder, chain).filter((coinName) =>
        coins.includes(coinName),
      ),
    [chain, coinOrder, coins],
  );
  const fromWallets = useMemo(
    () => wallets.filter((entry) => entry?.address),
    [wallets],
  );
  const toWallets = useMemo(
    () =>
      getWalletOptions(walletEntriesM[walletType] || [], walletPkM, walletType),
    [walletEntriesM, walletPkM, walletType],
  );
  const currentToWallets = fromWallets;
  const allToWalletEntries = useMemo(
    () => [...currentToWallets, ...toWallets],
    [currentToWallets, toWallets],
  );
  const allToWalletValues = useMemo(
    () =>
      Array.from(
        new Set(
          allToWalletEntries
            .map((entry) => entry?.value)
            .filter(Boolean),
        ),
      ),
    [allToWalletEntries],
  );
  const toWalletHistoryValues = useMemo(
    () =>
      normalizeSelectionOrder(
        toWalletOrder,
        allToWalletValues,
        sendToWalletOrderCap,
      ),
    [allToWalletValues, toWalletOrder],
  );
  const toWalletHistoryEntries = useMemo(
    () =>
      toWalletHistoryValues
        .map((value) =>
          allToWalletEntries.find((entry) => entry?.value == value),
        )
        .filter(Boolean),
    [allToWalletEntries, toWalletHistoryValues],
  );
  const fromEntry =
    fromWallets.find((entry) => entry.value == fromWallet) ||
    selectedWalletEntry ||
    fromWallets[0];
  const toEntry =
    toWallets.find((entry) => entry.value == toWallet) ||
    currentToWallets.find((entry) => entry.value == toWallet) ||
    toWallets[0];
  const loadedToEntry = currentToWallets.find(
    (entry) =>
      entry.value == toWallet || sameAddress(entry.address, toEntry?.address),
  );
  const rightSenderEntry =
    toEntry?.hasPrivateKey || toEntry?.isBrowserWallet || !loadedToEntry
      ? toEntry
      : loadedToEntry;
  const canSwitchWallets = !!loadedToEntry && !!fromEntry?.address;
  const fromBalanceKey = getBalanceKey(chain, coin, fromEntry?.address);
  const toBalanceKey = getBalanceKey(chain, coin, toEntry?.address);
  const fromHasTableBalance = hasTableBalance(chainE, coin, fromEntry);
  const toHasTableBalance = hasTableBalance(chainE, coin, toEntry);
  const fromBalance = getSendSelectedBalance(
    chainE,
    coin,
    fromEntry,
    fallbackBalanceM,
  );
  const toBalance = getSendSelectedBalance(
    chainE,
    coin,
    toEntry,
    fallbackBalanceM,
  );
  const fromBalanceLoading =
    !!balanceLoadingM[fromBalanceKey] && !fromHasTableBalance;
  const toBalanceLoading =
    !!balanceLoadingM[toBalanceKey] && !toHasTableBalance;
  const fromBalanceError = balanceErrorM[fromBalanceKey] || "";
  const toBalanceError = balanceErrorM[toBalanceKey] || "";
  const coinDecimals = getQtyDecimals(chainE?.coinInfoM?.[coin]?.decimals);
  const maxSend = toNum(fromBalance.balance);
  const currentToBal = toNum(toBalance.balance);
  const maxSendQty = formatTradeQty(fromBalance.balance, coinDecimals);
  const currentToQty = formatTradeQty(toBalance.balance, coinDecimals);
  const fromSendQty = toNum(fromQty);
  const toSendQty = toNum(toQty);
  const fromSliderValue = Math.max(0, Math.min(fromSendQty, maxSend));
  const toSliderValue = Math.max(0, Math.min(toSendQty, currentToBal));
  const listPrice = toNum(fromBalance.price || toBalance.price);
  const { fallbackPrice, loading: priceLoading } = useTradeFallbackPrice({
    cacheKey: `${chain}:${coin}`,
    chain,
    coin,
    listPrice,
    getPrice: getTradeCoinPrice,
  });
  const price = listPrice || toNum(fallbackPrice);
  const fromUsd = price ? maxSend * price : 0;
  const toUsd = price ? currentToBal * price : 0;
  const fromEndInputValue =
    fromEndDraft ||
    getTradeEndInputValue(
      maxSendQty,
      fromQty,
      toNum(fromQty) < 0,
      coinDecimals,
    );
  const toEndInputValue =
    toEndDraft ||
    getTradeEndInputValue(
      currentToQty,
      toQty,
      toNum(toQty) < 0,
      coinDecimals,
    );
  const fromQtyUsd = price ? fromSendQty * price : 0;
  const toQtyUsd = price ? toSendQty * price : 0;
  const fromEndUsd = price ? toNum(fromEndInputValue) * price : 0;
  const toEndUsd = price ? toNum(toEndInputValue) * price : 0;
  const priceStatus = priceLoading
    ? "querying price..."
    : coin && listPrice <= 0 && fallbackPrice === 0
      ? `price n/a: ${coin}`
      : "";

  function getSelectedCoinE() {
    const coinE = chainE?.coinInfoM?.[coin];
    if (!coinE) return undefined;

    return {
      address: coinE.address || "",
      decimals: coinE.decimals,
      native: !!coinE.native,
    };
  }

  function getSendRefreshTarget(address = "") {
    const coinE = getSelectedCoinE();

    return {
      chain,
      coin,
      address,
      ...(coinE ? { coinE } : {}),
    };
  }

  useEffect(() => {
    const savedChain = getCookie(
      getTradeModeCookie(tradeSendChainCookie, walletType),
    );
    const nextChainOrder = normalizeSelectionOrder(
      parseSelectionOrder(
        getCookie(getTradeModeCookie(tradeSendChainOrderCookie, walletType)),
      ),
      chainNames,
    );
    const nextChainNames = sortBySelectionOrder(chainNames, nextChainOrder);
    setChainOrder(nextChainOrder);
    setCoinOrder(
      parseGroupedSelectionOrder(
        getCookie(getTradeModeCookie(tradeSendCoinOrderCookie, walletType)),
      ),
    );
    if (savedChain && nextChainNames.includes(savedChain)) {
      setChain(savedChain);
    }
  }, [chainNames, walletType]);

  useEffect(() => {
    if (orderedChainNames.length && !orderedChainNames.includes(chain)) {
      setChain(orderedChainNames[0]);
    }
  }, [chain, orderedChainNames]);

  useEffect(() => {
    if (coins.length) {
      const savedCoin = getCookie(
        getChainCoinCookie(tradeSendCoinCookie, walletType, chain),
      );
      const nextCoin = coins.includes(savedCoin)
        ? savedCoin
        : coins.includes(coin)
          ? coin
          : coins[0];
      if (nextCoin != coin) setCoin(nextCoin);
    } else if (!coins.length && coin) {
      setCoin("");
    }
  }, [chain, coins, walletType]);

  useEffect(() => {
    if (selectedWalletEntry?.value) setFromWallet(selectedWalletEntry.value);
  }, [selectedWalletEntry?.value]);

  useEffect(() => {
    if (!fromWallets.length) return;
    if (!fromWallets.some((entry) => entry.value == fromWallet)) {
      selectFromWallet(fromWallets[0].value);
    }
  }, [fromWallet, fromWallets]);

  useEffect(() => {
    if (!toWallets.length) {
      setToWallet("");
      return;
    }
    if (
      toWallets.some((entry) => entry.value == toWallet) &&
      !sameAddress(toEntry?.address, fromEntry?.address)
    ) {
      return;
    }

    const savedToWallet = getCookie(
      getTradeModeCookie(tradeSendToWalletCookie, walletType),
    );
    const savedEntry = allToWalletEntries.find(
      (entry) =>
        entry.value == savedToWallet &&
        !sameAddress(entry.address, fromEntry?.address),
    );
    const next = savedEntry || getDefaultToWallet();
    setToWallet(next?.value || "");
  }, [
    currentToWallets,
    allToWalletEntries,
    fromEntry?.address,
    toEntry?.address,
    toWallet,
    toWallets,
    walletType,
  ]);

  useEffect(() => {
    const nextOrder = normalizeSelectionOrder(
      toWalletOrder,
      allToWalletValues,
      sendToWalletOrderCap,
    );
    if (encodeSelectionOrder(nextOrder) == encodeSelectionOrder(toWalletOrder)) {
      return;
    }

    setToWalletOrder(nextOrder);
  }, [allToWalletValues, toWalletOrder]);

  function getDefaultToWallet() {
    return (
      currentToWallets.find(
        (entry) => !sameAddress(entry.address, fromEntry?.address),
      ) || toWallets[0]
    );
  }

  useEffect(() => {
    setFromQty("0");
    setToQty("0");
    setFromEndDraft("");
    setToEndDraft("");
  }, [chain, coin, fromEntry?.value, toEntry?.value]);

  useEffect(() => {
    function closeMenus(e) {
      if (!tradeTypePickerRef.current?.contains(e.target)) {
        setShowTradeTypeMenu(false);
      }
      if (!chainPickerRef.current?.contains(e.target)) {
        setShowChainMenu(false);
      }
      if (!coinPickerRef.current?.contains(e.target)) {
        setShowCoinMenu(false);
      }
      if (!toWalletPickerRef.current?.contains(e.target)) {
        setShowToWalletMenu(false);
      }
    }

    document.addEventListener("mousedown", closeMenus);

    return () => {
      document.removeEventListener("mousedown", closeMenus);
    };
  }, []);

  useEffect(() => {
    if (
      !chain ||
      !coin ||
      !fromEntry?.address ||
      fromHasTableBalance ||
      fallbackBalanceM[fromBalanceKey] ||
      balanceLoadingM[fromBalanceKey] ||
      balanceErrorM[fromBalanceKey]
    ) {
      return;
    }

    let cancelled = false;
    setBalanceLoadingM((balanceM) => ({ ...balanceM, [fromBalanceKey]: true }));
    getTradeCoinBalance({
      chain,
      coin,
      address: fromEntry.address,
      coinE: getSelectedCoinE(),
    })
      .then((res) => {
        if (cancelled) return;
        setFallbackBalanceM((balanceM) => ({
          ...balanceM,
          [fromBalanceKey]: res || {},
        }));
      })
      .catch((e) => {
        if (cancelled) return;
        setBalanceErrorM((errorM) => ({
          ...errorM,
          [fromBalanceKey]: e?.message || "balance query failed",
        }));
      })
      .finally(() => {
        if (cancelled) return;
        setBalanceLoadingM((balanceM) => ({
          ...balanceM,
          [fromBalanceKey]: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [chain, coin, fromBalanceKey, fromEntry?.address, fromHasTableBalance]);

  useEffect(() => {
    if (
      !chain ||
      !coin ||
      !toEntry?.address ||
      toHasTableBalance ||
      fallbackBalanceM[toBalanceKey] ||
      balanceLoadingM[toBalanceKey] ||
      balanceErrorM[toBalanceKey]
    ) {
      return;
    }

    let cancelled = false;
    setBalanceLoadingM((balanceM) => ({ ...balanceM, [toBalanceKey]: true }));
    getTradeCoinBalance({
      chain,
      coin,
      address: toEntry.address,
      coinE: getSelectedCoinE(),
    })
      .then((res) => {
        if (cancelled) return;
        setFallbackBalanceM((balanceM) => ({
          ...balanceM,
          [toBalanceKey]: res || {},
        }));
      })
      .catch((e) => {
        if (cancelled) return;
        setBalanceErrorM((errorM) => ({
          ...errorM,
          [toBalanceKey]: e?.message || "balance query failed",
        }));
      })
      .finally(() => {
        if (cancelled) return;
        setBalanceLoadingM((balanceM) => ({
          ...balanceM,
          [toBalanceKey]: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [chain, coin, toBalanceKey, toEntry?.address, toHasTableBalance]);

  useEffect(() => {
    function handleBalancePatch(e) {
      const patches = Array.isArray(e?.detail?.balances)
        ? e.detail.balances
        : [];
      const nextEntries = patches
        .filter(
          (patch) =>
            patch?.chain == chain &&
            patch?.coin == coin &&
            patch?.address &&
            patch?.balance,
        )
        .map((patch) => [
          getBalanceKey(patch.chain, patch.coin, patch.address),
          patch.balance,
        ]);
      if (!nextEntries.length) return;

      setFallbackBalanceM((balanceM) => ({
        ...balanceM,
        ...Object.fromEntries(nextEntries),
      }));
    }

    window.addEventListener(walletBalancePatchEvent, handleBalancePatch);
    return () => {
      window.removeEventListener(walletBalancePatchEvent, handleBalancePatch);
    };
  }, [chain, coin]);

  function nextChain() {
    const values = getHistoryCycleValues(chainHistoryOptions, orderedChainNames);
    const next = nextValue(values, chain);
    if (next) selectChain(next, { rememberOrder: false });
  }

  function prevChain() {
    const values = getHistoryCycleValues(chainHistoryOptions, orderedChainNames);
    const prev = prevValue(values, chain);
    if (prev) selectChain(prev, { rememberOrder: false });
  }

  function selectChain(chain, options = {}) {
    setChain(chain);
    saveSendChainCookie(chain, options);
    emitTradeChainSelect(chain);
    setShowChainMenu(false);
  }

  function focusSelectedChain() {
    if (chain) emitTradeChainSelect(chain);
  }

  function saveSendChainCookie(chain, { rememberOrder = true } = {}) {
    if (!chain) return;
    setCookie(getTradeModeCookie(tradeSendChainCookie, walletType), chain, {
      maxAge: cookieMaxAge,
    });
    if (!rememberOrder) return;
    const nextOrder = rememberSelectionValue(chainOrder, chain, chainNames);
    setChainOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeSendChainOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function removeChainHistory(value) {
    const nextOrder = removeSelectionValue(chainOrder, value);
    setChainOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeSendChainOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function nextCoin() {
    const values = getHistoryCycleValues(coinHistoryOptions, coins);
    const next = nextValue(values, coin);
    if (next) selectCoin(next, { rememberOrder: false });
  }

  function prevCoin() {
    const values = getHistoryCycleValues(coinHistoryOptions, coins);
    const prev = prevValue(values, coin);
    if (prev) selectCoin(prev, { rememberOrder: false });
  }

  function selectCoin(coin, options = {}) {
    setCoin(coin);
    saveSendCoinCookie(coin, options);
    setShowCoinMenu(false);
  }

  function saveSendCoinCookie(coin, { rememberOrder = true } = {}) {
    if (!chain || !coin) return;
    setCookie(
      getChainCoinCookie(tradeSendCoinCookie, walletType, chain),
      coin,
      {
        maxAge: cookieMaxAge,
      },
    );
    if (!rememberOrder) return;
    const nextOrder = rememberGroupedSelectionValue(coinOrder, chain, coin, {
      validGroups: chainNames,
      validValues: getChainCoins(chainE),
    });
    setCoinOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeSendCoinOrderCookie, walletType),
      encodeGroupedSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function CoinQty({ coinName = "" }) {
    const balance = getSendSelectedBalance(
      chainE,
      coinName,
      fromEntry,
      fallbackBalanceM,
    );
    if (!Object.prototype.hasOwnProperty.call(balance || {}, "balance")) {
      return null;
    }

    return <span>{pc(balance.balance)}</span>;
  }

  function getCoinQty(coinName = "") {
    const balance = getSendSelectedBalance(
      chainE,
      coinName,
      fromEntry,
      fallbackBalanceM,
    );

    return Object.prototype.hasOwnProperty.call(balance || {}, "balance")
      ? toNum(balance.balance)
      : 0;
  }

  function cycleFromWallet(direction) {
    const next = cycleWalletSelection(fromWallets, fromWallet, direction);
    if (next) selectFromWallet(next);
  }

  function cycleToWallet(direction) {
    const next = cycleWalletSelection(currentToWallets, toWallet, direction);
    if (next) selectToWallet(next, { rememberOrder: false });
  }

  function selectFromWallet(value, syncParent = true) {
    setFromWallet(value);
    if (syncParent) onFromWalletChange(value);
  }

  function selectToWallet(value, options = {}) {
    setToWallet(value);
    saveSendToWalletCookie(value, options);
    setShowToWalletMenu(false);
  }

  function saveSendToWalletCookie(value, { rememberOrder = true } = {}) {
    const entry = allToWalletEntries.find((entry) => entry.value == value);
    if (!entry?.address) return;
    setCookie(getTradeModeCookie(tradeSendToWalletCookie, walletType), value, {
      maxAge: cookieMaxAge,
    });
    if (!rememberOrder) return;

    const nextOrder = rememberSelectionValue(
      toWalletOrder,
      value,
      allToWalletValues,
      sendToWalletOrderCap,
    );
    setToWalletOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeSendToWalletOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function removeToWalletHistory(value) {
    const nextOrder = removeSelectionValue(toWalletOrder, value).slice(
      0,
      sendToWalletOrderCap,
    );
    setToWalletOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeSendToWalletOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function switchWallets() {
    if (!canSwitchWallets) return;

    const nextToEntry =
      toWallets.find(
        (entry) =>
          entry.value == fromEntry.value ||
          sameAddress(entry.address, fromEntry.address),
      ) || toWallets[0];
    selectFromWallet(loadedToEntry.value);
    if (nextToEntry?.value) selectToWallet(nextToEntry.value);
  }

  function getOppositeSendQty(value = "0") {
    return formatComputedTradeQty(
      subtractTradeQtyText(
        "0",
        formatTradeQty(value, coinDecimals),
        coinDecimals,
      ),
      coinDecimals,
    );
  }

  function getAbsSendQty(value = "0") {
    return formatTradeQty(String(value ?? "").replace(/^-/, ""), coinDecimals);
  }

  function normalizeSendQtyInput(value, maxPositive, maxNegative) {
    return normalizeSignedQtyInput(
      value,
      maxPositive,
      maxNegative,
      coinDecimals,
      { allowNegativeZero: true },
    );
  }

  function updateFromQty(value, { clearEndDrafts = true } = {}) {
    const qty = normalizeSendQtyInput(value, maxSend, currentToBal);
    setFromQty(qty);
    setToQty(getOppositeSendQty(qty));
    if (clearEndDrafts) {
      setFromEndDraft("");
      setToEndDraft("");
    }
  }

  function updateToQty(value, { clearEndDrafts = true } = {}) {
    const qty = normalizeSendQtyInput(value, currentToBal, maxSend);
    setToQty(qty);
    setFromQty(getOppositeSendQty(qty));
    if (clearEndDrafts) {
      setFromEndDraft("");
      setToEndDraft("");
    }
  }

  function setMaxSend(side = "from") {
    if (side == "to") updateToQty(currentToQty);
    else updateFromQty(maxSendQty);
  }

  function renderSendControls({
    showGas = false,
    side = "from",
    txLabel = "SEND",
  } = {}) {
    const config = getSendSideConfig(side);
    const sideQty = toNum(config.qty);
    const senderEntry = getEffectiveSendSender(config, sideQty);
    const signerMissing =
      !!senderEntry?.address &&
      !senderEntry.isBrowserWallet &&
      !senderEntry.hasPrivateKey;
    const disabled = sendPending || signerMissing;
    const maxValue = side == "to" ? currentToBal : maxSend;
    const maxQty = side == "to" ? currentToQty : maxSendQty;
    const sliderValue = side == "to" ? toSliderValue : fromSliderValue;
    const updateSideQty = side == "to" ? updateToQty : updateFromQty;

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
              rangeQtyInput(
                e.target.value,
                maxValue,
                maxQty,
                coinDecimals,
              ),
            )
          }
          disabled={!maxValue}
        />
        <button
          type="button"
          className="btn small bgGray"
          onClick={() => setMaxSend(side)}
          disabled={!maxValue}
        >
          max
        </button>
        <button
          type="button"
          className="btn bgCyan sendTransferButton"
          onClick={() => runSend(side)}
          disabled={disabled}
        >
          {sendPending ? "SENDING" : <>&nbsp;{txLabel}&nbsp;</>}
        </button>
        {signerMissing && <span className="red">no key</span>}
      </div>
    );
  }

  function updateFromEnd(value) {
    const endQty = limitQtyInputDecimals(cleanTradeInput(value), coinDecimals);
    setFromEndDraft(endQty);
    setToEndDraft("");
    updateFromQty(getTradeEndDiffQty(maxSendQty, endQty, coinDecimals), {
      clearEndDrafts: false,
    });
  }

  function updateToEnd(value) {
    const endQty = limitQtyInputDecimals(cleanTradeInput(value), coinDecimals);
    setToEndDraft(endQty);
    setFromEndDraft("");
    updateToQty(getTradeEndDiffQty(currentToQty, endQty, coinDecimals), {
      clearEndDrafts: false,
    });
  }

  function getSendSideConfig(side = "from", sideEntryOverride) {
    const isRightSide = side == "to";
    const sideEntry =
      sideEntryOverride || (isRightSide ? rightSenderEntry : fromEntry);

    return {
      sideEntry,
      oppositeEntry: isRightSide ? fromEntry : rightSenderEntry,
      recipientEntry: isRightSide ? fromEntry : toEntry,
      qty: isRightSide ? toQty : fromQty,
      endWith: isRightSide ? toEndWith : fromEndWith,
      endInputValue: isRightSide ? toEndInputValue : fromEndInputValue,
      localMaxQty: isRightSide ? currentToQty : maxSendQty,
    };
  }

  function getEffectiveSendSender(config, qty) {
    return toNum(qty) < 0 ? config.oppositeEntry : config.sideEntry;
  }

  function getEffectiveSendRecipient(config, qty) {
    return toNum(qty) < 0
      ? config.sideEntry
      : config.recipientEntry || config.oppositeEntry;
  }

  function getSendConfirmText({
    config,
    submitQty,
    senderLabel,
    senderAddress,
    recipientLabel,
    recipientAddress,
  }) {
    const actionLine = config.endWith
      ? `End with ${formatTradeQty(config.endInputValue, coinDecimals)} ${coin} on ${chain}?`
      : `Send ${submitQty} ${coin} on ${chain}?`;
    const qtyLine = config.endWith ? `\nsend qty: ${submitQty} ${coin}` : "";

    return `${actionLine}${qtyLine}\n\nfrom: ${senderLabel} ${shortAddress(
      senderAddress,
    )}\nto: ${recipientLabel} ${shortAddress(recipientAddress)}`;
  }

  function getSendLoopCounterpartyText(side = "from") {
    const isRightSide = side == "to";
    const label = isRightSide ? "left selected" : "right selected";
    const entry = isRightSide ? fromEntry : toEntry;
    const address = entry?.address ? ` ${shortAddress(entry.address)}` : "";

    return `with ${label}: ${getTradeWalletLabel(entry)}${address}`;
  }

  async function getSendQtyForSideWallet(
    walletEntry = fromEntry,
    side = "from",
    { forceBalanceQuery = false } = {},
  ) {
    const config = getSendSideConfig(side, walletEntry);
    if (!config.endWith) return formatTradeQty(config.qty, coinDecimals);

    const targetEnd = formatTradeQty(config.endInputValue, coinDecimals);
    if (!walletEntry?.address) return "0";
    const defaultSideEntry = side == "to" ? rightSenderEntry : fromEntry;
    if (
      !forceBalanceQuery &&
      sameAddress(walletEntry.address, defaultSideEntry?.address)
    ) {
      return getTradeEndDiffQty(config.localMaxQty, targetEnd, coinDecimals);
    }

    const balance = await getTradeCoinBalance({
      chain,
      coin,
      address: walletEntry.address,
      coinE: getSelectedCoinE(),
    });

    return formatComputedTradeQty(
      subtractTradeQtyText(
        formatTradeQty(balance?.balance, coinDecimals),
        targetEnd,
        coinDecimals,
      ),
      coinDecimals,
    );
  }

  async function copySendAddress(e, address = "") {
    e.preventDefault();
    e.stopPropagation();
    if (!address) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        const input = document.createElement("textarea");
        input.value = address;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      setCopiedAddress(address);
      setTimeout(() => {
        setCopiedAddress((prev) => (prev == address ? "" : prev));
      }, 1200);
    } catch (err) {
      toast.error(err?.message || "copy failed");
    }
  }

  function renderSendWalletTail(address = "", label = "wallet") {
    if (!address) return null;
    const copied = copiedAddress == address;

    return (
      <span className="infoHover sendWalletAddressHover">
        <span className="gray sendWalletTail">{shortTail(address)}</span>
        <span className="infoCard sendWalletAddressCard">
          <span className="infoCardTitle">{label}</span>
          <span className="sendWalletAddressRow">
            <span
              className="copyAddressText"
              onClick={(e) => copySendAddress(e, address)}
            >
              {address}
            </span>
            <button
              type="button"
              className={`copyAddressBtn ${copied ? "copied" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => copySendAddress(e, address)}
              aria-label="copy address"
            >
              <span className="copyIcon" aria-hidden="true"></span>
              <span className="copyTick" aria-hidden="true"></span>
            </button>
          </span>
        </span>
      </span>
    );
  }

  async function runSendForWallet(
    sideEntry = fromEntry,
    { skipConfirm = false, loopRun = false, side = "from" } = {},
  ) {
    const config = getSendSideConfig(side, sideEntry);
    const tradeToast = createTradeToast(sideEntry, loopRun);

    if (!sideEntry?.address) {
      tradeToast.error("wallet missing");
      return;
    }
    let signedQty = "0";
    try {
      signedQty = await getSendQtyForSideWallet(sideEntry, side, {
        forceBalanceQuery: loopRun,
      });
    } catch (e) {
      tradeToast.error(e?.message || "send qty query failed");
      return;
    }

    const submitQty = getAbsSendQty(signedQty);
    const senderEntry = getEffectiveSendSender(config, signedQty);
    const recipientEntry = getEffectiveSendRecipient(config, signedQty);

    if (!toNum(submitQty)) {
      tradeToast.error("send qty is 0");
      return;
    }
    if (!senderEntry?.address) {
      tradeToast.error("sender missing");
      return;
    }
    if (!recipientEntry?.address) {
      tradeToast.error("recipient missing");
      return;
    }
    if (sameAddress(senderEntry.address, recipientEntry.address)) {
      tradeToast.error("sender and recipient are the same");
      return;
    }

    const senderLabel = senderEntry.label || senderEntry.name;
    const recipientLabel = recipientEntry.label || recipientEntry.name;
    const useBrowserWallet = !!senderEntry.isBrowserWallet;
    if (!useBrowserWallet && !senderEntry.hasPrivateKey) {
      tradeToast.error("no private key");
      return;
    }

    if (!useBrowserWallet && !skipConfirm) {
      const ok = window.confirm(
        getSendConfirmText({
          config,
          submitQty,
          senderLabel,
          senderAddress: senderEntry.address,
          recipientLabel,
          recipientAddress: recipientEntry.address,
        }),
      );
      if (!ok) return;
    }

    setSendPending(true);
    setSendResult(null);
    const toastId = tradeToast.loading("Send: preparing tx...");
    try {
      let res;

      if (useBrowserWallet) {
        const built = await buildSendTx({
          walletAddress: senderEntry.address,
          chain,
          coin,
          amount: submitQty,
          recipient: recipientEntry.address,
          coinE: getSelectedCoinE(),
        });
        const txs = [];

        for (const tx of built.txs || []) {
          txs.push(
            await sendBrowserTradeTx({
              tx,
              walletEntry: senderEntry,
              tradeToast,
              toastId,
              message: `Send: confirm ${tx.chain} ${tx.type}...`,
            }),
          );
        }
        res = { ...built, txs };
      } else {
        tradeToast.loading("Send: submitting tx...", { id: toastId });
        res = await executeSend({
          walletName: senderEntry.name,
          walletAddress: senderEntry.address,
          chain,
          coin,
          amount: submitQty,
          recipient: recipientEntry.address,
          coinE: getSelectedCoinE(),
        });
      }

      if (res?.ok === false) {
        throw new Error(res.error || "send failed");
      }

      setSendResult(res);
      tradeToast.success(`Send submitted ${res.txs?.length || 0} tx`, {
        id: toastId,
      });
      onTxComplete({
        ...res,
        refreshTargets: [
          getSendRefreshTarget(senderEntry.address),
          getSendRefreshTarget(recipientEntry.address),
        ],
      });
      return res;
    } catch (e) {
      const message = e?.message || "send failed";
      const errorResult = { ok: false, error: message };
      setSendResult(errorResult);
      tradeToast.error(message, { id: toastId });
      return errorResult;
    } finally {
      setSendPending(false);
    }
  }

  async function runSend(side = "from") {
    const config = getSendSideConfig(side);
    const result = await runTradeWalletLoop({
      loopWallets,
      getLoopWalletEntries,
      selectedWalletEntry: config.sideEntry,
      actionLabel: `send ${
        config.endWith
          ? `end ${formatTradeQty(config.endInputValue, coinDecimals)}`
          : formatTradeQty(config.qty, coinDecimals)
      } ${coin} ${side == "to" ? "←" : "→"} ${getSendLoopCounterpartyText(
        side,
      )}`,
      runOne: (walletEntry, options) =>
        runSendForWallet(walletEntry, { ...options, side }),
    });
    if (Array.isArray(result)) {
      const loopResult = createTradeLoopResult(result, { action: "send" });
      if (loopResult) setSendResult(loopResult);
    }

    return result;
  }

  const sortedCoinRows = sortTradePickerRows(
    coins.map((coinName) => ({
      coinName,
      qty: getCoinQty(coinName),
    })),
    coinSort,
    {
      coin: (entry) => entry.coinName,
      qty: (entry) => entry.qty,
    },
    { qty: "desc" },
  );
  const sendWalletPickerColumns = [
    {
      key: "wallet",
      label: "wallet",
      getValue: (entry) => entry.label,
      getSortValue: (entry) => entry.label,
    },
    {
      key: "addr",
      label: "addr",
      className: "gray",
      getValue: (entry) => shortTail(entry.address),
      getSortValue: (entry) => entry.address,
    },
  ];

  return (
    <div className="tradePane tradeWidePane sendPane">
      <div className="flex tradePaneTop">
        <TradeSelectionPicker
          selectedValue={tradeType}
          historyOptions={tradeHistoryTypes}
          allOptions={allTradeTypes.length ? allTradeTypes : tradeTypes}
          showMenu={showTradeTypeMenu}
          setShowMenu={setShowTradeTypeMenu}
          pickerRef={tradeTypePickerRef}
          pickerSortM={simplePickerSortM}
          setPickerSortM={setSimplePickerSortM}
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
        <TradeSelectionPicker
          selectedValue={chain}
          historyOptions={chainHistoryOptions}
          allOptions={chainNames}
          showMenu={showChainMenu}
          setShowMenu={setShowChainMenu}
          pickerRef={chainPickerRef}
          pickerSortM={simplePickerSortM}
          setPickerSortM={setSimplePickerSortM}
          sortKeyPrefix="sendChain"
          header="chain"
          className="tradeChainCycle"
          menuClassName="tradeChainMenu"
          onSelect={selectChain}
          onRemoveHistory={removeChainHistory}
          onPrev={prevChain}
          onNext={nextChain}
          onOpen={focusSelectedChain}
          onFocus={focusSelectedChain}
        />
        <span className="selectCycle sendCoinCycle">
          <CycleButtonPair
            onPrev={prevCoin}
            onNext={nextCoin}
            disabled={getHistoryCycleValues(coinHistoryOptions, coins).length < 2}
          />
          <div className="customPicker" ref={coinPickerRef}>
            <button
              type="button"
              className="customPickerButton"
              disabled={!coins.length}
              onClick={() => setShowCoinMenu((show) => !show)}
            >
              {coin || "coin"}
            </button>
            {showCoinMenu && (
              <TradePickerMenu className="sendCoinMenu">
                <TradePickerColumn title="coins">
                  <TradePickerTable
                    className="sendCoinTable"
                    headers={[
                      <PickerSortHeader
                        activeSort={coinSort}
                        setSort={setCoinSort}
                        sortKey="coin"
                      >
                        coin
                      </PickerSortHeader>,
                      <PickerSortHeader
                        activeSort={coinSort}
                        setSort={setCoinSort}
                        sortKey="qty"
                      >
                        qty
                      </PickerSortHeader>,
                    ]}
                  >
                    <tbody>
                      {sortedCoinRows.length ? (
                        sortedCoinRows.map(({ coinName }) => (
                          <tr
                            key={coinName}
                            className={
                              coinName == coin
                                ? "customPickerRow on"
                                : "customPickerRow"
                            }
                            onClick={() => selectCoin(coinName)}
                          >
                            <td>{coinName}</td>
                            <td>
                              <CoinQty coinName={coinName} />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2} className="gray">
                            -
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </TradePickerTable>
                </TradePickerColumn>
              </TradePickerMenu>
            )}
          </div>
        </span>
        <span className="tradeCoinPrice">
          <span className="gray">{fmtPrice(price)}</span>
          {priceStatus && <span className="gray"> {priceStatus}</span>}
        </span>
      </div>

      <div className="tradeRows">
        <div className="tradeBox">
          <div className="tradeAssetLine">
            <span className="gray">from:</span>
            <span className="selectCycle walletCycle">
              <CycleButtonPair
                onPrev={() => cycleFromWallet("prev")}
                onNext={() => cycleFromWallet("next")}
                disabled={fromWallets.length < 2}
              />
              <select
                value={fromWallet}
                onChange={(e) => selectFromWallet(e.target.value)}
              >
                {fromWallets.map((entry) => (
                  <option
                    key={`${entry.value}_${entry.address}`}
                    value={entry.value}
                  >
                    {entry.label}
                  </option>
                ))}
              </select>
            </span>
            {renderSendWalletTail(fromEntry?.address, "from")}
            <button
              type="button"
              className="tradeSwitchButton"
              onClick={switchWallets}
              disabled={!canSwitchWallets}
            >
              {"⇆"}
            </button>
          </div>
          <div className="tradeBalanceLine">
            <button
              type="button"
              className="tradeTextButton tradeAssetBalance"
              onClick={() => setMaxSend("from")}
            >
              <span className="gray">{coin}: </span>
              {fromBalanceLoading ? "..." : maxSendQty}
              {fromUsd > 0 && <span className="gray"> ${fmt(fromUsd, 2)}</span>}
              {fromBalanceError && (
                <span className="red"> {fromBalanceError}</span>
              )}
            </button>
          </div>
          <div className="tradeAmountLine">
            <span className="gray">end</span>
            <label className="switch small tradeEndSwitch">
              <input
                type="checkbox"
                checked={fromEndWith}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setFromEndWith(checked);
                  if (checked) setToEndWith(false);
                }}
              />
              <span className="slider" />
            </label>
            <input
              className="tradeQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              step="any"
              size={qtyInputSize(fromEndInputValue)}
              style={qtyInputStyle(fromEndInputValue)}
              value={fromEndInputValue}
              onChange={(e) => updateFromEnd(e.target.value)}
              onBlur={() => setFromEndDraft("")}
            />
            {price > 0 && <span className="gray">${fmt(fromEndUsd, 2)}</span>}
          </div>
          <div className="tradeAmountLine">
            <span className="gray">qty</span>
            <input
              className="sendQtyInput tradeQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              step="any"
              size={qtyInputSize(fromQty)}
              style={qtyInputStyle(fromQty)}
              value={fromQty}
              onChange={(e) => updateFromQty(e.target.value)}
            />
            {price > 0 && <span className="gray">${fmt(fromQtyUsd, 2)}</span>}
          </div>
          {renderSendControls({ showGas: true, side: "from", txLabel: "→" })}
        </div>

        <div className="tradeBox">
          <div className="tradeAssetLine">
            <span className="gray">to:</span>
            <div className="selectCycle walletCycle selectedCompact">
              <CycleButtonPair
                onPrev={() => cycleToWallet("prev")}
                onNext={() => cycleToWallet("next")}
                disabled={currentToWallets.length < 2}
              />
              <TradeSelectionPicker
                selectedValue={toWallet}
                selectedLabel={toEntry?.label || ""}
                extraSections={[
                  {
                    section: "loaded",
                    title: "loaded",
                    options: currentToWallets,
                    emptyText: "-",
                  },
                ]}
                historyOptions={toWalletHistoryEntries}
                allOptions={toWallets}
                showMenu={showToWalletMenu}
                setShowMenu={setShowToWalletMenu}
                pickerRef={toWalletPickerRef}
                pickerSortM={simplePickerSortM}
                setPickerSortM={setSimplePickerSortM}
                sortKeyPrefix="sendToWallet"
                header="wallet"
                menuClassName="sendWalletTableMenu"
                tableClassName="sendWalletTable"
                optionColumns={sendWalletPickerColumns}
                showCycle={false}
                onSelect={selectToWallet}
                onRemoveHistory={removeToWalletHistory}
              />
              {renderSendWalletTail(toEntry?.address, "to")}
            </div>
          </div>
          <div className="tradeBalanceLine">
            <span className="tradeAssetBalance">
              <span className="gray">{coin}: </span>
              {toBalanceLoading ? "..." : currentToQty}
              {toUsd > 0 && <span className="gray"> ${fmt(toUsd, 2)}</span>}
              {toBalanceError && <span className="red"> {toBalanceError}</span>}
            </span>
          </div>
          <div className="tradeAmountLine">
            <span className="gray">end</span>
            <label className="switch small tradeEndSwitch">
              <input
                type="checkbox"
                checked={toEndWith}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setToEndWith(checked);
                  if (checked) setFromEndWith(false);
                }}
              />
              <span className="slider" />
            </label>
            <input
              className="tradeQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              step="any"
              size={qtyInputSize(toEndInputValue)}
              style={qtyInputStyle(toEndInputValue)}
              value={toEndInputValue}
              onChange={(e) => updateToEnd(e.target.value)}
              onBlur={() => setToEndDraft("")}
            />
            {price > 0 && <span className="gray">${fmt(toEndUsd, 2)}</span>}
          </div>
          <div className="tradeAmountLine">
            <span className="gray">qty</span>
            <input
              className="sendQtyInput tradeQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              step="any"
              size={qtyInputSize(toQty)}
              style={qtyInputStyle(toQty)}
              value={toQty}
              onChange={(e) => updateToQty(e.target.value)}
            />
            {price > 0 && <span className="gray">${fmt(toQtyUsd, 2)}</span>}
          </div>
          {renderSendControls({ side: "to", txLabel: "←" })}
        </div>
      </div>

      {sendResult && (
        <div className="tradeResult">
          {sendResult.ok ? (
            <>
              <span className="gray">Send:</span>{" "}
              {sendResult.txs?.map((tx, index) => (
                <SwapTxLink
                  key={`${tx.walletLabel || ""}_${tx.hash}_${index}`}
                  tx={tx}
                />
              ))}
              {sendResult.loopErrors?.map((entry) => (
                <span
                  key={`${entry.walletLabel}_${entry.error}`}
                  className="red"
                >
                  {" "}
                  {entry.walletLabel}: {entry.error}
                </span>
              ))}
            </>
          ) : (
            <span className="red">{sendResult.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
