"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import {
  AprText,
  LendCoinInfoCard,
  LendMarketPicker,
  MarketCoinBalance,
  getBalanceQty,
  getCoinTypeOptions,
  getInitialCookie,
  getInitialLendDefi,
  getLendMarketChains,
  getLendingMarkets,
  getMarketCoinBalance,
  getMarketLabel,
  getMarketSupplyApr,
  getProtocolCookie,
  getSelectedBalance,
  getTokenAddressKey,
  hasLoadedBalance,
  isLendingProtocolSupportedForWallet,
  useLendAllMarkets,
  useLendDirectMarketBalance,
  withClientTimeout,
} from "./Client";
import {
  buildAaveLendTxs,
  executeAaveLend,
  getAaveAllMarkets,
  getAaveLendPreview,
  getAaveMarketBalance,
} from "./aave/sv";
import AaveClient from "./aave/Client";
import {
  buildJupiterLendTxs,
  executeJupiterLend,
  getJupiterAllMarkets,
  getJupiterLendPreview,
  getJupiterMarketBalance,
} from "./jupiter/sv";
import JupiterLendClient from "./jupiter/Client";
import {
  buildMorphoLendTxs,
  executeMorphoLend,
  getMorphoAllMarkets,
  getMorphoLendPreview,
  getMorphoMarketBalance,
} from "./morpho/sv";
import MorphoClient from "./morpho/Client";
import {
  buildVenusLendTxs,
  executeVenusLend,
  getVenusAllMarkets,
  getVenusLendPreview,
  getVenusMarketBalance,
} from "./venus/sv";
import VenusClient from "./venus/Client";
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
  absTradeQty,
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
  getQtyDecimals,
  getTradeModeCookie,
  lendingOptions,
  limitQtyInputDecimals,
  nextValue,
  noLending,
  normalizeSignedQtyInput,
  priceKey,
  qtyInputSize,
  qtyInputStyle,
  rangeQtyInput,
  runTradeWalletLoop,
  sameAddress,
  sendBrowserTradeTx,
  SwapTxLink,
  tradeAutoApprovalCookie,
  tradeLendChainCookie,
  tradeLendDefiCookie,
  tradeLendMarketCookie,
  toNum,
} from "../clientShared";

const withdrawAllTolerance = 0.999999999999;

function getInitialAutoApproval(initialCookieM = {}) {
  return getInitialCookie(initialCookieM, tradeAutoApprovalCookie) == "1";
}

export default function LendPanel({
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
  const initialDefi = getInitialLendDefi(
    initialCookieM,
    walletType,
    tradeLendDefiCookie,
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
    () => getLendMarketChains(chainList, initialChainMarketsM, initialDefi),
    [chainList, initialChainMarketsM, initialDefi],
  );
  const initialSavedChain =
    getInitialCookie(
      initialCookieM,
      getProtocolCookie(tradeLendChainCookie, walletType, initialDefi),
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
        tradeLendMarketCookie,
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
  const [lendEndWith, setLendEndWith] = useState(false);
  const [redeemEndWith, setRedeemEndWith] = useState(false);
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
  const [customCoinPreview, setCustomCoinPreview] = useState(null);
  const [customCoinDraft, setCustomCoinDraft] = useState({
    coin: "",
    name: "",
    type: "",
    customType: "",
    ref: "",
  });
  const [addingCoin, setAddingCoin] = useState(false);
  const [locallyAddedAddressM, setLocallyAddedAddressM] = useState({});
  const [addedMarketSort, setAddedMarketSort] = useState("");
  const [allMarketSort, setAllMarketSort] = useState("");
  const marketPickerRef = useRef(null);
  const useLocalEditorStore = useLocalStorageEditor();
  const chainMarketsM = useMemo(() => {
    return Object.fromEntries(
      chainList.map((chainE) => [chainE.chain, getLendingMarkets(chainE, defi)]),
    );
  }, [chainList, defi]);
  const marketChains = useMemo(
    () => getLendMarketChains(chainList, chainMarketsM, defi),
    [chainList, chainMarketsM, defi],
  );
  const activeChain = marketChains.includes(chain) ? chain : marketChains[0] || "";
  const chainE =
    chainList.find((entry) => entry.chain == activeChain) ||
    chainList.find((entry) => marketChains.includes(entry.chain)) ||
    chainList[0];
  const availableLendingOptions = useMemo(
    () =>
      lendingOptions.filter((option) =>
        isLendingProtocolSupportedForWallet(option, walletType),
      ),
    [walletType],
  );
  const lendingE =
    availableLendingOptions.find((entry) => entry.value == defi) || noLending;
  const ProtocolClient =
    defi == "venus"
      ? VenusClient
      : defi == "jupiter"
        ? JupiterLendClient
        : defi == "morpho"
          ? MorphoClient
          : AaveClient;
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
      if (coinE?.source == "alchemy") continue;
      const addressKey = getTokenAddressKey(chainE?.chain, coinE?.address);
      if (addressKey) entries[addressKey] = true;
    }
    return entries;
  }, [chainE?.chain, chainE?.coinInfoM]);
  const hasProtocolAllMarkets =
    defi == "aave" || defi == "venus" || defi == "jupiter" || defi == "morpho";
  const allProtocolLabel =
    defi == "venus"
      ? "Venus"
      : defi == "jupiter"
        ? "Jupiter"
        : defi == "morpho"
          ? "Morpho"
          : "Aave";
  const allMarketKey =
    defi == "jupiter" ? (chainE?.chain == "Solana" ? "Solana" : "") : chainE?.chain || "";
  const jupiterAllKey = defi == "jupiter" ? allMarketKey : "";
  const getAllLendMarkets =
    defi == "venus"
      ? getVenusAllMarkets
      : defi == "jupiter"
        ? getJupiterAllMarkets
        : defi == "morpho"
          ? getMorphoAllMarkets
          : getAaveAllMarkets;
  const {
    markets: rawAllMarkets,
    loading: allLoading,
    error: allError,
    retry: retryAllMarkets,
  } = useLendAllMarkets({
    enabled: hasProtocolAllMarkets,
    cacheKey: `${defi}:${allMarketKey}`,
    chain: allMarketKey,
    protocolLabel: allProtocolLabel,
    getAllMarkets: getAllLendMarkets,
    timeoutMs: defi == "aave" && allMarketKey == "Ethereum" ? 45000 : defi == "venus" ? 45000 : 25000,
  });
  const allMarkets = rawAllMarkets
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
        !!locallyAddedAddressM[`${allMarketKey}:${underlyingAddressKey}`];
      const addedLend =
        entry.addedLend ||
        !!addedValue ||
        !!addedCoinAddressM[addressKey] ||
        !!locallyAddedAddressM[`${allMarketKey}:${addressKey}`];

      return {
        ...entry,
        addedUnderlying,
        addedLend,
        addedValue,
      };
    })
    .filter((entry) => !entry.addedUnderlying || !entry.addedLend);
  const visibleAddedMarkets = useMemo(() => {
    if (!rawAllMarkets.length) return addedMarkets;
    const protocolAllKey = allMarketKey || chainE?.chain || "";

    const rawMarketByLendAddress = Object.fromEntries(
      rawAllMarkets
        .filter((entry) => entry.lendAddress)
        .map((entry) => [
          getTokenAddressKey(chainE?.chain, entry.lendAddress),
          entry,
        ]),
    );

    const mergedAddedMarkets = addedMarkets.map((entry) => {
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
        underlyingCoin: raw.underlyingCoin || entry.underlyingCoin,
        lendCoin: entry.lendCoin,
        lendName: entry.lendName || raw.lendName,
        underlyingAddress: raw.underlyingAddress || entry.underlyingAddress,
        underlyingDecimals: Number.isInteger(raw.underlyingDecimals)
          ? raw.underlyingDecimals
          : entry.underlyingDecimals,
        lendAddress: entry.lendAddress || raw.lendAddress,
        lendDecimals: Number.isInteger(entry.lendDecimals)
          ? entry.lendDecimals
          : raw.lendDecimals,
        addedValue: entry.value,
        addedLend: true,
      };
    });
    const seen = new Set(
      mergedAddedMarkets.map((entry) =>
        getTokenAddressKey(
          chainE?.chain,
          entry.lendAddress ||
            chainE?.coinInfoM?.[entry.lendCoin]?.address ||
            entry.value ||
            "",
        ),
      ),
    );

    for (const entry of rawAllMarkets) {
      const lendAddress = getTokenAddressKey(chainE?.chain, entry.lendAddress);
      const underlyingAddress = getTokenAddressKey(
        chainE?.chain,
        entry.underlyingAddress,
      );
      const addedValue = addedMarketAddressM[lendAddress] || entry.addedValue || "";
      const addedUnderlying =
        entry.addedUnderlying ||
        !!addedCoinAddressM[underlyingAddress] ||
        !!locallyAddedAddressM[`${protocolAllKey}:${underlyingAddress}`];
      const addedLend =
        entry.addedLend ||
        !!addedValue ||
        !!addedCoinAddressM[lendAddress] ||
        !!locallyAddedAddressM[`${protocolAllKey}:${lendAddress}`];

      if (!addedLend || !lendAddress || seen.has(lendAddress)) continue;
      seen.add(lendAddress);
      mergedAddedMarkets.push({
        ...entry,
        value: addedValue || entry.addedValue || entry.value,
        addedValue: addedValue || entry.addedValue || entry.value,
        addedUnderlying,
        addedLend: true,
      });
    }

    return mergedAddedMarkets;
  }, [
    addedCoinAddressM,
    addedMarketAddressM,
    addedMarkets,
    allMarketKey,
    chainE?.chain,
    chainE?.coinInfoM,
    locallyAddedAddressM,
    rawAllMarkets,
  ]);
  const marketE =
    visibleAddedMarkets.find((entry) => entry.value == market) ||
    allMarkets.find((entry) => entry.value == market) ||
    visibleAddedMarkets[0];
  const marketSupplyApr = getMarketSupplyApr({
    chainE,
    defi,
    marketE,
    rawMarkets: rawAllMarkets,
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
  const underlyingQtyDecimals = getQtyDecimals(
    marketE?.underlyingDecimals ?? chainE?.coinInfoM?.[underlyingCoin]?.decimals,
  );
  const receiptQtyDecimals = getQtyDecimals(
    marketE?.lendDecimals ?? chainE?.coinInfoM?.[lendCoin]?.decimals,
  );
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
  const {
    balance: directBalance,
    loading: directBalanceLoading,
    clear: clearDirectBalance,
  } = useLendDirectMarketBalance({
    enabled: needsDirectBalance,
    cacheKey: directBalanceKey,
    walletAddress: selectedWalletEntry?.address,
    chain: chainE?.chain,
    marketE,
    getMarketBalance: getProtocolMarketBalance(),
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
  const maxUnderlying = toNum(underlyingBalance.balance);
  const maxReceipt = toNum(receiptBalance.balance);
  const maxUnderlyingQty = formatTradeQty(
    underlyingBalance.balance,
    underlyingQtyDecimals,
  );
  const maxReceiptQty = formatTradeQty(
    receiptBalance.balance,
    receiptQtyDecimals,
  );
  const underlyingPriceKey = priceKey(chainE?.chain || "", underlyingCoin);
  const receiptPriceKey = priceKey(chainE?.chain || "", lendCoin);
  const marketPreviewKey = `${defi}:${chainE?.chain || ""}:${underlyingCoin}:${lendCoin}`;
  const marketPreview = marketPreviewM[marketPreviewKey];
  const marketPreviewLoaded = marketPreview !== undefined;
  const marketLoading = !!marketLoadingM[marketPreviewKey];
  const marketReceiptRate =
    defi == "venus" || defi == "jupiter" || defi == "morpho"
      ? toNum(marketPreview?.receiptPerUnderlying)
      : 0;
  const underlyingListPrice = toNum(underlyingBalance.price);
  const receiptListPrice = toNum(receiptBalance.price);
  const underlyingFallbackPrice = fallbackPriceM[underlyingPriceKey];
  const receiptFallbackPrice = fallbackPriceM[receiptPriceKey];
  const underlyingPrice =
    underlyingListPrice || toNum(underlyingFallbackPrice) || 0;
  const receiptPrice =
    receiptListPrice ||
    toNum(receiptFallbackPrice) ||
    ((defi == "venus" || defi == "jupiter" || defi == "morpho") &&
    underlyingPrice &&
    marketReceiptRate
      ? underlyingPrice / marketReceiptRate
      : 0);
  const receiptRate =
    defi == "aave"
      ? 1
      : (defi == "venus" || defi == "jupiter" || defi == "morpho") && marketReceiptRate
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
  const underlyingQtyAbs = Math.abs(underlyingQty);
  const receiptQtyAbs = Math.abs(receiptQtyNum);
  const lendSliderValue = Math.max(0, Math.min(underlyingQty, maxUnderlying));
  const redeemSliderValue = Math.max(0, Math.min(receiptQtyNum, maxReceipt));
  const underlyingEnd = isRedeem
    ? maxUnderlying + underlyingQtyAbs
    : Math.max(0, maxUnderlying - underlyingQtyAbs);
  const receiptEnd = isRedeem
    ? Math.max(0, maxReceipt - receiptQtyAbs)
    : maxReceipt + receiptQtyAbs;
  const underlyingEndInputValue =
    underlyingEndDraft || formatComputedTradeQty(underlyingEnd, underlyingQtyDecimals);
  const receiptEndInputValue =
    receiptEndDraft || formatComputedTradeQty(receiptEnd, receiptQtyDecimals);
  function getWalletUnderlyingBalance(walletEntry = selectedWalletEntry) {
    const selected =
      sameAddress(walletEntry?.address, selectedWalletEntry?.address) ||
      walletEntry?.value == selectedWalletEntry?.value ||
      walletEntry?.name == selectedWalletEntry?.name;

    const localBalance = getMarketCoinBalance(
      chainE,
      underlyingCoin,
      marketE?.underlyingAddress,
      walletEntry,
    );
    if (selected) {
      return [underlyingBalance, directBalance.underlying, localBalance]
        .filter(hasLoadedBalance)
        .sort((a, b) => toNum(b.balance) - toNum(a.balance))[0] || {};
    }

    if (hasLoadedBalance(localBalance)) return localBalance;

    return localBalance;
  }

  function getWalletReceiptBalance(walletEntry = selectedWalletEntry) {
    const selected =
      sameAddress(walletEntry?.address, selectedWalletEntry?.address) ||
      walletEntry?.value == selectedWalletEntry?.value ||
      walletEntry?.name == selectedWalletEntry?.name;

    const localBalance = getMarketCoinBalance(
      chainE,
      lendCoin,
      marketE?.lendAddress,
      walletEntry,
    );
    if (selected) {
      return [receiptBalance, directBalance.lend, localBalance]
        .filter(hasLoadedBalance)
        .sort((a, b) => toNum(b.balance) - toNum(a.balance))[0] || {};
    }

    if (hasLoadedBalance(localBalance)) return localBalance;

    return localBalance;
  }

  function getProtocolMarketBalance() {
    if (defi == "venus") return getVenusMarketBalance;
    if (defi == "jupiter") return getJupiterMarketBalance;
    if (defi == "morpho") return getMorphoMarketBalance;
    return getAaveMarketBalance;
  }

  function getMarketCoinE(side = "underlying") {
    const coin = side == "lend" ? lendCoin : underlyingCoin;
    const info = chainE?.coinInfoM?.[coin] || {};
    const address =
      side == "lend" ? marketE?.lendAddress : marketE?.underlyingAddress;
    const decimals =
      side == "lend" ? marketE?.lendDecimals : marketE?.underlyingDecimals;

    return {
      ...(info || {}),
      ...(address ? { address } : {}),
      decimals: Number.isInteger(decimals)
        ? decimals
        : getQtyDecimals(info?.decimals),
    };
  }

  async function queryWalletMarketBalance(
    walletEntry = selectedWalletEntry,
    side = "underlying",
  ) {
    if (!walletEntry?.address || !chainE?.chain) return {};

    if (usesDirectMarket && marketE?.underlyingAddress && marketE?.lendAddress) {
      const res = await withClientTimeout(
        getProtocolMarketBalance()({
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
    return toNum(
      underlyingEndDraft || formatTradeQty(underlyingEnd, underlyingQtyDecimals),
    );
  }

  function getRedeemEndTarget() {
    return toNum(
      receiptEndDraft || formatTradeQty(receiptEnd, receiptQtyDecimals),
    );
  }

  async function getLendQtyForWallet(walletEntry = selectedWalletEntry) {
    if (!lendEndWith) return formatTradeQty(lendQty, underlyingQtyDecimals);

    const balance = await getWalletUnderlyingBalanceForEnd(walletEntry);
    if (!hasLoadedBalance(balance)) return null;

    return formatComputedTradeQty(
      toNum(balance.balance) - getLendEndTarget(),
      underlyingQtyDecimals,
    );
  }

  async function getRedeemQtyForWallet(walletEntry = selectedWalletEntry) {
    if (!redeemEndWith) return formatTradeQty(receiptQty, receiptQtyDecimals);

    const balance = await getWalletReceiptBalanceForEnd(walletEntry);
    if (!hasLoadedBalance(balance)) return null;

    return formatComputedTradeQty(
      toNum(balance.balance) - getRedeemEndTarget(),
      receiptQtyDecimals,
    );
  }

  async function shouldAaveWithdrawAll(walletEntry = selectedWalletEntry, qty = "") {
    if (defi != "aave") return false;

    const balance = await getWalletReceiptBalanceForEnd(walletEntry);
    if (!hasLoadedBalance(balance)) return false;

    const balanceQty = toNum(balance.balance);
    const qtyNum = toNum(qty);
    if (!(balanceQty > 0) || !(qtyNum > 0)) return false;
    if (redeemEndWith && getRedeemEndTarget() <= 0) return true;

    return qtyNum >= balanceQty * withdrawAllTolerance;
  }
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
  const marketCookieValues = useMemo(() => {
    const values = hasProtocolAllMarkets
      ? [
          ...visibleAddedMarkets.map((entry) => entry.value),
          ...allMarkets.map((entry) => getAllMarketSelectValue(entry)),
        ]
      : markets.map((entry) => entry.value);

    return [...new Set(values.filter(Boolean))];
  }, [allMarkets, hasProtocolAllMarkets, markets, visibleAddedMarkets]);

  useEffect(() => {
    const savedDefi = getCookie(getTradeModeCookie(tradeLendDefiCookie, walletType));
    if (savedDefi && lendingOptions.some((entry) => entry.value == savedDefi)) {
      setDefi(savedDefi);
    }
  }, [walletType]);

  useEffect(() => {
    if (
      availableLendingOptions.length &&
      !availableLendingOptions.some((entry) => entry.value == defi)
    ) {
      setDefi(availableLendingOptions[0].value);
    } else if (!availableLendingOptions.length && defi) {
      setDefi("");
    }
  }, [availableLendingOptions, defi]);

  useEffect(() => {
    if (marketChains.length) {
      const savedChain = getCookie(
        getProtocolCookie(tradeLendChainCookie, walletType, defi),
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
          tradeLendMarketCookie,
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
    if (
      (defi != "venus" && defi != "jupiter" && defi != "morpho") ||
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
    const getLendPreview =
      defi == "jupiter"
        ? getJupiterLendPreview
        : defi == "morpho"
          ? getMorphoLendPreview
          : getVenusLendPreview;
    getLendPreview({
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
            marketName: marketE.market,
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
      const next = getSignedUnderlyingQty(receiptQty);
      if (next != lendQty) setLendQty(next);
      return;
    }

    const next = getSignedReceiptQty(lendQty);
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
    return formatComputedTradeQty(toNum(value) * receiptRate, receiptQtyDecimals);
  }

  function getUnderlyingQty(value) {
    return receiptRate > 0
      ? formatComputedTradeQty(toNum(value) / receiptRate, underlyingQtyDecimals)
      : "0";
  }

  function getSignedReceiptQty(value) {
    return formatComputedTradeQty(-toNum(value) * receiptRate, receiptQtyDecimals);
  }

  function getSignedUnderlyingQty(value) {
    return receiptRate > 0
      ? formatComputedTradeQty(-toNum(value) / receiptRate, underlyingQtyDecimals)
      : "0";
  }

  function updateLendQty(value) {
    const maxRedeemUnderlying = receiptRate > 0 ? maxReceipt / receiptRate : 0;
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
      maxReceipt,
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
    const qty = formatComputedTradeQty(maxUnderlying - toNum(endQty), underlyingQtyDecimals);
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
    const qty = formatComputedTradeQty(maxReceipt - toNum(endQty), receiptQtyDecimals);
    setReceiptEndDraft(endQty);
    setQtyInputSide("redeem");
    setReceiptQty(qty);
    setLendQty(getSignedUnderlyingQty(qty));
  }

  function updateLendEndWith(checked) {
    setLendEndWith(checked);
    if (!checked) return;

    const endQty =
      underlyingEndDraft || formatComputedTradeQty(underlyingEnd, underlyingQtyDecimals);
    const qty = formatComputedTradeQty(maxUnderlying - toNum(endQty), underlyingQtyDecimals);
    setUnderlyingEndDraft(formatTradeQty(endQty, underlyingQtyDecimals));
    setQtyInputSide("lend");
    setLendQty(qty);
    setReceiptQty(getSignedReceiptQty(qty));
  }

  function updateRedeemEndWith(checked) {
    setRedeemEndWith(checked);
    if (!checked) return;

    const endQty =
      receiptEndDraft || formatComputedTradeQty(receiptEnd, receiptQtyDecimals);
    const qty = formatComputedTradeQty(maxReceipt - toNum(endQty), receiptQtyDecimals);
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

  function nextDefi() {
    const next = nextValue(
      availableLendingOptions.map((option) => option.value),
      defi,
    );
    if (next) selectDefi(next);
  }

  function selectDefi(value) {
    setDefi(value);
    if (!value) return;
    setCookie(getTradeModeCookie(tradeLendDefiCookie, walletType), value, {
      maxAge: cookieMaxAge,
    });
  }

  function nextChain() {
    const next = nextValue(marketChains, chainE?.chain || chain);
    if (next) selectChain(next);
  }

  function selectChain(chain) {
    setChain(chain);
    saveLendChainCookie(chain);
    emitTradeChainSelect(chain);
  }

  function focusSelectedChain() {
    const currentChain = chainE?.chain || chain;
    if (currentChain) emitTradeChainSelect(currentChain);
  }

  function saveLendChainCookie(chain) {
    if (!defi || !chain || !marketChains.includes(chain)) return;
    setCookie(getProtocolCookie(tradeLendChainCookie, walletType, defi), chain, {
      maxAge: cookieMaxAge,
    });
  }

  function nextMarket() {
    const cycleMarkets = hasProtocolAllMarkets
      ? visibleAddedMarkets.length
        ? visibleAddedMarkets
        : allMarkets
      : markets;
    const next = nextValue(
      cycleMarkets.map((entry) => entry.value),
      market,
    );
    if (next) selectMarket(next);
  }

  function prevMarket() {
    const cycleMarkets = hasProtocolAllMarkets
      ? visibleAddedMarkets.length
        ? visibleAddedMarkets
        : allMarkets
      : markets;
    const values = cycleMarkets.map((entry) => entry.value);
    const index = values.indexOf(market);
    const next = values.length
      ? values[(index - 1 + values.length) % values.length]
      : "";
    if (next) selectMarket(next);
  }

  function selectMarket(value) {
    setMarket(value);
    saveLendMarketCookie(value);
    setShowMarketMenu(false);
  }

  function saveLendMarketCookie(value) {
    if (!defi || !chainE?.chain || !marketCookieValues.includes(value)) return;
    setCookie(
      getProtocolCookie(
        tradeLendMarketCookie,
        walletType,
        defi,
        chainE.chain,
      ),
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

  function getAllMarketSelectValue(entry = {}) {
    return entry.addedUnderlying && entry.addedLend && entry.addedValue
      ? entry.addedValue
      : entry.value;
  }

  function clearCustomCoinPreview() {
    setCustomCoinPreview(null);
    setCustomCoinDraft({ coin: "", name: "", type: "", customType: "", ref: "" });
  }

  function setCustomCoinPreviewData(res) {
    setCustomCoinPreview(res);
    setCustomCoinDraft({
      coin: res.coin || "",
      name: res.entry?.name || "",
      type: res.entry?.type || "token",
      customType: res.entry?.type || "token",
      ref: res.entry?.ref || "",
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

      setCustomCoinPreviewData(
        tokenKind == "lend"
          ? {
              ...res,
              entry: {
                ...(res.entry || {}),
                type: "lend",
                ref: defi == "morpho" ? "DeFi: Morpho" : defi == "aave" ? "1:1, increasing qty" : res.entry?.ref,
              },
            }
          : res,
      );
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
      if (customCoinDraft.ref.trim()) entry.ref = customCoinDraft.ref.trim();
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
            ref: entry.ref || "",
          });

      if (!res.ok) throw new Error(res.msg || "add coin failed");
      if (res.exists) {
        toast(`${res.chain} ${res.coin} exists`);
        clearCustomCoinPreview();
        return;
      }

      const addressKey = getTokenAddressKey(customCoinPreview.chain, entry.address);
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
    updateLendQty(maxUnderlyingQty);
  }

  function setMaxRedeem() {
    updateRedeemQty(maxReceiptQty);
  }

  async function runLendForWallet(
    action,
    walletEntry = selectedWalletEntry,
    { skipConfirm = false, loopRun = false } = {},
  ) {
    const tradeToast = createTradeToast(walletEntry, loopRun);

    if (!lendCoin || !underlyingCoin) {
      tradeToast.error(`${lendingE.label}: no lending market selected`);
      return;
    }
    const isAave = defi == "aave";
    const isVenus = defi == "venus";
    const isJupiter = defi == "jupiter";
    const isMorpho = defi == "morpho";

    if (!isAave && !isVenus && !isJupiter && !isMorpho) {
      tradeToast.show(`${lendingE.label}: lending not wired yet`);
      return;
    }
    const protocol = isVenus
      ? "Venus"
      : isJupiter
        ? "Jupiter"
        : isMorpho
          ? "Morpho"
          : "Aave";
    if (!walletEntry?.address) {
      tradeToast.error("wallet missing");
      return;
    }
    if (
      walletEntry?.isBrowserWallet &&
      walletEntry.type != (isJupiter ? "solana" : "evm")
    ) {
      tradeToast.error(
        `${protocol} needs a ${isJupiter ? "Solana" : "EVM"} browser wallet`,
      );
      return;
    }
    if (!walletEntry?.isBrowserWallet && !walletEntry?.hasPrivateKey) {
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
    const signedQtyAbs = Math.abs(signedQtyNum);
    const qty = redeem
      ? submitRedeem
        ? absTradeQty(signedQty, receiptQtyDecimals)
        : getUnderlyingQty(signedQtyAbs)
      : submitRedeem
        ? getReceiptQty(signedQtyAbs)
        : absTradeQty(signedQty, underlyingQtyDecimals);
    const autoApprovalAmount =
      !submitRedeem && !isJupiter && autoApproval ? qty : "";
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
      tradeToast.error(`${submitAction} qty is 0`);
      return;
    }
    const withdrawAll =
      isAave && submitRedeem && await shouldAaveWithdrawAll(walletEntry, qty);

    const useBrowserWallet = !!walletEntry?.isBrowserWallet;
    const buildTxs = isVenus
      ? buildVenusLendTxs
      : isJupiter
        ? buildJupiterLendTxs
        : isMorpho
          ? buildMorphoLendTxs
          : buildAaveLendTxs;
    const executeLend = isVenus
      ? executeVenusLend
      : isJupiter
        ? executeJupiterLend
        : isMorpho
          ? executeMorphoLend
          : executeAaveLend;
    const previewLend = isVenus
      ? getVenusLendPreview
      : isJupiter
        ? getJupiterLendPreview
        : isMorpho
          ? getMorphoLendPreview
          : getAaveLendPreview;
    const directMarketArgs =
      (isAave || isVenus || isJupiter || isMorpho) && usesDirectMarket
        ? {
            underlyingAddress: marketE.underlyingAddress,
            underlyingDecimals: marketE.underlyingDecimals,
            lendAddress: marketE.lendAddress,
            lendDecimals: marketE.lendDecimals,
            marketName: marketE.market,
          }
        : {};
    const toastId = tradeToast.loading(`${protocol}: preparing ${submitAction}...`);
    setLendPending(true);
    setLendPendingAction(submitAction);
    setLendResult(null);

    try {
      let res;
      if (useBrowserWallet) {
        tradeToast.loading(`${protocol}: building ${submitAction} wallet prompt...`, {
          id: toastId,
        });
        const built = await buildTxs({
          walletAddress: walletEntry.address,
          chain: chainE.chain,
          action: submitAction,
          underlyingCoin,
          lendCoin,
          amount: qty,
          withdrawAll,
          ...directMarketArgs,
        });
        const txs = [];

        for (const tx of built.txs || []) {
          txs.push(
            await sendBrowserTradeTx({
              tx,
              walletEntry,
              tradeToast,
              toastId,
              message: `${protocol}: confirm ${tx.type}...`,
              solana: isJupiter,
            }),
          );
        }
        res = { ...built, txs };
      } else {
        if (!skipConfirm) {
          const ok = window.confirm(
            `Execute ${protocol} ${submitAction}?\n\nwallet: ${
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
        if (!submitRedeem && !isJupiter) {
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

        tradeToast.loading(`${protocol}: submitting ${submitAction}...`, {
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
          withdrawAll,
          ...directMarketArgs,
        });
      }

      setLendResult(res);
      if (usesDirectMarket && directBalanceKey) {
        clearDirectBalance();
      }
      const getRefreshTarget = (coin) => {
        const coinE = chainE?.coinInfoM?.[coin];
        if (!coinE) return null;
        const decimals = Number(coinE.decimals);
        const refreshCoinE = {
          address: coinE.address || "",
          native: !!coinE.native,
        };
        if (Number.isInteger(decimals)) refreshCoinE.decimals = decimals;

        return {
          chain: chainE.chain,
          coin,
          address: walletEntry.address,
          coinE: refreshCoinE,
        };
      };
      const refreshTargets = [
        getRefreshTarget(underlyingCoin),
        getRefreshTarget(lendCoin),
      ].filter(Boolean);
      tradeToast.success(
        `${protocol} ${submitAction} submitted ${res.txs?.length || 0} tx`,
        { id: toastId },
      );
      onTxComplete({
        ...res,
        refreshTargets,
      });
      return res;
    } catch (e) {
      const message = e?.message || `${protocol} ${submitAction} failed`;
      const errorResult = {
        ok: false,
        error: message,
        defi: protocol,
        action: submitAction,
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
      actionLabel: `${lendingE.label} ${action} ${
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
        action,
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
        idPrefix="lendCoinConfirm"
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
            value={availableLendingOptions.length ? defi : ""}
            onChange={(e) => selectDefi(e.target.value)}
            disabled={!availableLendingOptions.length}
          >
            {!availableLendingOptions.length && (
              <option value="">no DeFi</option>
            )}
            {availableLendingOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn nx bgGray"
            onClick={nextDefi}
            disabled={availableLendingOptions.length < 2}
          >
            {">"}
          </button>
        </label>
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
        {hasProtocolAllMarkets ? (
          <LendMarketPicker
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
            rawAllMarkets={rawAllMarkets}
            allLoading={allLoading}
            allError={allError}
            allProtocolLabel={allProtocolLabel}
            retryAllMarkets={retryAllMarkets}
            jupiterAllKey={jupiterAllKey}
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
            MarketCoinBalance={MarketCoinBalance}
            AprText={AprText}
            LendCoinInfoCard={LendCoinInfoCard}
          />
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
              onClick={setMaxLend}
            >
              <span className="gray">{underlyingCoin}: </span>
              {directBalanceLoading ? "..." : maxUnderlyingQty}
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
            <span className="gray">lend</span>
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
              onClick={() => runLend("lend")}
              disabled={lendPending}
            >
              {lendPendingAction == "lend" ? "LENDING" : "LEND"}
            </button>
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
          {!selectedWalletEntry?.isBrowserWallet && defi != "jupiter" && (
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
              {directBalanceLoading ? "..." : maxReceiptQty}
              {receiptUsd > 0 && (
                <span className="gray"> ${fmt(receiptUsd, 2)}</span>
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
            <span className="gray">redeem</span>
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
              max={maxReceipt || 0}
              step="any"
              value={redeemSliderValue}
              onChange={(e) =>
                updateRedeemQty(
                  rangeQtyInput(
                    e.target.value,
                    maxReceipt,
                    maxReceiptQty,
                    receiptQtyDecimals,
                  ),
                )
              }
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
