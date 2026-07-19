"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import { DiscoveryCacheInfo } from "@/components/Shared";
import { chainIds } from "@/data/basic";
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
  LendMarketPicker,
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
  getAaveSupportedChains,
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
  buildJustLendTxs,
  executeJustLend,
  getJustLendAllMarkets,
  getJustLendMarketBalance,
  getJustLendPreview,
} from "./justlend/sv";
import JustLendClient from "./justlend/Client";
import {
  buildMorphoLendTxs,
  executeMorphoLend,
  getMorphoAllMarkets,
  getMorphoLendPreview,
  getMorphoMarketBalance,
  getMorphoSupportedChains,
} from "./morpho/sv";
import MorphoClient from "./morpho/Client";
import {
  buildVenusLendTxs,
  executeVenusLend,
  getVenusAllMarkets,
  getVenusLendPreview,
  getVenusMarketBalance,
  getVenusSupportedChains,
} from "./venus/sv";
import VenusClient from "./venus/Client";
import { getTradeCoinBalance, getTradeCoinPrice } from "./sv";
import { addCustomCoin, previewCustomCoin } from "../../w/coinActions";
import {
  addLocalCustomCoin,
  shouldUseLocalStorageEditor,
} from "../../_editorData/browserEditorStorage";
import {
  absTradeQty,
  applyTradeMarketEndState,
  applyTradeMarketQtyState,
  cookieMaxAge,
  createTradeLoopResult,
  createTradeToast,
  CustomCoinConfirmModal,
  canonicalizeTradeMarketEntry,
  completeTradeTransaction,
  emitTradeChainSelect,
  fmt,
  fmtPrice,
  fmtRate,
  formatTradeQty,
  getInitialAutoApproval,
  getQtyDecimals,
  getTradeMarketEndTarget,
  getTradeMarketEndTargetText,
  getTradeMarketEndPair,
  getTradeModeCookie,
  getTradeMarketPriceSummary,
  getTradeMarketQtyConverters,
  getTradeMarketQtyForWallet,
  getTradeMarketQtyPair,
  getTradeMarketSideState,
  getTradeMarketSideCoinEntry,
  getTradeMarketSyncedQty,
  getFallbackTradeMarketEntry,
  getHistoryCycleValues,
  getTradeWalletMarketBalance,
  TradeAssetInfoIcon,
  TradeSelectionPicker,
  lendingOptions,
  nextValue,
  noLending,
  prevValue,
  priceKey,
  qtyInputSize,
  qtyInputStyle,
  rangeQtyInput,
  runTradeWalletLoop,
  sendBrowserTradeTx,
  SwapTxLink,
  tradeAutoApprovalCookie,
  tradeLendChainCookie,
  tradeLendChainOrderCookie,
  tradeLendDefiCookie,
  tradeLendDefiOrderCookie,
  tradeLendMarketCookie,
  tradeLendMarketOrderCookie,
  toNum,
  useCustomCoinConfirm,
  useTradeFallbackPrice,
} from "../clientShared";

const withdrawAllTolerance = 0.999999999999;
const emptyChainDiscovery = {
  chains: [],
  loading: false,
  loaded: false,
  error: "",
  cacheMeta: null,
  refresh: false,
};
const aaveMarketNameM = {
  Ethereum: "proto_mainnet_v3",
  EthereumEtherFi: "proto_etherfi_v3",
  EthereumHorizon: "proto_horizon_v3",
  EthereumLido: "proto_lido_v3",
  BSC: "proto_bnb_v3",
  Arbitrum: "proto_arbitrum_v3",
  Avalanche: "proto_avalanche_v3",
  Optimism: "proto_optimism_v3",
  Polygon: "proto_polygon_v3",
  Base: "proto_base_v3",
  Celo: "proto_celo_v3",
  Gnosis: "proto_gnosis_v3",
  Ink: "proto_ink_v3",
  Linea: "proto_linea_v3",
  Mantle: "proto_mantle_v3",
  Metis: "proto_metis_v3",
  Plasma: "proto_plasma_v3",
  Scroll: "proto_scroll_v3",
  Soneium: "proto_soneium_v3",
  Sonic: "proto_sonic_v3",
  XLayer: "proto_xlayer_v3",
  zkSyncEra: "proto_zksync_v3",
};
const venusInitialSupportedChainSet = new Set([
  "Arbitrum",
  "Base",
  "BSC",
  "Ethereum",
  "zkSyncEra",
]);

function getAaveMarketUrl(chain = "") {
  const marketName = aaveMarketNameM[chain];
  return marketName
    ? `https://app.aave.com/markets/?marketName=${encodeURIComponent(marketName)}`
    : "https://app.aave.com/markets/";
}

function hasLendChainDiscovery(defi = "") {
  return defi == "aave" || defi == "venus" || defi == "morpho";
}

function getLendChainDiscoveryColumnTitle(defi = "") {
  return defi == "morpho" ? "discovery" : "all";
}

function getInitialLendChainDiscoveryM(initialTradePickerData = {}) {
  return Object.fromEntries(
    Object.entries(initialTradePickerData?.lendChainDiscoveryM || {}).map(
      ([defi, entry]) => [
        defi,
        {
          chains: Array.isArray(entry?.chains) ? entry.chains : [],
          loading: false,
          loaded: !!entry?.loaded,
          error: entry?.error || "",
          cacheMeta: entry?.cache || entry?.cacheMeta || null,
          refresh: false,
        },
      ],
    ),
  );
}

function getInitialLendDiscoveryChains(
  initialTradePickerData = {},
  defi = "",
  chainList = [],
) {
  const validChains = new Set(chainList.map((entry) => entry.chain));
  const discovery = initialTradePickerData?.lendChainDiscoveryM?.[defi];

  return (Array.isArray(discovery?.chains) ? discovery.chains : [])
    .map((entry) => entry?.chain)
    .filter((chain) => chain && validChains.has(chain));
}

function isInitialLendChainSupported(defi = "", chain = "", marketChains = []) {
  if (defi == "venus") {
    return (
      marketChains.includes(chain) || venusInitialSupportedChainSet.has(chain)
    );
  }

  return marketChains.includes(chain);
}

function getLendProtocolLabel(defi = "") {
  if (defi == "venus") return "Venus";
  if (defi == "morpho") return "Morpho";
  if (defi == "jupiter") return "Jupiter";
  if (defi == "justlend") return "JustLend";
  return "Aave";
}

function getLendProtocolUrl(defi = "") {
  if (defi == "venus") return "https://app.venus.io/";
  if (defi == "morpho") return "https://app.morpho.org/";
  if (defi == "jupiter") return "https://jup.ag/lend";
  if (defi == "justlend") return "https://justlend.org/";
  if (defi == "aave") return "https://app.aave.com/markets/";
  return "";
}

function getLendProtocolChainUrl(defi = "", entry = {}) {
  if (defi == "aave") return getAaveMarketUrl(entry.chain);
  if (defi == "morpho" && entry.chainId) {
    return `https://app.morpho.org/vaults?chains=${encodeURIComponent(entry.chainId)}`;
  }
  if (defi == "venus") {
    const chainId = entry.chainId || chainIds[entry.chain];
    return chainId
      ? `https://venus.io/#/markets/any?chainId=${encodeURIComponent(chainId)}`
      : "https://venus.io/#/markets";
  }
  if (defi == "justlend" && entry.chain == "Tron") {
    return "https://justlend.org/";
  }
  return "";
}

function LendProtocolChainLink({ defi = "", entry = {} }) {
  const url = getLendProtocolChainUrl(defi, entry);
  if (!url) return null;

  return (
    <a
      className="gray externalLinkIcon"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${getLendProtocolLabel(defi)} ${entry.chain}`}
      onClick={(e) => e.stopPropagation()}
    >
      ↗
    </a>
  );
}

export default function LendPanel({
  data = [],
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
  initialTradePickerData = {},
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
        .filter((chainE) => {
          if (walletType == "solana") return chainE.chain == "Solana";
          if (walletType == "tron") return chainE.chain == "Tron";

          return chainE.chain != "Solana" && chainE.chain != "Tron";
        }),
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
  const initialLocalMarketChains = useMemo(
    () => getLendMarketChains(chainList, initialChainMarketsM, initialDefi),
    [chainList, initialChainMarketsM, initialDefi],
  );
  const initialDiscoveryChains = useMemo(
    () =>
      getInitialLendDiscoveryChains(
        initialTradePickerData,
        initialDefi,
        chainList,
      ),
    [chainList, initialDefi, initialTradePickerData],
  );
  const initialMarketChains = useMemo(
    () =>
      hasLendChainDiscovery(initialDefi)
        ? [...new Set([...initialLocalMarketChains, ...initialDiscoveryChains])]
        : initialLocalMarketChains,
    [initialDefi, initialDiscoveryChains, initialLocalMarketChains],
  );
  const initialDefiOrder = normalizeSelectionOrder(
    parseSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getTradeModeCookie(tradeLendDefiOrderCookie, walletType),
      ),
    ),
    lendingOptions.map((entry) => entry.value),
  );
  const initialChainOrder = normalizeSelectionOrder(
    parseSelectionOrder(
      getInitialCookie(
        initialCookieM,
        getProtocolCookie(tradeLendChainOrderCookie, walletType, initialDefi),
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
      getProtocolCookie(tradeLendChainCookie, walletType, initialDefi),
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
      getProtocolCookie(tradeLendMarketOrderCookie, walletType, initialDefi),
    ),
  );
  const initialOrderedMarkets = sortByGroupedSelectionOrder(
    initialMarkets,
    initialMarketOrder,
    initialChain,
    (entry) => entry.value,
  );
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
    initialSavedMarket || initialOrderedMarkets[0]?.value || "";
  const [defi, setDefi] = useState(initialDefi);
  const [defiOrder, setDefiOrder] = useState(initialDefiOrder);
  const [chainOrder, setChainOrder] = useState(initialChainOrder);
  const [marketOrder, setMarketOrder] = useState(initialMarketOrder);
  const [chain, setChain] = useState(initialChain);
  const [market, setMarket] = useState(initialMarket);
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
  const [showDefiMenu, setShowDefiMenu] = useState(false);
  const [showTradeTypeMenu, setShowTradeTypeMenu] = useState(false);
  const [showChainMenu, setShowChainMenu] = useState(false);
  const [chainPickerSortM, setChainPickerSortM] = useState({});
  const [chainDiscoveryM, setChainDiscoveryM] = useState(() =>
    getInitialLendChainDiscoveryM(initialTradePickerData),
  );
  const [showMarketMenu, setShowMarketMenu] = useState(false);
  const [locallyAddedAddressM, setLocallyAddedAddressM] = useState({});
  const [addedMarketSort, setAddedMarketSort] = useState("");
  const [allMarketSort, setAllMarketSort] = useState("");
  const tradeTypePickerRef = useRef(null);
  const defiPickerRef = useRef(null);
  const chainPickerRef = useRef(null);
  const marketPickerRef = useRef(null);
  const useLocalEditorStore = shouldUseLocalStorageEditor();
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
  const marketChains = useMemo(
    () => getLendMarketChains(chainList, chainMarketsM, defi),
    [chainList, chainMarketsM, defi],
  );
  const chainDiscovery = chainDiscoveryM[defi] || emptyChainDiscovery;
  const hasChainDiscovery = hasLendChainDiscovery(defi);
  const discoveredChainInfoM = useMemo(() => {
    const infoM = {};
    for (const entry of chainDiscovery.chains || []) {
      if (entry?.chain) infoM[entry.chain] = entry;
    }
    return infoM;
  }, [chainDiscovery.chains]);
  const discoveredChainSet = useMemo(
    () =>
      new Set(
        (chainDiscovery.chains || [])
          .map((entry) => entry.chain)
          .filter(Boolean),
      ),
    [chainDiscovery.chains],
  );
  const selectableProtocolChains = useMemo(() => {
    if (!hasChainDiscovery) return [];
    const discovered = discoveredChainSet;
    const chains = chainList
      .map((chainE) => chainE.chain)
      .filter(Boolean)
      .filter((chainName) =>
        discovered.size
          ? discovered.has(chainName)
          : isInitialLendChainSupported(defi, chainName, marketChains),
      );

    return [...new Set(chains)];
  }, [chainList, defi, discoveredChainSet, hasChainDiscovery, marketChains]);
  const rawSelectableChains = hasChainDiscovery
    ? selectableProtocolChains
    : marketChains;
  const selectableChains = useMemo(
    () => sortBySelectionOrder(rawSelectableChains, chainOrder),
    [chainOrder, rawSelectableChains],
  );
  const chainHistoryOptions = useMemo(
    () =>
      chainOrder.filter((chainName) => rawSelectableChains.includes(chainName)),
    [chainOrder, rawSelectableChains],
  );
  const activeChain = selectableChains.includes(chain)
    ? chain
    : selectableChains[0] || "";
  const chainE =
    chainList.find((entry) => entry.chain == activeChain) ||
    chainList.find((entry) => selectableChains.includes(entry.chain)) ||
    chainList[0];
  const supportedLendingOptions = useMemo(() => {
    return lendingOptions.filter((option) =>
      isLendingProtocolSupportedForWallet(option, walletType),
    );
  }, [walletType]);
  const availableLendingOptions = useMemo(
    () =>
      sortBySelectionOrder(
        supportedLendingOptions,
        defiOrder,
        (option) => option.value,
      ),
    [defiOrder, supportedLendingOptions],
  );
  const lendingHistoryOptions = useMemo(
    () =>
      defiOrder
        .map((value) =>
          supportedLendingOptions.find((option) => option.value == value),
        )
        .filter(Boolean),
    [defiOrder, supportedLendingOptions],
  );
  const lendingE =
    availableLendingOptions.find((entry) => entry.value == defi) || noLending;
  const ProtocolClient =
    defi == "venus"
      ? VenusClient
      : defi == "jupiter"
        ? JupiterLendClient
        : defi == "justlend"
          ? JustLendClient
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
    defi == "aave" ||
    defi == "venus" ||
    defi == "jupiter" ||
    defi == "morpho" ||
    defi == "justlend";
  const allProtocolLabel =
    defi == "venus"
      ? "Venus"
      : defi == "jupiter"
        ? "Jupiter"
        : defi == "justlend"
          ? "JustLend"
          : defi == "morpho"
            ? "Morpho"
            : "Aave";
  const allMarketKey =
    defi == "jupiter"
      ? chainE?.chain == "Solana"
        ? "Solana"
        : ""
      : chainE?.chain || "";
  const jupiterAllKey = defi == "jupiter" ? allMarketKey : "";
  const getAllLendMarkets =
    defi == "venus"
      ? getVenusAllMarkets
      : defi == "jupiter"
        ? getJupiterAllMarkets
        : defi == "justlend"
          ? getJustLendAllMarkets
          : defi == "morpho"
            ? getMorphoAllMarkets
            : getAaveAllMarkets;
  const {
    markets: rawAllMarkets,
    loading: allLoading,
    loaded: allLoaded,
    error: allError,
    retry: retryAllMarkets,
    cacheMeta: allCacheMeta,
  } = useLendAllMarkets({
    enabled: hasProtocolAllMarkets,
    cacheKey: `${defi}:${allMarketKey}`,
    chain: allMarketKey,
    protocolLabel: allProtocolLabel,
    getAllMarkets: getAllLendMarkets,
    timeoutMs:
      defi == "aave" && allMarketKey == "Ethereum"
        ? 45000
        : defi == "venus"
          ? 45000
          : 25000,
  });
  const canonicalAllMarkets = useMemo(
    () =>
      rawAllMarkets.map((entry) => canonicalizeTradeMarketEntry(chainE, entry)),
    [chainE, rawAllMarkets],
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
      }),
    [
      addedCoinAddressM,
      addedMarketAddressM,
      allMarketKey,
      canonicalAllMarkets,
      chainE?.chain,
      locallyAddedAddressM,
    ],
  );
  const allMarkets = sortByGroupedSelectionOrder(
    protocolMarketRows.filter(
      (entry) => !entry.addedUnderlying || !entry.addedLend,
    ),
    marketOrder,
    chainE?.chain,
    (entry) => entry.addedValue || entry.value,
  );
  const visibleAddedMarkets = useMemo(() => {
    if (!canonicalAllMarkets.length) {
      return sortByGroupedSelectionOrder(
        addedMarkets,
        marketOrder,
        chainE?.chain,
        (entry) => entry.value,
      );
    }
    const protocolAllKey = allMarketKey || chainE?.chain || "";

    const rawMarketByLendAddress = Object.fromEntries(
      protocolMarketRows
        .filter((entry) => entry.lendAddress)
        .map((entry) => [
          getTokenAddressKey(chainE?.chain, entry.lendAddress),
          entry,
        ]),
    );

    const mergedAddedMarkets = addedMarkets.map((entry) => {
      const lendAddress =
        entry.lendAddress || chainE?.coinInfoM?.[entry.lendCoin]?.address || "";
      const raw =
        rawMarketByLendAddress[getTokenAddressKey(chainE?.chain, lendAddress)];
      if (!raw) {
        return {
          ...entry,
          addedUnderlying: !!chainE?.coinInfoM?.[entry.underlyingCoin],
          addedLend: true,
          addedValue: entry.value,
        };
      }

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
        addedUnderlying: !!raw.addedUnderlying,
        addedLend: true,
      };
    });
    const visibleMergedAddedMarkets = mergedAddedMarkets.filter(
      (entry) => defi != "morpho" || (entry.addedUnderlying && entry.addedLend),
    );
    const seen = new Set(
      visibleMergedAddedMarkets.map((entry) =>
        getTokenAddressKey(
          chainE?.chain,
          entry.lendAddress ||
            chainE?.coinInfoM?.[entry.lendCoin]?.address ||
            entry.value ||
            "",
        ),
      ),
    );

    for (const entry of protocolMarketRows) {
      const lendAddress = getTokenAddressKey(chainE?.chain, entry.lendAddress);
      const underlyingAddress = getTokenAddressKey(
        chainE?.chain,
        entry.underlyingAddress,
      );
      const addedValue =
        addedMarketAddressM[lendAddress] || entry.addedValue || "";
      const addedUnderlying =
        entry.addedUnderlying ||
        !!addedCoinAddressM[underlyingAddress] ||
        !!locallyAddedAddressM[`${protocolAllKey}:${underlyingAddress}`];
      const addedLend =
        entry.addedLend ||
        !!addedValue ||
        !!addedCoinAddressM[lendAddress] ||
        !!locallyAddedAddressM[`${protocolAllKey}:${lendAddress}`];
      const showInAdded =
        defi == "morpho" ? addedUnderlying && addedLend : addedLend;

      if (!showInAdded || !lendAddress || seen.has(lendAddress)) continue;
      seen.add(lendAddress);
      visibleMergedAddedMarkets.push({
        ...entry,
        value: addedValue || entry.addedValue || entry.value,
        addedValue: addedValue || entry.addedValue || entry.value,
        addedUnderlying,
        addedLend: true,
      });
    }

    return sortByGroupedSelectionOrder(
      visibleMergedAddedMarkets,
      marketOrder,
      chainE?.chain,
      (entry) => entry.value,
    );
  }, [
    addedCoinAddressM,
    addedMarketAddressM,
    addedMarkets,
    allMarketKey,
    chainE?.chain,
    chainE?.coinInfoM,
    defi,
    locallyAddedAddressM,
    marketOrder,
    protocolMarketRows,
  ]);
  const marketCookieValues = useMemo(() => {
    const values = hasProtocolAllMarkets
      ? [
          ...visibleAddedMarkets.map((entry) => entry.value),
          ...allMarkets.map((entry) => getAllMarketSelectValue(entry)),
        ]
      : markets.map((entry) => entry.value);

    return [...new Set(values.filter(Boolean))];
  }, [allMarkets, hasProtocolAllMarkets, markets, visibleAddedMarkets]);
  const savedMarketForActiveChain = getInitialCookie(
    initialCookieM,
    getProtocolCookie(
      tradeLendMarketCookie,
      walletType,
      defi,
      chainE?.chain,
    ),
  );
  const marketExistsForActiveChain = marketCookieValues.includes(market);
  const savedMarketPending =
    hasProtocolAllMarkets &&
    !allLoaded &&
    savedMarketForActiveChain &&
    savedMarketForActiveChain == market;
  const marketBelongsToActiveChain =
    !market || marketExistsForActiveChain || savedMarketPending;
  const selectedMarketE = useMemo(
    () =>
      marketBelongsToActiveChain
        ? visibleAddedMarkets.find((entry) => entry.value == market) ||
          allMarkets.find(
            (entry) =>
              entry.value == market || getAllMarketSelectValue(entry) == market,
          )
        : null,
    [allMarkets, market, marketBelongsToActiveChain, visibleAddedMarkets],
  );
  const fallbackMarketE = useMemo(() => {
    if (!marketBelongsToActiveChain) return null;
    const fallback = getFallbackTradeMarketEntry(market);
    if (hasProtocolAllMarkets && !selectedMarketE && !fallback?.lendAddress) {
      return null;
    }
    if (defi != "morpho" || !fallback || fallback.underlyingCoin) {
      return fallback;
    }

    const lendE = chainE?.coinInfoM?.[fallback.lendCoin] || {};
    const text = `${fallback.lendCoin || ""} ${lendE.name || ""}`.toLowerCase();
    const underlyingCoin = ["USDS", "USDT", "USDC", "DAI", "EURC", "USD1"].find(
      (coin) => text.includes(coin.toLowerCase()),
    );

    return underlyingCoin
      ? {
          ...fallback,
          underlyingCoin,
          underlyingName: underlyingCoin,
        }
      : fallback;
  }, [
    chainE?.coinInfoM,
    defi,
    hasProtocolAllMarkets,
    market,
    marketBelongsToActiveChain,
    selectedMarketE,
  ]);
  const waitsForSelectedProtocolMarket =
    marketBelongsToActiveChain &&
    hasProtocolAllMarkets &&
    !!market &&
    !selectedMarketE &&
    !fallbackMarketE;
  const marketE = !marketBelongsToActiveChain
    ? null
    : waitsForSelectedProtocolMarket
    ? null
    : selectedMarketE || fallbackMarketE || visibleAddedMarkets[0];
  const fallbackMarketHistoryOptions = useMemo(() => {
    const values = getGroupedSelectionItems(marketOrder, chainE?.chain);
    return values
      .map((value) => markets.find((entry) => entry.value == value))
      .filter(Boolean)
      .map((entry) => ({ ...entry, label: getMarketLabel(entry) }));
  }, [chainE?.chain, marketOrder, markets]);
  const fallbackMarketOptions = useMemo(
    () => markets.map((entry) => ({ ...entry, label: getMarketLabel(entry) })),
    [markets],
  );
  const marketSupplyApr = getMarketSupplyApr({
    chainE,
    defi,
    marketE,
    rawMarkets: canonicalAllMarkets,
  });
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
  const underlyingCoinE = chainE?.coinInfoM?.[underlyingCoin] || {};
  const lendCoinE = chainE?.coinInfoM?.[lendCoin] || {};
  const underlyingName =
    marketE?.underlyingName ||
    underlyingCoinE.name ||
    underlyingCoin;
  const lendName = marketE?.lendName || lendCoin;
  const underlyingQtyDecimals = getQtyDecimals(
    marketE?.underlyingDecimals ??
      chainE?.coinInfoM?.[underlyingCoin]?.decimals,
  );
  const receiptQtyDecimals = getQtyDecimals(
    marketE?.lendDecimals ?? chainE?.coinInfoM?.[lendCoin]?.decimals,
  );
  const usesDirectMarket =
    hasProtocolAllMarkets &&
    !!marketE?.lendAddress &&
    (defi == "jupiter" ||
      defi == "morpho" ||
      defi == "venus" ||
      defi == "justlend" ||
      !!marketE?.underlyingAddress);
  const directBalanceKey = usesDirectMarket
    ? [
        defi,
        chainE?.chain || "",
        selectedWalletEntry?.address || "",
        marketE.underlyingAddress,
        marketE.lendAddress,
      ].join(":")
    : "";
  const localUnderlyingBalance =
    defi == "justlend"
      ? getMarketCoinBalance(
          chainE,
          underlyingCoin,
          marketE?.underlyingAddress,
          selectedWalletEntry,
        )
      : getSelectedBalance(chainE, underlyingCoin, selectedWalletEntry);
  const localReceiptBalance =
    defi == "justlend"
      ? getMarketCoinBalance(
          chainE,
          lendCoin,
          marketE?.lendAddress,
          selectedWalletEntry,
        )
      : getSelectedBalance(chainE, lendCoin, selectedWalletEntry);
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
  const underlyingBalanceLoading =
    directBalanceLoading &&
    !hasLocalUnderlyingBalance &&
    !directBalance.underlying;
  const receiptBalanceLoading =
    directBalanceLoading && !hasLocalReceiptBalance && !directBalance.lend;
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
  const underlyingPriceAddress =
    marketE?.underlyingAddress || underlyingCoinE.address || "";
  const receiptPriceAddress = marketE?.lendAddress || lendCoinE.address || "";
  const underlyingPriceKey = priceKey(
    chainE?.chain || "",
    underlyingPriceAddress || underlyingCoin,
  );
  const receiptPriceKey = priceKey(
    chainE?.chain || "",
    receiptPriceAddress || lendCoin,
  );
  const underlyingPriceCoinE = underlyingPriceAddress
    ? {
        address: underlyingPriceAddress,
        decimals: marketE?.underlyingDecimals ?? underlyingCoinE.decimals,
      }
    : null;
  const receiptPriceCoinE = receiptPriceAddress
    ? {
        address: receiptPriceAddress,
        decimals: marketE?.lendDecimals ?? lendCoinE.decimals,
      }
    : null;
  const marketPreviewKey = `${defi}:${chainE?.chain || ""}:${underlyingCoin}:${lendCoin}:${marketE?.lendAddress || ""}`;
  const marketPreview = marketPreviewM[marketPreviewKey];
  const marketPreviewLoaded = marketPreview !== undefined;
  const marketLoading = !!marketLoadingM[marketPreviewKey];
  const marketReceiptRate =
    defi == "venus" ||
    defi == "jupiter" ||
    defi == "morpho" ||
    defi == "justlend"
      ? toNum(
          marketPreview?.receiptPerUnderlying ??
            marketE?.receiptPerUnderlying,
        )
      : 0;
  const underlyingListPrice = toNum(underlyingBalance.price);
  const receiptListPrice = toNum(receiptBalance.price);
  const justLendUnderlyingPrice =
    defi == "justlend"
      ? toNum(marketE?.underlyingPriceInTrx) *
        toNum(getSelectedBalance(chainE, "TRX", selectedWalletEntry).price)
      : 0;
  const {
    fallbackPrice: underlyingFallbackPrice,
    loading: underlyingPriceLoading,
  } = useTradeFallbackPrice({
    cacheKey: underlyingPriceKey,
    chain: chainE?.chain,
    coin: underlyingCoin,
    coinE: underlyingPriceCoinE,
    listPrice: underlyingListPrice,
    getPrice: getTradeCoinPrice,
  });
  const { fallbackPrice: receiptFallbackPrice, loading: receiptPriceLoading } =
    useTradeFallbackPrice({
      cacheKey: receiptPriceKey,
      chain: chainE?.chain,
      coin: lendCoin,
      coinE: receiptPriceCoinE,
      listPrice: receiptListPrice,
      getPrice: getTradeCoinPrice,
    });
  const underlyingPrice =
    underlyingListPrice ||
    justLendUnderlyingPrice ||
    toNum(underlyingFallbackPrice) ||
    0;
  const receiptPrice =
    receiptListPrice ||
    toNum(receiptFallbackPrice) ||
    (defi == "aave" && underlyingPrice ? underlyingPrice : 0) ||
    ((defi == "venus" ||
      defi == "jupiter" ||
      defi == "morpho" ||
      defi == "justlend") &&
    underlyingPrice &&
    marketReceiptRate
      ? underlyingPrice / marketReceiptRate
      : 0);
  const receiptRate =
    defi == "aave"
      ? 1
      : (defi == "venus" ||
            defi == "jupiter" ||
            defi == "morpho" ||
            defi == "justlend") &&
          marketReceiptRate
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
  const redeemSliderValue = Math.max(0, Math.min(receiptQtyNum, maxReceipt));

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
      selectedBalances: [underlyingBalance, directBalance.underlying],
    });
  }

  function getWalletReceiptBalance(walletEntry = selectedWalletEntry) {
    return getTradeWalletMarketBalance({
      chainE,
      coin: lendCoin,
      address: marketE?.lendAddress,
      walletEntry,
      selectedWalletEntry,
      selectedBalances: [receiptBalance, directBalance.lend],
    });
  }

  function getProtocolMarketBalance() {
    if (defi == "venus") return getVenusMarketBalance;
    if (defi == "jupiter") return getJupiterMarketBalance;
    if (defi == "morpho") return getMorphoMarketBalance;
    if (defi == "justlend") return getJustLendMarketBalance;
    return getAaveMarketBalance;
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

    if (
      usesDirectMarket &&
      marketE?.underlyingAddress &&
      marketE?.lendAddress
    ) {
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

  async function getWalletUnderlyingBalanceForEnd(
    walletEntry = selectedWalletEntry,
    { forceBalanceQuery = false } = {},
  ) {
    const balance = getWalletUnderlyingBalance(walletEntry);
    if (!forceBalanceQuery && hasLoadedBalance(balance)) return balance;

    return queryWalletMarketBalance(walletEntry, "underlying").catch(
      () => ({}),
    );
  }

  async function getWalletReceiptBalanceForEnd(
    walletEntry = selectedWalletEntry,
    { forceBalanceQuery = false } = {},
  ) {
    const balance = getWalletReceiptBalance(walletEntry);
    if (!forceBalanceQuery && hasLoadedBalance(balance)) return balance;

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

  async function getLendQtyForWallet(
    walletEntry = selectedWalletEntry,
    { forceBalanceQuery = false } = {},
  ) {
    return getTradeMarketQtyForWallet({
      endWith: lendEndWith,
      qty: lendQty,
      decimals: underlyingQtyDecimals,
      getWalletBalance: () =>
        getWalletUnderlyingBalanceForEnd(walletEntry, { forceBalanceQuery }),
      getEndTargetText: getLendEndTargetText,
      hasBalance: hasLoadedBalance,
    });
  }

  async function getRedeemQtyForWallet(
    walletEntry = selectedWalletEntry,
    { forceBalanceQuery = false } = {},
  ) {
    return getTradeMarketQtyForWallet({
      endWith: redeemEndWith,
      qty: receiptQty,
      decimals: receiptQtyDecimals,
      getWalletBalance: () =>
        getWalletReceiptBalanceForEnd(walletEntry, { forceBalanceQuery }),
      getEndTargetText: getRedeemEndTargetText,
      hasBalance: hasLoadedBalance,
    });
  }

  async function shouldAaveWithdrawAll(
    walletEntry = selectedWalletEntry,
    qty = "",
    { forceBalanceQuery = false } = {},
  ) {
    if (defi != "aave") return false;

    const balance = await getWalletReceiptBalanceForEnd(walletEntry, {
      forceBalanceQuery,
    });
    if (!hasLoadedBalance(balance)) return false;

    const balanceQty = toNum(balance.balance);
    const qtyNum = toNum(qty);
    if (!(balanceQty > 0) || !(qtyNum > 0)) return false;
    if (redeemEndWith && getRedeemEndTarget() <= 0) return true;

    return qtyNum >= balanceQty * withdrawAllTolerance;
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
    underlyingLabel: underlyingCoin,
    receiptLabel: lendCoin,
  });
  useEffect(() => {
    if (!hasLendChainDiscovery(defi) || chainDiscovery.loaded) {
      return;
    }

    let cancelled = false;
    setChainDiscoveryM((discoveryM) => ({
      ...discoveryM,
      [defi]: {
        ...(discoveryM[defi] || emptyChainDiscovery),
        loading: true,
        error: "",
      },
    }));
    const forceRefresh = !!chainDiscovery.refresh;
    const request =
      defi == "aave"
        ? getAaveSupportedChains({ refresh: forceRefresh })
        : defi == "venus"
          ? getVenusSupportedChains({ refresh: forceRefresh })
          : getMorphoSupportedChains({ refresh: forceRefresh });

    request
      .then((res) => {
        if (cancelled) return;
        setChainDiscoveryM((discoveryM) => ({
          ...discoveryM,
          [defi]: {
            chains: Array.isArray(res?.chains) ? res.chains : [],
            loading: false,
            loaded: true,
            error: "",
            cacheMeta: res?.cache || null,
            refresh: false,
          },
        }));
      })
      .catch((e) => {
        if (cancelled) return;
        setChainDiscoveryM((discoveryM) => ({
          ...discoveryM,
          [defi]: {
            chains: [],
            loading: false,
            loaded: true,
            error:
              e?.message ||
              `${getLendProtocolLabel(defi)} chain discovery failed`,
            cacheMeta: null,
            refresh: false,
          },
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [chainDiscovery.loaded, chainDiscovery.refresh, defi]);

  useEffect(() => {
    const savedDefi = getCookie(
      getTradeModeCookie(tradeLendDefiCookie, walletType),
    );
    if (savedDefi && lendingOptions.some((entry) => entry.value == savedDefi)) {
      setDefi(savedDefi);
    }
    setDefiOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(getTradeModeCookie(tradeLendDefiOrderCookie, walletType)),
        ),
        lendingOptions.map((entry) => entry.value),
      ),
    );
  }, [walletType]);

  useEffect(() => {
    setChainOrder(
      normalizeSelectionOrder(
        parseSelectionOrder(
          getCookie(
            getProtocolCookie(tradeLendChainOrderCookie, walletType, defi),
          ),
        ),
        rawSelectableChains,
      ),
    );
    setMarketOrder(
      parseGroupedSelectionOrder(
        getCookie(
          getProtocolCookie(tradeLendMarketOrderCookie, walletType, defi),
        ),
      ),
    );
  }, [defi, rawSelectableChains, walletType]);

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
    if (selectableChains.length) {
      const savedChain = getCookie(
        getProtocolCookie(tradeLendChainCookie, walletType, defi),
      );
      const nextChain = selectableChains.includes(savedChain)
        ? savedChain
        : selectableChains.includes(chain)
          ? chain
          : selectableChains[0];
      if (nextChain != chain) setChain(nextChain);
    } else if (!selectableChains.length && chain) {
      setChain("");
    }
  }, [chain, defi, selectableChains, walletType]);

  useEffect(() => {
    const savedMarket = getCookie(
      getProtocolCookie(
        tradeLendMarketCookie,
        walletType,
        defi,
        chainE?.chain,
      ),
    );
    if (
      marketCookieValues.length &&
      !marketExistsForActiveChain &&
      !savedMarketPending
    ) {
      const nextMarket = marketCookieValues.includes(savedMarket)
        ? savedMarket
        : marketCookieValues[0];
      setMarket(nextMarket || "");
    } else if (
      (!hasProtocolAllMarkets || allLoaded) &&
      !savedMarketPending &&
      !markets.length &&
      !allMarkets.length &&
      market
    ) {
      setMarket("");
    }
  }, [
    allMarkets.length,
    allLoaded,
    hasProtocolAllMarkets,
    market,
    marketExistsForActiveChain,
    marketCookieValues,
    markets,
    savedMarketPending,
    walletType,
    chainE?.chain,
    defi,
  ]);

  useEffect(() => {
    function closeChainMenu(e) {
      if (!tradeTypePickerRef.current?.contains(e.target)) {
        setShowTradeTypeMenu(false);
      }
      if (!defiPickerRef.current?.contains(e.target)) {
        setShowDefiMenu(false);
      }
      if (!chainPickerRef.current?.contains(e.target)) {
        setShowChainMenu(false);
      }
    }

    document.addEventListener("mousedown", closeChainMenu);

    return () => {
      document.removeEventListener("mousedown", closeChainMenu);
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
    if (
      (defi != "venus" &&
        defi != "jupiter" &&
        defi != "morpho" &&
        defi != "justlend") ||
      !chainE?.chain ||
      !marketBelongsToActiveChain ||
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
        : defi == "justlend"
          ? getJustLendPreview
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
            exchangeRateRaw: marketE.exchangeRateRaw,
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
    marketBelongsToActiveChain,
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
      maxReceipt,
      receiptRate,
      underlyingDecimals: underlyingQtyDecimals,
      receiptDecimals: receiptQtyDecimals,
      inputMaxOff,
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
      maxReceipt,
      receiptRate,
      underlyingDecimals: underlyingQtyDecimals,
      receiptDecimals: receiptQtyDecimals,
      inputMaxOff,
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

  function nextDefi() {
    const values = getHistoryCycleValues(
      lendingHistoryOptions,
      supportedLendingOptions,
    );
    const next = nextValue(values, defi);
    if (next) selectDefi(next, { rememberOrder: false });
  }

  function prevDefi() {
    const values = getHistoryCycleValues(
      lendingHistoryOptions,
      supportedLendingOptions,
    );
    const prev = prevValue(values, defi);
    if (prev) selectDefi(prev, { rememberOrder: false });
  }

  function selectDefi(value, { rememberOrder = true } = {}) {
    setDefi(value);
    setShowDefiMenu(false);
    if (!value) return;
    setCookie(getTradeModeCookie(tradeLendDefiCookie, walletType), value, {
      maxAge: cookieMaxAge,
    });
    if (!rememberOrder) return;
    const nextOrder = rememberSelectionValue(
      defiOrder,
      value,
      lendingOptions.map((entry) => entry.value),
    );
    setDefiOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeLendDefiOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function removeDefiHistory(value) {
    const nextOrder = removeSelectionValue(defiOrder, value);
    setDefiOrder(nextOrder);
    setCookie(
      getTradeModeCookie(tradeLendDefiOrderCookie, walletType),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function nextChain() {
    const values = getHistoryCycleValues(chainHistoryOptions, selectableChains);
    const next = nextValue(values, activeChain || chain);
    if (next) selectChain(next, { rememberOrder: false });
  }

  function prevChain() {
    const values = getHistoryCycleValues(chainHistoryOptions, selectableChains);
    const prev = prevValue(values, activeChain || chain);
    if (prev) selectChain(prev, { rememberOrder: false });
  }

  function selectChain(chain, options = {}) {
    setChain(chain);
    saveLendChainCookie(chain, options);
    emitTradeChainSelect(chain);
    setShowChainMenu(false);
  }

  function focusSelectedChain() {
    const currentChain = activeChain || chain;
    if (currentChain) emitTradeChainSelect(currentChain);
  }

  function saveLendChainCookie(chain, { rememberOrder = true } = {}) {
    if (!defi || !chain || !selectableChains.includes(chain)) return;
    setCookie(
      getProtocolCookie(tradeLendChainCookie, walletType, defi),
      chain,
      {
        maxAge: cookieMaxAge,
      },
    );
    if (!rememberOrder) return;
    const nextOrder = rememberSelectionValue(
      chainOrder,
      chain,
      rawSelectableChains,
    );
    setChainOrder(nextOrder);
    setCookie(
      getProtocolCookie(tradeLendChainOrderCookie, walletType, defi),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function removeChainHistory(value) {
    const nextOrder = removeSelectionValue(chainOrder, value);
    setChainOrder(nextOrder);
    setCookie(
      getProtocolCookie(tradeLendChainOrderCookie, walletType, defi),
      encodeSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function retryChainDiscovery() {
    setChainDiscoveryM((discoveryM) => ({
      ...discoveryM,
      [defi]: { ...emptyChainDiscovery, refresh: true },
    }));
  }

  function selectProtocolDiscoveryChain(entry = {}) {
    const chainName = entry.chain || entry.label || "";
    if (!chainName) return;
    if (!selectableProtocolChains.includes(chainName)) {
      toast.error(`${chainName} chain not added`);
      return;
    }

    selectChain(chainName);
  }

  function renderChainSelect() {
    const useHistoryChainPicker =
      !hasChainDiscovery || getLendChainDiscoveryColumnTitle(defi) == "all";
    const protocolLabel = getLendProtocolLabel(defi);
    const localProtocolChainNames = chainList
      .map((chainE) => chainE.chain)
      .filter(Boolean);
    const protocolChainOption = (chainName) => {
      const supported = discoveredChainSet.size
        ? discoveredChainSet.has(chainName)
        : isInitialLendChainSupported(defi, chainName, marketChains);
      return {
        ...(discoveredChainInfoM[chainName] || {}),
        value: chainName,
        label: chainName,
        chain: chainName,
        supported,
        on: supported ? 1 : 0,
      };
    };
    const protocolHistoryChainOptions =
      chainHistoryOptions.map(protocolChainOption);
    const protocolAllChainOptions = sortBySelectionOrder(
      localProtocolChainNames.map(protocolChainOption),
      chainOrder,
      (entry) => entry.chain,
    );
    const discoveryChainOptions = sortBySelectionOrder(
      (chainDiscovery.chains || []).map((entry) => ({
        ...entry,
        value: entry.chain,
        label: entry.chain,
        added: selectableProtocolChains.includes(entry.chain),
        add: selectableProtocolChains.includes(entry.chain) ? 1 : 0,
      })),
      chainOrder,
      (entry) => entry.chain,
    );
    const protocolChainColumns = [
      {
        key: "chain",
        label: "chain",
        getValue: (entry) => entry.chain,
        getSortValue: (entry) => entry.chain,
      },
      {
        key: "on",
        label: "on",
        getValue: (entry) =>
          entry.supported ? "" : <span className="gray">off</span>,
        getSortValue: (entry) => entry.on,
      },
    ];
    const discoveryChainColumns = [
      {
        key: "chain",
        label: "chain",
        getValue: (entry) => entry.chain,
        getSortValue: (entry) => entry.chain,
      },
      {
        key: "add",
        label: "add",
        getValue: (entry) =>
          entry.added ? (
            <span className="gray">✓</span>
          ) : (
            <button
              type="button"
              className="btn small bgCyan"
              onClick={(e) => {
                e.stopPropagation();
                selectProtocolDiscoveryChain(entry);
              }}
            >
              +
            </button>
          ),
        getSortValue: (entry) => entry.add,
      },
    ];

    if (useHistoryChainPicker) {
      return (
        <TradeSelectionPicker
          selectedValue={selectableChains.length ? chainE?.chain || "" : ""}
          historyOptions={chainHistoryOptions}
          allOptions={rawSelectableChains}
          showMenu={showChainMenu}
          setShowMenu={setShowChainMenu}
          pickerRef={chainPickerRef}
          pickerSortM={chainPickerSortM}
          setPickerSortM={setChainPickerSortM}
          sortKeyPrefix={`lendChain:${defi || "defi"}`}
          header="chain"
          className="tradeChainCycle"
          menuClassName="tradeChainMenu"
          disabled={!selectableChains.length}
          getOptionLink={(chain) =>
            getLendProtocolChainUrl(defi, { chain }) || getLendProtocolUrl(defi)
          }
          onSelect={selectChain}
          onRemoveHistory={removeChainHistory}
          onPrev={prevChain}
          onNext={nextChain}
          onOpen={focusSelectedChain}
          onFocus={focusSelectedChain}
        />
      );
    }

    return (
      <TradeSelectionPicker
        selectedValue={activeChain || ""}
        selectedLabel={activeChain || "no chain"}
        historyOptions={protocolHistoryChainOptions}
        allOptions={protocolAllChainOptions}
        extraSections={[
          {
            section: "discovery",
            title: "discovery",
            options: discoveryChainOptions,
            emptyText: "-",
            info: (
              <DiscoveryCacheInfo
                cacheMeta={chainDiscovery.cacheMeta}
                onReload={retryChainDiscovery}
              />
            ),
            optionColumns: discoveryChainColumns,
            getOptionValue: (entry) => entry.chain,
            getOptionLabel: (entry) => entry.chain,
            getOptionTitle: (entry) => entry.chain,
            getOptionLink: (entry) => getLendProtocolChainUrl(defi, entry),
            onSelect: (_, entry) => selectProtocolDiscoveryChain(entry),
            renderBody: ({ columns, renderRows }) => {
              if (chainDiscovery.loading) {
                return (
                  <tr>
                    <td colSpan={columns.length} className="gray">
                      loading {protocolLabel}...
                    </td>
                  </tr>
                );
              }
              if (chainDiscovery.error) {
                return (
                  <tr>
                    <td>
                      <span className="red">{chainDiscovery.error}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small bgGray"
                        onClick={retryChainDiscovery}
                      >
                        retry
                      </button>
                    </td>
                  </tr>
                );
              }
              if (!discoveryChainOptions.length) {
                return (
                  <tr>
                    <td className="gray">-</td>
                    <td>
                      <button
                        type="button"
                        className="btn small bgGray"
                        onClick={retryChainDiscovery}
                      >
                        retry
                      </button>
                    </td>
                  </tr>
                );
              }
              return renderRows();
            },
          },
        ]}
        showMenu={showChainMenu}
        setShowMenu={setShowChainMenu}
        pickerRef={chainPickerRef}
        pickerSortM={chainPickerSortM}
        setPickerSortM={setChainPickerSortM}
        sortKeyPrefix={`lendChain:${defi || "defi"}`}
        header="chain"
        className="tradeChainCycle"
        menuClassName="tradeChainMenu"
        disabled={!localProtocolChainNames.length && !chainDiscovery.chains.length}
        cycleDisabled={
          getHistoryCycleValues(chainHistoryOptions, selectableChains).length < 2
        }
        getOptionValue={(entry) => entry.value}
        getOptionLabel={(entry) => entry.label}
        getOptionTitle={(entry) => entry.label}
        getOptionLink={(entry) =>
          entry.supported ? getLendProtocolChainUrl(defi, entry) : ""
        }
        optionColumns={protocolChainColumns}
        isOptionDisabled={(entry) => !entry.supported}
        onSelect={selectChain}
        onRemoveHistory={removeChainHistory}
        onPrev={prevChain}
        onNext={nextChain}
        onOpen={focusSelectedChain}
        onFocus={focusSelectedChain}
      />
    );
  }

  function getMarketCycleValues() {
    const historyMarkets = hasProtocolAllMarkets
      ? getGroupedSelectionItems(marketOrder, chainE?.chain)
          .map(
            (value) =>
              visibleAddedMarkets.find((entry) => entry.value == value) ||
              allMarkets.find(
                (entry) =>
                  (entry.addedValue || entry.value) == value ||
                  entry.value == value,
              ),
          )
          .filter(Boolean)
      : fallbackMarketHistoryOptions;
    const allCycleMarkets = hasProtocolAllMarkets ? visibleAddedMarkets : markets;
    return getHistoryCycleValues(
      historyMarkets.map((entry) => ({
        value: entry.value,
        label: getMarketLabel(entry),
      })),
      allCycleMarkets.map((entry) => ({
        value: entry.value,
        label: getMarketLabel(entry),
      })),
    );
  }

  function nextMarket() {
    const values = getMarketCycleValues();
    const next = nextValue(values, market);
    if (next) selectMarket(next, { rememberOrder: false });
  }

  function prevMarket() {
    const values = getMarketCycleValues();
    const next = prevValue(values, market);
    if (next) selectMarket(next, { rememberOrder: false });
  }

  function selectMarket(value, options = {}) {
    setMarket(value);
    saveLendMarketCookie(value, options);
    setShowMarketMenu(false);
  }

  function saveLendMarketCookie(value, { rememberOrder = true } = {}) {
    if (!defi || !chainE?.chain || !marketCookieValues.includes(value)) return;
    setCookie(
      getProtocolCookie(tradeLendMarketCookie, walletType, defi, chainE.chain),
      value,
      { maxAge: cookieMaxAge },
    );
    if (!rememberOrder) return;
    const nextOrder = rememberGroupedSelectionValue(
      marketOrder,
      chainE.chain,
      value,
      {
        validGroups: rawSelectableChains,
        validValues: marketCookieValues,
      },
    );
    setMarketOrder(nextOrder);
    setCookie(
      getProtocolCookie(tradeLendMarketOrderCookie, walletType, defi),
      encodeGroupedSelectionOrder(nextOrder),
      { maxAge: cookieMaxAge },
    );
  }

  function removeMarketHistory(value) {
    if (!chainE?.chain) return;
    const nextOrder = removeGroupedSelectionValue(
      marketOrder,
      chainE.chain,
      value,
    );
    setMarketOrder(nextOrder);
    setCookie(
      getProtocolCookie(tradeLendMarketOrderCookie, walletType, defi),
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

  function getAllMarketSelectValue(entry = {}) {
    return entry.addedUnderlying && entry.addedLend && entry.addedValue
      ? entry.addedValue
      : entry.value;
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
                ref:
                  defi == "morpho"
                    ? "DeFi: Morpho"
                    : defi == "aave"
                      ? "1:1, increasing qty"
                      : defi == "justlend"
                        ? "DeFi: JustLend"
                      : res.entry?.ref,
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
    const isJustLend = defi == "justlend";

    if (!isAave && !isVenus && !isJupiter && !isMorpho && !isJustLend) {
      tradeToast.show(`${lendingE.label}: lending not wired yet`);
      return;
    }
    const protocol = isVenus
      ? "Venus"
      : isJupiter
        ? "Jupiter"
        : isJustLend
          ? "JustLend"
          : isMorpho
            ? "Morpho"
            : "Aave";
    if (!walletEntry?.address) {
      tradeToast.error("wallet missing");
      return;
    }
    if (
      walletEntry?.isBrowserWallet &&
      walletEntry.type !=
        (isJupiter ? "solana" : isJustLend ? "tron" : "evm")
    ) {
      const requiredWalletType = isJupiter
        ? "Solana"
        : isJustLend
          ? "Tron"
          : "EVM";
      tradeToast.error(
        `${protocol} needs a ${requiredWalletType} browser wallet`,
      );
      return;
    }
    if (!walletEntry?.isBrowserWallet && !walletEntry?.hasPrivateKey) {
      tradeToast.error("no private key");
      return;
    }

    const redeem = action == "redeem";
    const signedQty = redeem
      ? await getRedeemQtyForWallet(walletEntry, {
          forceBalanceQuery: loopRun,
        })
      : await getLendQtyForWallet(walletEntry, {
          forceBalanceQuery: loopRun,
        });
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
      isAave &&
      submitRedeem &&
      (await shouldAaveWithdrawAll(walletEntry, qty, {
        forceBalanceQuery: loopRun,
      }));

    const useBrowserWallet = !!walletEntry?.isBrowserWallet;
    const buildTxs = isVenus
      ? buildVenusLendTxs
      : isJupiter
        ? buildJupiterLendTxs
        : isJustLend
          ? buildJustLendTxs
          : isMorpho
            ? buildMorphoLendTxs
            : buildAaveLendTxs;
    const executeLend = isVenus
      ? executeVenusLend
      : isJupiter
        ? executeJupiterLend
        : isJustLend
          ? executeJustLend
          : isMorpho
            ? executeMorphoLend
            : executeAaveLend;
    const previewLend = isVenus
      ? getVenusLendPreview
      : isJupiter
        ? getJupiterLendPreview
        : isJustLend
          ? getJustLendPreview
          : isMorpho
            ? getMorphoLendPreview
            : getAaveLendPreview;
    const directMarketArgs =
      (isAave || isVenus || isJupiter || isMorpho || isJustLend) &&
      usesDirectMarket
        ? {
            underlyingAddress: marketE.underlyingAddress,
            underlyingDecimals: marketE.underlyingDecimals,
            lendAddress: marketE.lendAddress,
            lendDecimals: marketE.lendDecimals,
            exchangeRateRaw: marketE.exchangeRateRaw,
            marketName: marketE.market,
          }
        : {};
    const toastId = tradeToast.loading(
      `${protocol}: preparing ${submitAction}...`,
    );
    setLendPending(true);
    setLendPendingAction(submitAction);
    setLendResult(null);

    try {
      let res;
      if (useBrowserWallet) {
        tradeToast.loading(
          `${protocol}: building ${submitAction} wallet prompt...`,
          {
            id: toastId,
          },
        );
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

        const builtTxs = built.txs || [];
        for (const [index, tx] of builtTxs.entries()) {
          txs.push(
            await sendBrowserTradeTx({
              tx,
              walletEntry,
              tradeToast,
              toastId,
              message: `${protocol}: confirm ${tx.type}...`,
              solana: isJupiter,
              waitForConfirmation:
                !isJustLend || index < builtTxs.length - 1,
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
      const getRefreshTarget = (coin, side) => {
        const coinE =
          defi == "justlend"
            ? getMarketCoinE(side)
            : chainE?.coinInfoM?.[coin] || getMarketCoinE(side);
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
        getRefreshTarget(underlyingCoin, "underlying"),
        getRefreshTarget(lendCoin, "lend"),
      ].filter(Boolean);
      tradeToast.success(
        `${protocol} ${submitAction} submitted ${res.txs?.length || 0} tx`,
        { id: toastId },
      );
      completeTradeTransaction({
        result: res,
        refreshTargets,
        onTxComplete,
        onConfirmationError: (error) =>
          tradeToast.error(
            `${protocol} confirmation failed: ${
              error?.message || "transaction failed"
            }`,
          ),
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
      <div className="tradePane tradeWidePane lendPane">
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
          <TradeSelectionPicker
            selectedValue={tradeType}
            historyOptions={tradeHistoryTypes}
            allOptions={allTradeTypes.length ? allTradeTypes : tradeTypes}
            showMenu={showTradeTypeMenu}
            setShowMenu={setShowTradeTypeMenu}
            pickerRef={tradeTypePickerRef}
            pickerSortM={chainPickerSortM}
            setPickerSortM={setChainPickerSortM}
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
            <span className="gray">DeFi:</span>
            <TradeSelectionPicker
              selectedValue={defi}
              selectedLabel={lendingE.label}
              historyOptions={lendingHistoryOptions}
              allOptions={supportedLendingOptions}
              showMenu={showDefiMenu}
              setShowMenu={setShowDefiMenu}
              pickerRef={defiPickerRef}
              pickerSortM={chainPickerSortM}
              setPickerSortM={setChainPickerSortM}
              sortKeyPrefix="lendDefi"
              header="DeFi"
              className="tradeDefiCycle"
              menuClassName="tradeDefiMenu"
              cycleSize="nx"
              getOptionLink={(option) =>
                option?.url || getLendProtocolUrl(option?.value)
              }
              onSelect={selectDefi}
              onRemoveHistory={removeDefiHistory}
              onPrev={prevDefi}
              onNext={nextDefi}
            />
          </span>
          {renderChainSelect()}
          {hasProtocolAllMarkets ? (
            <LendMarketPicker
              marketPickerRef={marketPickerRef}
              chainE={chainE}
              chainName={chainE?.chain}
              defi={defi}
              market={market}
              marketE={marketE}
              getMarketLabel={getMarketLabel}
              showMarketMenu={showMarketMenu}
              setShowMarketMenu={setShowMarketMenu}
              prevMarket={prevMarket}
              nextMarket={nextMarket}
              cycleDisabled={getMarketCycleValues().length < 2}
              visibleAddedMarkets={visibleAddedMarkets}
              historyRows={getGroupedSelectionItems(marketOrder, chainE?.chain)
                .map(
                  (value) =>
                    visibleAddedMarkets.find((entry) => entry.value == value) ||
                    allMarkets.find(
                      (entry) =>
                        (entry.addedValue || entry.value) == value ||
                        entry.value == value,
                    ),
                )
                .filter(Boolean)
                .map(getMarketTableRow)}
              addedRows={visibleAddedMarkets.map(getMarketTableRow)}
              allRows={allMarkets.map(getMarketTableRow)}
              rawAllMarkets={canonicalAllMarkets}
              allLoading={allLoading}
              allError={allError}
              allProtocolLabel={allProtocolLabel}
              allCacheMeta={allCacheMeta}
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
            />
          ) : (
            <TradeSelectionPicker
              selectedValue={marketE?.value || ""}
              selectedLabel={marketE ? getMarketLabel(marketE) : ""}
              historyOptions={fallbackMarketHistoryOptions}
              allOptions={fallbackMarketOptions}
              showMenu={showMarketMenu}
              setShowMenu={setShowMarketMenu}
              pickerRef={marketPickerRef}
              pickerSortM={chainPickerSortM}
              setPickerSortM={setChainPickerSortM}
              sortKeyPrefix={`lendMarket:${defi || "defi"}:${chainE?.chain || ""}`}
              header="coin"
              className="tradeMarketCycle"
              menuClassName="tradeMarketMenu"
              disabled={!markets.length}
              onSelect={selectMarket}
              onRemoveHistory={removeMarketHistory}
              onPrev={prevMarket}
              onNext={nextMarket}
            />
          )}
        </div>

        <div className="tradeRows">
          <div className="tradeBox">
            <div className="tradeAssetLine">
              <span className="tradeAssetName">
                <span>{underlyingCoin || "-"}</span>
                <TradeAssetInfoIcon
                  coin={underlyingCoin}
                  name={underlyingName}
                  chain={chainE?.chain}
                  address={
                    marketE?.underlyingAddress ||
                    underlyingCoinE.address
                  }
                  decimals={
                    marketE?.underlyingDecimals ?? underlyingCoinE.decimals
                  }
                  type={underlyingCoinE.type}
                  ref={underlyingCoinE.ref}
                  price={underlyingPrice}
                />
              </span>
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
                <span className="gray">wallet: </span>
                {underlyingBalanceLoading ? "..." : maxUnderlyingQty}
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
              <span className="gray">lend</span>
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
                onClick={() => runLend("lend")}
                disabled={lendPending}
              >
                {lendPendingAction == "lend" ? "LENDING" : "LEND"}
              </button>
            </div>
          </div>

          <div className="tradeMiddle">
            {showGasAutoLabel && (
              <label className="tradeGasSelect">
                <span className="gray">gas:</span>
                <select value="default" disabled>
                  <option value="default">auto</option>
                </select>
              </label>
            )}
            {!selectedWalletEntry?.isBrowserWallet && defi != "jupiter" && (
              <label className="tradeAutoApproval">
                <input
                  type="checkbox"
                  checked={autoApproval}
                  onChange={(e) => updateAutoApproval(e.target.checked)}
                />
                <span className="gray">auto approve</span>
              </label>
            )}
            <span className="tradeRateLine">
              <span className="gray">rate:</span>{" "}
              {underlyingCoin && lendCoin
                ? `1 ${underlyingCoin} = ${fmtRate(receiptRate)} ${lendCoin}`
                : "-"}
              {priceStatus && <span className="gray"> {priceStatus}</span>}
            </span>
          </div>

          <div className="tradeBox">
            <div className="tradeAssetLine">
              <span className="tradeAssetName">
                <span>{lendCoin || "-"}</span>
                <TradeAssetInfoIcon
                  coin={lendCoin}
                  name={lendName}
                  chain={chainE?.chain}
                  address={
                    marketE?.lendAddress ||
                    lendCoinE.address
                  }
                  decimals={marketE?.lendDecimals ?? lendCoinE.decimals}
                  type={lendCoinE.type}
                  ref={lendCoinE.ref}
                  price={receiptPrice}
                />
              </span>
              <span className="tradeCoinPrice">
                <span className="gray">{fmtPrice(receiptPrice)}</span>
              </span>
            </div>
            <div className="tradeBalanceLine">
              <span className="tradeAssetBalance">
                <span className="gray">wallet: </span>
                {receiptBalanceLoading ? "..." : maxReceiptQty}
                {receiptUsd > 0 && (
                  <span className="gray"> ${fmt(receiptUsd, 2)}</span>
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
              <span className="gray">redeem</span>
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
                className="btn tradeActionButton bgCyan"
                onClick={() => runLend("redeem")}
                disabled={lendPending}
              >
                {lendPendingAction == "redeem" ? "REDEEMING" : "REDEEM"}
              </button>
            </div>
          </div>
        </div>
        {lendResult && (
          <div className="tradeResult">
            {lendResult.ok ? (
              <>
                <span className="gray">
                  {lendResult.defi || lendingE.label} {lendResult.action}:
                </span>{" "}
                {lendResult.txs?.map((tx, index) => (
                  <SwapTxLink
                    key={`${tx.walletLabel || ""}_${tx.hash}_${index}`}
                    tx={tx}
                  />
                ))}
                {lendResult.loopErrors?.map((entry) => (
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
              <span className="red">{lendResult.error}</span>
            )}
          </div>
        )}
      </div>
    </ProtocolClient>
  );
}
