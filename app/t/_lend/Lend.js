"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  buildAaveLendTxs,
  buildVenusLendTxs,
  executeAaveLend,
  executeVenusLend,
  getAaveAllMarkets,
  getAaveLendPreview,
  getAaveMarketBalance,
  getTradeCoinPrice,
  getVenusAllMarkets,
  getVenusLendPreview,
  getVenusMarketBalance,
} from "./act";
import { addCustomCoin, previewCustomCoin } from "../../w/coinActions";
import {
  addLocalCustomCoin,
  useLocalStorageEditor,
} from "../../browserEditorStorage";
import {
  clampInputValue,
  fmt,
  fmtPrice,
  fmtRate,
  getChainCoins,
  inputQty,
  lendingOptions,
  nextValue,
  noLending,
  normalizeQtyInput,
  priceKey,
  readQtyInput,
  sameAddress,
  sendBrowserTx,
  SwapTxLink,
  toNum,
} from "../sharedClient";

function isProtocolCoin(protocol, coin, coinE = {}) {
  if (coinE.type != "lending") return false;

  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  if (protocol == "aave") return text.includes("aave") || /^a[A-Z]/.test(coin);
  if (protocol == "venus") {
    return (
      /^v[A-Z]/.test(coin) ||
      (text.includes("venus") && !/^f[A-Z]/.test(coin))
    );
  }

  return false;
}

function getUnderlyingCoin(chainE, lendCoin) {
  const coinInfoM = chainE?.coinInfoM || {};
  const lendE = coinInfoM[lendCoin] || {};
  const text = `${lendCoin} ${lendE.name || ""}`.toLowerCase();
  const candidates = getChainCoins(chainE)
    .filter((coin) => coin != lendCoin)
    .filter((coin) => coinInfoM[coin]?.type != "lending")
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
        lendCoin,
        lendName: lendE.name || lendCoin,
        underlyingCoin,
      };
    })
    .filter((entry) => entry.underlyingCoin);
}

function getMarketLabel(entry = {}) {
  return entry?.underlyingCoin
    ? `${entry.underlyingCoin} (${entry.lendCoin})`
    : "coin";
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

const aaveConfiguredChainSet = new Set([
  "Ethereum",
  "EthereumEtherFi",
  "EthereumHorizon",
  "EthereumLido",
  "BSC",
  "BNB",
  "Arbitrum",
  "Avalanche",
  "Optimism",
  "Polygon",
  "Base",
  "Celo",
  "Fantom",
  "Gnosis",
  "Harmony",
  "Ink",
  "Linea",
  "Mantle",
  "MegaEth",
  "Metis",
  "Monad",
  "Plasma",
  "Scroll",
  "Soneium",
  "Sonic",
  "XLayer",
  "ZkSync",
  "zkSyncEra",
]);

function getSelectedBalance(chainE, coin, selectedWalletEntry) {
  if (!chainE || !coin || !selectedWalletEntry) return {};

  const row = chainE.rows?.find(
    (entry) =>
      sameAddress(entry.address, selectedWalletEntry.address) ||
      entry.name == selectedWalletEntry.name,
  );

  return row?.balances?.[coin] || {};
}

export default function LendPanel({
  data = [],
  selectedWalletEntry,
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
  const [defi, setDefi] = useState(lendingOptions[0]?.value || "");
  const [chain, setChain] = useState("");
  const [market, setMarket] = useState("");
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
  const [autoApproval, setAutoApproval] = useState(false);
  const [showMarketMenu, setShowMarketMenu] = useState(false);
  const [aaveAllMarketM, setAaveAllMarketM] = useState({});
  const [aaveAllLoadingM, setAaveAllLoadingM] = useState({});
  const [aaveAllErrorM, setAaveAllErrorM] = useState({});
  const [aaveAllRetryTick, setAaveAllRetryTick] = useState(0);
  const [venusAllMarketM, setVenusAllMarketM] = useState({});
  const [venusAllLoadingM, setVenusAllLoadingM] = useState({});
  const [venusAllErrorM, setVenusAllErrorM] = useState({});
  const [venusAllRetryTick, setVenusAllRetryTick] = useState(0);
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
  const marketPickerRef = useRef(null);
  const mountedRef = useRef(false);
  const useLocalEditorStore = useLocalStorageEditor();
  const lendingE =
    lendingOptions.find((entry) => entry.value == defi) || noLending;
  const chainMarketsM = useMemo(() => {
    return Object.fromEntries(
      chainList.map((chainE) => [chainE.chain, getLendingMarkets(chainE, defi)]),
    );
  }, [chainList, defi]);
  const marketChains = useMemo(
    () =>
      chainList
        .filter((chainE) =>
          defi == "aave"
            ? aaveConfiguredChainSet.has(chainE.chain) ||
              chainMarketsM[chainE.chain]?.length
            : chainMarketsM[chainE.chain]?.length,
        )
        .map((chainE) => chainE.chain),
    [chainList, chainMarketsM, defi],
  );
  const activeChain = marketChains.includes(chain) ? chain : marketChains[0] || "";
  const chainE =
    chainList.find((entry) => entry.chain == activeChain) ||
    chainList.find((entry) => marketChains.includes(entry.chain)) ||
    chainList[0];
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
  const aaveAllKey = chainE?.chain || "";
  const aaveAllMarkets = (aaveAllMarketM[aaveAllKey] || [])
    .map((entry) => {
      const addressKey = String(entry.lendAddress || "").toLowerCase();
      const underlyingAddressKey = String(entry.underlyingAddress || "").toLowerCase();
      const addedValue = addedMarketAddressM[addressKey] || "";
      const addedUnderlying =
        entry.addedUnderlying ||
        !!addedCoinAddressM[underlyingAddressKey] ||
        !!locallyAddedAddressM[`${aaveAllKey}:${underlyingAddressKey}`];
      const addedLend =
        entry.addedLend ||
        !!addedValue ||
        !!locallyAddedAddressM[`${aaveAllKey}:${addressKey}`];

      return {
        ...entry,
        addedUnderlying,
        addedLend,
        addedValue,
      };
    })
    .filter((entry) => !entry.addedUnderlying || !entry.addedLend);
  const aaveAllLoading = !!aaveAllLoadingM[aaveAllKey];
  const aaveAllError = aaveAllErrorM[aaveAllKey] || "";
  const venusAllKey = chainE?.chain || "";
  const venusAllMarkets = (venusAllMarketM[venusAllKey] || [])
    .map((entry) => {
      const addressKey = String(entry.lendAddress || "").toLowerCase();
      const underlyingAddressKey = String(entry.underlyingAddress || "").toLowerCase();
      const addedValue = addedMarketAddressM[addressKey] || "";
      const addedUnderlying =
        entry.addedUnderlying ||
        !!addedCoinAddressM[underlyingAddressKey] ||
        !!locallyAddedAddressM[`${venusAllKey}:${underlyingAddressKey}`];
      const addedLend =
        entry.addedLend ||
        !!addedValue ||
        !!locallyAddedAddressM[`${venusAllKey}:${addressKey}`];

      return {
        ...entry,
        addedUnderlying,
        addedLend,
        addedValue,
      };
    })
    .filter((entry) => !entry.addedUnderlying || !entry.addedLend);
  const venusAllLoading = !!venusAllLoadingM[venusAllKey];
  const venusAllError = venusAllErrorM[venusAllKey] || "";
  const allMarkets =
    defi == "aave"
      ? aaveAllMarkets
      : defi == "venus"
        ? venusAllMarkets
        : [];
  const allLoading =
    defi == "aave"
      ? aaveAllLoading
      : defi == "venus"
        ? venusAllLoading
        : false;
  const allError =
    defi == "aave"
      ? aaveAllError
      : defi == "venus"
        ? venusAllError
        : "";
  const hasProtocolAllMarkets = defi == "aave" || defi == "venus";
  const allProtocolLabel = defi == "venus" ? "Venus" : "Aave";
  const marketE =
    markets.find((entry) => entry.value == market) ||
    allMarkets.find((entry) => entry.value == market) ||
    markets[0];
  const marketButtonWidth = useMemo(() => {
    const maxLabelLength = Math.max(
      8,
      ...addedMarkets.map((entry) => getMarketLabel(entry).length),
    );

    return `${Math.min(Math.max(maxLabelLength - 1, 1), 32)}ch`;
  }, [addedMarkets]);
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
  const usesDirectMarket =
    hasProtocolAllMarkets &&
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
  const underlyingBalance =
    usesDirectMarket && directBalance.underlying
      ? directBalance.underlying
      : localUnderlyingBalance;
  const receiptBalance =
    usesDirectMarket && directBalance.lend
      ? directBalance.lend
      : localReceiptBalance;
  const maxUnderlying = toNum(underlyingBalance.balance);
  const maxReceipt = toNum(receiptBalance.balance);
  const underlyingPriceKey = priceKey(chainE?.chain || "", underlyingCoin);
  const receiptPriceKey = priceKey(chainE?.chain || "", lendCoin);
  const marketPreviewKey = `${defi}:${chainE?.chain || ""}:${underlyingCoin}:${lendCoin}`;
  const marketPreview = marketPreviewM[marketPreviewKey];
  const marketPreviewLoaded = marketPreview !== undefined;
  const marketLoading = !!marketLoadingM[marketPreviewKey];
  const venusReceiptRate =
    defi == "venus" ? toNum(marketPreview?.receiptPerUnderlying) : 0;
  const underlyingListPrice = toNum(underlyingBalance.price);
  const receiptListPrice = toNum(receiptBalance.price);
  const underlyingFallbackPrice = fallbackPriceM[underlyingPriceKey];
  const receiptFallbackPrice = fallbackPriceM[receiptPriceKey];
  const underlyingPrice =
    underlyingListPrice || toNum(underlyingFallbackPrice) || 0;
  const receiptPrice =
    receiptListPrice ||
    toNum(receiptFallbackPrice) ||
    (defi == "venus" && underlyingPrice && venusReceiptRate
      ? underlyingPrice / venusReceiptRate
      : 0);
  const receiptRate =
    defi == "aave"
      ? 1
      : defi == "venus" && venusReceiptRate
        ? venusReceiptRate
      : underlyingPrice && receiptPrice
        ? underlyingPrice / receiptPrice
        : 1;
  const underlyingQty = toNum(lendQty);
  const receiptQtyNum = toNum(receiptQty);
  const isRedeem = qtyInputSide == "redeem";
  const lendSliderValue = Math.min(underlyingQty, maxUnderlying);
  const redeemSliderValue = Math.min(receiptQtyNum, maxReceipt);
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

  useEffect(() => {
    if (
      lendingOptions.length &&
      !lendingOptions.some((entry) => entry.value == defi)
    ) {
      setDefi(lendingOptions[0].value);
    }
  }, [defi]);

  useEffect(() => {
    if (marketChains.length && !marketChains.includes(chain)) {
      setChain(marketChains[0]);
    } else if (!marketChains.length && chain) {
      setChain("");
    }
  }, [chain, marketChains]);

  useEffect(() => {
    const marketExists =
      markets.some((entry) => entry.value == market) ||
      allMarkets.some((entry) => entry.value == market);

    if (markets.length && !marketExists) {
      setMarket((hasProtocolAllMarkets ? addedMarkets[0] : null)?.value || markets[0].value);
    } else if (!markets.length && !allMarkets.length && market) {
      setMarket("");
    }
  }, [addedMarkets, allMarkets, hasProtocolAllMarkets, market, markets]);

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
    if (defi != "aave" || !showMarketMenu || !aaveAllKey) return;
    if (aaveAllMarketM[aaveAllKey] !== undefined || aaveAllLoadingM[aaveAllKey]) {
      return;
    }

    setAaveAllLoadingM((loadingM) => ({ ...loadingM, [aaveAllKey]: true }));
    setAaveAllErrorM((errorM) => ({ ...errorM, [aaveAllKey]: "" }));
    withClientTimeout(
      getAaveAllMarkets({ chain: aaveAllKey }),
      aaveAllKey == "Ethereum" ? 45000 : 25000,
      `${aaveAllKey} Aave loading timeout`,
    )
      .then((res) => {
        if (!mountedRef.current) return;
        setAaveAllMarketM((marketM) => ({
          ...marketM,
          [aaveAllKey]: Array.isArray(res?.markets) ? res.markets : [],
        }));
      })
      .catch((e) => {
        if (!mountedRef.current) return;
        setAaveAllMarketM((marketM) => ({ ...marketM, [aaveAllKey]: [] }));
        setAaveAllErrorM((errorM) => ({
          ...errorM,
          [aaveAllKey]: e?.message || "Aave markets failed",
        }));
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setAaveAllLoadingM((loadingM) => ({
          ...loadingM,
          [aaveAllKey]: false,
        }));
      });
  }, [
    aaveAllKey,
    aaveAllRetryTick,
    defi,
    showMarketMenu,
  ]);

  useEffect(() => {
    if (defi != "venus" || !showMarketMenu || !venusAllKey) return;
    if (venusAllMarketM[venusAllKey] !== undefined || venusAllLoadingM[venusAllKey]) {
      return;
    }

    setVenusAllLoadingM((loadingM) => ({ ...loadingM, [venusAllKey]: true }));
    setVenusAllErrorM((errorM) => ({ ...errorM, [venusAllKey]: "" }));
    withClientTimeout(
      getVenusAllMarkets({ chain: venusAllKey }),
      45000,
      `${venusAllKey} Venus loading timeout`,
    )
      .then((res) => {
        if (!mountedRef.current) return;
        setVenusAllMarketM((marketM) => ({
          ...marketM,
          [venusAllKey]: Array.isArray(res?.markets) ? res.markets : [],
        }));
      })
      .catch((e) => {
        if (!mountedRef.current) return;
        setVenusAllMarketM((marketM) => ({ ...marketM, [venusAllKey]: [] }));
        setVenusAllErrorM((errorM) => ({
          ...errorM,
          [venusAllKey]: e?.message || "Venus markets failed",
        }));
      })
      .finally(() => {
        if (!mountedRef.current) return;
        setVenusAllLoadingM((loadingM) => ({
          ...loadingM,
          [venusAllKey]: false,
        }));
      });
  }, [
    defi,
    showMarketMenu,
    venusAllKey,
    venusAllRetryTick,
  ]);

  useEffect(() => {
    if (
      !usesDirectMarket ||
      !directBalanceKey ||
      !selectedWalletEntry?.address ||
      directBalanceM[directBalanceKey] ||
      directBalanceLoadingM[directBalanceKey]
    ) {
      return;
    }

    let cancelled = false;
    setDirectBalanceLoadingM((loadingM) => ({
      ...loadingM,
      [directBalanceKey]: true,
    }));
    const getMarketBalance =
      defi == "venus" ? getVenusMarketBalance : getAaveMarketBalance;
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
      `${chainE.chain} ${defi == "venus" ? "Venus" : "Aave"} balance timeout`,
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
    selectedWalletEntry?.address,
    usesDirectMarket,
  ]);

  useEffect(() => {
    if (
      defi != "venus" ||
      !chainE?.chain ||
      !underlyingCoin ||
      !lendCoin ||
      !selectedWalletEntry?.address
    ) {
      return;
    }
    if (marketPreviewLoaded) return;

    let cancelled = false;
    setMarketLoadingM((loadingM) => ({
      ...loadingM,
      [marketPreviewKey]: true,
    }));
    getVenusLendPreview({
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
    const qty = normalizeQtyInput(clampInputValue(value, maxReceipt));
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

  function nextDefi() {
    const next = nextValue(
      lendingOptions.map((option) => option.value),
      defi,
    );
    if (next) setDefi(next);
  }

  function nextChain() {
    const next = nextValue(marketChains, chainE?.chain || chain);
    if (next) setChain(next);
  }

  function nextMarket() {
    const cycleMarkets = hasProtocolAllMarkets ? addedMarkets : markets;
    const next = nextValue(
      cycleMarkets.map((entry) => entry.value),
      market,
    );
    if (next) setMarket(next);
  }

  function prevMarket() {
    const cycleMarkets = hasProtocolAllMarkets ? addedMarkets : markets;
    const values = cycleMarkets.map((entry) => entry.value);
    const index = values.indexOf(market);
    const next = values.length
      ? values[(index - 1 + values.length) % values.length]
      : "";
    if (next) setMarket(next);
  }

  function selectMarket(value) {
    setMarket(value);
    setShowMarketMenu(false);
  }

  function retryAaveAllMarkets(e) {
    e.preventDefault();
    e.stopPropagation();
    setAaveAllMarketM((marketM) => {
      const next = { ...marketM };
      delete next[aaveAllKey];
      return next;
    });
    setAaveAllErrorM((errorM) => ({ ...errorM, [aaveAllKey]: "" }));
    setAaveAllLoadingM((loadingM) => ({ ...loadingM, [aaveAllKey]: false }));
    setAaveAllRetryTick((tick) => tick + 1);
  }

  function retryVenusAllMarkets(e) {
    e.preventDefault();
    e.stopPropagation();
    setVenusAllMarketM((marketM) => {
      const next = { ...marketM };
      delete next[venusAllKey];
      return next;
    });
    setVenusAllErrorM((errorM) => ({ ...errorM, [venusAllKey]: "" }));
    setVenusAllLoadingM((loadingM) => ({ ...loadingM, [venusAllKey]: false }));
    setVenusAllRetryTick((tick) => tick + 1);
  }

  function retryAllMarkets(e) {
    if (defi == "venus") {
      retryVenusAllMarkets(e);
      return;
    }

    retryAaveAllMarkets(e);
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
    updateRedeemQty(inputQty(maxReceipt));
  }

  async function runLend(action) {
    if (!lendCoin || !underlyingCoin) {
      toast.error(`${lendingE.label}: no lending market selected`);
      return;
    }
    const isAave = defi == "aave";
    const isVenus = defi == "venus";

    if (!isAave && !isVenus) {
      toast(`${lendingE.label}: lending not wired yet`);
      return;
    }
    const protocol = isVenus ? "Venus" : "Aave";
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
    const qty = redeem ? readQtyInput(receiptQty) : readQtyInput(lendQty);
    const autoApprovalAmount = !redeem && autoApproval ? qty : "";
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
      toast.error(`${action} qty is 0`);
      return;
    }

    const useBrowserWallet = !!selectedWalletEntry?.isBrowserWallet;
    const buildTxs = isVenus ? buildVenusLendTxs : buildAaveLendTxs;
    const executeLend = isVenus ? executeVenusLend : executeAaveLend;
    const previewLend = isVenus ? getVenusLendPreview : getAaveLendPreview;
    const directMarketArgs =
      (isAave || isVenus) && usesDirectMarket
        ? {
            underlyingAddress: marketE.underlyingAddress,
            underlyingDecimals: marketE.underlyingDecimals,
            lendAddress: marketE.lendAddress,
            lendDecimals: marketE.lendDecimals,
          }
        : {};
    const toastId = toast.loading(`${protocol}: preparing ${action}...`);
    setLendPending(true);
    setLendPendingAction(action);
    setLendResult(null);

    try {
      let res;
      if (useBrowserWallet) {
        toast.loading(`${protocol}: building ${action} wallet prompt...`, {
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
        const ok = window.confirm(
          `Execute ${protocol} ${action}?\n\nwallet: ${
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
        if (!redeem) {
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

        toast.loading(`${protocol}: submitting ${action}...`, { id: toastId });
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
      toast.success(`${protocol} ${action} submitted ${res.txs?.length || 0} tx`, {
        id: toastId,
      });
      onTxComplete(res);
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
            <span className="walletCoinConfirmAddress" title={entry.address}>
              {entry.address}
            </span>

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
            value={defi}
            onChange={(e) => setDefi(e.target.value)}
          >
            {lendingOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn nx bgGray"
            onClick={nextDefi}
            disabled={lendingOptions.length < 2}
          >
            {">"}
          </button>
        </label>
        <span className="selectCycle">
          <select
            value={marketChains.length ? chainE?.chain || "" : ""}
            onChange={(e) => setChain(e.target.value)}
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
        {hasProtocolAllMarkets ? (
          <span className="selectCycle walletCycle lendMarketCycle">
            <button
              type="button"
              className="btn small bgGray"
              onClick={prevMarket}
              disabled={addedMarkets.length < 2}
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
                    {addedMarkets.length ? (
                      addedMarkets.map((entry) => (
                        <button
                          key={`wallet_${entry.value}`}
                          type="button"
                          className={
                            entry.value == market
                              ? "sendWalletMenuItem on"
                              : "sendWalletMenuItem"
                          }
                          onClick={() => selectMarket(entry.value)}
                        >
                          <span>{entry.underlyingCoin}</span>
                          <span className="gray">{entry.lendCoin}</span>
                        </button>
                      ))
                    ) : (
                      <span className="gray">-</span>
                    )}
                  </span>
                  <span className="sendWalletMenuCol">
                    <span className="sendWalletMenuTitle">all</span>
                    {allLoading && (
                      <span className="gray">loading {allProtocolLabel}...</span>
                    )}
                    {!allLoading && allError && (
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
                        <span className="gray">-</span>
                        <button
                          type="button"
                          className="btn small bgGray"
                          onClick={retryAllMarkets}
                        >
                          retry
                        </button>
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
                          <span className="lendMarketAllTokens">
                            <span className="lendMarketAllToken">
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
                                {entry.addedUnderlying ? "added" : "add"}
                              </button>
                            </span>
                            <span className="lendMarketAllToken">
                              <button
                                type="button"
                                className="lendMarketAllSelect"
                                onClick={() =>
                                  selectMarket(entry.addedValue || entry.value)
                                }
                                title={entry.lendName}
                              >
                                <span className="gray">{entry.lendCoin}</span>
                              </button>
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
                                {entry.addedLend ? "added" : "add"}
                              </button>
                            </span>
                          </span>
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
              disabled={addedMarkets.length < 2}
            >
              {">"}
            </button>
          </span>
        ) : (
          <span className="selectCycle">
            <select
              value={marketE?.value || ""}
              onChange={(e) => setMarket(e.target.value)}
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
              {directBalanceLoading ? "..." : fmt(underlyingBalance.balance)}
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
            <span className="gray">lend</span>
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
              {lendPendingAction == "lend" ? "LENDING" : "LEND"}
            </button>
          </div>
        </div>

        <div className="swapMiddle">
          <label className="swapGasSelect">
            <span className="gray">gas:</span>
            <select value="default" disabled>
              <option value="default">default</option>
            </select>
          </label>
          {!selectedWalletEntry?.isBrowserWallet && (
            <label className="swapAutoApproval">
              <input
                type="checkbox"
                checked={autoApproval}
                onChange={(e) => setAutoApproval(e.target.checked)}
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
              {directBalanceLoading ? "..." : fmt(receiptBalance.balance)}
              {receiptUsd > 0 && (
                <span className="gray"> ${fmt(receiptUsd, 2)}</span>
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
            <span className="gray">redeem</span>
            <input
              type="number"
              min="0"
              max={maxReceipt || 0}
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
              max={maxReceipt || 0}
              step="any"
              value={redeemSliderValue}
              onChange={(e) => updateRedeemQty(inputQty(e.target.value))}
              disabled={!maxReceipt}
            />
            <button
              type="button"
              className="btn small bgGray"
              onClick={setMaxRedeem}
              disabled={!maxReceipt}
            >
              max
            </button>
            <button
              type="button"
              className="btn swapActionButton bgCyan"
              onClick={() => runLend("redeem")}
              disabled={lendPending}
            >
              {lendPendingAction == "redeem" ? "REDEEMING" : "REDEEM"}
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
