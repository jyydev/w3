"use client";
import "ygb/react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import arbitrumIcon from "@/data/img/arbitrum.svg";
import bscIcon from "@/data/img/bsc.png";
import debankIcon from "@/data/img/debank.png";
import ethereumIcon from "@/data/img/ethereum.svg";
import solanaIcon from "@/data/img/solana.svg";
import useCgb from "@/app/context";
import { pc } from "@/fn/basic";
import permanentCoinM from "@/fn/coinM";
import {
  encodeSelectionOrder,
  normalizeSelectionOrder,
  parseSelectionOrder,
  rememberSelectionValue,
} from "@/fn/selectionOrder";
import { ckPrefix, scanners, walletChainFilterPriority } from "@/sets";
import {
  CustomHistoryPicker,
  CycleButtonPair,
  DiscoveryCacheInfo,
  getCycleTargetValue,
  getCustomPickerHistoryCycleValues,
  HoverInfoCard,
  InteractiveInfoCard,
  PassiveInfoCard,
  TableSortHeader,
  TrashIcon,
} from "@/components/Shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  addLocalCustomCoin,
  addLocalWalletEntry,
  deleteLocalCustomCoin,
  deleteLocalWalletEntry,
  getAllLocalCustomCoinM,
  hasLocalWalletSource,
  listLocalWalletSources,
  localEditorStorageEvent,
  readLocalLineFileValues,
  readLocalWalletEntries,
  setLocalLineFileValue,
  updateLocalWalletEntryRef,
  shouldUseLocalStorageEditor,
} from "../_editorData/browserEditorStorage";
import { toggleOffAddr, toggleOffCoin } from "./chainActions";
import {
  addCustomCoin,
  deleteCustomCoin,
  previewCustomCoin,
} from "./coinActions";
import { getLocalWalletBalanceData } from "./localWalletActions";
import {
  addWalletEntry,
  deleteWalletEntry,
  updateWalletEntryRef,
} from "./walletActions";
import {
  encodeFavAddrs,
  favAddrCookie,
  getFavAddrKey,
  parseFavAddrs,
} from "./favAddrs";
import { readStoredWallet, walletConnectEvent } from "./browserWalletStorage";
import {
  applyWalletBalanceClientCache,
  clearWalletBalanceClientCache,
  createWalletBalanceClientViewId,
  emitWalletBalancePatches,
  getWalletBalancePatches,
  getWalletBalanceClientCacheData,
  getWalletBalanceClientCacheMeta,
  isWalletBalanceAddressCached,
  markWalletBalanceDataFresh,
  mergeWalletBalanceData,
  patchWalletBalanceClientCache,
  walletBalancePatchEvent,
  writeWalletBalanceClientCache,
} from "./walletBalanceClientCache";
import {
  disabledCoinsCookie,
  disabledWalletsCookie,
  encodeDisabledCoinM,
  encodeDisabledWallets,
  getWalletDisableKey,
} from "./walletSettingData";
import {
  buildAaveStakingClaimTxs,
  executeAaveStakingClaim,
} from "../t/_yield/aaveStaking/sv";
import { getWalletPrivateKeyFlag, sendBrowserTradeTx } from "../t/clientShared";

function shortAddr(address) {
  return address ? `..${address.slice(-3)}` : "";
}

const tradeChainSelectEvent = "w3:tradeChainSelect";

function sameWalletAddress(a = "", b = "") {
  const addressA = String(a || "").trim();
  const addressB = String(b || "").trim();
  if (!addressA || !addressB) return false;

  if (addressA == addressB) return true;
  if (addressA.startsWith("0x") && addressB.startsWith("0x")) {
    return addressA.toLowerCase() == addressB.toLowerCase();
  }

  return false;
}

function hasWalletBalanceDataForAddress(
  data = [],
  { walletType = "evm", address = "", chains = [] } = {},
) {
  const addressKey = getFavAddrKey(walletType, address);
  const chainList = Array.isArray(data) ? data : data ? [data] : [];
  const requestedChains = (chains || []).filter(Boolean);
  if (!addressKey || !requestedChains.length) return false;

  const chainM = new Map(
    chainList.map((chainE) => [String(chainE?.chain || ""), chainE]),
  );

  return requestedChains.every((chain) =>
    (chainM.get(chain)?.rows || []).some(
      (row) => getFavAddrKey(walletType, row?.address) == addressKey,
    ),
  );
}

function filterWalletBalanceData(
  data = [],
  { walletType = "evm", addresses = [], chains = [] } = {},
) {
  const chainList = Array.isArray(data) ? data : data ? [data] : [];
  const addressSet = new Set(
    (addresses || [])
      .map((address) => getFavAddrKey(walletType, address))
      .filter(Boolean),
  );
  const chainSet = new Set((chains || []).filter(Boolean));

  return chainList
    .filter((chainE) => !chainSet.size || chainSet.has(chainE?.chain))
    .map((chainE) => ({
      ...chainE,
      rows: (chainE?.rows || []).filter((row) =>
        addressSet.has(getFavAddrKey(walletType, row?.address)),
      ),
    }))
    .filter((chainE) => chainE.rows.length);
}

function getBalancePatchKey({ chain = "", coin = "", address = "" } = {}) {
  const addressKey = getTokenAddressKey(chain, address);

  return `${chain}:${coin}:${addressKey}`;
}

function getClaimRewardKey({
  address = "",
  sourceChain = "",
  stakingAddress = "",
  coin = "",
} = {}) {
  return `${String(address || "").toLowerCase()}:${sourceChain}:${String(
    stakingAddress || "",
  ).toLowerCase()}:${coin}`;
}

function getTokenAddressKey(chain = "", address = "") {
  const value = String(address || "").trim();
  if (!value) return "";

  return chain == "Solana" || chain == "Tron"
    ? value
    : value.toLowerCase();
}

function hasPositiveBalance(balance = {}) {
  if (!balance || typeof balance != "object") return false;
  try {
    if (BigInt(balance.raw || 0) > 0n) return true;
  } catch {}

  return Number(balance.balance || 0) > 0 || Number(balance.usd || 0) > 0;
}

function getPermanentAddressCoinM(chain = "") {
  const addressCoinM = {};

  for (const [coin, coinE] of Object.entries(permanentCoinM?.[chain] || {})) {
    const addressKey = getTokenAddressKey(chain, coinE?.address);
    if (addressKey && !addressCoinM[addressKey])
      addressCoinM[addressKey] = coin;
  }

  return addressCoinM;
}

function normalizeCoinAliasList(list = [], aliasCoinM = {}) {
  const seen = new Set();
  const result = [];

  for (const coin of list || []) {
    const canonicalCoin = aliasCoinM[coin] || coin;
    if (!canonicalCoin || seen.has(canonicalCoin)) continue;
    seen.add(canonicalCoin);
    result.push(canonicalCoin);
  }

  return result;
}

function normalizeWalletCoinAliases(data = []) {
  const list = Array.isArray(data) ? data : data ? [data] : [];

  return list.map((chainE) => {
    const coinInfoM = chainE?.coinInfoM || {};
    const permanentAddressCoinM = getPermanentAddressCoinM(chainE.chain);
    const addressCoinM = {};
    const aliasCoinM = {};
    const normalizedCoinInfoM = {};

    for (const [coin, coinE] of Object.entries(coinInfoM)) {
      const addressKey = getTokenAddressKey(chainE.chain, coinE?.address);
      const canonicalCoin =
        (addressKey && permanentAddressCoinM[addressKey]) ||
        (addressKey && addressCoinM[addressKey]) ||
        coin;

      if (canonicalCoin != coin) {
        aliasCoinM[coin] = canonicalCoin;
      }

      if (!normalizedCoinInfoM[canonicalCoin]) {
        normalizedCoinInfoM[canonicalCoin] =
          coinInfoM[canonicalCoin] ||
          permanentCoinM?.[chainE.chain]?.[canonicalCoin] ||
          coinE;
      }
      if (addressKey && !addressCoinM[addressKey]) {
        addressCoinM[addressKey] = canonicalCoin;
      }
    }

    const rows = (chainE.rows || []).map((row) => {
      const balances = {};

      for (const [coin, balance] of Object.entries(row.balances || {})) {
        const canonicalCoin = aliasCoinM[coin] || coin;
        const nextBalance = { ...balance, coin: canonicalCoin };
        const prevBalance = balances[canonicalCoin];
        balances[canonicalCoin] =
          !prevBalance ||
          (!hasPositiveBalance(prevBalance) && hasPositiveBalance(nextBalance))
            ? nextBalance
            : prevBalance;
      }

      return { ...row, balances };
    });

    const allCoins = normalizeCoinAliasList(
      chainE.allCoins?.length ? chainE.allCoins : Object.keys(coinInfoM),
      aliasCoinM,
    );
    const coins = normalizeCoinAliasList(chainE.coins || [], aliasCoinM);

    return {
      ...chainE,
      allCoins,
      coins,
      coinInfoM: normalizedCoinInfoM,
      rows,
    };
  });
}

function applyBalancePatches(data = [], patchM = {}) {
  const patches = Object.values(patchM || {}).filter(
    (patch) => patch?.chain && patch?.coin && patch?.address && patch?.balance,
  );
  if (!patches.length) return data;

  const list = Array.isArray(data) ? data : data ? [data] : [];

  return list.map((chainE) => {
    const chainPatches = patches.filter((patch) => patch.chain == chainE.chain);
    if (!chainPatches.length) return chainE;

    const patchCoins = chainPatches.map((patch) => patch.coin);

    return {
      ...chainE,
      allCoins: [...new Set([...(chainE.allCoins || []), ...patchCoins])],
      coins: [...new Set([...(chainE.coins || []), ...patchCoins])],
      rows: (chainE.rows || []).map((row) => {
        const rowPatches = chainPatches.filter((patch) =>
          sameWalletAddress(row.address, patch.address),
        );
        if (!rowPatches.length) return row;

        const balances = { ...(row.balances || {}) };
        for (const patch of rowPatches) {
          balances[patch.coin] = {
            ...(balances[patch.coin] || {}),
            ...patch.balance,
          };
        }

        return { ...row, balances };
      }),
    };
  });
}

function getWalletAddressReloadKey(walletType = "evm", address = "") {
  const text = String(address || "").trim();
  const cleanAddress = walletType == "evm" ? text.toLowerCase() : text;
  return cleanAddress ? `${walletType}:${cleanAddress}` : "";
}

function applyWalletAddressReloadData(
  data = [],
  reloadM = {},
  walletType = "evm",
) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  const reloadData = Object.entries(reloadM || {})
    .filter(([key]) => key.startsWith(`${walletType}:`))
    .flatMap(([, value]) =>
      Array.isArray(value) ? value : value ? [value] : [],
    );
  if (!list.length || !reloadData.length) return data;

  const reloadByChainM = {};
  for (const chainE of reloadData) {
    const chain = String(chainE?.chain || "");
    if (!chain) continue;
    reloadByChainM[chain] ??= [];
    reloadByChainM[chain].push(chainE);
  }

  const merged = list.map((chainE) => {
    const reloadChains = reloadByChainM[chainE?.chain] || [];
    if (!reloadChains.length) return chainE;

    const rows = [...(chainE.rows || [])];
    const allCoins = [...(chainE.allCoins || [])];
    const coins = [...(chainE.coins || [])];
    const coinInfoM = { ...(chainE.coinInfoM || {}) };

    for (const reloadChain of reloadChains) {
      Object.assign(coinInfoM, reloadChain.coinInfoM || {});
      for (const coin of reloadChain.allCoins || []) {
        if (!allCoins.includes(coin)) allCoins.push(coin);
      }
      for (const coin of reloadChain.coins || []) {
        if (!coins.includes(coin)) coins.push(coin);
      }
      for (const reloadRow of reloadChain.rows || []) {
        const index = rows.findIndex((row) =>
          sameWalletAddress(row.address, reloadRow.address),
        );
        if (index >= 0) {
          rows[index] = {
            ...rows[index],
            ...reloadRow,
            clientCached: false,
            clientReloaded: true,
          };
        } else {
          rows.push({
            ...reloadRow,
            clientCached: false,
            clientReloaded: true,
          });
        }
      }
    }

    return {
      ...chainE,
      allCoins,
      coins,
      coinInfoM,
      rows,
    };
  });

  return Array.isArray(data) ? merged : merged[0] || data;
}

function shortContract(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function getCoinDisplayLabel(chain = "", coin = "", coinE = {}) {
  const address = String(coinE.address || "").replace(/^0x/i, "");
  if (chain == "Hyperliquid" && /^HL_/i.test(coin) && address) {
    return `HL_${address.slice(-3)}`;
  }

  return coin;
}

const chainIconM = {
  Arbitrum: arbitrumIcon,
  BSC: bscIcon,
  Ethereum: ethereumIcon,
  Solana: solanaIcon,
};
const chainTextIconM = {
  Avalanche: "Av",
  Base: "Ba",
  Claim: "Cl",
  Kaia: "Ka",
  Optimism: "Op",
  Hyperliquid: "Hy",
  Tron: "Tr",
  WEMIX: "We",
  zkSyncEra: "Zk",
};

function getChainIconClass(chain = "") {
  return chain.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getImgSrc(img) {
  return typeof img == "string" ? img : img?.src;
}

function ChainIcon({ chain }) {
  const textIcon = chainTextIconM[chain];
  if (textIcon) {
    return (
      <span
        className={`assetIcon assetIconText chainIcon chainIcon-${getChainIconClass(chain)}`}
        aria-hidden="true"
      >
        {textIcon}
      </span>
    );
  }

  const src = getImgSrc(chainIconM[chain]);
  if (!src) {
    if (!chain) return null;

    return (
      <span
        className="assetIcon assetIconText chainIcon chainIcon-missing"
        aria-hidden="true"
      >
        {getCoinIconText({ coin: chain })}
      </span>
    );
  }

  return (
    <img
      className={`assetIcon chainIcon chainIcon-${getChainIconClass(chain)}`}
      src={src}
      alt=""
      aria-hidden="true"
    />
  );
}

function getCoinTypeClass(type = "") {
  return String(type || "token")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getCoinIconText({ coin = "", name = "" } = {}) {
  const cleanName = String(name || coin || "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const firstWord = cleanName.split(/\s+/).find(Boolean) || String(coin || "");
  const letters = firstWord.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2);

  return (letters || String(coin || "").slice(0, 2) || "?")
    .slice(0, 2)
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

function CoinIcon({ coin, coinE = {} }) {
  if (coinE.synthetic) return null;

  return (
    <span
      className={`assetIcon assetIconText coinIcon coinIcon-${getCoinTypeClass(coinE.type)}`}
      title={`${coinE.name || coin} (${coinE.type || "token"})`}
      aria-hidden="true"
    >
      {getCoinIconText({ coin, name: coinE.name })}
    </span>
  );
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getDefaultWalletName(address = "") {
  const clean = String(address || "")
    .trim()
    .replace(/^0x/i, "")
    .replace(/[^\w]/g, "");

  return clean ? `addr_${clean.slice(-6)}` : "";
}

function isAddressOnlyWalletName(name = "") {
  const clean = String(name || "").trim();
  return /^addr(?:[_-].*)?$/i.test(clean) || /^fav[_-].+/i.test(clean);
}

function getNameDisableKey(name = "") {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function getScannerTokenUrl(chainE, address) {
  if (!chainE?.scanner || !address) return "";
  const scanner = chainE.scanner.replace(/\/+$/, "");
  if (chainE.chain == "Hyperliquid") return `${scanner}/vaults/${address}`;

  if (chainE.chain == "Solana") return `${scanner}/token/${address}`;
  if (chainE.chain == "Tron") return `${scanner}/token20/${address}`;

  return `${scanner}/address/${address}`;
}

function getScannerAccountUrl(chainE, address) {
  if (!chainE?.scanner || !address) return "";
  const scanner = chainE.scanner.replace(/\/+$/, "");
  if (chainE.chain == "Hyperliquid") return `${scanner}/${address}`;

  return chainE.chain == "Solana"
    ? `${scanner}/account/${address}`
    : `${scanner}/address/${address}`;
}

function getStandaloneAccountUrl(chain, scanner, address) {
  if (!scanner || !address) return "";
  const base = scanner.replace(/\/+$/, "");

  return chain == "Solana"
    ? `${base}/account/${address}`
    : `${base}/address/${address}`;
}

const walletTypeList = [
  ["evm", "EVM"],
  ["solana", "Solana"],
  ["tron", "Tron"],
];
const coinLimitCookie = `${ckPrefix ?? ""}coinLimit`;
const assetSortCookie = `${ckPrefix ?? ""}assetSort`;
const rowSortCookie = `${ckPrefix ?? ""}rowSort`;
const activeChainCookie = `${ckPrefix ?? ""}activeChain`;
const showAllChainIconsCookie = `${ckPrefix ?? ""}showAllChainIcons`;
const chainSortCookie = `${ckPrefix ?? ""}chainSort`;
const allChainSortValue = "__all__";
const chainSortCap = 10;
const lastWalletCookiePrefix = `${ckPrefix ?? ""}lastWallet_`;
const walletHistoryCookiePrefix = `${ckPrefix ?? ""}walletHistory_`;
const lastWalletStoragePrefix = `${ckPrefix ?? ""}lastWalletStorage_`;
const walletHistoryStoragePrefix = `${ckPrefix ?? ""}walletHistoryStorage_`;
const walletHistorySkipStorageKey = `${ckPrefix ?? ""}walletHistorySkip`;
const walletHistoryCap = 10;
const cookieMaxAge = 365 * 24 * 60 * 60;
const connectedWalletValue = "__connected__";
const walletNotFoundValue = "__not_found__";
const favWalletHistoryValue = "__favs__";

function getInitialCookie(initialCookieM = {}, name = "") {
  const value = initialCookieM?.[name];
  return value === undefined ? undefined : String(value);
}

function getInitialActiveChain({ data, initialCookieM = {} } = {}) {
  const chainList = Array.isArray(data) ? data : data ? [data] : [];
  const chainNames = chainList.map((chainE) => chainE.chain).filter(Boolean);
  if (chainNames.length == 1) return chainNames[0];

  const savedActiveChain = getInitialCookie(initialCookieM, activeChainCookie);
  return chainNames.includes(savedActiveChain) ? savedActiveChain : "";
}

function getWalletHistoryCookie(type = "evm") {
  return `${walletHistoryCookiePrefix}${type}`;
}

function getWalletHistoryStorageKey(type = "evm") {
  return `${walletHistoryStoragePrefix}${type}`;
}

function getLastWalletStorageKey(type = "evm") {
  return `${lastWalletStoragePrefix}${type}`;
}

function readBrowserStorage(key = "") {
  if (typeof window == "undefined" || !key) return "";

  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeBrowserStorage(key = "", value = "") {
  if (typeof window == "undefined" || !key) return;

  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {}
}

function getWalletHistoryValue(value = "") {
  return value === "" ? favWalletHistoryValue : value;
}

function getWalletValueFromHistory(value = "") {
  return value == favWalletHistoryValue ? "" : value;
}

function getWalletHistoryValues(options = []) {
  return options.map((option) => getWalletHistoryValue(option.value));
}

function getWalletNotFoundValue(wallet = "") {
  const clean = String(wallet || "").trim();
  return clean ? `${walletNotFoundValue}:${clean}` : walletNotFoundValue;
}

function getWalletNotFoundPath(value = "") {
  const text = String(value || "");
  if (!text.startsWith(`${walletNotFoundValue}:`)) return "";

  return text.slice(walletNotFoundValue.length + 1).replace(/\/+$/, "");
}

function getStoredWalletHistoryOption(value = "") {
  const text = String(value || "");
  if (text === "") return { value: "", label: "favs" };
  if (text == "all") return { value: text, label: "all" };
  if (text.startsWith(`${walletNotFoundValue}:`)) {
    const wallet = text.slice(walletNotFoundValue.length + 1);
    return {
      value: text,
      label: `not found${wallet ? `: ${wallet}` : ""}`,
    };
  }
  if (text == walletNotFoundValue) {
    return { value: text, label: "not found" };
  }
  if (text.startsWith("__walletName__:")) {
    const name = text.slice("__walletName__:".length);
    return { value: text, label: `w: ${name}` };
  }
  if (text.startsWith("__address__:")) {
    const address = text.slice("__address__:".length);
    return {
      value: text,
      label: `addr: ${shortAddr(address)}`,
      detail: shortAddr(address),
      address,
    };
  }
  if (text == connectedWalletValue) return null;

  return { value: text, label: text };
}

function WalletSelectPicker({
  value = "",
  options = [],
  historyValues = [],
  onSelect,
  onRemoveHistory,
  disabled = false,
}) {
  const optionM = new Map(options.map((option) => [option.value, option]));
  const selected = optionM.get(value);
  const historyOptions = historyValues
    .filter((entry) => {
      const notFoundPath = getWalletNotFoundPath(entry);
      return !notFoundPath || !optionM.has(notFoundPath);
    })
    .map((entry) => optionM.get(entry) || getStoredWalletHistoryOption(entry))
    .filter(Boolean);

  return (
    <CustomHistoryPicker
      selectedValue={value}
      selectedLabel={selected?.label || ""}
      historyOptions={historyOptions}
      allOptions={options}
      header="wallets"
      historyLimit={walletHistoryCap}
      pickerClassName="walletSelectPicker"
      buttonClassName="walletSelectPickerButton"
      menuClassName="walletSelectPickerMenu"
      tableClassName="walletSelectPickerTable"
      allTableClassName="customPickerAllTable"
      showCycle={false}
      disabled={disabled}
      onSelect={onSelect}
      onRemoveHistory={onRemoveHistory}
      getOptionTitle={(option) => option.title || option.label}
      isOptionDisabled={(option) => !!option?.disabled}
    />
  );
}

function ChainSelectPicker({
  value = "",
  options = [],
  historyValues = [],
  onSelect,
  onRemoveHistory,
  disabled = false,
}) {
  const optionM = new Map(options.map((option) => [option.value, option]));
  const selected = optionM.get(value);
  const historyOptions = historyValues
    .map((entry) => optionM.get(entry))
    .filter(Boolean);

  return (
    <CustomHistoryPicker
      selectedValue={value}
      selectedLabel={selected?.label || ""}
      historyOptions={historyOptions}
      allOptions={options}
      header="chain"
      historyLimit={chainSortCap}
      pickerClassName="walletSelectPicker"
      buttonClassName="walletSelectPickerButton"
      menuClassName="walletSelectPickerMenu"
      tableClassName="walletSelectPickerTable"
      allTableClassName="customPickerAllTable"
      showCycle={false}
      disabled={disabled}
      onSelect={onSelect}
      onRemoveHistory={onRemoveHistory}
      getOptionTitle={(option) => option.title || option.label}
      isOptionDisabled={(option) => !!option?.disabled}
    />
  );
}

function parseChainSortOrder(value = "") {
  const order = [];

  for (const rawEntry of String(value || "").split("|")) {
    let entry = rawEntry;
    try {
      entry = decodeURIComponent(rawEntry);
    } catch {}

    if (entry == allChainSortValue) {
      order.push("");
      continue;
    }

    entry = entry.trim();
    if (entry) order.push(entry);
  }

  return order;
}

function encodeChainSortOrder(order = []) {
  return order
    .map((entry) =>
      entry === "" ? allChainSortValue : encodeURIComponent(entry),
    )
    .join("|");
}

function normalizeChainSortOrder(
  order = [],
  validValues = [],
  cap = chainSortCap,
) {
  const validSet = validValues?.length ? new Set(validValues) : null;
  const seen = new Set();
  const next = [];

  for (const value of order || []) {
    const entry = String(value ?? "").trim();
    if ((validSet && !validSet.has(entry)) || seen.has(entry)) continue;
    seen.add(entry);
    next.push(entry);
    if (next.length >= cap) break;
  }

  return next;
}

function Wallet({
  routeBase = "/w",
  customCoinChains = [],
  customCoinM = {},
  walletNotes = {},
  data,
  walletFiles = [],
  walletFilesM = {},
  selectedAddress = "",
  selectedWallet = "",
  selectedWalletNotFound = false,
  requestedWallet = "",
  selectedWalletName = "",
  walletEntries = [],
  allWalletEntries = [],
  walletPkM = {},
  disabledWallets = [],
  offAddrs = [],
  disabledCoinM = {},
  offCoinM = {},
  walletTypeOptions = walletTypeList,
  walletType = "evm",
  useAlchemy = null,
  alchemyMinUsd = 0.01,
  usdPriceQuery = false,
  initialCookieM = {},
}) {
  const router = useRouter();
  const { setWalletLoading } = useCgb();
  const walletFileOptions = walletFiles.filter((file) => !file.endsWith("/"));
  const defaultAddWalletFile = walletFileOptions.includes(selectedWallet)
    ? selectedWallet
    : walletFileOptions[0] || "";
  let [show, setShow] = useState(false);
  let [activeChain, setActiveChain] = useState(() =>
    getInitialActiveChain({ data, initialCookieM }),
  );
  let [showAllChainIcons, setShowAllChainIcons] = useState(
    () => getInitialCookie(initialCookieM, showAllChainIconsCookie) != "0",
  );
  let [chainFilterTab, setChainFilterTab] = useState("chains");
  let [chainFilterOpen, setChainFilterOpen] = useState(false);
  let [chainSortOrder, setChainSortOrder] = useState(() =>
    parseChainSortOrder(
      getInitialCookie(initialCookieM, chainSortCookie),
    ).slice(0, chainSortCap),
  );
  let [walletHistoryOrder, setWalletHistoryOrder] = useState(() =>
    parseSelectionOrder(
      [
        getInitialCookie(initialCookieM, getWalletHistoryCookie(walletType)),
        readBrowserStorage(getWalletHistoryStorageKey(walletType)),
      ]
        .filter(Boolean)
        .join("|"),
    ).slice(0, walletHistoryCap),
  );
  const walletHistoryByTypeRef = useRef({});
  const walletHistorySkipRef = useRef("");
  let [loadingWallet, setLoadingWallet] = useState(false);
  let [coinLimit, setCoinLimit] = useState(() => {
    const savedCoinLimit = Number(
      getInitialCookie(initialCookieM, coinLimitCookie),
    );
    return Number.isInteger(savedCoinLimit) && savedCoinLimit >= 0
      ? savedCoinLimit
      : 1;
  });
  let [rowSort, setRowSort] = useState(() => {
    const savedRowSort = getInitialCookie(initialCookieM, rowSortCookie) || "";
    return (
      savedRowSort ||
      (getInitialCookie(initialCookieM, assetSortCookie) == "1" ? "asset" : "")
    );
  });
  let [customAddress, setCustomAddress] = useState(selectedAddress);
  let [showAddWallet, setShowAddWallet] = useState(false);
  let [addWalletFile, setAddWalletFile] = useState(defaultAddWalletFile);
  let [draftWalletFile, setDraftWalletFile] = useState(defaultAddWalletFile);
  let [addWalletName, setAddWalletName] = useState("");
  let [addingWallet, setAddingWallet] = useState(false);
  let [customCoinAddress, setCustomCoinAddress] = useState("");
  let [customCoinChain, setCustomCoinChain] = useState("");
  let [customCoinPreview, setCustomCoinPreview] = useState(null);
  let [customCoinDraft, setCustomCoinDraft] = useState({
    coin: "",
    name: "",
    type: "",
    customType: "",
    ref: "",
  });
  let [addingCoin, setAddingCoin] = useState(false);
  let [copiedAddress, setCopiedAddress] = useState("");
  let [copiedAddressSource, setCopiedAddressSource] = useState("");
  let [claimingRewardKey, setClaimingRewardKey] = useState("");
  let [deletingWalletKey, setDeletingWalletKey] = useState("");
  let [savingWalletRefKey, setSavingWalletRefKey] = useState("");
  let [walletRefDraftM, setWalletRefDraftM] = useState({});
  let [deletingCoinKey, setDeletingCoinKey] = useState("");
  let [disabledWalletList, setDisabledWalletList] = useState(disabledWallets);
  let [offAddrList, setOffAddrList] = useState(offAddrs);
  let [walletSettingSort, setWalletSettingSort] = useState("");
  let [disabledCoinsM, setDisabledCoinsM] = useState(disabledCoinM);
  let [offCoinsM, setOffCoinsM] = useState(offCoinM);
  let [localOffChains, setLocalOffChains] = useState([]);
  let [coinSettingSortM, setCoinSettingSortM] = useState({});
  let [openCoinSettingsChain, setOpenCoinSettingsChain] = useState("");
  let [favAddrs, setFavAddrs] = useState(() =>
    parseFavAddrs(getInitialCookie(initialCookieM, favAddrCookie)),
  );
  let [connectedWallet, setConnectedWallet] = useState(null);
  let [connectedWalletChecked, setConnectedWalletChecked] = useState(false);
  let [useLocalEditorStore, setUseLocalEditorStore] = useState(false);
  let [localEditorStoreChecked, setLocalEditorStoreChecked] = useState(false);
  let [localWalletFiles, setLocalWalletFiles] = useState([]);
  let [localWalletData, setLocalWalletData] = useState(null);
  let [balancePatchM, setBalancePatchM] = useState({});
  let [walletAddressReloadM, setWalletAddressReloadM] = useState({});
  let [reloadingWalletAddressKey, setReloadingWalletAddressKey] = useState("");
  let [walletBalanceCacheVersion, setWalletBalanceCacheVersion] = useState(0);
  let [localWalletVersion, setLocalWalletVersion] = useState(0);
  let [localCustomCoinM, setLocalCustomCoinM] = useState({});
  let [loadingLocalWallet, setLoadingLocalWallet] = useState(false);
  let [checkingLocalWallet, setCheckingLocalWallet] = useState(
    Boolean(requestedWallet || selectedWallet == "all" || selectedWalletName) &&
      !selectedAddress,
  );
  const editableCustomCoinM = useLocalEditorStore
    ? localCustomCoinM
    : customCoinM;
  const basePath = String(routeBase || "/w").startsWith("/")
    ? String(routeBase || "/w").replace(/\/+$/, "") || "/w"
    : "/w";
  const allWalletFiles = [
    ...new Set([...walletFiles, ...localWalletFiles]),
  ].sort((a, b) => a.localeCompare(b));
  const requestedWalletRaw = String(requestedWallet || "");
  const effectiveRequestedWallet = requestedWalletRaw.replace(/\/+$/, "");
  const localRequestedWalletOption =
    useLocalEditorStore &&
    (localWalletFiles.includes(`${effectiveRequestedWallet}/`)
      ? `${effectiveRequestedWallet}/`
      : localWalletFiles.includes(effectiveRequestedWallet)
        ? effectiveRequestedWallet
        : "");
  const localRequestedWallet =
    useLocalEditorStore &&
    !!effectiveRequestedWallet &&
    hasLocalWalletSource(walletType, effectiveRequestedWallet);
  const localAllWallets = useLocalEditorStore && selectedWallet == "all";
  const localWalletLoadSource = localAllWallets
    ? ""
    : localRequestedWallet
      ? effectiveRequestedWallet
      : "";
  const localWalletName = String(selectedWalletName || "").trim();
  const localWalletNameEntries =
    useLocalEditorStore && localWalletName
      ? readLocalWalletEntries(walletType, "", {
          includeReserved: true,
          uniqueNames: false,
        }).filter((entry) => entry.name == localWalletName)
      : [];
  const localFavWalletEntries =
    useLocalEditorStore &&
    !selectedAddress &&
    !localWalletName &&
    !effectiveRequestedWallet &&
    selectedWallet != "all"
      ? readLocalWalletEntries(walletType, "", {
          includeReserved: true,
          uniqueNames: false,
        }).filter((entry) =>
          favAddrs.some(
            (fav) =>
              fav.type == walletType &&
              getFavAddrKey(fav.type, fav.address) ==
                getFavAddrKey(walletType, entry.address),
          ),
        )
      : [];
  const effectiveSelectedWallet =
    selectedWallet || (localRequestedWallet ? localRequestedWalletOption : "");
  const effectiveSelectedWalletNotFound =
    selectedWalletNotFound && !localRequestedWallet;
  const saveWalletFileOptions = [
    ...new Set([
      ...walletFileOptions,
      ...localWalletFiles.filter((file) => !file.endsWith("/")),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  const serverChainList = Array.isArray(data) ? data : data ? [data] : [];
  const serverChainNameKey = serverChainList
    .map((chainE) => chainE.chain)
    .join("|");
  const localAllWalletEntries = useLocalEditorStore
    ? readLocalWalletEntries(walletType, "", {
        includeReserved: true,
        uniqueNames: false,
      })
    : [];
  const localWalletDataKey = [
    walletType,
    selectedAddress
      ? `addr:${getFavAddrKey(walletType, selectedAddress)}`
      : localWalletName
        ? `name:${localWalletName}`
        : selectedWallet == "all" || localAllWallets
          ? "all"
          : effectiveRequestedWallet
            ? `file:${effectiveRequestedWallet}`
            : "favs",
    localWalletVersion,
    JSON.stringify(favAddrs),
  ].join("|");
  const walletBalanceViewKey = [
    walletType,
    selectedAddress
      ? `addr:${getFavAddrKey(walletType, selectedAddress)}`
      : localWalletName
        ? `name:${localWalletName}`
        : selectedWallet == "all"
          ? "all"
          : effectiveRequestedWallet
            ? `file:${effectiveRequestedWallet}`
            : "favs",
    JSON.stringify(favAddrs),
  ].join("|");
  const walletBalanceViewId = useMemo(
    () => createWalletBalanceClientViewId(),
    [walletBalanceViewKey],
  );
  const activeLocalWalletData =
    localWalletData?.key == localWalletDataKey ? localWalletData.data : null;
  const freshServerWalletData = useMemo(
    () => markWalletBalanceDataFresh(data),
    [data],
  );
  const walletSourceData =
    activeLocalWalletData || freshServerWalletData;
  const cachedWalletSourceData = useMemo(
    () =>
      applyWalletBalanceClientCache(walletSourceData, {
        walletType,
        viewId: walletBalanceViewId,
      }),
    [
      walletSourceData,
      walletType,
      walletBalanceCacheVersion,
      walletBalanceViewId,
    ],
  );
  const reloadedWalletSourceData = useMemo(
    () =>
      applyWalletAddressReloadData(
        cachedWalletSourceData,
        walletAddressReloadM,
        walletType,
      ),
    [cachedWalletSourceData, walletAddressReloadM, walletType],
  );
  const activeData = useMemo(
    () =>
      applyBalancePatches(
        normalizeWalletCoinAliases(reloadedWalletSourceData),
        balancePatchM,
      ),
    [balancePatchM, reloadedWalletSourceData],
  );
  const chainList = Array.isArray(activeData)
    ? activeData
    : activeData
      ? [activeData]
      : [];
  const chainDataKey = chainList
    .map(
      (chainE) =>
        `${chainE.chain}:${chainE.rows?.length ?? 0}:${chainE.error ?? ""}`,
    )
    .join("|");
  const walletBalanceCacheDataKey = chainList
    .map(
      (chainE) =>
        `${chainE.chain}:${(chainE.rows || [])
          .map(
            (row) =>
              `${row.address || ""}:${row.error || ""}:${Object.entries(
                row.balances || {},
              )
                .map(
                  ([coin, bal]) =>
                    `${coin}:${bal?.raw ?? bal?.balance ?? ""}:${bal?.usd ?? ""}`,
                )
                .join(",")}`,
          )
          .join(";")}`,
    )
    .join("|");
  const chainNameKey = chainList.map((chainE) => chainE.chain).join("|");
  const customCoinChainValue = customCoinChains.includes(customCoinChain)
    ? customCoinChain
    : customCoinChains[0] || "";
  const localSettingWalletEntries = useLocalEditorStore
    ? localWalletName
      ? localWalletNameEntries
      : !selectedAddress &&
          !localWalletName &&
          !effectiveRequestedWallet &&
          selectedWallet != "all"
        ? localFavWalletEntries
        : localAllWallets
          ? localAllWalletEntries
          : localRequestedWallet
            ? readLocalWalletEntries(walletType, localWalletLoadSource, {
                uniqueNames: false,
              })
            : []
    : [];
  const mergedWalletEntries = (() => {
    const seen = new Set();

    return [...(walletEntries || []), ...localSettingWalletEntries].filter(
      (entry) => {
        const key = `${entry.source || ""}:${entry.name || ""}:${getFavAddrKey(
          walletType,
          entry.address,
        )}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      },
    );
  })();
  const allKnownWalletEntries = (() => {
    const seen = new Set();

    return [
      ...(allWalletEntries || []),
      ...localAllWalletEntries,
      ...mergedWalletEntries,
    ].filter((entry) => {
      const key = getWalletEntryKey(entry);
      if (!key || seen.has(key)) return false;
      seen.add(key);

      return true;
    });
  })();
  const walletEntryByAddress = getWalletEntryByAddress();
  const walletEntryByName = getWalletEntryByName();
  const rows = getRows();
  const displayRows = getDisplayRows();
  const showLocalWalletLoading =
    !displayRows.length && (loadingLocalWallet || checkingLocalWallet);
  const visibleChainList = getVisibleChainList();
  const walletFilterValue = selectedWalletName
    ? `__walletName__:${selectedWalletName}`
    : selectedAddress
      ? `__address__:${selectedAddress}`
      : "";
  const walletNotFoundSelectValue = getWalletNotFoundValue(requestedWallet);
  const connectedSelected =
    connectedWallet?.address &&
    selectedAddress &&
    getFavAddrKey(connectedWallet.type, connectedWallet.address) ==
      getFavAddrKey(walletType, selectedAddress);
  const walletSelectValue = connectedSelected
    ? connectedWalletValue
    : effectiveSelectedWalletNotFound
      ? walletNotFoundSelectValue
      : effectiveSelectedWallet || walletFilterValue || "";
  const canCycleWalletType = walletTypeOptions.length > 1;
  const hasError = visibleChainList.some(
    (chainE) => chainE?.error || chainE?.rows?.some((row) => row.error),
  );
  const disabledWalletKey = JSON.stringify(disabledWallets || []);
  const offAddrKey = JSON.stringify(offAddrs || []);
  const disabledCoinKey = JSON.stringify(disabledCoinM || {});
  const offCoinKey = JSON.stringify(offCoinM || {});
  const walletFileKey = walletFileOptions.join("|");
  const coinTypeOptions = getCoinTypeOptions();
  const selectableWalletFiles = allWalletFiles.filter(
    isVisibleWalletSelectionFile,
  );
  const specialWalletFiles = selectableWalletFiles.filter(isSpecialWalletFile);
  const normalWalletFiles = selectableWalletFiles.filter(
    (file) => !isSpecialWalletFile(file),
  );
  const walletSelectOptions = getWalletSelectOptions();
  const walletSelectOptionKey = walletSelectOptions
    .map(
      (option) =>
        `${option.value}:${option.remember === false ? "0" : "1"}:${option.disabled ? "1" : "0"}`,
    )
    .join("|");
  const walletHistoryOptionValues = getWalletHistoryValues(walletSelectOptions);
  const walletHistoryValues = normalizeSelectionOrder(
    walletHistoryOrder,
    [],
    walletHistoryCap,
  ).map(getWalletValueFromHistory);
  const chainSelectOptions = getChainSelectOptions();
  const chainSelectOptionValues = chainSelectOptions.map(
    (option) => option.value,
  );
  const chainHistoryValues = normalizeChainSortOrder(
    chainSortOrder,
    chainSelectOptionValues,
    chainSortCap,
  );
  function getAllCoins(chainE) {
    return chainE?.allCoins?.length ? chainE.allCoins : chainE?.coins || [];
  }

  function getCoinTypeOptions() {
    const types = new Set(["token"]);

    for (const chainE of data || []) {
      for (const coinE of Object.values(chainE?.coinInfoM || {})) {
        const type = String(coinE?.type || "").trim();
        if (type) types.add(type);
      }
    }

    const draftType = String(customCoinDraft.type || "").trim();
    if (draftType) types.add(draftType);

    return [...types].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }

  function getSortedCoins(chainE) {
    return getAllCoins(chainE)
      .map((coin, index) => ({
        coin,
        index,
        total: getTotalCoin(chainE.chain, coin),
      }))
      .sort((a, b) => {
        const aHasUsd = a.total.usd > 0;
        const bHasUsd = b.total.usd > 0;

        if (aHasUsd || bHasUsd) {
          if (aHasUsd && bHasUsd) return b.total.usd - a.total.usd;
          return bHasUsd - aHasUsd;
        }

        const aHasBalance = a.total.balance > 0;
        const bHasBalance = b.total.balance > 0;
        if (aHasBalance != bHasBalance) return bHasBalance - aHasBalance;

        return a.index - b.index;
      })
      .map((e) => e.coin);
  }

  function getVisibleCoins(chainE) {
    const coins = getSortedCoins(chainE);
    if (activeChain == chainE.chain) return coins;

    return coins
      .filter((coin) =>
        rows.some((row) => row.chainM[chainE.chain]?.balances?.[coin]),
      )
      .slice(0, coinLimit);
  }

  function getVisibleChainList() {
    const localOffChainSet = new Set(localOffChains);
    const chainSortIndexM = Object.fromEntries(
      chainSortOrder.map((chain, index) => [chain, index]),
    );
    const chains = activeChain
      ? chainList.filter(
          (chainE) =>
            chainE.chain == activeChain && !localOffChainSet.has(chainE.chain),
        )
      : chainList.filter((chainE) => !localOffChainSet.has(chainE.chain));

    return chains
      .map((chainE, index) => ({
        chainE,
        index,
        total: getTotalChain(chainE.chain),
        sortIndex: chainSortIndexM[chainE.chain] ?? Infinity,
      }))
      .sort((a, b) => {
        const aHasValue = a.total.usd > 0 || a.total.balance > 0;
        const bHasValue = b.total.usd > 0 || b.total.balance > 0;

        if (aHasValue || bHasValue) {
          if (aHasValue && bHasValue) {
            const usdDiff = b.total.usd - a.total.usd;
            return usdDiff || a.index - b.index;
          }

          return bHasValue - aHasValue;
        }

        return a.sortIndex - b.sortIndex || a.index - b.index;
      })
      .map((e) => e.chainE);
  }

  function getMaxCoinLimit() {
    return chainList.reduce(
      (max, chainE) => Math.max(max, getAllCoins(chainE).length),
      0,
    );
  }

  function getChainSelectOptions() {
    const priorityChains = Array.isArray(walletChainFilterPriority)
      ? walletChainFilterPriority
      : [];
    const chainOptions = chainList.map((chainE) => ({
      value: chainE.chain,
      label: chainE.chain,
    }));
    const prioritySet = new Set(priorityChains);

    return [
      { value: "", label: "all" },
      ...priorityChains
        .map((chain) => chainOptions.find((option) => option.value == chain))
        .filter(Boolean),
      ...chainOptions.filter((option) => !prioritySet.has(option.value)),
    ];
  }

  function toggleChain(chain) {
    setActiveChain((prev) => {
      const next = prev == chain ? "" : chain;
      saveActiveChainCookie(next);
      rememberChainSort(next);
      return next;
    });
  }

  function selectActiveChainValue(chain = "") {
    setActiveChain(chain);
    saveActiveChainCookie(chain);
    rememberChainSort(chain);
  }

  function cycleActiveChainValue(chain = "") {
    setActiveChain(chain);
    saveActiveChainCookie(chain);
  }

  function getChainCycleValues() {
    return getCustomPickerHistoryCycleValues(
      chainHistoryValues,
      chainSelectOptions.map((option) => option.value),
    );
  }

  function getChainCycleTarget(direction = "next") {
    const target = getCycleTargetValue(
      getChainCycleValues(),
      activeChain,
      direction,
    );
    const option = chainSelectOptions.find((entry) => entry.value == target);

    return option?.label || target;
  }

  function cycleActiveChain(direction = 1) {
    const chains = getChainCycleValues();
    if (!chains.length) return;
    const index = Math.max(0, chains.indexOf(activeChain));
    const next = chains[(index + direction + chains.length) % chains.length];
    cycleActiveChainValue(next);
  }

  function toggleShowAllChainIcons() {
    setShowAllChainIcons((prev) => {
      const next = !prev;
      setCookie(showAllChainIconsCookie, next ? "1" : "0", {
        maxAge: cookieMaxAge,
      });
      return next;
    });
  }

  function ChainFilterLabel() {
    const chainOptions = chainSelectOptions.filter((option) => option.value);

    return (
      <InteractiveInfoCard
        activation="hover"
        open={chainFilterOpen}
        onOpenChange={setChainFilterOpen}
        className="walletChainFilterInfo"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <span>chain:</span>
        <span className="infoCard interactiveInfoCard">
          <span className="infoCardTitle interactiveInfoCardTitle">
            chain filter
          </span>
          <span className="interactiveInfoTabs">
            <button
              type="button"
              className={`walletSettingsTab ${
                chainFilterTab == "chains" ? "walletSettingsTabActive" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setChainFilterTab("chains");
              }}
            >
              chains
            </button>
            <button
              type="button"
              className={`walletSettingsTab ${
                chainFilterTab == "setting" ? "walletSettingsTabActive" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setChainFilterTab("setting");
              }}
            >
              setting
            </button>
          </span>
          {chainFilterTab == "setting" ? (
            <table className="coinSettingsTable interactiveInfoSettingsTable">
              <thead>
                <tr>
                  <th>setting</th>
                  <th>on</th>
                  <th>default</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>show chain icon on 'all' mode</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={showAllChainIcons}
                      onChange={toggleShowAllChainIcons}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td>on</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <>
              <button
                type="button"
                className={`walletChainOption interactiveInfoOption ${
                  !activeChain ? "active" : ""
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectActiveChainValue("");
                  setChainFilterOpen(false);
                }}
              >
                <span className="interactiveInfoIconSpacer"></span>
                <span>all</span>
                <span className="interactiveInfoStatus">
                  {!activeChain ? "on" : "off"}
                </span>
              </button>
              {chainOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`walletChainOption interactiveInfoOption ${
                    activeChain == option.value ? "active" : ""
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleChain(option.value);
                    setChainFilterOpen(false);
                  }}
                >
                  <ChainIcon chain={option.value} />
                  <span>{option.label}</span>
                  <span className="interactiveInfoStatus">
                    {activeChain == option.value ? "on" : "off"}
                  </span>
                </button>
              ))}
            </>
          )}
        </span>
      </InteractiveInfoCard>
    );
  }

  function saveActiveChainCookie(chain = "") {
    setCookie(activeChainCookie, chain, {
      maxAge: cookieMaxAge,
      path: "/",
    });
  }

  function saveChainSortCookie(order = []) {
    setCookie(
      chainSortCookie,
      encodeChainSortOrder(order.slice(0, chainSortCap)),
      {
        maxAge: cookieMaxAge,
        path: "/",
      },
    );
  }

  function rememberChainSort(chain = "") {
    setChainSortOrder((prev) => {
      const chainNames = new Set([
        "",
        ...chainList.map((chainE) => chainE.chain),
      ]);
      const next = [chain, ...prev.filter((entry) => entry != chain)]
        .filter((entry) => chainNames.has(entry))
        .slice(0, chainSortCap);
      saveChainSortCookie(next);
      return next;
    });
  }

  function removeChainHistory(chain = "") {
    setChainSortOrder((prev) => {
      const next = prev.filter((entry) => entry != chain);
      if (encodeChainSortOrder(next) == encodeChainSortOrder(prev)) return prev;
      saveChainSortCookie(next);
      return next;
    });
  }

  function refreshLocalWalletFiles() {
    if (!shouldUseLocalStorageEditor()) {
      setLocalWalletFiles([]);
      setLocalCustomCoinM({});
      return;
    }

    setLocalWalletFiles(listLocalWalletSources(walletType));
    setLocalWalletVersion((version) => version + 1);
  }

  function getLocalStorageChainNames() {
    return [
      ...new Set([
        ...serverChainList.map((chainE) => chainE.chain).filter(Boolean),
        ...(customCoinChains || []),
        ...Object.keys(offCoinM || {}),
      ]),
    ];
  }

  function refreshLocalStorageEditorData(forceUseLocal = useLocalEditorStore) {
    if (!forceUseLocal) {
      setLocalWalletFiles([]);
      setLocalCustomCoinM({});
      setLocalOffChains([]);
      return;
    }

    refreshLocalWalletFiles();

    const chainNames = getLocalStorageChainNames();
    setLocalCustomCoinM(getAllLocalCustomCoinM(chainNames));

    const localOffAddrs = readLocalLineFileValues("cookie/offAddr.txt");
    setOffAddrList([...new Set([...(offAddrs || []), ...localOffAddrs])]);

    setLocalOffChains(
      readLocalLineFileValues("cookie/offChains.txt", chainNames),
    );

    const nextOffCoinsM = { ...(offCoinM || {}) };
    for (const chain of chainNames) {
      const localCoins = readLocalLineFileValues(
        `cookie/offCoins/${chain}.txt`,
      );
      if (!localCoins.length) continue;
      nextOffCoinsM[chain] = [
        ...new Set([...(nextOffCoinsM[chain] || []), ...localCoins]),
      ];
    }
    setOffCoinsM(nextOffCoinsM);
  }

  function toggleRowSort(sortKey) {
    setRowSort((prev) => {
      const next = prev == sortKey ? "" : sortKey;
      setCookie(rowSortCookie, next, { maxAge: cookieMaxAge });
      setCookie(assetSortCookie, "0", { maxAge: cookieMaxAge });
      return next;
    });
  }

  useEffect(() => {
    setLoadingWallet(false);
  }, [
    selectedAddress,
    selectedWallet,
    selectedWalletName,
    walletType,
    chainDataKey,
  ]);

  useEffect(() => {
    const saved = getSavedWalletHistoryOrder(walletType);
    const cached = walletHistoryByTypeRef.current[walletType] || [];
    const next = normalizeSelectionOrder(
      [...saved, ...cached],
      [],
      walletHistoryCap,
    );
    walletHistoryByTypeRef.current[walletType] = next;
    setWalletHistoryOrder(next);
  }, [walletType]);

  useEffect(() => {
    if (!localEditorStoreChecked || checkingLocalWallet) return;
    if (selectedAddress && !connectedWalletChecked) return;
    if (consumeWalletHistorySkip(walletSelectValue)) return;
    if (!shouldAutoRememberWalletHistory(walletSelectValue)) return;
    rememberWalletHistory(walletSelectValue);
  }, [
    checkingLocalWallet,
    connectedWalletChecked,
    localEditorStoreChecked,
    selectedAddress,
    walletSelectValue,
    walletSelectOptionKey,
    walletType,
  ]);

  useEffect(() => {
    function handleBalancePatch(e) {
      const patches = Array.isArray(e?.detail?.balances)
        ? e.detail.balances
        : [];
      if (!patches.length) return;

      let patchedCache = false;
      for (const patch of patches) {
        if (
          !patch?.chain ||
          !patch?.coin ||
          !patch?.address ||
          !patch?.balance
        ) {
          continue;
        }
        patchWalletBalanceClientCache({
          walletType,
          chain: patch.chain,
          address: patch.address,
          coin: patch.coin,
          balance: patch.balance,
        });
        patchedCache = true;
      }
      if (patchedCache) {
        setWalletBalanceCacheVersion((version) => version + 1);
      }

      setBalancePatchM((patchM) => {
        const next = { ...patchM };
        for (const patch of patches) {
          if (
            !patch?.chain ||
            !patch?.coin ||
            !patch?.address ||
            !patch?.balance
          ) {
            continue;
          }
          next[getBalancePatchKey(patch)] = patch;
        }
        return next;
      });
    }

    window.addEventListener(walletBalancePatchEvent, handleBalancePatch);
    return () => {
      window.removeEventListener(walletBalancePatchEvent, handleBalancePatch);
    };
  }, [walletType]);

  useEffect(() => {
    setCheckingLocalWallet(
      Boolean(
        requestedWallet || selectedWallet == "all" || selectedWalletName,
      ) && !selectedAddress,
    );
    setLocalEditorStoreChecked(false);
  }, [
    requestedWallet,
    selectedWallet,
    selectedAddress,
    selectedWalletName,
    walletType,
  ]);

  useEffect(() => {
    setWalletAddressReloadM({});
    setReloadingWalletAddressKey("");
  }, [
    requestedWallet,
    selectedWallet,
    selectedAddress,
    selectedWalletName,
    walletType,
  ]);

  useEffect(() => {
    const useLocal = shouldUseLocalStorageEditor();
    setUseLocalEditorStore(useLocal);
    setLocalEditorStoreChecked(true);
    if (useLocal) refreshLocalStorageEditorData(useLocal);
    else setCheckingLocalWallet(false);
  }, [
    requestedWallet,
    selectedWallet,
    selectedAddress,
    selectedWalletName,
    walletType,
    serverChainNameKey,
  ]);

  useEffect(() => {
    if (!useLocalEditorStore) return;

    function handleLocalEditorStorageChange() {
      refreshLocalStorageEditorData(true);
    }

    window.addEventListener(
      localEditorStorageEvent,
      handleLocalEditorStorageChange,
    );
    window.addEventListener("storage", handleLocalEditorStorageChange);
    return () => {
      window.removeEventListener(
        localEditorStorageEvent,
        handleLocalEditorStorageChange,
      );
      window.removeEventListener("storage", handleLocalEditorStorageChange);
    };
  }, [
    useLocalEditorStore,
    walletType,
    serverChainNameKey,
    offAddrKey,
    offCoinKey,
  ]);

  useEffect(() => {
    setLocalWalletData(null);
    if (!localEditorStoreChecked) return;

    if (!useLocalEditorStore) {
      setCheckingLocalWallet(false);
      return;
    }
    if (
      !localRequestedWallet &&
      !localAllWallets &&
      !localWalletName &&
      !localFavWalletEntries.length
    ) {
      setCheckingLocalWallet(false);
      return;
    }

    const entries = localWalletName
      ? localWalletNameEntries
      : localFavWalletEntries.length
        ? localFavWalletEntries
        : readLocalWalletEntries(walletType, localWalletLoadSource);
    if (!entries.length) {
      setCheckingLocalWallet(false);
      return;
    }

    const balanceChains = serverChainList
      .map((chainE) => chainE.chain)
      .filter((chain) => chain && chain != "Claim");
    const cachedEntries = entries.filter((entry) =>
      isWalletBalanceAddressCached({
        walletType,
        address: entry.address,
        chains: balanceChains,
        requireAllChains: true,
        requireViewId: true,
      }),
    );
    const cachedAddressSet = new Set(
      cachedEntries.map((entry) => getFavAddrKey(walletType, entry.address)),
    );
    const uncachedEntries = entries.filter(
      (entry) =>
        !cachedAddressSet.has(getFavAddrKey(walletType, entry.address)),
    );
    const freshEntries = uncachedEntries.filter((entry) =>
      hasWalletBalanceDataForAddress(freshServerWalletData, {
        walletType,
        address: entry.address,
        chains: balanceChains,
      }),
    );
    const freshAddressSet = new Set(
      freshEntries.map((entry) => getFavAddrKey(walletType, entry.address)),
    );
    const fetchEntries = uncachedEntries.filter(
      (entry) =>
        !freshAddressSet.has(getFavAddrKey(walletType, entry.address)),
    );
    const cachedData = getWalletBalanceClientCacheData({
      walletType,
      addresses: cachedEntries.map((entry) => entry.address),
      chains: balanceChains,
      viewId: walletBalanceViewId,
    });
    const freshData = filterWalletBalanceData(freshServerWalletData, {
      walletType,
      addresses: freshEntries.map((entry) => entry.address),
      chains: balanceChains,
    });
    const initialData = mergeWalletBalanceData(cachedData, freshData);

    let cancelled = false;
    setCheckingLocalWallet(false);
    if (initialData.length) {
      setLocalWalletData({ key: localWalletDataKey, data: initialData });
    }
    if (!fetchEntries.length) {
      setLoadingLocalWallet(false);
      return () => {
        cancelled = true;
      };
    }

    setLoadingLocalWallet(true);
    getLocalWalletBalanceData({
      walletType,
      walletEntries: fetchEntries,
      chains: balanceChains,
      disabledCoinM: {
        ...disabledCoinsM,
        ...Object.fromEntries(
          Object.entries(offCoinsM).map(([chain, coins]) => [
            chain,
            [...new Set([...(disabledCoinsM[chain] || []), ...(coins || [])])],
          ]),
        ),
      },
      disabledWallets: disabledWalletList,
      disabledWalletNames: offAddrList,
      customCoinM: localCustomCoinM,
      useAlchemy,
      alchemyMinUsd,
      usdPriceQuery,
    })
      .then((nextData) => {
        if (!cancelled) {
          const freshData = markWalletBalanceDataFresh(nextData);
          writeWalletBalanceClientCache(freshData, {
            walletType,
            viewId: walletBalanceViewId,
          });
          setLocalWalletData({
            key: localWalletDataKey,
            data: mergeWalletBalanceData(initialData, freshData),
          });
        }
      })
      .catch((e) => {
        if (!cancelled) toast.error(e.message || "local wallet load failed");
      })
      .finally(() => {
        if (!cancelled) setLoadingLocalWallet(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    useLocalEditorStore,
    localEditorStoreChecked,
    localRequestedWallet,
    localAllWallets,
    localWalletLoadSource,
    localWalletName,
    localWalletNameEntries.length,
    localFavWalletEntries.length,
    JSON.stringify(favAddrs),
    localWalletVersion,
    localWalletDataKey,
    JSON.stringify(localCustomCoinM),
    effectiveRequestedWallet,
    walletType,
    serverChainNameKey,
    disabledCoinKey,
    offCoinKey,
    disabledWalletKey,
    offAddrKey,
    useAlchemy,
    alchemyMinUsd,
    usdPriceQuery,
    freshServerWalletData,
    walletBalanceViewId,
  ]);

  useEffect(() => {
    if (!localEditorStoreChecked) return;
    if (useLocalEditorStore && !activeLocalWalletData) return;
    writeWalletBalanceClientCache(activeData, {
      walletType,
      viewId: walletBalanceViewId,
    });
  }, [
    activeData,
    activeLocalWalletData,
    localEditorStoreChecked,
    useLocalEditorStore,
    walletBalanceCacheDataKey,
    walletType,
    walletBalanceViewId,
  ]);

  useEffect(() => {
    if (!loadingWallet) return;

    const id = setTimeout(() => setLoadingWallet(false), 20000);
    return () => clearTimeout(id);
  }, [loadingWallet]);

  useEffect(() => {
    setWalletLoading?.(
      Boolean(loadingWallet || loadingLocalWallet || checkingLocalWallet),
    );
  }, [
    loadingWallet,
    loadingLocalWallet,
    checkingLocalWallet,
    setWalletLoading,
  ]);

  useEffect(() => () => setWalletLoading?.(false), [setWalletLoading]);

  useEffect(() => {
    const chainNames = chainNameKey ? chainNameKey.split("|") : [];
    setChainSortOrder((prev) => {
      const available = new Set(["", ...chainNames]);
      const next = prev
        .filter((chain) => available.has(chain))
        .slice(0, chainSortCap);
      if (next.length != prev.length) saveChainSortCookie(next);
      return next;
    });

    if (chainNames.length == 1) {
      setActiveChain((prev) => (prev == chainNames[0] ? prev : chainNames[0]));
      return;
    }

    const savedActiveChain = String(getCookie(activeChainCookie) || "");
    setActiveChain((prev) => {
      if (savedActiveChain && chainNames.includes(savedActiveChain)) {
        return savedActiveChain;
      }

      return prev && !chainNames.includes(prev) ? "" : prev;
    });
  }, [chainNameKey]);

  useEffect(() => {
    function handleTradeChainSelect(e) {
      const chain = String(e?.detail?.chain || "");
      const chainNames = chainNameKey ? chainNameKey.split("|") : [];
      if (!chain || !chainNames.includes(chain)) return;

      saveActiveChainCookie(chain);
      rememberChainSort(chain);
      setActiveChain(chain);
    }

    window.addEventListener(tradeChainSelectEvent, handleTradeChainSelect);
    return () => {
      window.removeEventListener(tradeChainSelectEvent, handleTradeChainSelect);
    };
  }, [chainNameKey]);

  useEffect(() => {
    saveCurrentWalletSelection();
  }, [selectedAddress, selectedWallet, selectedWalletName, walletType]);

  useEffect(() => {
    setCustomAddress(selectedAddress);
  }, [selectedAddress]);

  useEffect(() => {
    const nextDefault = defaultAddWalletFile || saveWalletFileOptions[0] || "";
    setAddWalletFile(nextDefault);
    setDraftWalletFile(nextDefault);
  }, [
    defaultAddWalletFile,
    walletFileKey,
    walletType,
    localWalletFiles.join("|"),
  ]);

  useEffect(() => {
    setDisabledWalletList(disabledWallets || []);
  }, [disabledWalletKey]);

  useEffect(() => {
    if (useLocalEditorStore) {
      refreshLocalStorageEditorData(true);
      return;
    }

    setOffAddrList(offAddrs || []);
  }, [offAddrKey, useLocalEditorStore]);

  useEffect(() => {
    setDisabledCoinsM(disabledCoinM || {});
  }, [disabledCoinKey]);

  useEffect(() => {
    if (useLocalEditorStore) {
      refreshLocalStorageEditorData(true);
      return;
    }

    setOffCoinsM(offCoinM || {});
  }, [offCoinKey, useLocalEditorStore]);

  useEffect(() => {
    const savedCoinLimit = Number(getCookie(coinLimitCookie));
    if (
      Number.isInteger(savedCoinLimit) &&
      savedCoinLimit >= 0 &&
      savedCoinLimit != coinLimit
    ) {
      setCoinLimit(savedCoinLimit);
    }

    const savedRowSort = String(getCookie(rowSortCookie) || "");
    const nextRowSort =
      savedRowSort || (getCookie(assetSortCookie) == "1" ? "asset" : "");
    if (nextRowSort != rowSort) setRowSort(nextRowSort);
    setFavAddrs(parseFavAddrs(getCookie(favAddrCookie)));
  }, []);

  useEffect(() => {
    setConnectedWalletChecked(false);

    function loadConnectedWallet() {
      setConnectedWallet(readStoredWallet(walletType));
      setConnectedWalletChecked(true);
    }

    loadConnectedWallet();
    window.addEventListener(walletConnectEvent, loadConnectedWallet);
    window.addEventListener("storage", loadConnectedWallet);

    return () => {
      window.removeEventListener(walletConnectEvent, loadConnectedWallet);
      window.removeEventListener("storage", loadConnectedWallet);
    };
  }, [walletType]);

  function saveCoinLimit(value) {
    setCookie(coinLimitCookie, String(value), { maxAge: cookieMaxAge });
    return value;
  }

  function toggleWalletEnabled(address) {
    const key = getWalletDisableKey(address);
    if (!key) return;

    const disabled = new Set(disabledWalletList.map(getWalletDisableKey));
    if (disabled.has(key)) {
      disabled.delete(key);
    } else {
      disabled.add(key);
    }

    const next = [...disabled];
    setDisabledWalletList(next);
    setCookie(disabledWalletsCookie, encodeDisabledWallets(next), {
      maxAge: cookieMaxAge,
      path: "/",
    });
    router.refresh();
  }

  function toggleWalletSettingSort(sortKey) {
    setWalletSettingSort((prev) => (prev == sortKey ? "" : sortKey));
  }

  function getWalletEntryKey(entry) {
    return `${entry.source || ""}:${entry.name || ""}:${entry.address || ""}`;
  }

  function getWalletRefDraft(entry) {
    const key = getWalletEntryKey(entry);
    return Object.prototype.hasOwnProperty.call(walletRefDraftM, key)
      ? walletRefDraftM[key]
      : entry?.ref || "";
  }

  function setWalletRefDraft(entry, value) {
    const key = getWalletEntryKey(entry);
    setWalletRefDraftM((prev) => ({ ...prev, [key]: value }));
  }

  async function saveWalletRef(entry) {
    if (!entry?.source) return;

    const key = getWalletEntryKey(entry);
    const nextRef = String(getWalletRefDraft(entry) || "").trim();
    if (nextRef == String(entry.ref || "").trim()) return;

    setSavingWalletRefKey(key);
    try {
      if (useLocalEditorStore) {
        const res = updateLocalWalletEntryRef({
          walletType,
          source: entry.source,
          name: entry.name,
          address: entry.address,
          ref: nextRef,
        });
        if (!res.ok) throw new Error(res.msg || "save local wallet ref failed");
        refreshLocalWalletFiles();
        toast.success(`saved local ${entry.label || entry.name} ref`);
        return;
      }

      const res = await updateWalletEntryRef({
        walletType,
        source: entry.source,
        name: entry.name,
        address: entry.address,
        ref: nextRef,
      });
      if (!res.ok) throw new Error(res.msg || "save wallet ref failed");

      toast.success(`saved ${entry.label || entry.name} ref`);
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingWalletRefKey("");
    }
  }

  function getWalletServerName(entry) {
    return entry.label || entry.name;
  }

  async function deleteWallet(e, entry) {
    e.preventDefault();
    e.stopPropagation();

    if (!entry.source) {
      toast.error("custom address has no wallet file");
      return;
    }

    const ok = window.confirm(
      `Delete ${entry.label || entry.name} from ${entry.source}.json?`,
    );
    if (!ok) return;

    const key = getWalletEntryKey(entry);
    setDeletingWalletKey(key);

    try {
      if (useLocalEditorStore) {
        const res = deleteLocalWalletEntry({
          walletType,
          source: entry.source,
          name: entry.name,
          address: entry.address,
        });
        if (!res.ok) throw new Error(res.msg || "delete local wallet failed");

        toast.success(`deleted local ${entry.label || entry.name}`);
        refreshLocalWalletFiles();
        return;
      }

      const res = await deleteWalletEntry({
        walletType,
        source: entry.source,
        name: entry.name,
        address: entry.address,
      });
      if (!res.ok) throw new Error(res.msg || "delete wallet failed");

      const favKey = getFavAddrKey(walletType, entry.address);
      const nextFavAddrs = favAddrs.filter(
        (fav) => getFavAddrKey(fav.type, fav.address) != favKey,
      );
      if (nextFavAddrs.length != favAddrs.length) {
        setFavAddrs(nextFavAddrs);
        setCookie(favAddrCookie, encodeFavAddrs(nextFavAddrs), {
          maxAge: cookieMaxAge,
          path: "/",
        });
      }

      toast.success(`deleted ${entry.label || entry.name}`);
      window.setTimeout(() => window.location.reload(), 80);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingWalletKey("");
    }
  }

  function toggleCoinEnabled(chain, coin) {
    const disabled = new Set(disabledCoinsM[chain] || []);
    if (disabled.has(coin)) {
      disabled.delete(coin);
    } else {
      disabled.add(coin);
    }

    const next = { ...disabledCoinsM, [chain]: [...disabled] };
    if (!next[chain].length) delete next[chain];

    setDisabledCoinsM(next);
    setCookie(disabledCoinsCookie, encodeDisabledCoinM(next), {
      maxAge: cookieMaxAge,
      path: "/",
    });
    router.refresh();
  }

  async function toggleServerCoin(chain, coin) {
    const disabled = new Set(offCoinsM[chain] || []);
    const off = !disabled.has(coin);
    if (off) {
      disabled.add(coin);
    } else {
      disabled.delete(coin);
    }

    const next = { ...offCoinsM, [chain]: [...disabled] };
    if (!next[chain].length) delete next[chain];

    setOffCoinsM(next);
    try {
      if (useLocalEditorStore) {
        const res = setLocalLineFileValue(
          `cookie/offCoins/${chain}.txt`,
          coin,
          off,
        );
        if (!res.ok) throw new Error(res.msg || "local coin update failed");
        toast.success(`saved ${chain} ${coin} locally`);
        return;
      }

      const res = await toggleOffCoin({ chain, coin, off });
      if (!res.ok) throw new Error("server coin update failed");
      router.refresh();
    } catch (e) {
      setOffCoinsM(offCoinsM);
      toast.error(e.message);
    }
  }

  async function deleteEditorCoin(e, chain, coin) {
    e.preventDefault();
    e.stopPropagation();

    const editableCoins = editableCustomCoinM?.[chain] || {};
    if (!Object.prototype.hasOwnProperty.call(editableCoins, coin)) {
      toast.error(`${chain} ${coin} is not an editor coin`);
      return;
    }

    const ok = window.confirm(`Delete ${chain} ${coin} from editor coins?`);
    if (!ok) return;

    const key = `${chain}:${coin}`;
    setDeletingCoinKey(key);

    try {
      if (useLocalEditorStore) {
        const res = deleteLocalCustomCoin({ chain, coin });
        if (!res.ok) throw new Error(res.msg || "delete local coin failed");
        toast.success(`deleted local ${chain} ${coin}`);
        refreshLocalStorageEditorData(true);
        return;
      }

      const res = await deleteCustomCoin({ chain, coin });
      if (!res.ok) throw new Error(res.msg || "delete custom coin failed");
      toast.success(`deleted ${chain} ${coin}`);
      router.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeletingCoinKey("");
    }
  }

  async function toggleServerWallet(entry) {
    const name = getWalletServerName(entry);
    const nameKey = getNameDisableKey(name);
    const disabled = new Set(offAddrList.map(getNameDisableKey));
    const off = !disabled.has(nameKey);
    if (off) {
      disabled.add(nameKey);
    } else {
      disabled.delete(nameKey);
    }

    const next = off
      ? [...offAddrList, name]
      : offAddrList.filter((entry) => getNameDisableKey(entry) != nameKey);
    setOffAddrList(next);
    try {
      if (useLocalEditorStore) {
        const res = setLocalLineFileValue("cookie/offAddr.txt", name, off);
        if (!res.ok) throw new Error(res.msg || "local wallet update failed");
        toast.success(`saved ${name} locally`);
        return;
      }

      const res = await toggleOffAddr({ name, off });
      if (!res.ok) throw new Error("server wallet update failed");
      router.refresh();
    } catch (e) {
      setOffAddrList(offAddrList);
      toast.error(e.message);
    }
  }

  function setCoinSettingSort(chain, sortKey) {
    setCoinSettingSortM((prev) => ({
      ...prev,
      [chain]: prev[chain] == sortKey ? "" : sortKey,
    }));
  }

  function getWalletValue(file) {
    return file.replace(/\.(txt|json)$/i, "");
  }

  function isVisibleWalletSelectionFile(file = "") {
    if (String(file).endsWith("/")) return true;

    return !allWalletFiles.includes(
      `${getWalletValue(file).replace(/\/+$/, "")}/`,
    );
  }

  function isSpecialWalletFile(file = "") {
    return String(file)
      .split(/[\\/]+/)
      .filter(Boolean)
      .some(
        (part) => part.replace(/\.(txt|json)$/i, "").toLowerCase() == "watch",
      );
  }

  function hasWalletFile(wallet, type = walletType) {
    if (!wallet) return true;
    const files = walletFilesM[type] ?? [];
    const cleanWallet = wallet.replace(/\/+$/, "");
    return (
      files.some(
        (file) => getWalletValue(file).replace(/\/+$/, "") == cleanWallet,
      ) ||
      (type == walletType && hasLocalWalletSource(type, cleanWallet))
    );
  }

  function getLastWalletCookie(type) {
    return `${lastWalletCookiePrefix}${type}`;
  }

  function saveLastWalletSelection(type, selection) {
    setCookie(getLastWalletCookie(type), selection, {
      maxAge: cookieMaxAge,
      path: "/",
    });
    writeBrowserStorage(getLastWalletStorageKey(type), selection);
  }

  function saveWalletHistoryOrder(type, order = []) {
    const normalizedOrder = normalizeSelectionOrder(
      order,
      [],
      walletHistoryCap,
    );
    walletHistoryByTypeRef.current[type] = normalizedOrder;
    const encoded = encodeSelectionOrder(normalizedOrder);
    setCookie(getWalletHistoryCookie(type), encoded, {
      maxAge: cookieMaxAge,
      path: "/",
    });
    writeBrowserStorage(getWalletHistoryStorageKey(type), encoded);
  }

  function getSavedWalletHistoryOrder(type = walletType) {
    return parseSelectionOrder(
      [
        getCookie(getWalletHistoryCookie(type)),
        readBrowserStorage(getWalletHistoryStorageKey(type)),
      ]
        .filter(Boolean)
        .join("|"),
    ).slice(0, walletHistoryCap);
  }

  function encodeSelectionValue(value) {
    return encodeURIComponent(value);
  }

  function decodeSelectionValue(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  }

  function getCurrentWalletSelection() {
    if (selectedAddress) {
      return `addr:${encodeSelectionValue(selectedAddress)}`;
    }
    if (selectedWallet == "all") return "all";
    if (selectedWallet) return `file:${encodeSelectionValue(selectedWallet)}`;
    if (selectedWalletName) {
      return `name:${encodeSelectionValue(selectedWalletName)}`;
    }
    return "favs";
  }

  function saveCurrentWalletSelection() {
    const selection = getCurrentWalletSelection();
    if (!selection) return;

    saveLastWalletSelection(walletType, selection);
  }

  function getLastWalletSelection(type) {
    const selection = String(
      getCookie(getLastWalletCookie(type)) ||
        readBrowserStorage(getLastWalletStorageKey(type)),
    ).trim();
    if (!selection || selection == "favs") return { type: "favs" };
    if (selection == "all") return { type: "all" };

    if (selection.startsWith("name:")) {
      const name = decodeSelectionValue(selection.slice(5));
      return name ? { type: "name", value: name } : { type: "all" };
    }

    if (selection.startsWith("addr:")) {
      const address = decodeSelectionValue(selection.slice(5));
      return address ? { type: "addr", value: address } : { type: "all" };
    }

    if (selection.startsWith("file:")) {
      const wallet = decodeSelectionValue(selection.slice(5));
      return hasWalletFile(wallet, type)
        ? { type: "file", value: wallet }
        : { type: "all" };
    }

    return hasWalletFile(selection, type)
      ? { type: "file", value: selection }
      : { type: "all" };
  }

  function getWalletSelectionUrl(selection, type = walletType) {
    if (selection?.type == "name") {
      return getWalletNameUrl(selection.value, type);
    }
    if (selection?.type == "file") {
      return getWalletUrl(selection.value, type);
    }
    if (selection?.type == "addr") {
      return getAddressUrl(selection.value, type);
    }
    if (selection?.type == "all") {
      return getWalletUrl("all", type);
    }
    return getWalletUrl("", type);
  }

  function getWalletUrl(wallet, type = walletType) {
    const cleanWallet = wallet.replace(/\/+$/, "");
    const query =
      type && type != "evm" ? `?chain=${encodeURIComponent(type)}` : "";
    if (!cleanWallet) return `${basePath}${query}`;
    if (cleanWallet == "all") return `${basePath}/all${query}`;

    const path = `${basePath}/${cleanWallet
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
    return `${path}${query}`;
  }

  function getWalletNameUrl(walletName, type = walletType) {
    const params = new URLSearchParams();
    if (type && type != "evm") params.set("chain", type);
    params.set("w", walletName);

    return `${basePath}?${params.toString()}`;
  }

  function getAddressUrl(address, type = walletType) {
    const params = new URLSearchParams();
    if (type && type != "evm") params.set("chain", type);
    if (address) params.set("addr", address);

    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  function submitAddress(e) {
    e.preventDefault();
    const address = String(
      new FormData(e.currentTarget).get("addr") || "",
    ).trim();
    if (address == String(selectedAddress || "").trim()) return;

    setLoadingWallet(true);
    router.push(getAddressUrl(address));
  }

  async function copyAddress(e, address, source = "row") {
    e.preventDefault();
    e.stopPropagation();

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
      setCopiedAddressSource(source);
      setTimeout(() => {
        setCopiedAddress((prev) => (prev == address ? "" : prev));
        setCopiedAddressSource((prev) => (prev == source ? "" : prev));
      }, 1200);
    } catch (err) {
      toast.error(err?.message ?? "copy failed");
    }
  }

  function isFavAddr(address) {
    return favAddrs.some(
      (fav) =>
        getFavAddrKey(fav.type, fav.address) ==
        getFavAddrKey(walletType, address),
    );
  }

  function toggleFavAddr(e, row) {
    e.preventDefault();
    e.stopPropagation();

    const key = getFavAddrKey(walletType, row.address);
    if (!key) return;

    const exists = favAddrs.some(
      (fav) => getFavAddrKey(fav.type, fav.address) == key,
    );
    const next = exists
      ? favAddrs.filter((fav) => getFavAddrKey(fav.type, fav.address) != key)
      : [
          ...favAddrs,
          {
            type: walletType,
            name: row.name,
            address: row.address,
          },
        ];

    setFavAddrs(next);
    setCookie(favAddrCookie, encodeFavAddrs(next), {
      maxAge: cookieMaxAge,
      path: "/",
    });
    if (!selectedWallet && !selectedAddress && !selectedWalletName) {
      router.refresh();
    }
  }

  function clearCustomCoinPreview() {
    setCustomCoinPreview(null);
    setCustomCoinDraft({
      coin: "",
      name: "",
      type: "",
      customType: "",
      ref: "",
    });
  }

  function setCustomCoinPreviewData(res) {
    setCustomCoinPreview(res);
    setCustomCoinDraft({
      coin: res.coin || "",
      name: res.entry?.name || "",
      type: res.entry?.type || (res.chain == "Hyperliquid" ? "vault" : "token"),
      customType:
        res.entry?.type || (res.chain == "Hyperliquid" ? "vault" : "token"),
      ref: res.entry?.ref || "",
    });
  }

  async function openAlchemyCoinConfirm(e, chainE, coinE = {}) {
    e.preventDefault();
    e.stopPropagation();
    const chain = String(chainE?.chain || "").trim();
    const address = String(coinE.address || "").trim();
    if (!chain || !address || addingCoin) return;

    setCustomCoinChain(chain);
    setCustomCoinAddress(address);
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

  async function submitCustomCoin(e) {
    e.preventDefault();
    const chain = String(customCoinChainValue || "").trim();
    const address = String(customCoinAddress || "").trim();
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
      if (useLocalEditorStore) {
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
        const res = addLocalCustomCoin({
          chain: customCoinPreview.chain,
          coin,
          entry,
        });
        if (!res.ok) throw new Error(res.msg || "add local custom coin failed");
        if (res.exists) {
          toast(`${res.chain} ${res.coin} exists locally`);
          clearCustomCoinPreview();
          return;
        }

        setCustomCoinAddress("");
        clearCustomCoinPreview();
        toast.success(`saved local ${res.chain} ${res.coin}`);
        return;
      }

      const res = await addCustomCoin({
        chain: customCoinPreview.chain,
        address: customCoinPreview.entry?.address,
        coin: customCoinDraft.coin,
        name: customCoinDraft.name,
        type: customCoinDraft.customType.trim() || customCoinDraft.type,
        ref: customCoinDraft.ref,
      });
      if (!res.ok) throw new Error(res.msg || "add custom coin failed");
      if (res.exists) {
        toast(`${res.chain} ${res.coin} exists`);
        clearCustomCoinPreview();
        return;
      }

      setCustomCoinAddress("");
      clearCustomCoinPreview();
      toast.success(`added ${res.chain} ${res.coin}`);
      router.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAddingCoin(false);
    }
  }

  async function submitAddWallet(e) {
    e.preventDefault();
    const address = String(customAddress || "").trim();
    const file = String(draftWalletFile || "").trim();
    const name = String(addWalletName || getDefaultWalletName(address)).trim();
    if (!address || !file || addingWallet) return;

    setAddingWallet(true);
    try {
      if (useLocalEditorStore) {
        const res = addLocalWalletEntry({
          walletType,
          source: file,
          name,
          address,
        });
        if (!res.ok) throw new Error(res.msg || "add local wallet failed");
        if (res.exists) {
          toast(
            res.reason == "address"
              ? `address exists locally as ${res.name}`
              : `${name} exists locally`,
          );
          return;
        }

        setAddWalletName("");
        setAddWalletFile(file);
        refreshLocalWalletFiles();
        toast.success(`saved local ${name}`);
        setLoadingWallet(true);
        router.push(getWalletUrl(file));
        return;
      }

      const res = await addWalletEntry({
        walletType,
        source: file,
        name,
        address,
      });
      if (!res.ok) throw new Error(res.msg || "add wallet failed");
      if (res.exists) {
        toast(
          res.reason == "address"
            ? `address exists as ${res.name}`
            : `${name} exists`,
        );
        return;
      }

      setAddWalletName("");
      setAddWalletFile(file);
      toast.success(`added ${name}`);
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAddingWallet(false);
    }
  }

  function selectWalletValue(value) {
    rememberWalletHistory(value);
    goWallet(value);
  }

  function getWalletHistoryAddress(value = "") {
    const text = String(value || "");
    if (!text.startsWith("__address__:")) return "";

    return text.slice("__address__:".length);
  }

  function getCanonicalWalletHistoryValue(value = "") {
    const historyValue = getWalletHistoryValue(value);
    const historyAddress = getWalletHistoryAddress(historyValue);

    if (
      connectedWallet?.type == walletType &&
      historyAddress &&
      sameWalletAddress(historyAddress, connectedWallet.address)
    ) {
      return connectedWalletValue;
    }

    return historyValue;
  }

  function isSameCanonicalWalletHistoryValue(entry = "", canonicalValue = "") {
    if (entry == canonicalValue) return true;
    if (
      canonicalValue == connectedWalletValue &&
      connectedWallet?.type == walletType
    ) {
      return sameWalletAddress(
        getWalletHistoryAddress(entry),
        connectedWallet.address,
      );
    }

    return false;
  }

  function rememberWalletHistory(value) {
    const option =
      walletSelectOptions.find((entry) => entry.value == value) ||
      getStoredWalletHistoryOption(value);
    if (!option) return;

    const historyValue = getCanonicalWalletHistoryValue(value);
    const resolvedHistoryPath = getWalletHistoryValue(value).replace(
      /\/+$/,
      "",
    );
    setWalletHistoryOrder((prev) => {
      const basePrev = walletHistoryByTypeRef.current[walletType] || prev;
      const validValues = [
        ...walletHistoryOptionValues,
        ...basePrev,
        getWalletHistoryValue(value),
        connectedWalletValue,
      ];
      const nextPrev = basePrev.filter(
        (entry) =>
          !isSameCanonicalWalletHistoryValue(entry, historyValue) &&
          getWalletNotFoundPath(entry) != resolvedHistoryPath,
      );
      const next = rememberSelectionValue(
        nextPrev,
        historyValue,
        validValues,
        walletHistoryCap,
      );
      if (encodeSelectionOrder(next) == encodeSelectionOrder(prev)) {
        walletHistoryByTypeRef.current[walletType] = next;
        return prev;
      }
      saveWalletHistoryOrder(walletType, next);
      return next;
    });
  }

  function shouldAutoRememberWalletHistory(value) {
    const historyValue = getWalletHistoryValue(value);
    return (
      historyValue && historyValue != favWalletHistoryValue && value != "all"
    );
  }

  function getWalletHistorySkipToken(value) {
    return JSON.stringify({
      routeBase,
      walletType,
      value: getWalletHistoryValue(value),
      at: Date.now(),
    });
  }

  function parseWalletHistorySkipToken(token = "") {
    try {
      return JSON.parse(token);
    } catch {
      return null;
    }
  }

  function markWalletHistorySkip(value) {
    const token = getWalletHistorySkipToken(value);
    walletHistorySkipRef.current = token;
    try {
      sessionStorage.setItem(walletHistorySkipStorageKey, token);
    } catch {}
  }

  function consumeWalletHistorySkip(value) {
    let token = walletHistorySkipRef.current;
    try {
      token ||= sessionStorage.getItem(walletHistorySkipStorageKey) || "";
    } catch {}

    if (!token) return false;

    const payload = parseWalletHistorySkipToken(token);
    const expired = !payload?.at || Date.now() - Number(payload.at) > 30_000;
    const sameScope =
      !expired &&
      payload.routeBase == routeBase &&
      payload.walletType == walletType;
    const matched = sameScope && payload.value == getWalletHistoryValue(value);

    if (expired || (sameScope && !matched)) {
      walletHistorySkipRef.current = "";
      try {
        sessionStorage.removeItem(walletHistorySkipStorageKey);
      } catch {}
    }

    return matched;
  }

  function removeWalletHistory(value) {
    const historyValue = getWalletHistoryValue(value);
    setWalletHistoryOrder((prev) => {
      const next = prev.filter((entry) => entry != historyValue);
      if (encodeSelectionOrder(next) == encodeSelectionOrder(prev)) return prev;
      saveWalletHistoryOrder(walletType, next);
      return next;
    });
  }

  function selectAddWalletFile(e) {
    const file = e.target.value;
    setAddWalletFile(file);
    setDraftWalletFile(file);
  }

  function selectWalletType(e) {
    goWalletType(e.target.value);
  }

  function goWalletType(nextType) {
    if (nextType == walletType) return;
    saveWalletHistoryOrder(
      walletType,
      walletHistoryByTypeRef.current[walletType] || walletHistoryOrder,
    );
    saveCurrentWalletSelection();

    const nextSelection = getLastWalletSelection(nextType);
    setLoadingWallet(true);
    router.push(getWalletSelectionUrl(nextSelection, nextType));
  }

  function goWallet(wallet) {
    if (wallet == walletSelectValue) return;
    if (wallet == walletNotFoundValue) return;
    if (String(wallet || "").startsWith(`${walletNotFoundValue}:`)) {
      const missingWallet = String(wallet).slice(
        walletNotFoundValue.length + 1,
      );
      if (!missingWallet) return;
      setLoadingWallet(true);
      router.push(getWalletUrl(missingWallet));
      return;
    }
    if (String(wallet || "").startsWith("__walletName__:")) {
      const walletName = String(wallet).slice("__walletName__:".length);
      if (!walletName) return;
      setLoadingWallet(true);
      router.push(getWalletNameUrl(walletName));
      return;
    }
    if (String(wallet || "").startsWith("__address__:")) {
      const address = String(wallet).slice("__address__:".length);
      if (!address) return;
      setLoadingWallet(true);
      router.push(getAddressUrl(address));
      return;
    }
    if (wallet == connectedWalletValue) {
      if (!connectedWallet?.address) return;

      setLoadingWallet(true);
      router.push(getAddressUrl(connectedWallet.address, connectedWallet.type));
      return;
    }

    setLoadingWallet(true);
    router.push(getWalletUrl(wallet));
  }

  function getWalletSelectOptions() {
    const options = [];

    if (connectedWallet?.address) {
      options.push({
        value: connectedWalletValue,
        label: `connected: ${connectedWallet.label} ${shortAddr(
          connectedWallet.address,
        )}`,
        detail: shortAddr(connectedWallet.address),
        address: connectedWallet.address,
      });
    }

    if (effectiveSelectedWalletNotFound) {
      options.push({
        value: walletNotFoundSelectValue,
        label: `not found${requestedWallet ? `: ${requestedWallet}` : ""}`,
      });
    }

    options.push({ value: "", label: "favs" });
    options.push({ value: "all", label: "all" });

    for (const file of specialWalletFiles) {
      const value = getWalletValue(file);
      options.push({ value, label: value });
    }

    if (!effectiveSelectedWallet && selectedWalletName) {
      options.push({
        value: walletFilterValue,
        label: `w: ${selectedWalletName}`,
      });
    }

    if (!effectiveSelectedWallet && !selectedWalletName && selectedAddress) {
      options.push({
        value: walletFilterValue,
        label: `addr: ${shortAddr(selectedAddress)}`,
        detail: shortAddr(selectedAddress),
        address: selectedAddress,
      });
    }

    for (const file of normalWalletFiles) {
      const value = getWalletValue(file);
      options.push({ value, label: value });
    }

    return options;
  }

  function getWalletOptionValues() {
    return walletSelectOptions.map((entry) => entry.value);
  }

  function getWalletCycleValues() {
    const getValues = (values = []) => {
      const out = [];

      for (const value of values) {
        const cleanValue = String(value ?? "");
        const option =
          walletSelectOptions.find((entry) => entry.value == cleanValue) ||
          getStoredWalletHistoryOption(cleanValue);
        if (option?.disabled) continue;
        if (!out.includes(cleanValue)) out.push(cleanValue);
      }

      return out;
    };
    const historyValues = getValues(walletHistoryValues);

    return historyValues.length
      ? historyValues
      : getValues(getWalletOptionValues());
  }

  function getWalletCycleTarget(direction = "next") {
    const target = getCycleTargetValue(
      getWalletCycleValues(),
      walletSelectValue,
      direction,
    );
    const option =
      walletSelectOptions.find((entry) => entry.value == target) ||
      getStoredWalletHistoryOption(target);

    return option?.label || target;
  }

  function nextWallet() {
    const wallets = getWalletCycleValues();
    if (!wallets.length) return;
    const index = Math.max(0, wallets.indexOf(walletSelectValue));
    const next = wallets[(index + 1) % wallets.length];
    if (next == walletSelectValue) return;
    markWalletHistorySkip(next);
    goWallet(next);
  }

  function prevWallet() {
    const wallets = getWalletCycleValues();
    if (!wallets.length) return;
    const index = Math.max(0, wallets.indexOf(walletSelectValue));
    const prev = wallets[(index - 1 + wallets.length) % wallets.length];
    if (prev == walletSelectValue) return;
    markWalletHistorySkip(prev);
    goWallet(prev);
  }

  function cycleWalletType(direction = 1) {
    const types = walletTypeOptions.map(([value]) => value);
    const index = types.indexOf(walletType);
    const next = types[(index + direction + types.length) % types.length];
    goWalletType(next);
  }

  function getWalletTypeCycleTarget(direction = "next") {
    const values = walletTypeOptions.map(([value]) => value);
    const target = getCycleTargetValue(values, walletType, direction);
    const option = walletTypeOptions.find(([value]) => value == target);

    return option?.[1] || target;
  }

  function nextWalletType() {
    cycleWalletType(1);
  }

  function prevWalletType() {
    cycleWalletType(-1);
  }

  function decCoinLimit() {
    setCoinLimit((prev) => saveCoinLimit(Math.max(0, prev - 1)));
  }

  function incCoinLimit() {
    setCoinLimit((prev) =>
      saveCoinLimit(Math.min(getMaxCoinLimit(), prev + 1)),
    );
  }

  function getWalletEntryByAddress() {
    const entryM = new Map();

    for (const entry of mergedWalletEntries || []) {
      const key = getFavAddrKey(walletType, entry?.address);
      if (key && !entryM.has(key)) entryM.set(key, entry);
    }

    return entryM;
  }

  function getWalletEntryByName() {
    const entryM = new Map();

    for (const entry of mergedWalletEntries || []) {
      const name = String(entry?.name || "").trim();
      if (name && !entryM.has(name)) entryM.set(name, entry);
    }

    return entryM;
  }

  function getKnownWalletEntry(row) {
    const addressKey = getFavAddrKey(walletType, row?.address);

    return (
      walletEntryByName.get(row?.name) ||
      (addressKey ? walletEntryByAddress.get(addressKey) : null) ||
      null
    );
  }

  function getEffectiveDisabledCoinM() {
    return {
      ...disabledCoinsM,
      ...Object.fromEntries(
        Object.entries(offCoinsM).map(([chain, coins]) => [
          chain,
          [...new Set([...(disabledCoinsM[chain] || []), ...(coins || [])])],
        ]),
      ),
    };
  }

  async function reloadWalletAddressBalance(event, row = {}) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const address = String(row?.address || "").trim();
    const reloadKey = getWalletAddressReloadKey(walletType, address);
    if (!address || !reloadKey || reloadingWalletAddressKey == reloadKey)
      return;

    const knownEntry = getKnownWalletEntry(row) || row;
    const walletEntry = {
      name:
        String(knownEntry.name || row.name || "").trim() ||
        getDefaultWalletName(address),
      address,
      source: String(knownEntry.source || "").trim(),
      label: String(
        knownEntry.label || knownEntry.name || row.name || "",
      ).trim(),
    };

    clearWalletBalanceClientCache({ walletType, address });
    setWalletBalanceCacheVersion((version) => version + 1);
    setReloadingWalletAddressKey(reloadKey);

    try {
      const nextData = await getLocalWalletBalanceData({
        walletType,
        walletEntries: [walletEntry],
        chains: serverChainList.map((chainE) => chainE.chain),
        disabledCoinM: getEffectiveDisabledCoinM(),
        disabledWallets: disabledWalletList,
        disabledWalletNames: offAddrList,
        customCoinM: editableCustomCoinM,
        useAlchemy,
        alchemyMinUsd,
        usdPriceQuery,
      });

      writeWalletBalanceClientCache(nextData, {
        walletType,
        viewId: walletBalanceViewId,
      });
      setWalletAddressReloadM((prev) => ({
        ...prev,
        [reloadKey]: nextData,
      }));
      setWalletBalanceCacheVersion((version) => version + 1);
      emitWalletBalancePatches(
        getWalletBalancePatches(normalizeWalletCoinAliases(nextData), {
          baseData: activeData,
          replaceAddresses: [address],
          walletType,
        }),
      );
      toast.success(`reloaded ${walletEntry.label || walletEntry.name}`);
    } catch (e) {
      toast.error(e?.message || "wallet reload failed");
    } finally {
      setReloadingWalletAddressKey("");
    }
  }

  function getClaimWalletEntry(row) {
    const knownEntry = getKnownWalletEntry(row) || {};
    const name = String(knownEntry.name || row?.name || "").trim();
    const address = String(knownEntry.address || row?.address || "").trim();
    const connected =
      connectedWallet?.type == "evm" &&
      sameWalletAddress(connectedWallet.address, address);

    return {
      ...knownEntry,
      name,
      label: knownEntry.label || name || shortAddr(address),
      address,
      type: "evm",
      isBrowserWallet: !!connected,
      browserWallet: connected ? connectedWallet.wallet : "",
      hasPrivateKey: getWalletPrivateKeyFlag(walletPkM, "evm", name),
    };
  }

  async function claimAaveStakingReward(event, { row, chainE, coin, bal }) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const coinE = chainE?.coinInfoM?.[coin] || {};
    const walletEntry = getClaimWalletEntry(row);
    const walletLabel = walletEntry.label || walletEntry.name || "wallet";
    const sourceChain = String(
      coinE.sourceChain || bal?.sourceChain || "",
    ).trim();
    const stakingAddress = String(
      coinE.sourceAddress || bal?.sourceAddress || "",
    ).trim();
    const rewardCoin = String(
      coinE.rewardCoin || bal?.rewardCoin || coin,
    ).trim();
    const claimKey = getClaimRewardKey({
      address: walletEntry.address,
      sourceChain,
      stakingAddress,
      coin,
    });

    if (!walletEntry.address) {
      toast.error("wallet address missing");
      return;
    }
    if (!sourceChain || !stakingAddress) {
      toast.error("claim route missing");
      return;
    }
    if (!walletEntry.isBrowserWallet && !walletEntry.hasPrivateKey) {
      toast.error(`${walletLabel}: private key missing`);
      return;
    }
    if (
      !walletEntry.isBrowserWallet &&
      typeof window != "undefined" &&
      !window.confirm(`Claim ${rewardCoin} reward for ${walletLabel}?`)
    ) {
      return;
    }

    const toastId = toast.loading(`${walletLabel}: claiming ${rewardCoin}...`);
    setClaimingRewardKey(claimKey);

    try {
      let result;

      if (walletEntry.isBrowserWallet) {
        const built = await buildAaveStakingClaimTxs({
          walletAddress: walletEntry.address,
          chain: sourceChain,
          stakingAddress,
        });
        const txs = [];

        for (const tx of built.txs || []) {
          txs.push(
            await sendBrowserTradeTx({
              tx,
              walletEntry,
              tradeToast: toast,
              toastId,
              message: `${walletLabel}: claiming ${rewardCoin}...`,
            }),
          );
        }

        result = { ...built, txs };
      } else {
        result = await executeAaveStakingClaim({
          walletName: walletEntry.name,
          walletAddress: walletEntry.address,
          chain: sourceChain,
          stakingAddress,
        });
      }

      const hash = result?.txs?.find((tx) => tx?.hash)?.hash;
      toast.success(
        hash ? `${walletLabel}: claimed ${hash}` : `${walletLabel}: claimed`,
        {
          id: toastId,
        },
      );
      router.refresh();
    } catch (error) {
      toast.error(`${walletLabel}: ${error.message || error}`, { id: toastId });
    } finally {
      setClaimingRewardKey("");
    }
  }

  function getKnownWalletEntries(row) {
    const knownEntry = getKnownWalletEntry(row);
    const addressKey = getFavAddrKey(walletType, row?.address);
    const walletName = String(knownEntry?.name || row?.name || "").trim();
    const seen = new Set();
    const entries = [];

    function addEntry(entry) {
      if (!entry) return;
      const key = getWalletEntryKey(entry);
      if (seen.has(key)) return;
      seen.add(key);
      entries.push(entry);
    }

    for (const entry of allKnownWalletEntries || []) {
      const entryAddressKey = getFavAddrKey(walletType, entry?.address);
      const nameMatches = walletName && entry?.name == walletName;
      const addressMatches = addressKey && entryAddressKey == addressKey;

      if (nameMatches && (!addressKey || addressMatches)) addEntry(entry);
    }

    addEntry(knownEntry);

    return entries.sort((a, b) =>
      String(a.source || "").localeCompare(String(b.source || "")),
    );
  }

  function getWalletEntrySourcePath(entry) {
    const source = String(entry?.source || "").trim();
    return source ? `wallets/${walletType}/${source}.json` : "";
  }

  function getRows() {
    const rowM = new Map();

    for (const chainE of chainList) {
      for (const row of chainE?.rows || []) {
        const key =
          getFavAddrKey(walletType, row.address) ||
          `name:${String(row.name || "").trim()}`;
        if (!key) continue;

        if (!rowM.has(key)) {
          rowM.set(key, { name: row.name, address: row.address, chainM: {} });
        }
        const tableRow = rowM.get(key);
        if (!tableRow.address && row.address) {
          tableRow.address = row.address;
        }
        tableRow.chainM[chainE.chain] = row;
      }
    }

    return [...rowM.values()].map((row) => {
      const entry = getKnownWalletEntry(row);
      if (!entry) return row;

      return {
        ...row,
        name: entry.name || row.name,
        label: entry.label || entry.name || row.name,
        source: entry.source || row.source || "",
        ref: entry.ref || "",
      };
    });
  }

  function getRowSortValue(row) {
    if (!rowSort) return 0;
    if (rowSort == "asset") return getTotalAssetUsd(row);

    const [type, chain, coin] = rowSort.split(":");
    if (type == "sum") return getAssetUsd(row.chainM[chain]);
    if (type == "coin") {
      const bal = row.chainM[chain]?.balances?.[coin];
      return toNum(bal?.usd) || toNum(bal?.balance);
    }

    return 0;
  }

  function getDisplayRows() {
    if (!rowSort) return rows;

    if (rowSort == "name") {
      return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
          const nameDiff = String(a.row.name).localeCompare(String(b.row.name));
          return nameDiff || a.index - b.index;
        })
        .map((e) => e.row);
    }

    return rows
      .map((row, index) => ({
        row,
        index,
        value: getRowSortValue(row),
      }))
      .sort((a, b) => {
        const valueDiff = b.value - a.value;
        return valueDiff || a.index - b.index;
      })
      .map((e) => e.row);
  }

  function ChainToggle({ chainE }) {
    if (activeChain != chainE.chain) return null;

    return (
      <label className="switch small walletChainSwitch" title="show all chains">
        <input
          type="checkbox"
          checked
          onChange={() => toggleChain(chainE.chain)}
        />
        <span className="slider"></span>
      </label>
    );
  }

  function ChainNoBalanceMsg({ chainE }) {
    if (
      !rows.length ||
      activeChain != chainE.chain ||
      chainE?.coins?.length ||
      chainE?.error ||
      getTotalChainUsd(chainE.chain) > 0
    ) {
      return null;
    }

    return (
      <span className="gray walletChainNoBalance">no non-zero balances</span>
    );
  }

  function renderChainCoinSettings(chainE) {
    const chain = chainE.chain;
    const sortKey = coinSettingSortM[chain] || "";
    const disabled = new Set(disabledCoinsM[chain] || []);
    const serverDisabled = new Set(offCoinsM[chain] || []);
    const editorCoinM = editableCustomCoinM?.[chain] || {};
    const permanentCoins = permanentCoinM?.[chain] || {};
    const discoveredCoins = new Set(chainE.discoveredCoins || []);
    const chainCoinInfoM = chainE.coinInfoM || {};
    const settingCoins = [
      ...new Set([
        ...Object.keys(permanentCoins),
        ...Object.keys(editorCoinM),
        ...Object.keys(chainCoinInfoM),
        ...disabled,
        ...serverDisabled,
      ]),
    ];
    const sourceIndexM = {
      permanent: Object.fromEntries(
        Object.keys(permanentCoins).map((coin, index) => [coin, index]),
      ),
      editor: Object.fromEntries(
        Object.keys(editorCoinM).map((coin, index) => [coin, index]),
      ),
      alchemy: Object.fromEntries(
        settingCoins
          .filter(
            (coin) =>
              !Object.prototype.hasOwnProperty.call(permanentCoins, coin) &&
              !Object.prototype.hasOwnProperty.call(editorCoinM, coin),
          )
          .map((coin, index) => [coin, index]),
      ),
    };
    const coinRows = settingCoins.map((coin, index) => {
      const coinE =
        chainCoinInfoM[coin] || editorCoinM[coin] || permanentCoins[coin] || {};

      return {
        coin,
        name: coinE?.name || "",
        index,
        removable: Object.prototype.hasOwnProperty.call(editorCoinM, coin),
        source: Object.prototype.hasOwnProperty.call(editorCoinM, coin)
          ? "editor"
          : discoveredCoins.has(coin) || coinE?.source == "alchemy"
            ? "alchemy"
            : Object.prototype.hasOwnProperty.call(permanentCoins, coin)
              ? "permanent"
              : "alchemy",
      };
    });
    const groupList = [
      ["permanent", "server"],
      ["editor", "added"],
      ["alchemy", "discovery"],
    ];

    function sortCoinSettings(a, b) {
      if (!sortKey) return a.index - b.index;
      if (sortKey == "on") {
        const enabledDiff =
          Number(disabled.has(a.coin)) - Number(disabled.has(b.coin));
        if (enabledDiff) return enabledDiff;
        return a.coin.localeCompare(b.coin, undefined, {
          sensitivity: "base",
        });
      }
      if (sortKey == "server") {
        const enabledDiff =
          Number(serverDisabled.has(a.coin)) -
          Number(serverDisabled.has(b.coin));
        if (enabledDiff) return enabledDiff;
        return a.coin.localeCompare(b.coin, undefined, {
          sensitivity: "base",
        });
      }

      const valueA = sortKey == "name" ? a.name || a.coin : a.coin;
      const valueB = sortKey == "name" ? b.name || b.coin : b.coin;
      const diff = valueA.localeCompare(valueB, undefined, {
        sensitivity: "base",
      });
      return diff || a.index - b.index;
    }

    const groupedCoins = groupList
      .map(([source, label]) => [
        source,
        label,
        coinRows
          .filter((entry) => entry.source == source)
          .sort((a, b) => {
            const sorted = sortCoinSettings(a, b);
            if (sorted) return sorted;
            return (
              (sourceIndexM[source]?.[a.coin] ?? a.index) -
              (sourceIndexM[source]?.[b.coin] ?? b.index)
            );
          }),
      ])
      .filter(([, , entries]) => entries.length);

    const showChainIcon =
      activeChain == chain || (!activeChain && showAllChainIcons);

    return (
      <span className="chainTitle">
        {showChainIcon && (
          <InteractiveInfoCard
            open={openCoinSettingsChain == chain}
            onOpenChange={(nextOpen) =>
              setOpenCoinSettingsChain(nextOpen ? chain : "")
            }
            className="walletChainSettingsIcon"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="chainSettingsIconButton"
              title={`${chain} coin settings`}
              aria-label={`${chain} coin settings`}
            >
              <ChainIcon chain={chain} />
            </button>
            <span className="infoCard chainCoinSettingsCard">
              <span className="infoCardTitle">{chain} coins</span>
              <table className="coinSettingsTable">
                <thead>
                  <tr>
                    <th>
                      <TableSortHeader
                        activeSort={sortKey}
                        onSort={(key) => setCoinSettingSort(chain, key)}
                        sortKey="symbol"
                      >
                        symbol
                      </TableSortHeader>
                    </th>
                    <th>
                      <TableSortHeader
                        activeSort={sortKey}
                        onSort={(key) => setCoinSettingSort(chain, key)}
                        sortKey="name"
                      >
                        name
                      </TableSortHeader>
                    </th>
                    <th>
                      <TableSortHeader
                        activeSort={sortKey}
                        onSort={(key) => setCoinSettingSort(chain, key)}
                        sortKey="on"
                      >
                        on
                      </TableSortHeader>
                    </th>
                    <th>
                      <TableSortHeader
                        activeSort={sortKey}
                        onSort={(key) => setCoinSettingSort(chain, key)}
                        sortKey="server"
                      >
                        server
                      </TableSortHeader>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupedCoins.map(([source, label, entries]) => (
                    <Fragment key={source}>
                      <tr
                        key={`${source}_title`}
                        className="coinSettingsGroupRow"
                      >
                        <td colSpan={4}>{label}</td>
                      </tr>
                      {entries.map(({ coin, name, removable }) => (
                        <tr key={coin} className="infoSettingsRow">
                          <td>
                            <span className="coinSettingsSymbolCell">
                              <span>{coin}</span>
                              {removable && (
                                <button
                                  type="button"
                                  className="walletDeleteButton coinDeleteButton"
                                  title={`delete ${chain} ${coin}`}
                                  aria-label={`delete ${chain} ${coin}`}
                                  disabled={
                                    deletingCoinKey == `${chain}:${coin}`
                                  }
                                  onClick={(e) =>
                                    deleteEditorCoin(e, chain, coin)
                                  }
                                >
                                  <TrashIcon />
                                </button>
                              )}
                            </span>
                          </td>
                          <td>{name || <span className="gray">-</span>}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={!disabled.has(coin)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleCoinEnabled(chain, coin)}
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={!serverDisabled.has(coin)}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleServerCoin(chain, coin)}
                            />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </span>
          </InteractiveInfoCard>
        )}
        <button
          type="button"
          className="chainSettingsTitle"
          title={
            activeChain == chain ? "show all chains" : `show only ${chain}`
          }
          aria-label={
            activeChain == chain ? "show all chains" : `show only ${chain}`
          }
          onClick={(e) => {
            e.stopPropagation();
            toggleChain(chain);
          }}
        >
          <span>{chain}</span>
        </button>
      </span>
    );
  }

  function SortArrow({ sortKey }) {
    if (rowSort != sortKey) return null;

    return (
      <span className="sortArrow active" aria-hidden="true">
        ↓
      </span>
    );
  }

  function SortHeader({ sortKey, children, className = "" }) {
    return (
      <button
        type="button"
        className={`sortHeader ${className}`}
        onClick={() => toggleRowSort(sortKey)}
      >
        <span>{children}</span>
        <SortArrow sortKey={sortKey} />
      </button>
    );
  }

  function CopyAddressRow({ address, source = "row" }) {
    const copied = copiedAddress == address && copiedAddressSource == source;

    return (
      <span className="addressCopyRow">
        <span
          className="copyAddressText"
          title="copy address"
          onClick={(e) => copyAddress(e, address, source)}
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
          onClick={(e) => copyAddress(e, address, source)}
          title="copy address"
          aria-label="copy address"
        >
          <span className="copyIcon" aria-hidden="true"></span>
          <span className="copyTick" aria-hidden="true"></span>
        </button>
      </span>
    );
  }

  function renderWalletRefInput(entry, compact = false) {
    if (!entry?.source) {
      return entry?.ref ? <span className="gray">{entry.ref}</span> : null;
    }

    const key = getWalletEntryKey(entry);
    const value = getWalletRefDraft(entry);
    const saving = savingWalletRefKey == key;

    return (
      <input
        type="text"
        className={`walletRefInput ${compact ? "compact" : ""}`}
        placeholder="ref"
        value={value}
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setWalletRefDraft(entry, e.target.value)}
        onBlur={() => saveWalletRef(entry)}
        onKeyDown={(e) => {
          if (e.key == "Enter") e.currentTarget.blur();
          if (e.key == "Escape") {
            setWalletRefDraft(entry, entry.ref || "");
            e.currentTarget.blur();
          }
        }}
        style={{
          width: `${Math.max(String(value || "").length, 8) + 2}ch`,
        }}
      />
    );
  }

  function renderAddressSettingsHeader() {
    const disabled = new Set(disabledWalletList.map(getWalletDisableKey));
    const serverDisabled = new Set(offAddrList.map(getNameDisableKey));
    const currentRowAddressSet = new Set(
      rows.map((row) => getFavAddrKey(walletType, row.address)).filter(Boolean),
    );
    const matchingWallets = allKnownWalletEntries.filter((entry) => {
      const addressKey = getFavAddrKey(walletType, entry.address);
      return !currentRowAddressSet.size || currentRowAddressSet.has(addressKey);
    });
    const pathAddressSet = new Set(
      matchingWallets
        .filter((entry) => String(entry?.source || "").trim())
        .map((entry) => getFavAddrKey(walletType, entry.address))
        .filter(Boolean),
    );
    const seenWallets = new Set();
    const wallets = matchingWallets
      .filter((entry) => {
        const addressKey = getFavAddrKey(walletType, entry.address);
        if (!entry?.source && pathAddressSet.has(addressKey)) return false;

        const key = `${entry?.source || ""}:${entry?.name || ""}:${addressKey}`;
        if (!addressKey || seenWallets.has(key)) return false;
        seenWallets.add(key);
        return true;
      })
      .map((entry, index) => ({
        ...entry,
        index,
        label: entry.label || entry.name,
      }))
      .sort((a, b) => {
        if (!walletSettingSort) return a.index - b.index;
        if (walletSettingSort == "on") {
          const enabledDiff =
            Number(disabled.has(getWalletDisableKey(a.address))) -
            Number(disabled.has(getWalletDisableKey(b.address)));
          if (enabledDiff) return enabledDiff;

          const nameDiff = a.label.localeCompare(b.label, undefined, {
            sensitivity: "base",
          });
          return nameDiff || a.index - b.index;
        }
        if (walletSettingSort == "server") {
          const enabledDiff =
            Number(
              serverDisabled.has(getNameDisableKey(getWalletServerName(a))),
            ) -
            Number(
              serverDisabled.has(getNameDisableKey(getWalletServerName(b))),
            );
          if (enabledDiff) return enabledDiff;

          const nameDiff = a.label.localeCompare(b.label, undefined, {
            sensitivity: "base",
          });
          return nameDiff || a.index - b.index;
        }
        if (walletSettingSort == "address") {
          const diff = String(a.address || "").localeCompare(
            String(b.address || ""),
            undefined,
            { sensitivity: "base" },
          );
          return diff || a.index - b.index;
        }
        if (walletSettingSort == "ref") {
          const diff = String(a.ref || "").localeCompare(
            String(b.ref || ""),
            undefined,
            { sensitivity: "base" },
          );
          return diff || a.index - b.index;
        }

        if (walletSettingSort != "name") return a.index - b.index;

        const diff = a.label.localeCompare(b.label, undefined, {
          sensitivity: "base",
        });
        return diff || a.index - b.index;
      });

    return (
      <InteractiveInfoCard
        activation="hover"
        className="walletAddrSettingsHeader"
      >
        <SortHeader sortKey="name">addr</SortHeader>
        <span className="infoCard walletAddrSettingsCard">
          <span className="infoCardTitle">Wallets</span>
          <table className="walletSettingsTable">
            <thead>
              <tr>
                <th>
                  <TableSortHeader
                    activeSort={walletSettingSort}
                    onSort={toggleWalletSettingSort}
                    sortKey="name"
                  >
                    wallet
                  </TableSortHeader>
                </th>
                <th>
                  <TableSortHeader
                    activeSort={walletSettingSort}
                    onSort={toggleWalletSettingSort}
                    sortKey="address"
                  >
                    address
                  </TableSortHeader>
                </th>
                <th>
                  <TableSortHeader
                    activeSort={walletSettingSort}
                    onSort={toggleWalletSettingSort}
                    sortKey="ref"
                  >
                    ref
                  </TableSortHeader>
                </th>
                <th>
                  <TableSortHeader
                    activeSort={walletSettingSort}
                    onSort={toggleWalletSettingSort}
                    sortKey="on"
                  >
                    on
                  </TableSortHeader>
                </th>
                <th>
                  <TableSortHeader
                    activeSort={walletSettingSort}
                    onSort={toggleWalletSettingSort}
                    sortKey="server"
                  >
                    server
                  </TableSortHeader>
                </th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((entry) => {
                const disabledWallet = disabled.has(
                  getWalletDisableKey(entry.address),
                );
                const entryKey = getWalletEntryKey(entry);
                const serverName = getWalletServerName(entry);
                const disabledServerWallet = serverDisabled.has(
                  getNameDisableKey(serverName),
                );
                const deleting = deletingWalletKey == entryKey;
                const sourcePrefix = entry.source ? `${entry.source}/` : "";
                const walletLabel =
                  sourcePrefix && entry.label?.startsWith(sourcePrefix)
                    ? entry.label.slice(sourcePrefix.length)
                    : entry.label || entry.name;

                return (
                  <tr
                    key={`${entry.label}:${entry.address}`}
                    className="infoSettingsRow"
                  >
                    <td>
                      <span className="walletSettingName">
                        <span className="walletSettingPath">
                          {entry.source ? (
                            <>
                              <Link href={getWalletUrl(entry.source)}>
                                {entry.source}
                              </Link>
                              <span>/</span>
                              <span>{walletLabel}</span>
                            </>
                          ) : (
                            <span>{walletLabel}</span>
                          )}
                        </span>
                        {entry.source && (
                          <button
                            type="button"
                            className="walletDeleteButton"
                            title={`delete ${entry.label}`}
                            aria-label={`delete ${entry.label}`}
                            disabled={deleting}
                            onClick={(e) => deleteWallet(e, entry)}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </span>
                    </td>
                    <td title={entry.address}>
                      <CopyAddressRow
                        address={entry.address}
                        source={`settings:${entryKey}`}
                      />
                    </td>
                    <td>{renderWalletRefInput(entry, true)}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!disabledWallet}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleWalletEnabled(entry.address)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!disabledServerWallet}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleServerWallet(entry)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </span>
      </InteractiveInfoCard>
    );
  }

  function BalanceCell({ chainE, row, coin }) {
    const bal = row?.balances?.[coin];
    const coinE = chainE?.coinInfoM?.[coin] || {};
    const isClaimBalance =
      chainE?.chain == "Claim" &&
      String(coinE.source || bal?.source || "").toLowerCase() ==
        "aave staking" &&
      (coinE.sourceAddress || bal?.sourceAddress) &&
      (coinE.sourceChain || bal?.sourceChain);
    const claimKey = getClaimRewardKey({
      address: row?.address,
      sourceChain: coinE.sourceChain || bal?.sourceChain,
      stakingAddress: coinE.sourceAddress || bal?.sourceAddress,
      coin,
    });

    return (
      <td>
        {bal ? (
          <>
            <div className={isClaimBalance ? "walletClaimCellLine" : ""}>
              {pc(bal.balance, { pc: show ? 5 : 3 })}{" "}
              {bal.usd > 0 && (
                <span className="gray">
                  ${pc(bal.usd, { pc: show ? 5 : 3 })}
                </span>
              )}
              {isClaimBalance && toNum(bal.balance) > 0 && (
                <button
                  type="button"
                  className="btn small walletClaimButton"
                  disabled={claimingRewardKey == claimKey}
                  onClick={(event) =>
                    claimAaveStakingReward(event, { row, chainE, coin, bal })
                  }
                >
                  claim
                </button>
              )}
            </div>

            {show && <div className="gray">{bal.balance}</div>}
          </>
        ) : (
          <span className="gray">-</span>
        )}
      </td>
    );
  }

  function getAssetUsd(row) {
    return Object.values(row?.balances || {}).reduce(
      (sum, bal) => sum + toNum(bal.usd),
      0,
    );
  }

  function ChainValueCell({ row }) {
    const usd = getAssetUsd(row);

    return (
      <td>
        {usd > 0 ? (
          <span>${pc(usd, { pc: show ? 5 : 3 })}</span>
        ) : (
          <span className="gray">-</span>
        )}
      </td>
    );
  }

  function getTotalAssetUsd(row) {
    return chainList.reduce(
      (sum, chainE) => sum + getAssetUsd(row.chainM[chainE.chain]),
      0,
    );
  }

  function AssetCell({ row }) {
    const usd = getTotalAssetUsd(row);

    return (
      <td>
        {usd > 0 ? (
          <span>${pc(usd, { pc: show ? 5 : 3 })}</span>
        ) : (
          <span className="gray">-</span>
        )}
      </td>
    );
  }

  function getTotalWalletsUsd() {
    return rows.reduce((sum, row) => sum + getTotalAssetUsd(row), 0);
  }

  function getTotalChainUsd(chain) {
    return rows.reduce((sum, row) => sum + getAssetUsd(row.chainM[chain]), 0);
  }

  function getTotalChain(chain) {
    return rows.reduce(
      (total, row) => {
        const chainM = row.chainM[chain] || {};
        const balances = Object.values(chainM.balances || {});
        return balances.reduce(
          (nextTotal, bal) => ({
            balance: nextTotal.balance + toNum(bal?.balance),
            usd: nextTotal.usd + toNum(bal?.usd),
          }),
          total,
        );
      },
      { balance: 0, usd: 0 },
    );
  }

  function getTotalCoin(chain, coin) {
    return rows.reduce(
      (total, row) => {
        const bal = row.chainM[chain]?.balances?.[coin];
        return {
          balance: total.balance + toNum(bal?.balance),
          usd: total.usd + toNum(bal?.usd),
        };
      },
      { balance: 0, usd: 0 },
    );
  }

  function getCoinPrice(chain, coin) {
    for (const row of rows) {
      const price = toNum(row.chainM[chain]?.balances?.[coin]?.price);
      if (price > 0) return price;
    }

    return 0;
  }

  function getInfoChainE(chain = "") {
    return (
      chainList.find((entry) => entry.chain == chain) || {
        chain,
        scanner: scanners?.[chain] || "",
        coinInfoM: {},
        discoveredCoins: [],
      }
    );
  }

  function getCoinEntryByAddress(chainE, address = "") {
    const cleanAddress = getTokenAddressKey(chainE?.chain, address);
    if (!cleanAddress) return null;

    return (
      Object.entries(chainE?.coinInfoM || {}).find(
        ([, entry]) =>
          getTokenAddressKey(chainE?.chain, entry?.address) == cleanAddress,
      ) || null
    );
  }

  function getCoinEntryByCoin(chainE, coin = "") {
    const cleanCoin = String(coin || "").trim();
    if (!cleanCoin) return null;

    return (
      Object.entries(chainE?.coinInfoM || {}).find(
        ([localCoin]) => localCoin == cleanCoin,
      ) || null
    );
  }

  function getChainCoinStats(chainE) {
    const chain = chainE.chain;
    const allCoins = getAllCoins(chainE);
    const balanceCoins = allCoins.filter((coin) =>
      rows.some(
        (row) => toNum(row.chainM[chain]?.balances?.[coin]?.balance) > 0,
      ),
    );
    const noPriceCoins = balanceCoins.filter((coin) =>
      rows.some((row) => {
        const bal = row.chainM[chain]?.balances?.[coin];
        return toNum(bal?.balance) > 0 && !(toNum(bal?.price) > 0);
      }),
    );

    return { allCoins, balanceCoins, noPriceCoins };
  }

  function renderAddressCell(row) {
    if (!row.address) return <td></td>;

    const walletEntry = getKnownWalletEntry(row) || row;
    const walletRefEntries = getKnownWalletEntries(row).filter((entry) =>
      getWalletEntrySourcePath(entry),
    );
    const walletNote = walletNotes?.[row.name] || "";
    const standaloneChain =
      walletType == "solana" ? "Solana" : walletType == "tron" ? "Tron" : "";
    const standaloneScanner = chainList.find(
      (chainE) => chainE.chain == standaloneChain,
    )?.scanner;
    const profileUrl = standaloneChain
      ? getStandaloneAccountUrl(
          standaloneChain,
          standaloneScanner,
          row.address,
        )
      : `https://debank.com/profile/${row.address}`;
    const profileName =
      standaloneChain == "Solana"
        ? "Solscan"
        : standaloneChain == "Tron"
          ? "Tronscan"
          : "DeBank";
    const scannerLinks = chainList
      .filter((chainE) =>
        standaloneChain
          ? chainE.chain == standaloneChain
          : chainE.chain != "Solana" && chainE.chain != "Tron",
      )
      .map((chainE) => ({
        chain: chainE.chain,
        url: getScannerAccountUrl(chainE, row.address),
      }))
      .filter((e) => e.url);
    const cacheMeta = getWalletBalanceClientCacheMeta({
      walletType,
      address: row.address,
    });
    const reloadKey = getWalletAddressReloadKey(walletType, row.address);
    const reloading = reloadingWalletAddressKey == reloadKey;
    const cacheChains = cacheMeta.chains?.length
      ? cacheMeta.chains.join(", ")
      : "-";
    const displayChainRows = Object.entries(row.chainM || {})
      .filter(([chain]) => chain != "Claim")
      .map(([, chainRow]) => chainRow)
      .filter(Boolean);
    const displayUsesCache = displayChainRows.some(
      (chainRow) => chainRow.clientCached && !chainRow.clientReloaded,
    );
    const displayUsesReload = displayChainRows.some(
      (chainRow) => chainRow.clientReloaded,
    );
    const displayUsesFresh =
      displayChainRows.length > 0 &&
      (!displayUsesCache ||
        displayChainRows.some((chainRow) => chainRow.clientFresh));
    const displayCacheMeta = {
      ...cacheMeta,
      source: displayUsesReload
        ? "fresh"
        : displayUsesCache
          ? "cache"
          : displayUsesFresh
            ? "fresh"
            : cacheMeta.source,
    };

    return (
      <td>
        <InteractiveInfoCard
          activation="hover"
          forceOpen={
            copiedAddress == row.address && copiedAddressSource == "row"
          }
          onOpenChange={(nextOpen) => {
            if (
              !nextOpen &&
              copiedAddress == row.address &&
              copiedAddressSource == "row"
            ) {
              setCopiedAddress("");
              setCopiedAddressSource("");
            }
          }}
        >
          <span>{show ? row.address : shortAddr(row.address)}</span>
          <span className="infoCard">
            <span className="walletAddressCardTitle">
              {row.name}
              {walletNote && <span className="gray">: {walletNote}</span>}
              <HoverInfoCard className="customPickerColumnInfo walletBalanceCacheInfo walletAddressCacheInfo">
                <span className="infoIcon">i</span>
                <span className="infoCard">
                  <DiscoveryCacheInfo
                    cacheMeta={displayCacheMeta}
                    description="Wallet balances cached for this address in this browser tab."
                    cacheText="browser tab"
                    expiresText="browser refresh or clear client cache"
                    showCache={false}
                    showAge={false}
                    extraRows={[
                      `chain rows: ${cacheMeta.chainEntries || 0}`,
                      `chains: ${cacheChains}`,
                      ...(reloading ? ["reloading..."] : []),
                    ]}
                    onReload={(event) => reloadWalletAddressBalance(event, row)}
                  />
                </span>
              </HoverInfoCard>
              <button
                type="button"
                className="btn small bgGray"
                disabled={reloading}
                onClick={(event) => reloadWalletAddressBalance(event, row)}
              >
                reload
              </button>
            </span>
            <CopyAddressRow address={row.address} />
            {walletRefEntries.length > 0 && (
              <span className="walletRefPathList">
                {walletRefEntries.map((entry) => {
                  const sourcePath = getWalletEntrySourcePath(entry);
                  return (
                    <span
                      key={getWalletEntryKey(entry)}
                      className="walletRefPathRow"
                    >
                      <span className="gray">ref:</span>
                      {sourcePath && (
                        <span className="gray">{`${sourcePath}:`}</span>
                      )}
                      {renderWalletRefInput(entry, true)}
                    </span>
                  );
                })}
              </span>
            )}
            {profileUrl && (
              <span>
                profile:{" "}
                <a href={profileUrl} target="_blank" rel="noreferrer">
                  {profileName}
                </a>
              </span>
            )}
            {scannerLinks.length > 0 && (
              <span>
                scanner:{" "}
                {scannerLinks.map((e, i) => (
                  <span key={e.chain}>
                    {i > 0 && " "}
                    <a href={e.url} target="_blank" rel="noreferrer">
                      {e.chain}
                    </a>
                  </span>
                ))}
              </span>
            )}
          </span>
        </InteractiveInfoCard>
        {!standaloneChain && (
          <a
            href={profileUrl}
            target="_blank"
            rel="noreferrer"
            title="DeBank profile"
          >
            <img src={debankIcon.src} alt="DeBank" className="debankIcon" />
          </a>
        )}
      </td>
    );
  }

  function ErrorCell({ tableRow }) {
    const msg = visibleChainList
      .map((chainE) => {
        const row = tableRow.chainM[chainE.chain];
        const error = row?.error || chainE.error;
        return error ? `${chainE.chain}: ${error}` : "";
      })
      .filter(Boolean)
      .join(" | ");

    return <td className="red">{msg}</td>;
  }

  function TotalCoinCell({ chainE, coin }) {
    const total = getTotalCoin(chainE.chain, coin);

    return (
      <td>
        {total.balance > 0 || total.usd > 0 ? (
          <>
            <div>
              {pc(total.balance, { pc: show ? 5 : 3 })}{" "}
              {total.usd > 0 && (
                <span className="gray">
                  ${pc(total.usd, { pc: show ? 5 : 3 })}
                </span>
              )}
            </div>

            {show && <div className="gray">{total.balance}</div>}
          </>
        ) : (
          <span className="gray">-</span>
        )}
      </td>
    );
  }

  function TotalRow() {
    if (!rows.length) return null;

    return (
      <tr className="totalRow">
        <td className="stickyL">T</td>
        <td></td>
        <td>
          <span>${pc(getTotalWalletsUsd(), { pc: show ? 5 : 3 })}</span>
        </td>
        {visibleChainList.map((chainE) => {
          const coins = getVisibleCoins(chainE);
          const chainUsd = getTotalChainUsd(chainE.chain);

          return [
            <td key={`${chainE.chain}-total-value`}>
              {chainUsd > 0 ? (
                <span>${pc(chainUsd, { pc: show ? 5 : 3 })}</span>
              ) : (
                <span className="gray">-</span>
              )}
            </td>,
            ...(coins.length
              ? coins.map((coin) => (
                  <TotalCoinCell
                    key={`${chainE.chain}-total-${coin}`}
                    chainE={chainE}
                    coin={coin}
                  />
                ))
              : []),
          ];
        })}
        {hasError && <td></td>}
      </tr>
    );
  }

  function getCanAddCoin({
    chainE,
    coin = "",
    coinE = {},
    force = false,
  } = {}) {
    const discoveredCoins = Array.isArray(chainE?.discoveredCoins)
      ? chainE.discoveredCoins
      : [];
    const address = coinE.address;

    return (
      !!address &&
      (force || coinE.source == "alchemy" || discoveredCoins.includes(coin))
    );
  }

  function CoinInfoCardBody({
    chainE,
    coin,
    coinE = {},
    price = 0,
    canAddCoin = false,
  }) {
    const address = coinE.address;
    const addressUrl = getScannerTokenUrl(chainE, address);

    return (
      <>
        <span className="infoCardTitle">{coinE.name || coin}</span>
        {price > 0 && (
          <span>
            price:{" "}
            <span className="white">${pc(price, { pc: show ? 5 : 3 })}</span>
          </span>
        )}
        <span>
          type: <span className="white">{coinE.type || "-"}</span>
        </span>
        {coinE.synthetic && (
          <span>
            derived:{" "}
            <span className="white">
              {coinE.syntheticInfo || "synthetic wallet balance"}
            </span>
          </span>
        )}
        {coinE.ref && (
          <span>
            ref: <span className="white">{coinE.ref}</span>
          </span>
        )}
        <span>
          address:{" "}
          {address && addressUrl ? (
            <a
              href={addressUrl}
              target="_blank"
              rel="noreferrer"
              title={address}
            >
              {shortContract(address)}
              {" "}
              <span className="gray externalLinkIcon">↗</span>
            </a>
          ) : (
            <span className="white">{coinE.native ? "native" : "-"}</span>
          )}
        </span>
        <span>
          decimals: <span className="white">{coinE.decimals ?? "-"}</span>
        </span>
        {canAddCoin && (
          <button
            type="button"
            className="btn small bgCyan"
            onClick={(e) => openAlchemyCoinConfirm(e, chainE, coinE)}
            disabled={addingCoin}
          >
            add
          </button>
        )}
      </>
    );
  }

  function CoinInfoCard({ chainE, coin, coinE, price, canAddCoin = false }) {
    return (
      <span className="infoCard">
        <CoinInfoCardBody
          chainE={chainE}
          coin={coin}
          coinE={coinE}
          price={price}
          canAddCoin={canAddCoin}
        />
      </span>
    );
  }

  function ClaimCoinInfoCard({ coin, coinE = {}, price = 0 }) {
    const sourceChain = String(coinE.sourceChain || "").trim();
    const sourceChainE = getInfoChainE(sourceChain);
    const rewardAddress = coinE.rewardAddress || coinE.address;
    const rewardEntry =
      getCoinEntryByAddress(sourceChainE, rewardAddress) ||
      getCoinEntryByCoin(
        sourceChainE,
        coinE.rewardCoin || String(coin).split("<-")[0],
      );
    const [rewardCoin, rewardCoinE] = rewardEntry || [
      coinE.rewardCoin || String(coin).split("<-")[0] || coin,
      {
        address: rewardAddress,
        decimals: coinE.decimals,
        name: coinE.rewardCoin || coinE.name || coin,
        type: "token",
      },
    ];
    const sourceCoin = coinE.sourceCoin || String(coin).split("<-")[1] || "";
    const sourceEntry =
      getCoinEntryByAddress(sourceChainE, coinE.sourceAddress) ||
      getCoinEntryByCoin(sourceChainE, sourceCoin);
    const [stakingCoin, stakingCoinE] = sourceEntry || [
      sourceCoin,
      {
        address: coinE.sourceAddress,
        decimals: coinE.sourceDecimals,
        name: coinE.sourceName || sourceCoin,
        type: coinE.sourceType || "yield",
      },
    ];
    const rewardPrice = price || getCoinPrice(sourceChain, rewardCoin);
    const stakingPrice = getCoinPrice(sourceChain, stakingCoin);

    return (
      <span className="infoCard claimCoinInfoCard">
        <span className="claimCoinInfoColumns">
          <span className="claimCoinInfoColumn">
            <CoinInfoCardBody
              chainE={sourceChainE}
              coin={rewardCoin}
              coinE={rewardCoinE}
              price={rewardPrice}
              canAddCoin={getCanAddCoin({
                chainE: sourceChainE,
                coin: rewardCoin,
                coinE: rewardCoinE,
                force: !rewardEntry && !!rewardAddress,
              })}
            />
          </span>
          <span className="claimCoinInfoColumn">
            <CoinInfoCardBody
              chainE={sourceChainE}
              coin={stakingCoin}
              coinE={stakingCoinE}
              price={stakingPrice}
              canAddCoin={getCanAddCoin({
                chainE: sourceChainE,
                coin: stakingCoin,
                coinE: stakingCoinE,
                force: !sourceEntry && !!coinE.sourceAddress,
              })}
            />
          </span>
        </span>
      </span>
    );
  }

  function CoinHeader({ chainE, coin }) {
    const coinE = chainE.coinInfoM?.[coin] ?? {};
    const displayCoin = getCoinDisplayLabel(chainE.chain, coin, coinE);
    const claimSourceChain =
      chainE.chain == "Claim" ? String(coinE.sourceChain || "").trim() : "";
    const claimDisplayParts =
      chainE.chain == "Claim" ? String(displayCoin).split("<-") : [];
    const claimDisplayCoin = claimDisplayParts[0] || displayCoin;
    const claimDisplaySource = claimDisplayParts.slice(1).join("<-");
    const price = getCoinPrice(chainE.chain, coin);
    const sortKey = `coin:${chainE.chain}:${coin}`;
    const canAddCoin = getCanAddCoin({ chainE, coin, coinE });

    return (
      <HoverInfoCard>
        <SortHeader sortKey={sortKey} className="coinSortHeader">
          <span className="coinHeaderLabel">
            {claimSourceChain ? (
              <span className="claimCoinHeaderChain">{claimSourceChain}</span>
            ) : (
              <CoinIcon coin={coin} coinE={coinE} />
            )}
            <span
              className={
                claimDisplaySource ? "coinSymbol claimCoinSymbol" : "coinSymbol"
              }
              title={displayCoin == coin ? undefined : coin}
            >
              {claimDisplaySource ? (
                <>
                  {claimDisplayCoin}
                  <span className="claimCoinHeaderSource">
                    {"←"}
                    {claimDisplaySource}
                  </span>
                </>
              ) : (
                displayCoin
              )}
            </span>
          </span>
        </SortHeader>
        {chainE.chain == "Claim" ? (
          <ClaimCoinInfoCard coin={coin} coinE={coinE} price={price} />
        ) : (
          <CoinInfoCard
            chainE={chainE}
            coin={coin}
            coinE={coinE}
            price={price}
            canAddCoin={canAddCoin}
          />
        )}
      </HoverInfoCard>
    );
  }

  function ChainSumHeader({ chainE }) {
    const { allCoins, balanceCoins, noPriceCoins } = getChainCoinStats(chainE);

    return (
      <HoverInfoCard>
        <SortHeader sortKey={`sum:${chainE.chain}`}>sum</SortHeader>
        <span className="infoCard">
          <span className="infoCardTitle">{chainE.chain} sum</span>
          <span>
            total coins: <span className="white">{allCoins.length}</span>
          </span>
          <span>
            coins with balance:{" "}
            <span className="white">{balanceCoins.length}</span>
          </span>
          <span>
            balance no price:{" "}
            <span className={noPriceCoins.length ? "yellow" : "white"}>
              {noPriceCoins.length}
            </span>
          </span>
          {noPriceCoins.length > 0 && (
            <span className="gray">{noPriceCoins.join(", ")}</span>
          )}
        </span>
      </HoverInfoCard>
    );
  }

  function CustomCoinConfirmModal() {
    if (!customCoinPreview) return null;

    const entry = customCoinPreview.entry || {};
    const isVault = customCoinPreview.chain == "Hyperliquid";
    const typeSelectWidth =
      Math.max(...coinTypeOptions.map((type) => type.length), 5) + 2;
    const confirmChainE =
      chainList.find((chainE) => chainE.chain == customCoinPreview.chain) ||
      (scanners?.[customCoinPreview.chain]
        ? {
            chain: customCoinPreview.chain,
            scanner: scanners[customCoinPreview.chain],
          }
        : null);
    const addressUrl = getScannerTokenUrl(confirmChainE, entry.address);

    return (
      <div className="walletCoinConfirmBackdrop">
        <form
          className="walletCoinConfirmCard"
          onSubmit={(e) => {
            e.preventDefault();
            confirmCustomCoin();
          }}
        >
          <div className="walletCoinConfirmTitle">
            Confirm {isVault ? "vault" : "coin"}
          </div>
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

            <label className="gray" htmlFor="coinConfirmKey">
              {isVault ? "vault" : "coin"}
            </label>
            <input
              id="coinConfirmKey"
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

            <label className="gray" htmlFor="coinConfirmName">
              name
            </label>
            <input
              id="coinConfirmName"
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

            <label className="gray" htmlFor="coinConfirmType">
              type
            </label>
            <span className="walletCoinConfirmTypeRow">
              <select
                id="coinConfirmType"
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

            <label className="gray" htmlFor="coinConfirmRef">
              ref
            </label>
            <input
              id="coinConfirmRef"
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

  function renderTable(children) {
    return (
      <table>
        <caption>
          <div className="tableCaptionRow">
            <span>chains:</span>
            <CycleButtonPair
              onPrev={prevWalletType}
              onNext={nextWalletType}
              prevTarget={getWalletTypeCycleTarget("prev")}
              nextTarget={getWalletTypeCycleTarget("next")}
              disabled={loadingWallet || !canCycleWalletType}
            />
            <select
              value={walletType}
              onChange={selectWalletType}
              disabled={loadingWallet}
            >
              {walletTypeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <PassiveInfoCard
              activation="click"
              content="option 'all' excludes watch"
            >
              <span>wallets:</span>
            </PassiveInfoCard>
            <CycleButtonPair
              onPrev={prevWallet}
              onNext={nextWallet}
              prevTarget={getWalletCycleTarget("prev")}
              nextTarget={getWalletCycleTarget("next")}
              disabled={loadingWallet || getWalletCycleValues().length < 2}
            />
            <WalletSelectPicker
              value={walletSelectValue}
              options={walletSelectOptions}
              historyValues={walletHistoryValues}
              onSelect={selectWalletValue}
              onRemoveHistory={removeWalletHistory}
              disabled={loadingWallet}
            />
            <ChainFilterLabel />
            <CycleButtonPair
              onPrev={() => cycleActiveChain(-1)}
              onNext={() => cycleActiveChain(1)}
              prevTarget={getChainCycleTarget("prev")}
              nextTarget={getChainCycleTarget("next")}
              disabled={loadingWallet || getChainCycleValues().length < 2}
            />
            <ChainSelectPicker
              value={activeChain}
              options={chainSelectOptions}
              historyValues={chainHistoryValues}
              onSelect={selectActiveChainValue}
              onRemoveHistory={removeChainHistory}
              disabled={loadingWallet || !chainList.length}
            />
            <span>coins:</span>
            <button
              className="btn small bgGray"
              onClick={decCoinLimit}
              disabled={coinLimit <= 0}
              title="show fewer collapsed coins"
            >
              {"-"}
            </button>
            <span className="white">{coinLimit}</span>
            <button
              className="btn small bgGray"
              onClick={incCoinLimit}
              disabled={coinLimit >= getMaxCoinLimit()}
              title="show more collapsed coins"
            >
              {"+"}
            </button>
            <form
              className="walletAddressForm walletCaptionAddressForm"
              onSubmit={submitAddress}
            >
              <span className="gray">addr:</span>
              <input
                type="text"
                name="addr"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                placeholder={
                  walletType == "solana"
                    ? "Solana address"
                    : walletType == "tron"
                      ? "Tron address"
                      : "0x..."
                }
                style={{
                  width: `${Math.max(customAddress.length || 0, 12) + 2}ch`,
                }}
              />
              <button
                type="submit"
                className="btn small bgGray"
                disabled={loadingWallet}
              >
                go
              </button>
            </form>
            <form
              className="walletAddForm walletCaptionAddForm"
              onSubmit={submitAddWallet}
            >
              <PassiveInfoCard content="Toggle on to add this address or add a new coin.">
                <label
                  className="switch small walletAddSwitch"
                  title="show add controls"
                >
                  <input
                    type="checkbox"
                    checked={showAddWallet}
                    onChange={(e) => setShowAddWallet(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </PassiveInfoCard>
              {showAddWallet && (
                <>
                  <select
                    value={addWalletFile}
                    onChange={selectAddWalletFile}
                    disabled={addingWallet || !saveWalletFileOptions.length}
                  >
                    {!saveWalletFileOptions.length && (
                      <option value="">new file</option>
                    )}
                    {saveWalletFileOptions.map((file) => (
                      <option key={file} value={file}>
                        {file}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={draftWalletFile}
                    onChange={(e) => setDraftWalletFile(e.target.value)}
                    placeholder="folder/file"
                    disabled={addingWallet}
                    style={{
                      width: `${
                        Math.max(draftWalletFile.length || 0, 10) + 2
                      }ch`,
                    }}
                  />
                  <input
                    type="text"
                    value={addWalletName}
                    onChange={(e) => setAddWalletName(e.target.value)}
                    placeholder={"label"}
                    disabled={addingWallet}
                    style={{
                      width: `${Math.max(addWalletName.length || 0, 8) + 2}ch`,
                    }}
                  />
                  <button
                    type="submit"
                    className="btn small bgGray"
                    disabled={
                      addingWallet ||
                      !customAddress.trim() ||
                      !draftWalletFile.trim()
                    }
                  >
                    {addingWallet ? "..." : "save"}
                  </button>
                </>
              )}
            </form>
            <form
              className="walletCoinForm walletCaptionCoinForm"
              onSubmit={submitCustomCoin}
            >
              {showAddWallet && (
                <>
                  {customCoinChainValue == "Hyperliquid" && (
                    <span className="gray">vault:</span>
                  )}
                  {customCoinChainValue != "Hyperliquid" && (
                    <span className="gray">coin:</span>
                  )}
                  <select
                    name="chain"
                    value={customCoinChainValue}
                    onChange={(e) => setCustomCoinChain(e.target.value)}
                    disabled={addingCoin || !customCoinChains.length}
                  >
                    {!customCoinChains.length && (
                      <option value="">no chain</option>
                    )}
                    {customCoinChains.map((chain) => (
                      <option key={chain} value={chain}>
                        {chain}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    name="address"
                    value={customCoinAddress}
                    onChange={(e) => setCustomCoinAddress(e.target.value)}
                    placeholder={
                      customCoinChainValue == "Hyperliquid"
                        ? "vault addr"
                        : customCoinChainValue == "Solana"
                          ? "mint"
                          : customCoinChainValue == "Tron"
                            ? "TRC-20 contract"
                            : "coin addr"
                    }
                    style={{
                      width: `${
                        Math.max(customCoinAddress.length || 0, 12) + 2
                      }ch`,
                    }}
                  />
                  <button
                    type="submit"
                    className="btn small bgGray"
                    disabled={
                      addingCoin ||
                      !customCoinChainValue ||
                      !customCoinAddress.trim()
                    }
                  >
                    {addingCoin
                      ? "..."
                      : customCoinChainValue == "Hyperliquid"
                        ? "add vault"
                        : "add"}
                  </button>
                </>
              )}
            </form>
          </div>
        </caption>
        <thead>
          <tr>
            <th className="stickyA" rowSpan={2}>
              <label className="switch" title="show full address and balance">
                <input
                  type="checkbox"
                  checked={show}
                  onChange={() => setShow((prev) => !prev)}
                />
                <span className="slider"></span>
              </label>
            </th>
            <th rowSpan={2}>
              <span className="addrHeaderTools">
                {renderAddressSettingsHeader()}
              </span>
            </th>
            <th rowSpan={2}>
              <div className="walletAssetHeader">
                <SortHeader sortKey="asset">asset</SortHeader>
              </div>
            </th>
            {visibleChainList.map((chainE) => {
              const coins = getVisibleCoins(chainE);
              return (
                <th key={chainE.chain} colSpan={Math.max(coins.length + 1, 1)}>
                  <div
                    className="flex noWrap"
                    style={{
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: 6,
                    }}
                  >
                    {renderChainCoinSettings(chainE)}
                    <ChainToggle chainE={chainE} />
                    <ChainNoBalanceMsg chainE={chainE} />
                  </div>
                </th>
              );
            })}
            {hasError && <th rowSpan={2}>error</th>}
          </tr>
          <tr>
            {visibleChainList.map((chainE) => [
              <th key={`${chainE.chain}-value`}>
                <ChainSumHeader chainE={chainE} />
              </th>,
              ...getVisibleCoins(chainE).map((coin) => (
                <th key={`${chainE.chain}-${coin}`}>
                  <CoinHeader chainE={chainE} coin={coin} />
                </th>
              )),
            ])}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    );
  }

  function renderRows() {
    return (
      <>
        <TotalRow />
        {showLocalWalletLoading && (
          <tr>
            <td
              className="gray"
              colSpan={
                3 +
                visibleChainList.reduce(
                  (sum, chainE) =>
                    sum + Math.max(getVisibleCoins(chainE).length + 1, 1),
                  0,
                ) +
                (hasError ? 1 : 0)
              }
            >
              loading wallets...
            </td>
          </tr>
        )}
        {displayRows.map((row) => {
          const walletNote = walletNotes?.[row.name] || "";
          const fav = isFavAddr(row.address);
          const knownEntry = getKnownWalletEntry(row);
          const rowName =
            knownEntry?.name || row.name || getDefaultWalletName(row.address);
          const rowNameUrl =
            row.address && isAddressOnlyWalletName(rowName)
              ? getAddressUrl(row.address)
              : getWalletNameUrl(rowName);
          const rowKey =
            getFavAddrKey(walletType, row.address) ||
            `${row.name}:${row.address}`;

          return (
            <tr key={rowKey}>
              <td className="stickyL">
                {row.address && (
                  <button
                    type="button"
                    className={`walletFavAddrBtn ${fav ? "active" : ""}`}
                    title={fav ? "remove favorite address" : "favorite address"}
                    aria-label={
                      fav ? "remove favorite address" : "favorite address"
                    }
                    onClick={(e) => toggleFavAddr(e, row)}
                  >
                    {fav ? "★" : "☆"}
                  </button>
                )}
                <Link href={rowNameUrl}>{rowName}</Link>
                {show && walletNote && (
                  <>
                    <br />
                    <span className="gray">{walletNote}</span>
                  </>
                )}
              </td>
              {renderAddressCell(row)}
              <AssetCell row={row} />
              {visibleChainList.map((chainE) => {
                const coins = getVisibleCoins(chainE);
                const chainRow = row.chainM[chainE.chain];

                return [
                  <ChainValueCell
                    key={`${chainE.chain}-value`}
                    row={chainRow}
                  />,
                  ...(coins.length
                    ? coins.map((coin) => (
                        <BalanceCell
                          key={`${chainE.chain}-${coin}`}
                          chainE={chainE}
                          row={chainRow}
                          coin={coin}
                        />
                      ))
                    : []),
                ];
              })}
              {hasError && <ErrorCell tableRow={row} />}
            </tr>
          );
        })}
      </>
    );
  }

  function NoBalanceMsg() {
    if (!rows.length || activeChain) return null;

    const noBalances = visibleChainList.every(
      (chainE) =>
        !chainE?.coins?.length &&
        !chainE?.error &&
        !(getTotalChainUsd(chainE.chain) > 0),
    );
    if (!noBalances) return null;

    return <div className="gray">no non-zero balances</div>;
  }

  return (
    <div>
      {renderTable(renderRows())}
      {!rows.length && !showLocalWalletLoading && (
        <div className="gray">no wallets</div>
      )}
      <NoBalanceMsg />
      {CustomCoinConfirmModal()}
    </div>
  );
}

export default Wallet;
