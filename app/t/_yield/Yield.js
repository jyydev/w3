"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import { scanners } from "@/sets";
import { pc } from "@/fn/basic";
import {
  buildHyperliquidAgentApproval,
  buildHyperliquidLendTxs,
  buildHyperliquidSpotDepositTxs,
  buildHyperliquidSpotWithdrawTxs,
  executeHyperliquidLend,
  executeHyperliquidSpotDeposit,
  executeHyperliquidSpotWithdraw,
  getHyperliquidLendPreview,
  getHyperliquidSpotBridgeDiscovery,
  submitHyperliquidAgentApproval,
  submitHyperliquidLendSignature,
  submitHyperliquidSpotWithdrawSignature,
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
  cleanTradeInput,
  cookieMaxAge,
  createTradeLoopResult,
  createTradeToast,
  emitTradeChainSelect,
  fmt,
  fmtPrice,
  fmtRate,
  formatTradeQty,
  getChainCoins,
  getBrowserEvmChainId,
  getQtyDecimals,
  getHyperliquidBrowserAgent,
  getTradeModeCookie,
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
  sameAddress,
  sendBrowserTradeTx,
  signHyperliquidBrowserAgentTypedData,
  signBrowserTypedData,
  SwapTxLink,
  TradePickerColumn,
  TradePickerMenu,
  TradePickerSortHeader,
  TradePickerTable,
  sortTradePickerRows,
  toggleTradePickerSort,
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
const hyperliquidBridgeCoinM = {
  Arbitrum: new Set(["USDC"]),
};
const emptyHyperliquidBridgeE = {
  deposit: { chains: [], tokens: [] },
  withdraw: { chains: [], tokens: [] },
  loading: false,
  loaded: false,
  error: "",
};
let hyperliquidBridgeCache = null;
let hyperliquidBridgePromise = null;

function isYieldProtocolSupportedForWallet(option = {}, walletType = "evm") {
  if (walletType == "solana") return false;
  if (option.value == "spark") return true;
  if (option.value == "venusFlux") return true;
  if (option.value == "hyperliquid") return true;

  return false;
}

function getProtocolCookie(
  base = "",
  walletType = "evm",
  defi = "",
  chain = "",
) {
  return [getTradeModeCookie(base, walletType), defi || "defi", chain || ""]
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

function getInitialHyperliquidMode(initialCookieM = {}, walletType = "evm") {
  const value = getInitialCookie(
    initialCookieM,
    getProtocolCookie(
      tradeYieldHyperliquidModeCookie,
      walletType,
      "hyperliquid",
    ),
  );

  return value == "deposit" ? "deposit" : "vault";
}

function getInitialHyperliquidRouteCookie(
  initialCookieM = {},
  walletType = "evm",
  base = "",
) {
  return (
    getInitialCookie(
      initialCookieM,
      getProtocolCookie(base, walletType, "hyperliquid"),
    ) || ""
  );
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
    String(a || "")
      .trim()
      .toLowerCase() ==
    String(b || "")
      .trim()
      .toLowerCase()
  );
}

function getTokenAddressKey(chain = "", address = "") {
  const value = String(address || "").trim();
  if (!value) return "";

  return chain == "Solana" ? value : value.toLowerCase();
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
    marketE?.lendAddress ||
    chainE?.coinInfoM?.[marketE?.lendCoin]?.address ||
    "";
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

function getCoinByAddress(chainE, address = "") {
  const addressKey = getTokenAddressKey(chainE?.chain, address);
  if (!addressKey) return "";

  return (
    Object.entries(chainE?.coinInfoM || {}).find(
      ([, coinE]) => getTokenAddressKey(chainE?.chain, coinE?.address) == addressKey,
    )?.[0] || ""
  );
}

function getMarketCoinBalance(chainE, coin = "", address = "", selectedWalletEntry) {
  const localCoin =
    getCoinByAddress(chainE, address) || (chainE?.coinInfoM?.[coin] ? coin : "");
  return localCoin ? getSelectedBalance(chainE, localCoin, selectedWalletEntry) : {};
}

function MarketCoinBalance({ balance = {} }) {
  if (!hasLoadedBalance(balance)) return null;

  return <span>{pc(balance.balance)}</span>;
}

function getBalanceQty(balance = {}) {
  return hasLoadedBalance(balance) ? toNum(balance.balance) : 0;
}

function isHyperliquidDepositCoin(chain = "", coin = "", coinE = {}) {
  const supportedCoins = hyperliquidBridgeCoinM[chain];
  if (!supportedCoins?.has(coin)) return false;

  const text = `${coin} ${coinE?.name || ""}`.toUpperCase();

  return coinE?.type == "stable" && text.includes("USDC");
}

function getHyperliquidDepositCoins(chainE) {
  const priority = ["USDC", "USDC.E", "USDT", "USDT.E", "USDE"];
  const coinInfoM = chainE?.coinInfoM || {};
  if (!hyperliquidBridgeCoinM[chainE?.chain]) return [];

  return getChainCoins(chainE)
    .filter((coin) =>
      isHyperliquidDepositCoin(chainE.chain, coin, coinInfoM[coin]),
    )
    .sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai >= 0 || bi >= 0) {
        return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
      }

      return a.localeCompare(b);
    });
}

function uniqueText(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function getHyperliquidBridgeTokens(discoveryE = {}, side = "deposit") {
  return Array.isArray(discoveryE?.[side]?.tokens)
    ? discoveryE[side].tokens
    : [];
}

function getHyperliquidBridgeChains(discoveryE = {}, side = "deposit") {
  return Array.isArray(discoveryE?.[side]?.chains)
    ? discoveryE[side].chains
    : [];
}

function getFallbackHyperliquidChains(chainList = []) {
  return uniqueText(
    chainList
      .filter((chainE) => getHyperliquidDepositCoins(chainE).length)
      .map((chainE) => chainE.chain),
  );
}

function getHyperliquidAllChains({
  discoveryE = {},
  side = "deposit",
  fallbackChains = [],
} = {}) {
  const chains = getHyperliquidBridgeChains(discoveryE, side).map(
    (entry) => entry.chain,
  );

  return uniqueText(chains).length ? uniqueText(chains) : fallbackChains;
}

function getHyperliquidAddedChains({
  chainList = [],
  discoveryE = {},
  side = "deposit",
  fallbackChains = [],
} = {}) {
  const discoveryChains = new Set(
    getHyperliquidBridgeChains(discoveryE, side).map((entry) => entry.chain),
  );
  const chains = chainList
    .map((chainE) => chainE.chain)
    .filter((chain) => !discoveryChains.size || discoveryChains.has(chain));

  return uniqueText(chains).length ? uniqueText(chains) : fallbackChains;
}

function getFallbackHyperliquidCoinsForChain(chainE) {
  return getHyperliquidDepositCoins(chainE);
}

function getHyperliquidChainEntry({
  discoveryE = {},
  side = "deposit",
  chain = "",
} = {}) {
  return getHyperliquidBridgeChains(discoveryE, side).find(
    (entry) => entry.chain == chain,
  );
}

function getHyperliquidAllCoinsForChain({
  discoveryE = {},
  side = "deposit",
  chain = "",
  fallbackCoins = [],
} = {}) {
  const chainE = getHyperliquidChainEntry({ discoveryE, side, chain });
  const coins = (chainE?.coins || []).map((entry) => entry.coin);

  return uniqueText(coins).length ? uniqueText(coins) : fallbackCoins;
}

function getHyperliquidAddedCoinsForChain({
  chainE,
  discoveryE = {},
  side = "deposit",
  fallbackCoins = [],
} = {}) {
  const allCoins = new Set(
    getHyperliquidAllCoinsForChain({
      discoveryE,
      side,
      chain: chainE?.chain,
      fallbackCoins: [],
    }),
  );
  const coins = getChainCoins(chainE).filter(
    (coin) => !allCoins.size || allCoins.has(coin),
  );

  return uniqueText(coins).length ? uniqueText(coins) : fallbackCoins;
}

function getHyperliquidCoinTokenEntries({
  discoveryE = {},
  side = "deposit",
  chain = "",
} = {}) {
  const chainE = getHyperliquidChainEntry({ discoveryE, side, chain });
  return Array.isArray(chainE?.coins) ? chainE.coins : [];
}

function getHyperliquidRouteToken({
  discoveryE = {},
  side = "deposit",
  chain = "",
  coin = "",
} = {}) {
  return getHyperliquidBridgeTokens(discoveryE, side).find(
    (entry) => entry.chain == chain && entry.coin == coin,
  );
}

function getHyperliquidRouteText(tokenE = {}) {
  if (!tokenE) return "";
  const parts = [];
  const routeE = tokenE.actionSupported
    ? tokenE.routes?.find(
        (entry) => entry.label == tokenE.chain || entry.route == "arbitrum",
      ) || tokenE.routes?.[0]
    : tokenE.routes?.[0];
  const route = routeE?.label || "";
  if (route && route != tokenE.chain) parts.push(route);

  return parts.join(" ");
}

function getHyperliquidFeeEtaText(tokenE = {}) {
  if (!tokenE) return "";
  const parts = [];

  if (tokenE.fee !== undefined && tokenE.fee !== null && tokenE.fee !== "") {
    parts.push(`fee:${pc(tokenE.fee)}`);
  }
  if (tokenE.eta) parts.push(`ETA:${tokenE.eta}`);

  return parts.join(" ");
}

function getHyperliquidPickerWidth(values = [], selected = "", max = 18) {
  const length = Math.max(
    5,
    String(selected || "").length,
    ...values.map((value) => String(value || "").length),
  );

  return `${Math.min(length + 2, max)}ch`;
}

function isUsdLikeYieldCoin(coin = "") {
  return /USD/i.test(String(coin || ""));
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
  showGasAutoLabel = false,
  loopWallets = false,
  getLoopWalletEntries = () => [],
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
  const [addedMarketSort, setAddedMarketSort] = useState("");
  const [allMarketSort, setAllMarketSort] = useState("");
  const [sparkAllMarketM, setSparkAllMarketM] = useState({});
  const [sparkAllLoadingM, setSparkAllLoadingM] = useState({});
  const [sparkAllErrorM, setSparkAllErrorM] = useState({});
  const [sparkAllRetryTick, setSparkAllRetryTick] = useState(0);
  const [hyperliquidBridgeE, setHyperliquidBridgeE] = useState(
    hyperliquidBridgeCache || emptyHyperliquidBridgeE,
  );
  const [hyperliquidBridgeRetryTick, setHyperliquidBridgeRetryTick] =
    useState(0);
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
  const [directBalanceM, setDirectBalanceM] = useState({});
  const [directBalanceLoadingM, setDirectBalanceLoadingM] = useState({});
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
  const [nowMs, setNowMs] = useState(0);
  const marketPickerRef = useRef(null);
  const hyperliquidDepositCoinPickerRef = useRef(null);
  const hyperliquidDepositChainPickerRef = useRef(null);
  const hyperliquidWithdrawCoinPickerRef = useRef(null);
  const hyperliquidWithdrawChainPickerRef = useRef(null);
  const mountedRef = useRef(false);
  const useLocalEditorStore = useLocalStorageEditor();
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
  const fallbackHyperliquidDepositChains = useMemo(
    () => getFallbackHyperliquidChains(chainList),
    [chainList],
  );
  const hyperliquidDepositChains = useMemo(
    () =>
      getHyperliquidAllChains({
        discoveryE: hyperliquidBridgeE,
        side: "deposit",
        fallbackChains: fallbackHyperliquidDepositChains,
      }),
    [fallbackHyperliquidDepositChains, hyperliquidBridgeE],
  );
  const hyperliquidDepositAddedChains = useMemo(
    () =>
      getHyperliquidAddedChains({
        chainList,
        discoveryE: hyperliquidBridgeE,
        side: "deposit",
        fallbackChains: fallbackHyperliquidDepositChains,
      }),
    [chainList, fallbackHyperliquidDepositChains, hyperliquidBridgeE],
  );
  const activeHyperliquidDepositChain = hyperliquidDepositChains.includes(
    hyperliquidDepositChain,
  )
    ? hyperliquidDepositChain
    : hyperliquidDepositAddedChains[0] || hyperliquidDepositChains[0] || "";
  const hyperliquidDepositChainE = chainList.find(
    (entry) => entry.chain == activeHyperliquidDepositChain,
  );
  const fallbackHyperliquidDepositCoins = useMemo(
    () => getFallbackHyperliquidCoinsForChain(hyperliquidDepositChainE),
    [hyperliquidDepositChainE],
  );
  const hyperliquidDepositCoins = useMemo(
    () =>
      getHyperliquidAllCoinsForChain({
        discoveryE: hyperliquidBridgeE,
        side: "deposit",
        chain: activeHyperliquidDepositChain,
        fallbackCoins: fallbackHyperliquidDepositCoins,
      }),
    [
      activeHyperliquidDepositChain,
      fallbackHyperliquidDepositCoins,
      hyperliquidBridgeE,
    ],
  );
  const hyperliquidDepositAddedCoins = useMemo(
    () =>
      getHyperliquidAddedCoinsForChain({
        chainE: hyperliquidDepositChainE,
        discoveryE: hyperliquidBridgeE,
        side: "deposit",
        fallbackCoins: fallbackHyperliquidDepositCoins,
      }),
    [
      fallbackHyperliquidDepositCoins,
      hyperliquidBridgeE,
      hyperliquidDepositChainE,
    ],
  );
  const activeHyperliquidDepositCoin = hyperliquidDepositCoins.includes(
    hyperliquidDepositCoin,
  )
    ? hyperliquidDepositCoin
    : hyperliquidDepositAddedCoins[0] || hyperliquidDepositCoins[0] || "";
  const fallbackHyperliquidWithdrawChains = useMemo(
    () => getFallbackHyperliquidChains(chainList),
    [chainList],
  );
  const hyperliquidWithdrawChains = useMemo(
    () =>
      getHyperliquidAllChains({
        discoveryE: hyperliquidBridgeE,
        side: "withdraw",
        fallbackChains: fallbackHyperliquidWithdrawChains,
      }),
    [fallbackHyperliquidWithdrawChains, hyperliquidBridgeE],
  );
  const hyperliquidWithdrawAddedChains = useMemo(
    () =>
      getHyperliquidAddedChains({
        chainList,
        discoveryE: hyperliquidBridgeE,
        side: "withdraw",
        fallbackChains: fallbackHyperliquidWithdrawChains,
      }),
    [chainList, fallbackHyperliquidWithdrawChains, hyperliquidBridgeE],
  );
  const activeHyperliquidWithdrawChain = hyperliquidWithdrawChains.includes(
    hyperliquidWithdrawChain,
  )
    ? hyperliquidWithdrawChain
    : hyperliquidWithdrawAddedChains[0] || hyperliquidWithdrawChains[0] || "";
  const hyperliquidWithdrawChainE = chainList.find(
    (entry) => entry.chain == activeHyperliquidWithdrawChain,
  );
  const fallbackHyperliquidWithdrawCoins = useMemo(
    () => getFallbackHyperliquidCoinsForChain(hyperliquidWithdrawChainE),
    [hyperliquidWithdrawChainE],
  );
  const hyperliquidWithdrawCoins = useMemo(
    () =>
      getHyperliquidAllCoinsForChain({
        discoveryE: hyperliquidBridgeE,
        side: "withdraw",
        chain: activeHyperliquidWithdrawChain,
        fallbackCoins: fallbackHyperliquidWithdrawCoins,
      }),
    [
      activeHyperliquidWithdrawChain,
      fallbackHyperliquidWithdrawCoins,
      hyperliquidBridgeE,
    ],
  );
  const hyperliquidWithdrawAddedCoins = useMemo(
    () =>
      getHyperliquidAddedCoinsForChain({
        chainE: hyperliquidWithdrawChainE,
        discoveryE: hyperliquidBridgeE,
        side: "withdraw",
        fallbackCoins: fallbackHyperliquidWithdrawCoins,
      }),
    [
      fallbackHyperliquidWithdrawCoins,
      hyperliquidBridgeE,
      hyperliquidWithdrawChainE,
    ],
  );
  const activeHyperliquidWithdrawCoin = hyperliquidWithdrawCoins.includes(
    hyperliquidWithdrawCoin,
  )
    ? hyperliquidWithdrawCoin
    : hyperliquidWithdrawAddedCoins[0] || hyperliquidWithdrawCoins[0] || "";
  const hyperliquidDepositAllCoinEntries = useMemo(
    () =>
      getHyperliquidCoinTokenEntries({
        discoveryE: hyperliquidBridgeE,
        side: "deposit",
        chain: activeHyperliquidDepositChain,
      }),
    [activeHyperliquidDepositChain, hyperliquidBridgeE],
  );
  const hyperliquidWithdrawAllCoinEntries = useMemo(
    () =>
      getHyperliquidCoinTokenEntries({
        discoveryE: hyperliquidBridgeE,
        side: "withdraw",
        chain: activeHyperliquidWithdrawChain,
      }),
    [activeHyperliquidWithdrawChain, hyperliquidBridgeE],
  );
  const hyperliquidDepositRouteToken = getHyperliquidRouteToken({
    discoveryE: hyperliquidBridgeE,
    side: "deposit",
    chain: activeHyperliquidDepositChain,
    coin: activeHyperliquidDepositCoin,
  });
  const hyperliquidWithdrawRouteToken = getHyperliquidRouteToken({
    discoveryE: hyperliquidBridgeE,
    side: "withdraw",
    chain: activeHyperliquidWithdrawChain,
    coin: activeHyperliquidWithdrawCoin,
  });
  const hyperliquidDepositRouteText = getHyperliquidRouteText(
    hyperliquidDepositRouteToken,
  );
  const hyperliquidWithdrawRouteText = getHyperliquidRouteText(
    hyperliquidWithdrawRouteToken,
  );
  const hyperliquidDepositFeeEtaText = getHyperliquidFeeEtaText(
    hyperliquidDepositRouteToken,
  );
  const hyperliquidWithdrawFeeEtaText = getHyperliquidFeeEtaText(
    hyperliquidWithdrawRouteToken,
  );
  const isHyperliquidDepositMode =
    isHyperliquid && hyperliquidMode == "deposit";
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
  const rawSparkAllMarkets = sparkAllMarketM[allMarketCacheKey] || [];
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
  const sparkAllLoading = !!sparkAllLoadingM[allMarketCacheKey];
  const sparkAllError = sparkAllErrorM[allMarketCacheKey] || "";
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
  const underlyingFallbackPrice = fallbackPriceM[underlyingPriceKey];
  const receiptFallbackPrice = fallbackPriceM[receiptPriceKey];
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
  const underlyingQtyAbs = Math.abs(underlyingQty);
  const receiptQtyAbs = Math.abs(receiptQtyNum);
  const lendSliderValue = Math.max(0, Math.min(underlyingQty, maxUnderlying));
  const redeemSliderValue = Math.max(0, Math.min(receiptQtyNum, withdrawMaxReceipt));
  const underlyingEnd = isRedeem
    ? maxUnderlying + underlyingQtyAbs
    : Math.max(0, maxUnderlying - underlyingQtyAbs);
  const receiptEnd = isRedeem
    ? Math.max(0, maxReceipt - receiptQtyAbs)
    : maxReceipt + receiptQtyAbs;
  const underlyingEndInputValue =
    underlyingEndDraft || formatTradeQty(underlyingEnd, underlyingQtyDecimals);
  const receiptEndInputValue =
    receiptEndDraft || formatTradeQty(receiptEnd, receiptQtyDecimals);
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
      return [displayUnderlyingBalance, directBalance.underlying, localBalance]
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
      return [displayReceiptBalance, directBalance.lend, localBalance]
        .filter(hasLoadedBalance)
        .sort((a, b) => toNum(b.balance) - toNum(a.balance))[0] || {};
    }

    if (hasLoadedBalance(localBalance)) return localBalance;

    return localBalance;
  }

  function getLendEndTarget() {
    return toNum(underlyingEndInputValue);
  }

  function getRedeemEndTarget() {
    return toNum(receiptEndInputValue);
  }

  function getLendQtyForWallet(walletEntry = selectedWalletEntry) {
    if (!lendEndWith) return formatTradeQty(lendQty, underlyingQtyDecimals);

    const balance = getWalletUnderlyingBalance(walletEntry);
    if (!hasLoadedBalance(balance)) return null;

    return formatTradeQty(
      toNum(balance.balance) - getLendEndTarget(),
      underlyingQtyDecimals,
    );
  }

  function getRedeemQtyForWallet(walletEntry = selectedWalletEntry) {
    if (!redeemEndWith) return formatTradeQty(receiptQty, receiptQtyDecimals);

    const balance = getWalletReceiptBalance(walletEntry);
    if (!hasLoadedBalance(balance)) return null;

    return formatTradeQty(
      toNum(balance.balance) - getRedeemEndTarget(),
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
    ? underlyingEnd * underlyingPrice
    : 0;
  const receiptEndUsd = receiptPrice ? receiptEnd * receiptPrice : 0;
  const priceLoading =
    !!priceLoadingM[underlyingPriceKey] || !!priceLoadingM[receiptPriceKey];
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
    if (!isHyperliquidDepositMode) return;
    if (hyperliquidBridgeCache && !hyperliquidBridgeRetryTick) {
      setHyperliquidBridgeE(hyperliquidBridgeCache);
      return;
    }

    let cancelled = false;
    if (!hyperliquidBridgePromise || hyperliquidBridgeRetryTick) {
      if (hyperliquidBridgeRetryTick) hyperliquidBridgeCache = null;
      hyperliquidBridgePromise = getHyperliquidSpotBridgeDiscovery()
        .then((res) => ({
          ...(res || {}),
          loading: false,
          loaded: true,
          error: res?.ok ? "" : res?.msg || "Hyperliquid routes failed",
        }))
        .catch((e) => ({
          ...emptyHyperliquidBridgeE,
          loading: false,
          loaded: true,
          error: e?.message || "Hyperliquid routes failed",
        }))
        .then((res) => {
          hyperliquidBridgeCache = res;
          return res;
        })
        .finally(() => {
          hyperliquidBridgePromise = null;
        });
    }

    setHyperliquidBridgeE((entry) => ({
      ...entry,
      loading: true,
      error: "",
    }));
    hyperliquidBridgePromise.then((res) => {
      if (!cancelled) {
        setHyperliquidBridgeE(res);
        setHyperliquidBridgeRetryTick(0);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hyperliquidBridgeRetryTick, isHyperliquidDepositMode]);

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
  }, [allMarketCacheKey, defi, sparkAllKey, sparkAllRetryTick]);

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
    return formatTradeQty(toNum(value) * receiptRate, receiptQtyDecimals);
  }

  function getUnderlyingQty(value) {
    return receiptRate > 0
      ? formatTradeQty(toNum(value) / receiptRate, underlyingQtyDecimals)
      : "0";
  }

  function getSignedReceiptQty(value) {
    return formatTradeQty(-toNum(value) * receiptRate, receiptQtyDecimals);
  }

  function getSignedUnderlyingQty(value) {
    return receiptRate > 0
      ? formatTradeQty(-toNum(value) / receiptRate, underlyingQtyDecimals)
      : "0";
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
    const qty = formatTradeQty(maxUnderlying - toNum(endQty), underlyingQtyDecimals);
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
    const qty = formatTradeQty(maxReceipt - toNum(endQty), receiptQtyDecimals);
    setReceiptEndDraft(endQty);
    setQtyInputSide("redeem");
    setReceiptQty(qty);
    setLendQty(getSignedUnderlyingQty(qty));
  }

  function updateLendEndWith(checked) {
    setLendEndWith(checked);
    if (!checked) return;

    const endQty = underlyingEndInputValue;
    const qty = formatTradeQty(maxUnderlying - toNum(endQty), underlyingQtyDecimals);
    setUnderlyingEndDraft(formatTradeQty(endQty, underlyingQtyDecimals));
    setQtyInputSide("lend");
    setLendQty(qty);
    setReceiptQty(getSignedReceiptQty(qty));
  }

  function updateRedeemEndWith(checked) {
    setRedeemEndWith(checked);
    if (!checked) return;

    const endQty = receiptEndInputValue;
    const qty = formatTradeQty(maxReceipt - toNum(endQty), receiptQtyDecimals);
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

  function sortMarketRows(rows = [], key = "") {
    return sortTradePickerRows(
      rows,
      key,
      {
        underlyingCoin: (entry) => entry.underlyingCoin,
        underlyingQty: (entry) => entry.underlyingQty,
        lendCoin: (entry) => entry.lendCoin,
        lendQty: (entry) => entry.lendQty,
        apr: (entry) => entry.aprValue,
      },
      {
        underlyingQty: "desc",
        lendQty: "desc",
        apr: "desc",
      },
    );
  }

  function toggleMarketSort(section = "added", key = "") {
    const setter = section == "all" ? setAllMarketSort : setAddedMarketSort;
    toggleTradePickerSort(setter, key);
  }

  function SortHeader({ section = "added", sortKey = "", children }) {
    const current = section == "all" ? allMarketSort : addedMarketSort;

    return (
      <TradePickerSortHeader
        activeSort={current}
        sortKey={sortKey}
        onSort={() => toggleMarketSort(section, sortKey)}
      >
        {children}
      </TradePickerSortHeader>
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

  function retryHyperliquidBridge(e) {
    e.preventDefault();
    e.stopPropagation();
    hyperliquidBridgeCache = null;
    hyperliquidBridgePromise = null;
    setHyperliquidBridgeE(emptyHyperliquidBridgeE);
    setHyperliquidBridgeRetryTick((tick) => tick + 1);
  }

  function renderHyperliquidCoinMenu({
    side = "deposit",
    chain = "",
    selectedCoin = "",
    addedCoins = [],
    allCoins = [],
    allCoinEntries = [],
    onSelect = () => {},
  }) {
    const entryM = Object.fromEntries(
      allCoinEntries.map((entry) => [entry.coin, entry]),
    );
    const chainEForBalance = chainList.find((entry) => entry.chain == chain);
    const getRouteCoinBalance = (coin = "") =>
      getMarketCoinBalance(chainEForBalance, coin, "", selectedWalletEntry);

    return (
      <TradePickerMenu className="swapCoinMenu">
        <TradePickerColumn title="added">
          <TradePickerTable
            className="swapCoinAddedTable"
            headers={["coin", "qty", "on"]}
          >
            <tbody>
              {addedCoins.length ? (
                addedCoins.map((coin) => {
                  const balance = getRouteCoinBalance(coin);
                  const supported =
                    !hyperliquidBridgeE.loaded || allCoins.includes(coin);
                  return (
                    <tr
                      key={`hl_${side}_added_coin_${coin}`}
                      className={[
                        "lendMarketRow",
                        coin == selectedCoin ? "on" : "",
                        supported ? "" : "unsupported",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td>
                        <button
                          type="button"
                          className="lendMarketAllSelect swapCoinAllSelect"
                          onClick={() =>
                            supported
                              ? onSelect(coin)
                              : toast(`${coin} is not supported by Hyperliquid`)
                          }
                        >
                          <span>{coin}</span>
                        </button>
                      </td>
                      <td>
                        <MarketCoinBalance balance={balance} />
                      </td>
                      <td>{!supported && <span className="gray">off</span>}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="gray">
                    -
                  </td>
                </tr>
              )}
            </tbody>
          </TradePickerTable>
        </TradePickerColumn>
        <TradePickerColumn title="all">
          <TradePickerTable
            className="swapCoinAllTable"
            headers={["coin", "qty", "add"]}
          >
            <tbody>
              {hyperliquidBridgeE.loading && (
                <tr>
                  <td colSpan={3} className="gray">
                    loading Hyperliquid...
                  </td>
                </tr>
              )}
              {!hyperliquidBridgeE.loading && hyperliquidBridgeE.error && (
                <tr>
                  <td colSpan={2}>
                    <span className="red">{hyperliquidBridgeE.error}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small bgGray"
                      onClick={retryHyperliquidBridge}
                    >
                      retry
                    </button>
                  </td>
                </tr>
              )}
              {!hyperliquidBridgeE.loading &&
                !hyperliquidBridgeE.error &&
                !allCoins.length && (
                  <tr>
                    <td colSpan={2} className="gray">
                      -
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small bgGray"
                        onClick={retryHyperliquidBridge}
                      >
                        retry
                      </button>
                    </td>
                  </tr>
                )}
              {!hyperliquidBridgeE.loading &&
                !hyperliquidBridgeE.error &&
                allCoins.map((coin) => {
                  const added = addedCoins.includes(coin);
                  const entry = entryM[coin] || {};
                  const balance = getRouteCoinBalance(coin);
                  const routeText = getHyperliquidRouteText(entry);
                  return (
                    <tr
                      key={`hl_${side}_all_coin_${coin}`}
                      className={
                        coin == selectedCoin
                          ? "lendMarketRow on"
                          : "lendMarketRow"
                      }
                    >
                      <td>
                        <button
                          type="button"
                          className="lendMarketAllSelect swapCoinAllSelect"
                          onClick={() => onSelect(coin)}
                        >
                          <span>{coin}</span>
                          {routeText && (
                            <span className="gray">{routeText}</span>
                          )}
                        </button>
                      </td>
                      <td>
                        <MarketCoinBalance balance={balance} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={
                            added ? "btn small bgGray" : "btn small bgCyan"
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (added) return;
                            toast(
                              `${
                                chain ? `${chain} ` : ""
                              }${coin}: add manually; Hyperliquid discovery has no contract address`,
                            );
                          }}
                          disabled={added}
                        >
                          {added ? "✓" : "+"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </TradePickerTable>
        </TradePickerColumn>
      </TradePickerMenu>
    );
  }

  function renderHyperliquidChainMenu({
    side = "deposit",
    selectedChain = "",
    addedChains = [],
    allChains = [],
    onSelect = () => {},
  }) {
    return (
      <TradePickerMenu className="swapChainMenu">
        <TradePickerColumn title="added">
          <TradePickerTable
            className="swapChainAddedTable"
            headers={["chain", "on"]}
          >
            <tbody>
              {addedChains.length ? (
                addedChains.map((chain) => {
                  const supported =
                    !hyperliquidBridgeE.loaded || allChains.includes(chain);
                  return (
                    <tr
                      key={`hl_${side}_added_chain_${chain}`}
                      className={[
                        "lendMarketRow",
                        chain == selectedChain ? "on" : "",
                        supported ? "" : "unsupported",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td>
                        <button
                          type="button"
                          className="lendMarketAllSelect swapChainAllSelect"
                          onClick={() =>
                            supported
                              ? onSelect(chain)
                              : toast(`${chain} is not supported by Hyperliquid`)
                          }
                        >
                          <span>{chain}</span>
                        </button>
                      </td>
                      <td>{!supported && <span className="gray">off</span>}</td>
                    </tr>
                  );
                })
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
        <TradePickerColumn title="all">
          <TradePickerTable
            className="swapChainAllTable"
            headers={["chain", "add"]}
          >
            <tbody>
              {hyperliquidBridgeE.loading && (
                <tr>
                  <td colSpan={2} className="gray">
                    loading Hyperliquid...
                  </td>
                </tr>
              )}
              {!hyperliquidBridgeE.loading && hyperliquidBridgeE.error && (
                <tr>
                  <td>
                    <span className="red">{hyperliquidBridgeE.error}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small bgGray"
                      onClick={retryHyperliquidBridge}
                    >
                      retry
                    </button>
                  </td>
                </tr>
              )}
              {!hyperliquidBridgeE.loading &&
                !hyperliquidBridgeE.error &&
                !allChains.length && (
                  <tr>
                    <td className="gray">-</td>
                    <td>
                      <button
                        type="button"
                        className="btn small bgGray"
                        onClick={retryHyperliquidBridge}
                      >
                        retry
                      </button>
                    </td>
                  </tr>
                )}
              {!hyperliquidBridgeE.loading &&
                !hyperliquidBridgeE.error &&
                allChains.map((chain) => {
                  const added = addedChains.includes(chain);
                  return (
                    <tr
                      key={`hl_${side}_all_chain_${chain}`}
                      className={
                        chain == selectedChain
                          ? "lendMarketRow on"
                          : "lendMarketRow"
                      }
                    >
                      <td>
                        <button
                          type="button"
                          className="lendMarketAllSelect swapChainAllSelect"
                          onClick={() => onSelect(chain)}
                        >
                          <span>{chain}</span>
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={
                            added ? "btn small bgGray" : "btn small bgCyan"
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (added) return;
                            toast(
                              `${chain}: add chain manually before using this route`,
                            );
                          }}
                          disabled={added}
                        >
                          {added ? "✓" : "+"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </TradePickerTable>
        </TradePickerColumn>
      </TradePickerMenu>
    );
  }

  function renderHyperliquidCoinSelect({
    side = "deposit",
    chain = "",
    selectedCoin = "",
    addedCoins = [],
    allCoins = [],
    allCoinEntries = [],
    showMenu = false,
    setShowMenu = () => {},
    pickerRef,
    onSelect = () => {},
    onNext = () => {},
  }) {
    return (
      <div className="selectCycle walletCycle swapCoinCycle">
        <div className="sendWalletPicker" ref={pickerRef}>
          <button
            type="button"
            className="sendWalletPickerButton"
            style={{
              width: getHyperliquidPickerWidth(
                [...addedCoins, ...allCoins],
                selectedCoin,
              ),
            }}
            disabled={!allCoins.length}
            onClick={() => setShowMenu((show) => !show)}
          >
            {selectedCoin || "no coin"}
          </button>
          {showMenu &&
            renderHyperliquidCoinMenu({
              side,
              chain,
              selectedCoin,
              addedCoins,
              allCoins,
              allCoinEntries,
              onSelect,
            })}
        </div>
        <button
          type="button"
          className="btn small bgGray"
          onClick={onNext}
          disabled={addedCoins.length < 2 && allCoins.length < 2}
        >
          {">"}
        </button>
      </div>
    );
  }

  function renderHyperliquidChainSelect({
    side = "deposit",
    selectedChain = "",
    addedChains = [],
    allChains = [],
    showMenu = false,
    setShowMenu = () => {},
    pickerRef,
    onSelect = () => {},
    onNext = () => {},
  }) {
    return (
      <div className="selectCycle walletCycle swapChainCycle">
        <div className="sendWalletPicker" ref={pickerRef}>
          <button
            type="button"
            className="sendWalletPickerButton"
            style={{
              width: getHyperliquidPickerWidth(
                [...addedChains, ...allChains],
                selectedChain,
              ),
            }}
            disabled={!allChains.length}
            onClick={() => {
              if (selectedChain) emitTradeChainSelect(selectedChain);
              setShowMenu((show) => !show);
            }}
            onFocus={() => selectedChain && emitTradeChainSelect(selectedChain)}
          >
            {selectedChain || "no chain"}
          </button>
          {showMenu &&
            renderHyperliquidChainMenu({
              side,
              selectedChain,
              addedChains,
              allChains,
              onSelect,
            })}
        </div>
        <button
          type="button"
          className="btn small bgGray"
          onClick={onNext}
          disabled={addedChains.length < 2 && allChains.length < 2}
        >
          {">"}
        </button>
      </div>
    );
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
      const coin = String(
        customCoinDraft.coin || customCoinPreview.coin || "",
      ).trim();
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
      onTxComplete({
        ok: true,
        type: "addCoin",
        chain: customCoinPreview.chain,
      });
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
      ? getRedeemQtyForWallet(walletEntry)
      : getLendQtyForWallet(walletEntry);
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
        ? formatTradeQty(signedQty, receiptQtyDecimals).replace(/^-/, "")
        : getUnderlyingQty(signedQtyAbs)
      : submitRedeem
        ? getReceiptQty(signedQtyAbs)
        : formatTradeQty(signedQty, underlyingQtyDecimals).replace(/^-/, "");
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

            <label className="gray" htmlFor="yieldCoinConfirmRef">
              ref
            </label>
            <input
              id="yieldCoinConfirmRef"
              type="text"
              value={customCoinDraft.ref}
              onChange={(e) =>
                setCustomCoinDraft((draft) => ({
                  ...draft,
                  ref: e.target.value,
                }))
              }
              placeholder="optional note"
              disabled={addingCoin}
              style={{
                width: `${Math.max(customCoinDraft.ref.length || 0, 13) + 2}ch`,
              }}
            />
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
            <button
              type="submit"
              className="btn small bgCyan"
              disabled={addingCoin}
            >
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
          <div className="selectCycle walletCycle lendMarketCycle">
            <button
              type="button"
              className="btn small bgGray"
              onClick={prevMarket}
              disabled={visibleAddedMarkets.length < 2}
            >
              {"<"}
            </button>
            <div className="sendWalletPicker" ref={marketPickerRef}>
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
                <TradePickerMenu className="lendMarketMenu">
                  <TradePickerColumn title="added">
                    <TradePickerTable
                      className="lendMarketAddedTable"
                      headers={[
                        <SortHeader sortKey="underlyingCoin">coin</SortHeader>,
                        <SortHeader sortKey="underlyingQty">qty</SortHeader>,
                        <SortHeader sortKey="lendCoin">coin</SortHeader>,
                        <SortHeader sortKey="lendQty">qty</SortHeader>,
                        <SortHeader sortKey="apr">apr</SortHeader>,
                      ]}
                    >
                      <tbody>
                        {visibleAddedMarkets.length ? (
                          sortMarketRows(
                            visibleAddedMarkets.map(getMarketTableRow),
                            addedMarketSort,
                          ).map((entry) => (
                            <tr
                              key={`wallet_${entry.value}`}
                              className={
                                entry.value == market
                                  ? "lendMarketRow on"
                                  : "lendMarketRow"
                              }
                              onClick={() => selectMarket(entry.value)}
                            >
                              <td>
                                <span>{entry.underlyingCoin}</span>
                              </td>
                              <td>
                                <MarketCoinBalance
                                  balance={entry.underlyingBalance}
                                />
                              </td>
                              <td>
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
                              </td>
                              <td>
                                <MarketCoinBalance
                                  balance={entry.lendBalance}
                                />
                              </td>
                              <td>
                                <AprText apr={entry.supplyApr} label={false} />
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="gray">
                              -
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </TradePickerTable>
                  </TradePickerColumn>
                  <TradePickerColumn title="all">
                    <TradePickerTable
                      className="lendMarketAllTable"
                      headers={[
                        <SortHeader section="all" sortKey="underlyingCoin">
                          coin
                        </SortHeader>,
                        <SortHeader section="all" sortKey="underlyingQty">
                          qty
                        </SortHeader>,
                        "add",
                        <SortHeader section="all" sortKey="lendCoin">
                          coin
                        </SortHeader>,
                        <SortHeader section="all" sortKey="lendQty">
                          qty
                        </SortHeader>,
                        "add",
                        <SortHeader section="all" sortKey="apr">
                          apr
                        </SortHeader>,
                      ]}
                    >
                      <tbody>
                        {allLoading && (
                          <tr>
                            <td colSpan={7} className="gray">
                              loading {allProtocolLabel}...
                            </td>
                          </tr>
                        )}
                        {!allLoading &&
                          allError &&
                          visibleAddedMarkets.length > 0 && (
                            <tr>
                              <td colSpan={7} className="gray">
                                all added
                              </td>
                            </tr>
                          )}
                        {!allLoading &&
                          allError &&
                          !visibleAddedMarkets.length && (
                            <tr>
                              <td colSpan={6}>
                                <span className="red">{allError}</span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn small bgGray"
                                  onClick={retryAllMarkets}
                                >
                                  retry
                                </button>
                              </td>
                            </tr>
                          )}
                        {!allLoading && !allError && !allMarkets.length && (
                          <tr>
                            <td colSpan={6} className="gray">
                              {visibleAddedMarkets.length ? "all added" : "-"}
                            </td>
                            <td>
                              {!visibleAddedMarkets.length && (
                                <button
                                  type="button"
                                  className="btn small bgGray"
                                  onClick={retryAllMarkets}
                                >
                                  retry
                                </button>
                              )}
                            </td>
                          </tr>
                        )}
                        {!allLoading &&
                          !allError &&
                          sortMarketRows(
                            allMarkets.map(getMarketTableRow),
                            allMarketSort,
                          ).map((entry) => (
                            <tr
                              key={`${defi}_${entry.value}`}
                              className={
                                entry.addedValue == market
                                  ? "lendMarketRow on"
                                  : "lendMarketRow"
                              }
                            >
                              <td>
                                <button
                                  type="button"
                                  className="lendMarketAllSelect"
                                  onClick={() =>
                                    selectMarket(
                                      entry.addedValue || entry.value,
                                    )
                                  }
                                  title={entry.underlyingName}
                                >
                                  <span>{entry.underlyingCoin}</span>
                                </button>
                              </td>
                              <td>
                                <MarketCoinBalance
                                  balance={entry.underlyingBalance}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={
                                    entry.addedUnderlying
                                      ? "btn small bgGray"
                                      : "btn small bgCyan"
                                  }
                                  onClick={(e) =>
                                    openProtocolCoinConfirm(
                                      e,
                                      entry,
                                      "underlying",
                                    )
                                  }
                                  disabled={
                                    entry.addedUnderlying || addingCoin
                                  }
                                  title={entry.underlyingName}
                                >
                                  {entry.addedUnderlying ? "✓" : "+"}
                                </button>
                              </td>
                              <td>
                                <span className="infoHover hoverOnlyInfo lendMarketCoinHover">
                                  <button
                                    type="button"
                                    className="lendMarketAllSelect lendMarketAllLendSelect"
                                    onClick={() =>
                                      selectMarket(
                                        entry.addedValue || entry.value,
                                      )
                                    }
                                  >
                                    <span className="gray">
                                      {entry.lendCoin}
                                    </span>
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
                              </td>
                              <td>
                                <MarketCoinBalance
                                  balance={entry.lendBalance}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={
                                    entry.addedLend
                                      ? "btn small bgGray"
                                      : "btn small bgCyan"
                                  }
                                  onClick={(e) =>
                                    openProtocolCoinConfirm(e, entry)
                                  }
                                  disabled={entry.addedLend || addingCoin}
                                >
                                  {entry.addedLend ? "✓" : "+"}
                                </button>
                              </td>
                              <td>
                                <AprText apr={entry.supplyApr} label={false} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </TradePickerTable>
                  </TradePickerColumn>
                </TradePickerMenu>
              )}
            </div>
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
          </div>
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
                {renderHyperliquidChainSelect({
                  side: "deposit",
                  selectedChain: activeHyperliquidDepositChain,
                  addedChains: hyperliquidDepositAddedChains,
                  allChains: hyperliquidDepositChains,
                  showMenu: showHyperliquidDepositChainMenu,
                  setShowMenu: setShowHyperliquidDepositChainMenu,
                  pickerRef: hyperliquidDepositChainPickerRef,
                  onSelect: selectHyperliquidDepositChain,
                  onNext: nextHyperliquidDepositChain,
                })}
                {renderHyperliquidCoinSelect({
                  side: "deposit",
                  chain: activeHyperliquidDepositChain,
                  selectedCoin: activeHyperliquidDepositCoin,
                  addedCoins: hyperliquidDepositAddedCoins,
                  allCoins: hyperliquidDepositCoins,
                  allCoinEntries: hyperliquidDepositAllCoinEntries,
                  showMenu: showHyperliquidDepositCoinMenu,
                  setShowMenu: setShowHyperliquidDepositCoinMenu,
                  pickerRef: hyperliquidDepositCoinPickerRef,
                  onSelect: selectHyperliquidDepositCoin,
                  onNext: nextHyperliquidDepositCoin,
                })}
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
                {renderHyperliquidChainSelect({
                  side: "withdraw",
                  selectedChain: activeHyperliquidWithdrawChain,
                  addedChains: hyperliquidWithdrawAddedChains,
                  allChains: hyperliquidWithdrawChains,
                  showMenu: showHyperliquidWithdrawChainMenu,
                  setShowMenu: setShowHyperliquidWithdrawChainMenu,
                  pickerRef: hyperliquidWithdrawChainPickerRef,
                  onSelect: selectHyperliquidWithdrawChain,
                  onNext: nextHyperliquidWithdrawChain,
                })}
                {renderHyperliquidCoinSelect({
                  side: "withdraw",
                  chain: activeHyperliquidWithdrawChain,
                  selectedCoin: activeHyperliquidWithdrawCoin,
                  addedCoins: hyperliquidWithdrawAddedCoins,
                  allCoins: hyperliquidWithdrawCoins,
                  allCoinEntries: hyperliquidWithdrawAllCoinEntries,
                  showMenu: showHyperliquidWithdrawCoinMenu,
                  setShowMenu: setShowHyperliquidWithdrawCoinMenu,
                  pickerRef: hyperliquidWithdrawCoinPickerRef,
                  onSelect: selectHyperliquidWithdrawCoin,
                  onNext: nextHyperliquidWithdrawCoin,
                })}
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
  );
}
