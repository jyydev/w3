"use client";
import "ygb/react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import arbitrumIcon from "@/data/img/arbitrum.svg";
import bscIcon from "@/data/img/bsc.png";
import debankIcon from "@/data/img/debank.png";
import ethereumIcon from "@/data/img/ethereum.svg";
import solanaIcon from "@/data/img/solana.svg";
import { pc } from "@/fn/basic";
import { ckPrefix, walletNotes } from "@/sets";
import { useRouter } from "next/navigation";
import {
  addLocalCustomCoin,
  addLocalWalletEntry,
  hasLocalWalletSource,
  listLocalWalletSources,
  readLocalWalletEntries,
  setLocalLineFileValue,
  useLocalStorageEditor,
} from "../browserEditorStorage";
import { toggleOffAddr, toggleOffCoin } from "./chainActions";
import { addCustomCoin, previewCustomCoin } from "./coinActions";
import { getLocalWalletBalanceData } from "./localWalletActions";
import { addWalletEntry, deleteWalletEntry } from "./walletActions";
import {
  encodeFavAddrs,
  favAddrCookie,
  getFavAddrKey,
  parseFavAddrs,
} from "./favAddrs";
import { readStoredWallet, walletConnectEvent } from "./browserWalletStorage";
import {
  disabledCoinsCookie,
  disabledWalletsCookie,
  encodeDisabledCoinM,
  encodeDisabledWallets,
  getWalletDisableKey,
} from "./walletSettingData";

function shortAddr(address) {
  return address ? `..${address.slice(-3)}` : "";
}

function shortContract(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
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
  Kaia: "Ka",
  Optimism: "Op",
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
        className={`chainIcon chainIcon-${getChainIconClass(chain)}`}
        aria-hidden="true"
      >
        {textIcon}
      </span>
    );
  }

  const src = getImgSrc(chainIconM[chain]);
  if (!src) return null;

  return (
    <img
      className={`chainIcon chainIcon-${getChainIconClass(chain)}`}
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
  return (
    <span
      className={`coinIcon coinIcon-${getCoinTypeClass(coinE.type)}`}
      title={`${coinE.name || coin} (${coinE.type || "token"})`}
      aria-hidden="true"
    >
      {getCoinIconText({ coin, name: coinE.name })}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-1 6h2v10H8V9Zm6 0h2v10h-2V9Zm-4 0h2v10h-2V9Z" />
    </svg>
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

function getNameDisableKey(name = "") {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function getScannerTokenUrl(chainE, address) {
  if (!chainE?.scanner || !address) return "";
  const scanner = chainE.scanner.replace(/\/+$/, "");
  return chainE.chain == "Solana"
    ? `${scanner}/token/${address}`
    : `${scanner}/address/${address}`;
}

function getScannerAccountUrl(chainE, address) {
  if (!chainE?.scanner || !address) return "";
  const scanner = chainE.scanner.replace(/\/+$/, "");
  return chainE.chain == "Solana"
    ? `${scanner}/account/${address}`
    : `${scanner}/address/${address}`;
}

function getSolanaAccountUrl(scanner, address) {
  return scanner && address
    ? `${scanner.replace(/\/+$/, "")}/account/${address}`
    : "";
}

const walletTypeList = [
  ["evm", "EVM"],
  ["solana", "Solana"],
];
const coinLimitCookie = `${ckPrefix ?? ""}coinLimit`;
const assetSortCookie = `${ckPrefix ?? ""}assetSort`;
const rowSortCookie = `${ckPrefix ?? ""}rowSort`;
const activeChainCookie = `${ckPrefix ?? ""}activeChain`;
const lastWalletCookiePrefix = `${ckPrefix ?? ""}lastWallet_`;
const cookieMaxAge = 365 * 24 * 60 * 60;
const connectedWalletValue = "__connected__";
const walletNotFoundValue = "__not_found__";

function Wallet({
  routeBase = "/w",
  customCoinChains = [],
  data,
  walletFiles = [],
  walletFilesM = {},
  selectedAddress = "",
  selectedWallet = "",
  selectedWalletNotFound = false,
  requestedWallet = "",
  selectedWalletName = "",
  walletEntries = [],
  disabledWallets = [],
  offAddrs = [],
  disabledCoinM = {},
  offCoinM = {},
  walletTypeOptions = walletTypeList,
  walletType = "evm",
  useAlchemy = null,
  alchemyMinUsd = 0.01,
}) {
  const router = useRouter();
  const walletFileOptions = walletFiles.filter((file) => !file.endsWith("/"));
  const defaultAddWalletFile = walletFileOptions.includes(selectedWallet)
    ? selectedWallet
    : walletFileOptions[0] || "";
  let [show, setShow] = useState(false);
  let [activeChain, setActiveChain] = useState("");
  let [loadingWallet, setLoadingWallet] = useState(false);
  let [coinLimit, setCoinLimit] = useState(1);
  let [rowSort, setRowSort] = useState("");
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
  });
  let [addingCoin, setAddingCoin] = useState(false);
  let [copiedAddress, setCopiedAddress] = useState("");
  let [copiedAddressSource, setCopiedAddressSource] = useState("");
  let [deletingWalletKey, setDeletingWalletKey] = useState("");
  let [disabledWalletList, setDisabledWalletList] = useState(disabledWallets);
  let [offAddrList, setOffAddrList] = useState(offAddrs);
  let [walletSettingSort, setWalletSettingSort] = useState("");
  let [openWalletSettings, setOpenWalletSettings] = useState(false);
  let [disabledCoinsM, setDisabledCoinsM] = useState(disabledCoinM);
  let [offCoinsM, setOffCoinsM] = useState(offCoinM);
  let [coinSettingSortM, setCoinSettingSortM] = useState({});
  let [openCoinSettingsChain, setOpenCoinSettingsChain] = useState("");
  let [favAddrs, setFavAddrs] = useState([]);
  let [connectedWallet, setConnectedWallet] = useState(null);
  let [useLocalEditorStore, setUseLocalEditorStore] = useState(false);
  let [localEditorStoreChecked, setLocalEditorStoreChecked] = useState(false);
  let [localWalletFiles, setLocalWalletFiles] = useState([]);
  let [localWalletData, setLocalWalletData] = useState(null);
  let [loadingLocalWallet, setLoadingLocalWallet] = useState(false);
  let [checkingLocalWallet, setCheckingLocalWallet] = useState(
    Boolean(requestedWallet || selectedWallet == "all") && !selectedAddress && !selectedWalletName,
  );
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
  const serverChainNameKey = serverChainList.map((chainE) => chainE.chain).join("|");
  const activeData = localWalletData || data;
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
  const chainNameKey = chainList.map((chainE) => chainE.chain).join("|");
  const customCoinChainValue = customCoinChains.includes(customCoinChain)
    ? customCoinChain
    : customCoinChains[0] || "";
  const localSettingWalletEntries = useLocalEditorStore
    ? readLocalWalletEntries(walletType, localWalletLoadSource)
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
  const connectedSelected =
    connectedWallet?.address &&
    selectedAddress &&
    getFavAddrKey(connectedWallet.type, connectedWallet.address) ==
      getFavAddrKey(walletType, selectedAddress);
  const walletSelectValue = connectedSelected
    ? connectedWalletValue
    : effectiveSelectedWalletNotFound
      ? walletNotFoundValue
      : walletFilterValue || effectiveSelectedWallet || "";
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
  const selectableWalletFiles = allWalletFiles.filter(isVisibleWalletSelectionFile);
  const specialWalletFiles = selectableWalletFiles.filter(isSpecialWalletFile);
  const normalWalletFiles = selectableWalletFiles.filter(
    (file) => !isSpecialWalletFile(file),
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
    const chains = activeChain
      ? chainList.filter((chainE) => chainE.chain == activeChain)
      : chainList;

    return chains
      .map((chainE, index) => ({
        chainE,
        index,
        usd: getTotalChainUsd(chainE.chain),
      }))
      .sort((a, b) => {
        const usdDiff = b.usd - a.usd;
        return usdDiff || a.index - b.index;
      })
      .map((e) => e.chainE);
  }

  function getMaxCoinLimit() {
    return chainList.reduce(
      (max, chainE) => Math.max(max, getAllCoins(chainE).length),
      0,
    );
  }

  function toggleChain(chain) {
    setActiveChain((prev) => {
      const next = prev == chain ? "" : chain;
      setCookie(activeChainCookie, next, {
        maxAge: cookieMaxAge,
        path: "/",
      });
      return next;
    });
  }

  function refreshLocalWalletFiles() {
    if (!useLocalStorageEditor()) {
      setLocalWalletFiles([]);
      return;
    }

    setLocalWalletFiles(listLocalWalletSources(walletType));
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
    setCheckingLocalWallet(
      Boolean(requestedWallet || selectedWallet == "all") &&
        !selectedAddress &&
        !selectedWalletName,
    );
    setLocalEditorStoreChecked(false);
  }, [requestedWallet, selectedWallet, selectedAddress, selectedWalletName, walletType]);

  useEffect(() => {
    const useLocal = useLocalStorageEditor();
    setUseLocalEditorStore(useLocal);
    setLocalEditorStoreChecked(true);
    if (useLocal) refreshLocalWalletFiles();
    else setCheckingLocalWallet(false);
  }, [walletType]);

  useEffect(() => {
    setLocalWalletData(null);
    if (!localEditorStoreChecked) return;

    if (!useLocalEditorStore) {
      setCheckingLocalWallet(false);
      return;
    }
    if (!localRequestedWallet && !localAllWallets) {
      setCheckingLocalWallet(false);
      return;
    }

    const entries = readLocalWalletEntries(walletType, localWalletLoadSource);
    if (!entries.length) {
      setCheckingLocalWallet(false);
      return;
    }

    let cancelled = false;
    setCheckingLocalWallet(false);
    setLoadingLocalWallet(true);
    getLocalWalletBalanceData({
      walletType,
      walletEntries: entries,
      chains: serverChainList.map((chainE) => chainE.chain),
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
      useAlchemy,
      alchemyMinUsd,
    })
      .then((nextData) => {
        if (!cancelled) setLocalWalletData(nextData);
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
    effectiveRequestedWallet,
    walletType,
    serverChainNameKey,
    disabledCoinKey,
    offCoinKey,
    disabledWalletKey,
    offAddrKey,
    useAlchemy,
    alchemyMinUsd,
  ]);

  useEffect(() => {
    if (!loadingWallet) return;

    const id = setTimeout(() => setLoadingWallet(false), 20000);
    return () => clearTimeout(id);
  }, [loadingWallet]);

  useEffect(() => {
    const chainNames = chainNameKey ? chainNameKey.split("|") : [];
    if (chainNames.length == 1) {
      setActiveChain(chainNames[0]);
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
    saveCurrentWalletSelection();
  }, [selectedAddress, selectedWallet, selectedWalletName, walletType]);

  useEffect(() => {
    setCustomAddress(selectedAddress);
  }, [selectedAddress]);

  useEffect(() => {
    const nextDefault = defaultAddWalletFile || saveWalletFileOptions[0] || "";
    setAddWalletFile(nextDefault);
    setDraftWalletFile(nextDefault);
  }, [defaultAddWalletFile, walletFileKey, walletType, localWalletFiles.join("|")]);

  useEffect(() => {
    setDisabledWalletList(disabledWallets || []);
  }, [disabledWalletKey]);

  useEffect(() => {
    setOffAddrList(offAddrs || []);
  }, [offAddrKey]);

  useEffect(() => {
    setDisabledCoinsM(disabledCoinM || {});
  }, [disabledCoinKey]);

  useEffect(() => {
    setOffCoinsM(offCoinM || {});
  }, [offCoinKey]);

  useEffect(() => {
    const savedCoinLimit = Number(getCookie(coinLimitCookie));
    if (Number.isInteger(savedCoinLimit) && savedCoinLimit >= 0) {
      setCoinLimit(savedCoinLimit);
    }

    const savedRowSort = String(getCookie(rowSortCookie) || "");
    setRowSort(
      savedRowSort || (getCookie(assetSortCookie) == "1" ? "asset" : ""),
    );
    setFavAddrs(parseFavAddrs(getCookie(favAddrCookie)));
  }, []);

  useEffect(() => {
    function loadConnectedWallet() {
      setConnectedWallet(readStoredWallet(walletType));
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
      `Delete ${entry.label || entry.name} from ${entry.source}.txt?`,
    );
    if (!ok) return;

    const key = getWalletEntryKey(entry);
    setDeletingWalletKey(key);

    try {
      const res = await deleteWalletEntry({
        walletType,
        source: entry.source,
        name: entry.name,
        address: entry.address,
      });
      if (!res.ok) throw new Error(res.msg || "delete wallet failed");

      toast.success(`deleted ${entry.label || entry.name}`);
      router.refresh();
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
        const res = setLocalLineFileValue(`cookie/offCoins/${chain}.txt`, coin, off);
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
    return file.replace(/\.txt$/i, "");
  }

  function isVisibleWalletSelectionFile(file = "") {
    if (String(file).endsWith("/")) return true;

    return !allWalletFiles.includes(`${getWalletValue(file).replace(/\/+$/, "")}/`);
  }

  function isSpecialWalletFile(file = "") {
    return String(file)
      .split(/[\\/]+/)
      .filter(Boolean)
      .some((part) => part.replace(/\.txt$/i, "").toLowerCase() == "watch");
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
    if (selectedWalletName) {
      return `name:${encodeSelectionValue(selectedWalletName)}`;
    }
    if (selectedWallet == "all") return "all";
    if (selectedWallet) return `file:${encodeSelectionValue(selectedWallet)}`;
    return "favs";
  }

  function saveCurrentWalletSelection() {
    const selection = getCurrentWalletSelection();
    if (!selection) return;

    setCookie(getLastWalletCookie(walletType), selection, {
      maxAge: cookieMaxAge,
    });
  }

  function getLastWalletSelection(type) {
    const selection = String(getCookie(getLastWalletCookie(type)) || "").trim();
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

  function selectWallet(e) {
    goWallet(e.target.value);
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
    saveCurrentWalletSelection();

    const nextSelection = getLastWalletSelection(nextType);
    setLoadingWallet(true);
    router.push(getWalletSelectionUrl(nextSelection, nextType));
  }

  function goWallet(wallet) {
    if (wallet == walletSelectValue) return;
    if (wallet == walletNotFoundValue) return;
    if (wallet == connectedWalletValue) {
      if (!connectedWallet?.address) return;

      setLoadingWallet(true);
      router.push(getAddressUrl(connectedWallet.address, connectedWallet.type));
      return;
    }

    setLoadingWallet(true);
    router.push(getWalletUrl(wallet));
  }

  function getWalletOptionValues() {
    return [
      ...(connectedWallet?.address ? [connectedWalletValue] : []),
      ...(effectiveSelectedWalletNotFound ? [walletNotFoundValue] : []),
      "",
      "all",
      ...specialWalletFiles.map(getWalletValue),
      ...normalWalletFiles.map(getWalletValue),
    ];
  }

  function nextWallet() {
    const wallets = getWalletOptionValues();
    const index = Math.max(0, wallets.indexOf(walletSelectValue));
    const next = wallets[(index + 1) % wallets.length];
    goWallet(next);
  }

  function prevWallet() {
    const wallets = getWalletOptionValues();
    const index = Math.max(0, wallets.indexOf(walletSelectValue));
    const prev = wallets[(index - 1 + wallets.length) % wallets.length];
    goWallet(prev);
  }

  function nextWalletType() {
    const types = walletTypeOptions.map(([value]) => value);
    const index = types.indexOf(walletType);
    const next = types[(index + 1) % types.length];
    goWalletType(next);
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

  function getRows() {
    const rowM = {};

    for (const chainE of chainList) {
      for (const row of chainE?.rows || []) {
        if (!rowM[row.name]) {
          rowM[row.name] = { name: row.name, address: row.address, chainM: {} };
        }
        if (!rowM[row.name].address && row.address) {
          rowM[row.name].address = row.address;
        }
        rowM[row.name].chainM[chainE.chain] = row;
      }
    }

    return Object.values(rowM).map((row) => {
      const entry = getKnownWalletEntry(row);
      if (!entry) return row;

      return {
        ...row,
        name: entry.name || row.name,
        label: entry.label || entry.name || row.name,
        source: entry.source || row.source || "",
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
    return (
      <label
        className="switch small walletChainSwitch"
        title={`show only ${chainE.chain}`}
      >
        <input
          type="checkbox"
          checked={activeChain == chainE.chain}
          onChange={() => toggleChain(chainE.chain)}
        />
        <span className="slider"></span>
      </label>
    );
  }

  function ChainCoinSettings({ chainE }) {
    const chain = chainE.chain;
    const sortKey = coinSettingSortM[chain] || "";
    const disabled = new Set(disabledCoinsM[chain] || []);
    const serverDisabled = new Set(offCoinsM[chain] || []);
    const coins = Object.entries(chainE.coinInfoM || {})
      .map(([coin, coinE], index) => ({
        coin,
        name: coinE?.name || "",
        index,
      }))
      .sort((a, b) => {
        if (!sortKey) return a.index - b.index;
        if (sortKey == "on") {
          const enabledDiff =
            Number(disabled.has(a.coin)) - Number(disabled.has(b.coin));
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
      });

    return (
      <span
        className={`infoHover clickInfo walletChainSettingsIcon ${
          openCoinSettingsChain == chain ? "infoOpen" : ""
        }`}
        onMouseLeave={() => setOpenCoinSettingsChain("")}
      >
        <button
          type="button"
          className="chainTitle chainSettingsTitle"
          title={`${chain} coin settings`}
          aria-label={`${chain} coin settings`}
          onClick={() =>
            setOpenCoinSettingsChain((prev) => (prev == chain ? "" : chain))
          }
        >
          <ChainIcon chain={chain} />
          <span>{chain}</span>
        </button>
        <span className="infoCard chainCoinSettingsCard">
          <span className="infoCardTitle">{chain} coins</span>
          <table className="coinSettingsTable">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="coinSettingsSort"
                    onClick={() => setCoinSettingSort(chain, "symbol")}
                  >
                    symbol{sortKey == "symbol" ? " ↓" : ""}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="coinSettingsSort"
                    onClick={() => setCoinSettingSort(chain, "name")}
                  >
                    name{sortKey == "name" ? " ↓" : ""}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="coinSettingsSort"
                    onClick={() => setCoinSettingSort(chain, "on")}
                  >
                    on{sortKey == "on" ? " ↓" : ""}
                  </button>
                </th>
                <th>server</th>
              </tr>
            </thead>
            <tbody>
              {coins.map(({ coin, name }) => (
                <tr
                  key={coin}
                  className="coinSettingsRow"
                  onClick={() => toggleCoinEnabled(chain, coin)}
                >
                  <td>{coin}</td>
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
            </tbody>
          </table>
        </span>
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

  function AddressSettings() {
    const disabled = new Set(disabledWalletList.map(getWalletDisableKey));
    const serverDisabled = new Set(offAddrList.map(getNameDisableKey));
    const wallets = mergedWalletEntries
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

        if (walletSettingSort != "name") return a.index - b.index;

        const diff = a.label.localeCompare(b.label, undefined, {
          sensitivity: "base",
        });
        return diff || a.index - b.index;
      });

    return (
      <span
        className={`infoHover clickInfo walletAddrSettingsIcon ${
          openWalletSettings ? "infoOpen" : ""
        }`}
        onMouseLeave={() => setOpenWalletSettings(false)}
      >
        <button
          type="button"
          className="settingsIcon addrSettingsIcon"
          title="wallet address settings"
          aria-label="wallet address settings"
          onClick={() => setOpenWalletSettings((prev) => !prev)}
        >
          ⚙
        </button>
        <span className="infoCard walletAddrSettingsCard">
          <span className="infoCardTitle">Wallets</span>
          <table className="walletSettingsTable">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="coinSettingsSort"
                    onClick={() => toggleWalletSettingSort("name")}
                  >
                    wallet{walletSettingSort == "name" ? " ↓" : ""}
                  </button>
                </th>
                <th>address</th>
                <th>
                  <button
                    type="button"
                    className="coinSettingsSort"
                    onClick={() => toggleWalletSettingSort("on")}
                  >
                    on{walletSettingSort == "on" ? " ↓" : ""}
                  </button>
                </th>
                <th>server</th>
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

                return (
                  <tr
                    key={`${entry.label}:${entry.address}`}
                    className="walletSettingsRow"
                    onClick={() => toggleWalletEnabled(entry.address)}
                  >
                    <td>
                      <span className="walletSettingName">
                        <span>{entry.label}</span>
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
      </span>
    );
  }

  function BalanceCell({ chainE, row, coin }) {
    const bal = row?.balances?.[coin];

    return (
      <td>
        {bal ? (
          <>
            <div>
              {pc(bal.balance, { pc: show ? 5 : 3 })}{" "}
              {bal.usd > 0 && <span className="gray">${pc(bal.usd)}</span>}
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
        {usd > 0 ? <span>${pc(usd)}</span> : <span className="gray">-</span>}
      </td>
    );
  }

  function getTotalWalletsUsd() {
    return rows.reduce((sum, row) => sum + getTotalAssetUsd(row), 0);
  }

  function getTotalChainUsd(chain) {
    return rows.reduce((sum, row) => sum + getAssetUsd(row.chainM[chain]), 0);
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

  function getChainCoinStats(chainE) {
    const chain = chainE.chain;
    const allCoins = getAllCoins(chainE);
    const balanceCoins = allCoins.filter((coin) =>
      rows.some((row) => toNum(row.chainM[chain]?.balances?.[coin]?.balance) > 0),
    );
    const noPriceCoins = balanceCoins.filter((coin) =>
      rows.some((row) => {
        const bal = row.chainM[chain]?.balances?.[coin];
        return toNum(bal?.balance) > 0 && !(toNum(bal?.price) > 0);
      }),
    );

    return { allCoins, balanceCoins, noPriceCoins };
  }

  function AddressCell({ row }) {
    if (!row.address) return <td></td>;

    const walletNote = walletNotes?.[row.name] || "";
    const isSolana = walletType == "solana";
    const solanaScanner = chainList.find(
      (chainE) => chainE.chain == "Solana",
    )?.scanner;
    const profileUrl = isSolana
      ? getSolanaAccountUrl(solanaScanner, row.address)
      : `https://debank.com/profile/${row.address}`;
    const profileName = isSolana ? "Solscan" : "DeBank";
    const scannerLinks = chainList
      .filter((chainE) =>
        isSolana ? chainE.chain == "Solana" : chainE.chain != "Solana",
      )
      .map((chainE) => ({
        chain: chainE.chain,
        url: getScannerAccountUrl(chainE, row.address),
      }))
      .filter((e) => e.url);

    return (
      <td>
        <span
          className={`infoHover ${
            copiedAddress == row.address && copiedAddressSource == "row"
              ? "infoOpen"
              : ""
          }`}
        >
          <span>{show ? row.address : shortAddr(row.address)}</span>
          <span className="infoCard">
            <span>
              {row.name}
              {walletNote && <span className="gray">: {walletNote}</span>}
            </span>
            <CopyAddressRow address={row.address} />
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
        </span>
        {!isSolana && (
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
          <span>${pc(getTotalWalletsUsd())}</span>
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

  function CoinHeader({ chainE, coin }) {
    const coinE = chainE.coinInfoM?.[coin] ?? {};
    const address = coinE.address;
    const addressUrl = getScannerTokenUrl(chainE, address);
    const price = getCoinPrice(chainE.chain, coin);
    const sortKey = `coin:${chainE.chain}:${coin}`;
    const discoveredCoins = Array.isArray(chainE.discoveredCoins)
      ? chainE.discoveredCoins
      : [];
    const canAddCoin =
      (coinE.source == "alchemy" || discoveredCoins.includes(coin)) &&
      !!address;

    return (
      <span className="infoHover">
        <SortHeader sortKey={sortKey} className="coinSortHeader">
          <span className="coinHeaderLabel">
            <CoinIcon coin={coin} coinE={coinE} />
            <span className="coinSymbol">{coin}</span>
          </span>
        </SortHeader>
        <span className="infoCard">
          <span className="infoCardTitle">{coinE.name || coin}</span>
          {price > 0 && (
            <span>
              price: <span className="white">${pc(price)}</span>
            </span>
          )}
          <span>
            type: <span className="white">{coinE.type || "-"}</span>
          </span>
          <span>
            decimals: <span className="white">{coinE.decimals ?? "-"}</span>
          </span>
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
              </a>
            ) : (
              <span className="white">{coinE.native ? "native" : "-"}</span>
            )}
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
        </span>
      </span>
    );
  }

  function ChainSumHeader({ chainE }) {
    const { allCoins, balanceCoins, noPriceCoins } = getChainCoinStats(chainE);

    return (
      <span className="infoHover">
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
      </span>
    );
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

            <label className="gray" htmlFor="coinConfirmKey">
              coin
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

  function renderTable(children) {
    return (
      <table>
        <caption>
          <div className="tableCaptionRow">
            <span>chain:</span>
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
            <button
              className="btn small bgGray"
              onClick={nextWalletType}
              disabled={loadingWallet || !canCycleWalletType}
            >
              {">"}
            </button>
            <span className="infoHover">
              <span>wallets:</span>
              <span className="infoCard">
                <span>option 'all' excludes watch</span>
              </span>
            </span>
            <button
              className="btn small bgGray"
              onClick={prevWallet}
              disabled={loadingWallet}
            >
              {"<"}
            </button>
            <select
              value={walletSelectValue}
              onChange={selectWallet}
              disabled={loadingWallet}
            >
              {connectedWallet?.address && (
                <option value={connectedWalletValue}>
                  connected: {connectedWallet.label}{" "}
                  {shortAddr(connectedWallet.address)}
                </option>
              )}
              {effectiveSelectedWalletNotFound && (
                <option value={walletNotFoundValue}>
                  not found{requestedWallet ? `: ${requestedWallet}` : ""}
                </option>
              )}
              <option value="">favs</option>
              <option value="all">all</option>
              {specialWalletFiles.map((file) => {
                const value = getWalletValue(file);
                return (
                  <option key={file} value={value}>
                    {value}
                  </option>
                );
              })}
              {!effectiveSelectedWallet && selectedWalletName && (
                <option value={walletFilterValue}>
                  w: {selectedWalletName}
                </option>
              )}
              {!effectiveSelectedWallet && !selectedWalletName && selectedAddress && (
                <option value={walletFilterValue}>
                  addr: {shortAddr(selectedAddress)}
                </option>
              )}
              {normalWalletFiles.map((file) => {
                const value = getWalletValue(file);
                return (
                  <option key={file} value={value}>
                    {value}
                  </option>
                );
              })}
            </select>
            <button
              className="btn small bgGray"
              onClick={nextWallet}
              disabled={loadingWallet}
            >
              {">"}
            </button>
            {(loadingWallet || loadingLocalWallet) && (
              <span className="yellow">loading...</span>
            )}
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
                  walletType == "solana" ? "Solana address" : "0x..."
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
              <span className="infoHover hoverOnlyInfo">
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
                <span className="infoCard">
                  <span>Toggle on to add this address or add a new coin.</span>
                </span>
              </span>
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
                  <span className="gray">coin:</span>
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
                      customCoinChainValue == "Solana" ? "mint" : "coin addr"
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
                    {addingCoin ? "..." : "add"}
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
                <SortHeader sortKey="name">addr</SortHeader>
                <AddressSettings />
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
                    <ChainCoinSettings chainE={chainE} />
                    <ChainToggle chainE={chainE} />
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
                  (sum, chainE) => sum + Math.max(getVisibleCoins(chainE).length + 1, 1),
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
          const rowNameUrl =
            !row.source && row.address
              ? getAddressUrl(row.address)
              : getWalletNameUrl(row.name);
          const rowName = row.name || getDefaultWalletName(row.address);

          return (
            <tr key={`${row.name}:${row.address}`}>
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
                <a href={rowNameUrl}>{rowName}</a>
                {show && walletNote && (
                  <>
                    <br />
                    <span className="gray">{walletNote}</span>
                  </>
                )}
              </td>
              <AddressCell row={row} />
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
    if (!rows.length) return null;

    const noBalances = visibleChainList.every(
      (chainE) => !chainE?.coins?.length && !chainE?.error,
    );
    if (!noBalances) return null;

    return <div className="gray">no non-zero balances</div>;
  }

  return (
    <div>
      {renderTable(renderRows())}
      {!rows.length && !showLocalWalletLoading && <div className="gray">no wallets</div>}
      <NoBalanceMsg />
      {CustomCoinConfirmModal()}
    </div>
  );
}

export default Wallet;
