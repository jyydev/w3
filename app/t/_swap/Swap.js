"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import { scanners } from "@/sets";
import {
  buildAcrossSwapTxs,
  executeAcrossSwap,
  getAcrossSupportedBridge,
  getAcrossSwapPreview,
} from "./svAcross";
import {
  buildJupiterSwapTxs,
  executeJupiterSwap,
  getJupiterSupportedSwap,
  getJupiterSwapPreview,
  getJupiterTokenDiscovery,
} from "./svJupiter";
import {
  buildJumperSwapTxs,
  executeJumperSwap,
  getJumperSupportedBridge,
  getJumperSwapPreview,
  getJumperTokenDiscovery,
} from "./svJumper";
import {
  buildRelaySwapSteps,
  executeRelaySwap,
  getRelayCurrencyDiscovery,
  getRelaySupportedBridge,
  getRelaySwapPreview,
} from "./svRelay";
import {
  buildUniswapSwapTxs,
  executeUniswapSwap,
  getUniswapSupportedSwap,
  getUniswapSwapPreview,
} from "./svUniswap";
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
  clampInputValue,
  cookieMaxAge,
  dexOptions,
  emitTradeChainSelect,
  fmt,
  fmtPrice,
  fmtRate,
  getChainCoins,
  getTradeModeCookie,
  getWalletOptions,
  inputQty,
  nextValue,
  noDex,
  normalizeQtyInput,
  priceKey,
  readQtyInput,
  sameAddress,
  sendBrowserSolanaTx,
  sendBrowserTx,
  shortAddress,
  signBrowserRelayItem,
  SwapTxLink,
  tradeAutoApprovalCookie,
  tradeSwapDexCookie,
  tradeSwapFromChainCookie,
  tradeSwapFromCoinCookie,
  tradeSwapToChainCookie,
  tradeSwapToCoinCookie,
  toNum,
} from "../clientShared";

const walletBalancePatchEvent = "w3:walletBalancePatch";
const chainDiscoveryDexs = ["relay", "jumper", "across", "uniswap", "jupiter"];
const emptySwapSupportE = {
  chains: [],
  tokens: [],
  loading: false,
  loaded: false,
  error: "",
};
const emptyTokenDiscoveryE = {
  tokens: [],
  loading: false,
  loaded: false,
  error: "",
};
const swapSupportTimeoutMs = 12000;
const swapSupportCacheM = {};
const swapSupportPromiseM = {};
const relayCurrencyCacheM = {};
const relayCurrencyPromiseM = {};

function hasChainDiscovery(defi = "") {
  return chainDiscoveryDexs.includes(defi);
}

function getSwapSupport(defi = "") {
  if (defi == "relay") return getRelaySupportedBridge();
  if (defi == "jumper") return getJumperSupportedBridge();
  if (defi == "across") return getAcrossSupportedBridge();
  if (defi == "uniswap") return getUniswapSupportedSwap();
  if (defi == "jupiter") return getJupiterSupportedSwap();
  return Promise.resolve(emptySwapSupportE);
}

function getDexLabel(value = "") {
  return dexOptions.find((entry) => entry.value == value)?.label || value || "DEX";
}

function getExplorerAddressUrl(chain = "", address = "") {
  const scanner = scanners?.[chain];
  if (!scanner || !address) return "";

  return `${String(scanner).replace(/\/+$/, "")}/address/${address}`;
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

function normalizeSwapSupport(res = {}) {
  return {
    chains: Array.isArray(res?.chains) ? res.chains : [],
    tokens: Array.isArray(res?.tokens) ? res.tokens : [],
    loading: false,
    loaded: true,
    error: "",
  };
}

function withTimeout(promise, timeoutMs = 0, message = "request timeout") {
  if (!timeoutMs) return promise;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function loadSwapSupport(defi = "") {
  if (!hasChainDiscovery(defi)) {
    return Promise.resolve({ ...emptySwapSupportE, loaded: true });
  }
  if (swapSupportCacheM[defi]) return Promise.resolve(swapSupportCacheM[defi]);

  if (!swapSupportPromiseM[defi]) {
    swapSupportPromiseM[defi] = withTimeout(
      getSwapSupport(defi),
      swapSupportTimeoutMs,
      `${getDexLabel(defi)} discovery timeout`,
    )
      .then((res) => {
        const support = normalizeSwapSupport(res);
        swapSupportCacheM[defi] = support;
        return support;
      })
      .catch((e) => {
        delete swapSupportPromiseM[defi];
        throw e;
      });
  }

  return swapSupportPromiseM[defi];
}

function getRelayCurrencyKey(chain = "", term = "") {
  return `${chain}:${String(term || "").trim().toLowerCase()}`;
}

function getTokenDiscoveryKey(defi = "", chain = "", term = "") {
  return `${defi}:${getRelayCurrencyKey(chain, term)}`;
}

function getDiscoveryTokenKey(entry = {}, index = "") {
  return [
    entry.chain || "",
    String(entry.address || "").toLowerCase(),
    entry.symbol || "",
    entry.name || "",
    Number.isFinite(Number(entry.decimals)) ? Number(entry.decimals) : "",
    index,
  ].join(":");
}

function getDiscoveryTokenDedupeKey(entry = {}) {
  return [
    entry.chain || "",
    String(entry.address || "").toLowerCase(),
    entry.symbol || "",
    entry.name || "",
    Number.isFinite(Number(entry.decimals)) ? Number(entry.decimals) : "",
  ].join(":");
}

function trimQtyToDecimals(value = "", decimals = 18) {
  const text = String(value ?? "");
  if (!text || !Number.isInteger(decimals) || decimals < 0) return text;
  if (/e/i.test(text)) return trimQtyToDecimals(inputQty(Number(text)), decimals);

  const parts = text.split(".");
  if (parts.length < 2) return text;
  if (decimals == 0) return parts[0] || "0";

  return `${parts[0] || "0"}.${parts.slice(1).join("").slice(0, decimals)}`;
}

function qtyInputSize(value = "") {
  return Math.min(Math.max(String(value ?? "").length + 1, 10), 34);
}

function isDexSupportedForChain(option = {}, fromChain = "") {
  if (!fromChain) return true;
  if (option.value == "jupiter") return fromChain == "Solana";
  if (fromChain == "Solana") {
    return ["relay", "jumper", "across", "jupiter"].includes(option.value);
  }

  return true;
}

function getSwapRouteCookie(
  base = "",
  walletType = "evm",
  defi = "",
  chain = "",
) {
  return [
    getTradeModeCookie(base, walletType),
    defi || "dex",
    chain || "",
  ]
    .filter(Boolean)
    .join("_");
}

function getInitialCookie(initialCookieM = {}, name = "") {
  const value = initialCookieM?.[name];
  return value === undefined ? undefined : String(value);
}

function getInitialSwapDex(initialCookieM = {}, walletType = "evm") {
  const savedDefi = getInitialCookie(
    initialCookieM,
    getTradeModeCookie(tradeSwapDexCookie, walletType),
  );

  return dexOptions.some((entry) => entry.value == savedDefi)
    ? savedDefi
    : dexOptions[0]?.value || "";
}

function getInitialAutoApproval(initialCookieM = {}) {
  return getInitialCookie(initialCookieM, tradeAutoApprovalCookie) == "1";
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
  const [qtyInputSide, setQtyInputSide] = useState("sell");
  const [fallbackPriceM, setFallbackPriceM] = useState({});
  const [priceLoadingM, setPriceLoadingM] = useState({});
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
  const [swapSupportM, setSwapSupportM] = useState({});
  const [showFromChainMenu, setShowFromChainMenu] = useState(false);
  const [showToChainMenu, setShowToChainMenu] = useState(false);
  const [showFromCoinMenu, setShowFromCoinMenu] = useState(false);
  const [showToCoinMenu, setShowToCoinMenu] = useState(false);
  const fromChainPickerRef = useRef(null);
  const toChainPickerRef = useRef(null);
  const fromCoinPickerRef = useRef(null);
  const toCoinPickerRef = useRef(null);
  const useLocalEditorStore = useLocalStorageEditor();
  const [addingCoin, setAddingCoin] = useState(false);
  const [customCoinPreview, setCustomCoinPreview] = useState(null);
  const [customCoinDraft, setCustomCoinDraft] = useState({
    coin: "",
    name: "",
    type: "",
    customType: "",
  });
  const [locallyAddedAddressM, setLocallyAddedAddressM] = useState({});
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
  const fromCoins = useMemo(() => getChainCoins(fromChainE), [fromChainE]);
  const toCoins = useMemo(() => getChainCoins(toChainE), [toChainE]);
  const fromCoinInfo = fromChainE?.coinInfoM?.[fromCoin] || {};
  const fromCoinDecimals = Number.isInteger(fromCoinInfo.decimals)
    ? fromCoinInfo.decimals
    : 18;
  const isSolanaBridge =
    !!fromChain &&
    !!toChain &&
    fromChain != toChain &&
    (fromChain == "Solana" || toChain == "Solana");
  const fromBalance = getSelectedBalance(fromChainE, fromCoin);
  const selectedToBalance = getSelectedBalance(toChainE, toCoin);
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
  const maxBuy = toNum(toBalance.balance);
  const sellQty = toNum(fromQty);
  const buyQty = toNum(toQty);
  const sellSliderValue = Math.min(toNum(fromQty), maxSell);
  const fromPriceKey = priceKey(fromChain, fromCoin);
  const toPriceKey = priceKey(toChain, toCoin);
  const fromListPrice = toNum(fromBalance.price);
  const toListPrice = toNum(toBalance.price);
  const fromFallbackPrice = fallbackPriceM[fromPriceKey];
  const toFallbackPrice = fallbackPriceM[toPriceKey];
  const fromPriceLoading = !!priceLoadingM[fromPriceKey];
  const toPriceLoading = !!priceLoadingM[toPriceKey];
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
  const sellEnd = Math.max(0, maxSell - sellQty);
  const buyEnd = maxBuy + buyQty;
  const sellQtyUsd = fromPrice ? sellQty * fromPrice : 0;
  const sellEndUsd = fromPrice ? sellEnd * fromPrice : 0;
  const buyQtyUsd = toPrice ? buyQty * toPrice : 0;
  const buyEndUsd = toPrice ? buyEnd * toPrice : 0;
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
  const swapSupportE = swapSupportM[defi] || emptySwapSupportE;
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
      `${Math.max(
        fromChain.length,
        ...sellChainNames.map((chain) => chain.length),
        5,
      ) + 2}ch`,
    [fromChain, sellChainNames],
  );
  const toChainButtonWidth = useMemo(
    () =>
      `${Math.max(
        toChain.length,
        ...chainNames.map((chain) => chain.length),
        5,
      ) + 2}ch`,
    [chainNames, toChain],
  );
  const fromCoinButtonWidth = useMemo(
    () =>
      `${Math.min(
        Math.max(fromCoin.length, ...fromCoins.map((coin) => coin.length), 5) + 2,
        18,
      )}ch`,
    [fromCoin, fromCoins],
  );
  const toCoinButtonWidth = useMemo(
    () =>
      `${Math.min(
        Math.max(toCoin.length, ...toCoins.map((coin) => coin.length), 5) + 2,
        18,
      )}ch`,
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
    requestSwapSupport(defi);
  }, [defi]);

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

  useEffect(() => {
    if (!fromChain || !fromCoin || fromListPrice > 0) return;
    if (fromFallbackPrice !== undefined) return;

    let cancelled = false;
    setPriceLoadingM((priceM) => ({ ...priceM, [fromPriceKey]: true }));
    getTradeCoinPrice({ chain: fromChain, coin: fromCoin })
      .then((res) => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({
          ...priceM,
          [fromPriceKey]: toNum(res?.price),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({ ...priceM, [fromPriceKey]: 0 }));
      })
      .finally(() => {
        if (cancelled) return;
        setPriceLoadingM((priceM) => ({ ...priceM, [fromPriceKey]: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [fromChain, fromCoin, fromFallbackPrice, fromListPrice, fromPriceKey]);

  useEffect(() => {
    if (!toChain || !toCoin || toListPrice > 0) return;
    if (toFallbackPrice !== undefined) return;

    let cancelled = false;
    setPriceLoadingM((priceM) => ({ ...priceM, [toPriceKey]: true }));
    getTradeCoinPrice({ chain: toChain, coin: toCoin })
      .then((res) => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({
          ...priceM,
          [toPriceKey]: toNum(res?.price),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({ ...priceM, [toPriceKey]: 0 }));
      })
      .finally(() => {
        if (cancelled) return;
        setPriceLoadingM((priceM) => ({ ...priceM, [toPriceKey]: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [toChain, toCoin, toFallbackPrice, toListPrice, toPriceKey]);

  function getSelectedBalance(chainE, coin) {
    if (!chainE || !coin || !selectedWalletEntry) return {};

    const row = chainE.rows?.find(
      (entry) =>
        sameAddress(entry.address, selectedWalletEntry.address) ||
        entry.name == selectedWalletEntry.name,
    );

    return row?.balances?.[coin] || {};
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

  async function runSwap() {
    if (!["jupiter", "jumper", "relay", "uniswap", "across"].includes(defi)) {
      toast(`${defiE.label}: swap not wired yet`);
      return;
    }
    const useBrowserEvmWallet =
      selectedWalletEntry?.isBrowserWallet &&
      selectedWalletEntry?.type == "evm";
    const useBrowserSolanaWallet =
      selectedWalletEntry?.isBrowserWallet &&
      selectedWalletEntry?.type == "solana" &&
      ["jupiter", "jumper", "relay"].includes(defi);
    const useBrowserWallet = useBrowserEvmWallet || useBrowserSolanaWallet;
    if (!selectedWalletEntry?.hasPrivateKey && !useBrowserWallet) {
      if (selectedWalletEntry?.isBrowserWallet) {
        toast.error(`${defiE.label} is not available for this browser wallet`);
        return;
      }
      const keyPrefix = selectedWalletEntry?.type == "solana" ? "pk_sol" : "pk";
      toast.error(
        `private key missing: ${keyPrefix}_${selectedWalletEntry?.name || ""}`,
      );
      return;
    }
    if (defi == "jupiter" && (fromChain != "Solana" || toChain != "Solana")) {
      toast.error("Jupiter is for Solana swaps only");
      return;
    }
    if (fromChain == "Solana" && !["jupiter", "jumper", "relay", "across"].includes(defi)) {
      toast.error(`${defiE.label} is not available for Solana-origin swaps`);
      return;
    }
    if (defi == "across" && fromChain == toChain) {
      toast.error(
        "Across is for cross-chain swaps; choose a different buy chain",
      );
      return;
    }
    if (fromChain == toChain && fromCoin == toCoin) {
      toast.error("sell coin and buy coin are the same");
      return;
    }
    if (!sellQty) {
      toast.error("sell qty is 0");
      return;
    }

    const amount = readQtyInput(fromQty);
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
    const toAddress = isSolanaBridge ? recipient : selectedWalletEntry.address;
    if (!useBrowserWallet) {
      const ok = window.confirm(
        `Execute ${defiE.label} swap?\n\nwallet: ${swapWalletLabel}\nsell: ${amount} ${fromCoin} on ${fromChain}\nbuy: ${toCoin} on ${toChain}\nrecipient: ${toAddress}`,
      );
      if (!ok) return;
    }

    setSwapPending(true);
    setSwapResult(null);
    const toastId = toast.loading(`${defiE.label}: preparing swap...`);
    try {
      let res;
      if (defi == "jupiter") {
        toast.loading("Jupiter: submitting tx...", { id: toastId });
        if (useBrowserWallet) {
          toast.loading("Jupiter: building wallet prompt...", { id: toastId });
          const built = await buildJupiterSwapTxs({
            walletAddress: selectedWalletEntry.address,
            fromChain,
            toChain,
            fromCoin,
            toCoin,
            amount,
          });
          const txs = [];

          for (const tx of built.txs || []) {
            toast.loading(`Jupiter: confirm ${tx.type}...`, { id: toastId });
            txs.push(
              await sendBrowserSolanaTx({
                tx,
                wallet: selectedWalletEntry.browserWallet,
                address: selectedWalletEntry.address,
              }),
            );
          }
          res = { ...built, txs };
        } else {
          toast.loading("Jupiter: checking quote...", { id: toastId });
          await getJupiterSwapPreview({
            walletAddress: selectedWalletEntry.address,
            fromChain,
            toChain,
            fromCoin,
            toCoin,
            amount,
          });

          toast.loading("Jupiter: submitting swap...", { id: toastId });
          res = await executeJupiterSwap({
            walletName: selectedWalletEntry.name,
            walletAddress: selectedWalletEntry.address,
            fromChain,
            toChain,
            fromCoin,
            toCoin,
            amount,
          });
        }
      } else if (defi == "jumper") {
        if (useBrowserWallet) {
          toast.loading("Jumper: building wallet prompts...", { id: toastId });
          const built = await buildJumperSwapTxs({
            walletAddress: selectedWalletEntry.address,
            fromChain,
            toChain,
            fromCoin,
            toCoin,
            amount,
            recipient: toAddress,
          });
          const txs = [];

          for (const tx of built.txs || []) {
            toast.loading(`Jumper: confirm ${tx.type}...`, { id: toastId });
            txs.push(
              tx.chain == "Solana" || tx.format?.startsWith("solana:")
                ? await sendBrowserSolanaTx({
                    tx,
                    wallet: selectedWalletEntry.browserWallet,
                    address: selectedWalletEntry.address,
                  })
                : await sendBrowserTx({
                    tx,
                    wallet: selectedWalletEntry.browserWallet,
                    address: selectedWalletEntry.address,
                  }),
            );
          }
          res = { ...built, txs };
        } else {
          toast.loading("Jumper: checking quote and allowance...", {
            id: toastId,
          });
          const preview = await getJumperSwapPreview({
            walletAddress: selectedWalletEntry.address,
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

          toast.loading(
            preview.approvalNeeded
              ? "Jumper: approving then swapping..."
              : "Jumper: submitting swap...",
            { id: toastId },
          );
          res = await executeJumperSwap({
            walletName: selectedWalletEntry.name,
            walletAddress: selectedWalletEntry.address,
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
        toast.loading(`${defiE.label}: submitting tx...`, { id: toastId });
        if (useBrowserWallet) {
          toast.loading("Relay: building wallet prompts...", { id: toastId });
          const built = await buildRelaySwapSteps({
            walletAddress: selectedWalletEntry.address,
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
              toast.loading(
                `Relay: confirm ${item.tx.chain} ${item.tx.type}...`,
                { id: toastId },
              );
              txs.push(
                item.tx.chain == "Solana"
                  ? await sendBrowserSolanaTx({
                      tx: item.tx,
                      wallet: selectedWalletEntry.browserWallet,
                      address: selectedWalletEntry.address,
                    })
                  : await sendBrowserTx({
                      tx: item.tx,
                      wallet: selectedWalletEntry.browserWallet,
                      address: selectedWalletEntry.address,
                    }),
              );
            } else if (item.kind == "signature") {
              toast.loading("Relay: sign message...", { id: toastId });
              signatures.push(
                await signBrowserRelayItem({
                  item,
                  wallet: selectedWalletEntry.browserWallet,
                  address: selectedWalletEntry.address,
                }),
              );
            }
          }
          res = { ...built, txs, signatures };
        } else {
          toast.loading("Relay: checking quote and allowance...", {
            id: toastId,
          });
          const preview = await getRelaySwapPreview({
            walletAddress: selectedWalletEntry.address,
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

          toast.loading(
            preview.approvalNeeded
              ? "Relay: approving then swapping..."
              : "Relay: submitting swap...",
            { id: toastId },
          );
          res = await executeRelaySwap({
            walletName: selectedWalletEntry.name,
            walletAddress: selectedWalletEntry.address,
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
          toast.loading("Across: building wallet prompts...", {
            id: toastId,
          });
          const built = await buildAcrossSwapTxs({
            walletAddress: selectedWalletEntry.address,
            fromChain,
            toChain,
            fromCoin,
            toCoin,
            amount,
            recipient: toAddress,
          });
          const txs = [];

          for (const tx of built.txs || []) {
            toast.loading(`Across: confirm ${tx.type}...`, { id: toastId });
            txs.push(
              tx.chain == "Solana" || tx.format?.startsWith("solana:")
                ? await sendBrowserSolanaTx({
                    tx,
                    wallet: selectedWalletEntry.browserWallet,
                    address: selectedWalletEntry.address,
                  })
                : await sendBrowserTx({
                    tx,
                    wallet: selectedWalletEntry.browserWallet,
                    address: selectedWalletEntry.address,
                  }),
            );
          }
          res = { ...built, txs };
        } else {
          toast.loading("Across: checking quote and allowance...", {
            id: toastId,
          });
          const preview = await getAcrossSwapPreview({
            walletAddress: selectedWalletEntry.address,
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

          toast.loading(
            preview.approvalNeeded
              ? "Across: approving then swapping..."
              : "Across: submitting swap...",
            { id: toastId },
          );
          res = await executeAcrossSwap({
            walletName: selectedWalletEntry.name,
            walletAddress: selectedWalletEntry.address,
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
          toast.loading("Uniswap: building wallet prompts...", {
            id: toastId,
          });
          const built = await buildUniswapSwapTxs({
            walletAddress: selectedWalletEntry.address,
            chain: fromChain,
            fromCoin,
            toCoin,
            amount,
          });
          const txs = [];

          for (const tx of built.txs || []) {
            toast.loading(`Uniswap: confirm ${tx.type}...`, { id: toastId });
            txs.push(
              await sendBrowserTx({
                tx,
                wallet: selectedWalletEntry.browserWallet,
                address: selectedWalletEntry.address,
              }),
            );
          }
          res = { ...built, txs };
        } else {
          toast.loading("Uniswap: checking quote and allowance...", {
            id: toastId,
          });
          const preview = await getUniswapSwapPreview({
            walletAddress: selectedWalletEntry.address,
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

          toast.loading(
            preview.approvalNeeded
              ? "Uniswap: approving then swapping..."
              : "Uniswap: submitting swap...",
            { id: toastId },
          );
          res = await executeUniswapSwap({
            walletName: selectedWalletEntry.name,
            walletAddress: selectedWalletEntry.address,
            chain: fromChain,
            fromCoin,
            toCoin,
            amount,
            approvalAmount,
          });
        }
      }

      setSwapResult(res);
      toast.success(
        `${res.dex || defiE.label} submitted ${res.txs?.length || 0} tx`,
        {
          id: toastId,
        },
      );
      onTxComplete({
        ...res,
        refreshTargets: [
          {
            chain: fromChain,
            coin: fromCoin,
            address: selectedWalletEntry.address,
          },
          {
            chain: toChain,
            coin: toCoin,
            address: toAddress,
          },
        ],
      });
    } catch (e) {
      const message = e?.message || `${defiE.label} swap failed`;
      setSwapResult({ ok: false, error: message });
      toast.error(message, { id: toastId });
    } finally {
      setSwapPending(false);
    }
  }

  function setMaxSell() {
    updateSellQty(trimQtyToDecimals(inputQty(maxSell), fromCoinDecimals));
  }

  function getBuyQty(value) {
    return swapRate > 0 ? inputQty(toNum(value) * swapRate) : "0";
  }

  function getSellQty(value) {
    return swapRate > 0
      ? trimQtyToDecimals(inputQty(toNum(value) / swapRate), fromCoinDecimals)
      : "0";
  }

  function updateSellQty(value) {
    const qty = normalizeQtyInput(
      trimQtyToDecimals(clampInputValue(value, maxSell), fromCoinDecimals),
    );
    setQtyInputSide("sell");
    setFromQty(qty);
    setToQty(getBuyQty(qty));
  }

  function updateBuyQty(value) {
    const qty = normalizeQtyInput(clampInputValue(value, maxBuyInput));
    setQtyInputSide("buy");
    setToQty(qty);
    setFromQty(getSellQty(qty));
  }

  function updateSellEnd(value) {
    const endQty = trimQtyToDecimals(
      clampInputValue(value, maxSell),
      fromCoinDecimals,
    );
    setSellEndDraft(readQtyInput(endQty));
    updateSellQty(
      trimQtyToDecimals(inputQty(Math.max(0, maxSell - toNum(endQty))), fromCoinDecimals),
    );
  }

  function updateBuyEnd(value) {
    const endQty = normalizeQtyInput(clampInputValue(value, maxBuyEnd));
    setBuyEndDraft(readQtyInput(endQty));
    updateBuyQty(inputQty(Math.max(0, toNum(endQty) - maxBuy)));
  }

  function nextFromChain() {
    const next = nextValue(sellChainNames, fromChain);
    if (next) selectFromChain(next);
  }

  function nextToChain() {
    const next = nextValue(chainNames, toChain);
    if (next) selectToChain(next);
  }

  function requestSwapSupport(value = "", { force = false } = {}) {
    if (!hasChainDiscovery(value)) return;
    const current = swapSupportM[value] || emptySwapSupportE;
    if (!force && (current.loading || current.loaded)) return;

    if (!force && swapSupportCacheM[value]) {
      setSwapSupportM((supportM) => ({
        ...supportM,
        [value]: swapSupportCacheM[value],
      }));
      return;
    }

    setSwapSupportM((supportM) => {
      return {
        ...supportM,
        [value]: {
          ...current,
          loading: true,
          loaded: false,
          error: "",
        },
      };
    });

    loadSwapSupport(value)
      .then((support) => {
        setSwapSupportM((supportM) => ({
          ...supportM,
          [value]: support,
        }));
      })
      .catch((e) => {
        setSwapSupportM((supportM) => ({
          ...supportM,
          [value]: {
            ...(supportM[value] || emptySwapSupportE),
            loading: false,
            loaded: true,
            error: e?.message || `${getDexLabel(value)} discovery failed`,
          },
        }));
      });
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

  function retrySwapSupport(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!defi) return;
    delete swapSupportCacheM[defi];
    delete swapSupportPromiseM[defi];
    setSwapSupportM((supportM) => ({
      ...supportM,
      [defi]: emptySwapSupportE,
    }));
    requestSwapSupport(defi, { force: true });
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
    if (symbol && coins.includes(symbol)) return symbol;

    const address = String(entry.address || "").toLowerCase();
    if (!address) return "";

    return (
      coins.find((coin) => {
        const coinAddress = String(
          chainE?.coinInfoM?.[coin]?.address || "",
        ).toLowerCase();
        return coinAddress && coinAddress == address;
      }) || ""
    );
  }

  function isDiscoveryCoinSupported(chain = "", coin = "", allTokens = []) {
    const chainE = chainList.find((chainEntry) => chainEntry.chain == chain);
    const coinE = chainE?.coinInfoM?.[coin] || {};
    return allTokens.some((entry) => {
      if (entry.chain != chain) return false;
      if (entry.symbol && entry.symbol == coin) return true;

      const tokenAddress = String(entry.address || "").toLowerCase();
      const coinAddress = String(coinE.address || "").toLowerCase();
      return tokenAddress && coinAddress && tokenAddress == coinAddress;
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

  function renderDiscoveryChainMenu({
    side = "from",
    selectedChain = "",
    addedChains = [],
    allChains = [],
  }) {
    return (
      <span className="sendWalletMenu swapChainMenu">
        <span className="sendWalletMenuCol">
          <span className="sendWalletMenuTitle">added</span>
          {addedChains.length ? (
            addedChains.map((chain) => {
              const supportLoaded =
                swapSupportE.loaded && !swapSupportE.loading && !swapSupportE.error;
              const supported =
                !supportLoaded || allChains.some((entry) => entry.chain == chain);
              return (
                <button
                  key={`${side}_added_${chain}`}
                  type="button"
                  className={
                    [
                      "sendWalletMenuItem",
                      "swapChainAddedItem",
                      chain == selectedChain ? "on" : "",
                      supported ? "" : "unsupported",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  onClick={() =>
                    supported
                      ? selectDiscoveryChain(
                          { chain, name: chain, added: true },
                          side,
                        )
                      : showUnsupportedChain(chain)
                  }
                >
                  <span>{chain}</span>
                  {!supported && <span className="gray">off</span>}
                </button>
              );
            })
          ) : (
            <span className="gray">-</span>
          )}
        </span>
        <span className="sendWalletMenuCol">
          <span className="sendWalletMenuTitle">all</span>
          {swapSupportE.loading && (
            <span className="gray">loading {defiE.label || "DEX"}...</span>
          )}
          {!swapSupportE.loading && swapSupportE.error && (
            <span className="sendWalletMenuItem swapChainAllItem">
              <span className="red">{swapSupportE.error}</span>
              <button
                type="button"
                className="btn small bgGray"
                onClick={retrySwapSupport}
              >
                retry
              </button>
            </span>
          )}
          {!swapSupportE.loading &&
            !swapSupportE.error &&
            !allChains.length && (
              <span className="sendWalletMenuItem swapChainAllItem">
                <span className="gray">-</span>
                <button
                  type="button"
                  className="btn small bgGray"
                  onClick={retrySwapSupport}
                >
                  retry
                </button>
              </span>
            )}
          {!swapSupportE.loading &&
            !swapSupportE.error &&
            allChains.map((entry) => {
              const canSelect =
                !!entry.chain && addedChains.includes(entry.chain);
              const label = entry.name || entry.chain || entry.chainId;
              return (
                <span
                  key={`${side}_all_${entry.chainId || label}`}
                  className={
                    entry.chain == selectedChain
                      ? "sendWalletMenuItem swapChainAllItem on"
                      : "sendWalletMenuItem swapChainAllItem"
                  }
                >
                  <button
                    type="button"
                    className="lendMarketAllSelect swapChainAllSelect"
                    onClick={() => selectDiscoveryChain(entry, side)}
                    disabled={!canSelect}
                  >
                    <span>{label}</span>
                    {entry.chain && entry.chain != label && (
                      <span className="gray">{entry.chain}</span>
                    )}
                  </button>
                  {canSelect ? (
                    <span className="gray">✓</span>
                  ) : (
                    <button
                      type="button"
                      className="btn small bgCyan"
                      onClick={() => showManualChain(entry)}
                    >
                      +
                    </button>
                  )}
                </span>
              );
            })}
        </span>
      </span>
    );
  }

  function renderChainSelect({
    side = "from",
    selectedChain = "",
    addedChains = [],
    allChains = [],
    disabled = false,
    buttonWidth = "8ch",
    title = "",
    onSelect = () => {},
    onNext = () => {},
    onFocusChain = () => {},
    showMenu = false,
    setShowMenu = () => {},
    pickerRef,
  }) {
    if (!hasChainDiscovery(defi)) {
      return (
        <span className="selectCycle">
          <select
            value={selectedChain}
            onChange={(e) => onSelect(e.target.value)}
            onClick={onFocusChain}
            onFocus={onFocusChain}
            disabled={disabled}
            title={title}
          >
            {addedChains.map((chain) => (
              <option key={chain} value={chain}>
                {chain}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small bgGray"
            onClick={onNext}
            disabled={disabled || addedChains.length < 2}
          >
            {">"}
          </button>
        </span>
      );
    }

    return (
      <span className="selectCycle walletCycle swapChainCycle">
        <span className="sendWalletPicker" ref={pickerRef}>
          <button
            type="button"
            className="sendWalletPickerButton"
            style={{ width: buttonWidth }}
            disabled={disabled}
            title={title}
            onClick={() => {
              onFocusChain();
              setShowMenu((show) => !show);
            }}
            onFocus={onFocusChain}
          >
            {selectedChain || "no chain"}
          </button>
          {showMenu &&
            renderDiscoveryChainMenu({
              side,
              selectedChain,
              addedChains,
              allChains,
            })}
        </span>
        <button
          type="button"
          className="btn small bgGray"
          onClick={onNext}
          disabled={disabled || addedChains.length < 2}
        >
          {">"}
        </button>
      </span>
    );
  }

  function renderDiscoveryCoinMenu({
    side = "from",
    chain = "",
    selectedCoin = "",
    addedCoins = [],
    allTokens = [],
    tokenDiscoveryE = swapSupportE,
    strictSupport = true,
    searchTerm = "",
    onSearchChange = () => {},
    onSearchSubmit = () => {},
    onRetryTokens = retrySwapSupport,
    showSearch = false,
  }) {
    return (
      <span className="sendWalletMenu swapCoinMenu">
        <span className="sendWalletMenuCol">
          <span className="sendWalletMenuTitle">added</span>
          {addedCoins.length ? (
            addedCoins.map((coin) => {
              const supportLoaded =
                strictSupport &&
                tokenDiscoveryE.loaded &&
                !tokenDiscoveryE.loading &&
                !tokenDiscoveryE.error;
              const supported =
                !supportLoaded ||
                isDiscoveryCoinSupported(chain, coin, allTokens);
              return (
                <button
                  key={`${side}_added_coin_${coin}`}
                  type="button"
                  className={
                    [
                      "sendWalletMenuItem",
                      "swapCoinAddedItem",
                      coin == selectedCoin ? "on" : "",
                      supported ? "" : "unsupported",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  onClick={() =>
                    supported
                      ? selectDiscoveryCoin({ symbol: coin }, side)
                      : showUnsupportedCoin(chain, coin)
                  }
                >
                  <span>{coin}</span>
                  {!supported && <span className="gray">off</span>}
                </button>
              );
            })
          ) : (
            <span className="gray">-</span>
          )}
        </span>
        <span className="sendWalletMenuCol">
          <span className="sendWalletMenuTitle">discovery</span>
          {showSearch && (
            <form className="swapCoinSearch" onSubmit={onSearchSubmit}>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="search"
              />
              <button type="submit" className="btn small bgGray">
                go
              </button>
            </form>
          )}
          {tokenDiscoveryE.loading && (
            <span className="gray">loading {defiE.label || "DEX"}...</span>
          )}
          {!tokenDiscoveryE.loading && tokenDiscoveryE.error && (
            <span className="sendWalletMenuItem swapCoinAllItem">
              <span className="red">{tokenDiscoveryE.error}</span>
              <button
                type="button"
                className="btn small bgGray"
                onClick={onRetryTokens}
              >
                retry
              </button>
            </span>
          )}
          {!tokenDiscoveryE.loading &&
            !tokenDiscoveryE.error &&
            !allTokens.length && (
              <span className="sendWalletMenuItem swapCoinAllItem">
                <span className="gray">-</span>
                <button
                  type="button"
                  className="btn small bgGray"
                  onClick={onRetryTokens}
                >
                  retry
                </button>
              </span>
            )}
          {!tokenDiscoveryE.loading &&
            !tokenDiscoveryE.error &&
            allTokens.map((entry, index) => {
              const localCoin = findLocalCoinForDiscovery(chain, entry);
              const addressKey = String(entry.address || "").toLowerCase();
              const added =
                !!localCoin || !!locallyAddedAddressM[`${chain}:${addressKey}`];
              const symbol = entry.symbol || "token";
              return (
                <span
                  key={`${side}_all_coin_${getDiscoveryTokenKey(entry, index)}`}
                  className={
                    localCoin == selectedCoin
                      ? "sendWalletMenuItem swapCoinAllItem on"
                      : "sendWalletMenuItem swapCoinAllItem"
                  }
                >
                  <button
                    type="button"
                    className="lendMarketAllSelect swapCoinAllSelect"
                    onClick={() =>
                      localCoin
                        ? selectDiscoveryCoin(entry, side)
                        : openDiscoveryCoinConfirm(
                            { preventDefault() {}, stopPropagation() {} },
                            chain,
                            entry,
                          )
                    }
                  >
                    <span>{symbol}</span>
                    {entry.name && entry.name != symbol && (
                      <span className="gray">{entry.name}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={added ? "btn small bgGray" : "btn small bgCyan"}
                    onClick={(e) => openDiscoveryCoinConfirm(e, chain, entry)}
                    disabled={added || addingCoin}
                    title={entry.name || symbol}
                  >
                    {added ? "✓" : "+"}
                  </button>
                </span>
              );
            })}
        </span>
      </span>
    );
  }

  function renderCoinSelect({
    side = "from",
    chain = "",
    selectedCoin = "",
    addedCoins = [],
    allTokens = [],
    tokenDiscoveryE = swapSupportE,
    strictSupport = true,
    searchTerm = "",
    onSearchChange = () => {},
    onSearchSubmit = () => {},
    onRetryTokens = retrySwapSupport,
    onOpen = () => {},
    showSearch = false,
    buttonWidth = "8ch",
    onSelect = () => {},
    onNext = () => {},
    showMenu = false,
    setShowMenu = () => {},
    pickerRef,
  }) {
    if (!hasChainDiscovery(defi)) {
      return (
        <span className="selectCycle">
          <select value={selectedCoin} onChange={(e) => onSelect(e.target.value)}>
            {addedCoins.map((coin) => (
              <option key={coin} value={coin}>
                {coin}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small bgGray"
            onClick={onNext}
            disabled={addedCoins.length < 2}
          >
            {">"}
          </button>
        </span>
      );
    }

    return (
      <span className="selectCycle walletCycle swapCoinCycle">
        <span className="sendWalletPicker" ref={pickerRef}>
          <button
            type="button"
            className="sendWalletPickerButton"
            style={{ width: buttonWidth }}
            onClick={() => {
              const nextShow = !showMenu;
              setShowMenu(nextShow);
              if (nextShow) onOpen();
            }}
          >
            {selectedCoin || "no coin"}
          </button>
          {showMenu &&
            renderDiscoveryCoinMenu({
              side,
              chain,
              selectedCoin,
              addedCoins,
              allTokens,
              tokenDiscoveryE,
              strictSupport,
              searchTerm,
              onSearchChange,
              onSearchSubmit,
              onRetryTokens,
              showSearch,
            })}
        </span>
        <button
          type="button"
          className="btn small bgGray"
          onClick={onNext}
          disabled={addedCoins.length < 2}
        >
          {">"}
        </button>
      </span>
    );
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

            <label className="gray" htmlFor="swapCoinConfirmKey">
              coin
            </label>
            <input
              id="swapCoinConfirmKey"
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

            <label className="gray" htmlFor="swapCoinConfirmName">
              name
            </label>
            <input
              id="swapCoinConfirmName"
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

            <label className="gray" htmlFor="swapCoinConfirmType">
              type
            </label>
            <span className="walletCoinConfirmTypeRow">
              <select
                id="swapCoinConfirmType"
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
    <div className="tradePane swapPane">
      {CustomCoinConfirmModal()}
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
          <button
            type="button"
            className="btn nx bgGray"
            onClick={onCycleTradeType}
          >
            {">"}
          </button>
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
          <button
            type="button"
            className="btn nx bgGray"
            onClick={nextDex}
            disabled={availableDexOptions.length < 2}
          >
            {">"}
          </button>
        </label>
        <span className="gray">
          {defiE.bridge ? "bridge swap" : "same-chain swap"}
        </span>
      </div>

      <div className="swapRows">
        <div className="swapBox">
          <div className="swapAssetLine">
            {renderChainSelect({
              side: "from",
              selectedChain: fromChain,
              addedChains: sellChainNames,
              allChains: fromDiscoveryChainEntries,
              buttonWidth: fromChainButtonWidth,
              onSelect: selectFromChain,
              onNext: nextFromChain,
              onFocusChain: () => fromChain && emitTradeChainSelect(fromChain),
              showMenu: showFromChainMenu,
              setShowMenu: setShowFromChainMenu,
              pickerRef: fromChainPickerRef,
            })}
            {renderCoinSelect({
              side: "from",
              chain: fromChain,
              selectedCoin: fromCoin,
              addedCoins: fromCoins,
              allTokens: fromSwapTokenEntries,
              tokenDiscoveryE: fromTokenDiscoveryE,
              strictSupport: !usesLazyTokenDiscovery,
              searchTerm: relayTokenSearchM.from,
              onSearchChange: (value) => changeRelayTokenSearch("from", value),
              onSearchSubmit: (e) =>
                submitRelayTokenSearch(e, "from", fromChain),
              onRetryTokens: (e) => retryRelayCurrencies(e, "from", fromChain),
              onOpen: () => openRelayCoinMenu("from", fromChain),
              showSearch: usesLazyTokenDiscovery,
              buttonWidth: fromCoinButtonWidth,
              onSelect: selectFromCoin,
              onNext: nextFromCoin,
              showMenu: showFromCoinMenu,
              setShowMenu: setShowFromCoinMenu,
              pickerRef: fromCoinPickerRef,
            })}
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
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              max={maxSell || 0}
              step="any"
              value={sellEndDraft || inputQty(sellEnd)}
              size={qtyInputSize(sellEndDraft || inputQty(sellEnd))}
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
              onChange={(e) => updateSellQty(e.target.value)}
            />
            {fromPrice > 0 && (
              <span className="gray">${fmt(sellQtyUsd, 2)}</span>
            )}
          </div>
        </div>

        <div className="swapMiddle">
          <label className="swapGasSelect">
            <span className="gray">gas:</span>
            <select value="default" disabled>
              <option value="default">auto</option>
            </select>
          </label>
          <input
            className="swapMiddleRange"
            type="range"
            min="0"
            max={maxSell || 0}
            step="any"
            value={sellSliderValue}
            onChange={(e) => updateSellQty(inputQty(e.target.value))}
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
            {renderChainSelect({
              side: "to",
              selectedChain: toChain,
              addedChains: chainNames,
              allChains: toDiscoveryChainEntries,
              disabled: !defiE.bridge,
              buttonWidth: toChainButtonWidth,
              title: defiE.bridge ? "" : "DEX swap uses the same chain",
              onSelect: selectToChain,
              onNext: nextToChain,
              onFocusChain: () => toChain && emitTradeChainSelect(toChain),
              showMenu: showToChainMenu,
              setShowMenu: setShowToChainMenu,
              pickerRef: toChainPickerRef,
            })}
            {renderCoinSelect({
              side: "to",
              chain: toChain,
              selectedCoin: toCoin,
              addedCoins: toCoins,
              allTokens: toSwapTokenEntries,
              tokenDiscoveryE: toTokenDiscoveryE,
              strictSupport: !usesLazyTokenDiscovery,
              searchTerm: relayTokenSearchM.to,
              onSearchChange: (value) => changeRelayTokenSearch("to", value),
              onSearchSubmit: (e) => submitRelayTokenSearch(e, "to", toChain),
              onRetryTokens: (e) => retryRelayCurrencies(e, "to", toChain),
              onOpen: () => openRelayCoinMenu("to", toChain),
              showSearch: usesLazyTokenDiscovery,
              buttonWidth: toCoinButtonWidth,
              onSelect: selectToCoin,
              onNext: nextToCoin,
              showMenu: showToCoinMenu,
              setShowMenu: setShowToCoinMenu,
              pickerRef: toCoinPickerRef,
            })}
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
            <input
              className="swapQtyInput"
              type="text"
              inputMode="decimal"
              min="0"
              max={maxBuyEnd || maxBuy || 0}
              step="any"
              value={buyEndDraft || inputQty(buyEnd)}
              size={qtyInputSize(buyEndDraft || inputQty(buyEnd))}
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
              {swapResult.txs?.map((tx) => (
                <SwapTxLink key={tx.hash} tx={tx} />
              ))}
              {!!swapResult.requestIds?.length && (
                <span className="gray">
                  {" "}
                  request: {swapResult.requestIds[0].slice(0, 10)}...
                </span>
              )}
            </>
          ) : (
            <span className="red">{swapResult.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
