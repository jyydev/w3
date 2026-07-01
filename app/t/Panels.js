"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCookie, setCookie } from "cookies-next";
import {
  getAllLocalCustomCoinM,
  localEditorStorageEvent,
  readLocalLineFileValues,
  readLocalWalletEntries,
  useLocalStorageEditor,
} from "../browserEditorStorage";
import { getLocalWalletBalanceData } from "../w/localWalletActions";
import {
  readStoredWallet,
  walletConnectEvent,
} from "../w/browserWalletStorage";
import { favAddrCookie, getFavAddrKey, parseFavAddrs } from "../w/favAddrs";
import LendPanel from "./_lend/Lend";
import SendPanel from "./_send/Send";
import SwapPanel from "./_swap/Swap";
import YieldPanel from "./_yield/Yield";
import { getTradeCoinBalance } from "./svShared";
import {
  cookieMaxAge,
  findWalletEntryByAddress,
  getWalletPrivateKeyFlag,
  getWalletOptions,
  sameAddress,
  tradeRightPaneCookie,
  tradeLeftPaneCookie,
  tradeRightPaneSelectCookie,
  shortAddress,
  tradeShowCookie,
} from "./clientShared";

const walletBalancePatchEvent = "w3:walletBalancePatch";

function getEntryKey(entry = {}) {
  return `${entry.source || ""}:${entry.name || ""}:${String(
    entry.address || "",
  ).toLowerCase()}`;
}

function mergeWalletEntries(...lists) {
  const seen = new Set();
  return lists
    .flat()
    .filter((entry) => entry?.name && entry?.address)
    .filter((entry) => {
      const key = getEntryKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isReservedWalletSource(source = "") {
  return String(source || "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((part) => part.replace(/\.txt$/i, "").toLowerCase() == "watch");
}

function filterReservedWalletEntries(entries = []) {
  return entries.filter((entry) => !isReservedWalletSource(entry?.source));
}

function getInitialCookie(initialCookieM = {}, name = "") {
  const value = initialCookieM?.[name];
  return value === undefined ? undefined : String(value);
}

function getBalancePatchKey({ chain = "", coin = "", address = "" } = {}) {
  return `${chain}:${coin}:${String(address || "").toLowerCase()}`;
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
          sameAddress(row.address, patch.address),
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

function emitBalancePatches(patches = []) {
  if (typeof window == "undefined" || !patches.length) return;
  window.dispatchEvent(
    new CustomEvent(walletBalancePatchEvent, {
      detail: { balances: patches },
    }),
  );
}

function getLocalSelectedWalletEntries({
  entries = [],
  favAddrs = [],
  requestedWallet = "",
  selectedAddress = "",
  selectedWallet = "",
  selectedWalletName = "",
  walletType = "evm",
} = {}) {
  const address = String(selectedAddress || "").trim();
  if (address)
    return entries.filter((entry) => sameAddress(entry.address, address));

  const name = String(selectedWalletName || "").trim();
  if (name) return entries.filter((entry) => entry.name == name);

  if (selectedWallet == "all") return filterReservedWalletEntries(entries);

  const source = String(requestedWallet || selectedWallet || "")
    .trim()
    .replace(/\/+$/, "");
  if (source) {
    return entries.filter(
      (entry) =>
        entry.source == source || entry.source?.startsWith(`${source}/`),
    );
  }

  return entries.filter((entry) =>
    favAddrs.some(
      (fav) =>
        fav.type == walletType &&
        getFavAddrKey(fav.type, fav.address) ==
          getFavAddrKey(walletType, entry.address),
    ),
  );
}

function Panels({
  data = [],
  walletData = [],
  customCoinM = {},
  disabledCoinM = {},
  offCoinM = {},
  disabledWallets = [],
  offAddrs = [],
  useAlchemy = null,
  alchemyMinUsd = 0.01,
  showGasAutoLabel = false,
  walletEntries = [],
  walletEntriesM = {},
  walletPkM = {},
  selectedAddress = "",
  selectedWalletName = "",
  selectedWallet = "",
  requestedWallet = "",
  walletType = "evm",
  initialCookieM = {},
}) {
  const router = useRouter();
  const tradeTypes = ["Swap", "Lend", "Yield", "Send"];
  const paneTypes = tradeTypes;
  const initialLeftPane = getInitialCookie(initialCookieM, tradeLeftPaneCookie);
  const initialRightPane = getInitialCookie(
    initialCookieM,
    tradeRightPaneSelectCookie,
  );
  const initialRightPaneVisible = getInitialCookie(
    initialCookieM,
    tradeRightPaneCookie,
  );
  const [connectedWallet, setConnectedWallet] = useState(null);
  const [localWalletEntriesM, setLocalWalletEntriesM] = useState({
    evm: [],
    solana: [],
  });
  const [localFavAddrs, setLocalFavAddrs] = useState([]);
  const [localCustomCoinM, setLocalCustomCoinM] = useState({});
  const [localOffAddrs, setLocalOffAddrs] = useState([]);
  const [localOffCoinM, setLocalOffCoinM] = useState({});
  const [localWalletData, setLocalWalletData] = useState(null);
  const [loadingLocalWalletData, setLoadingLocalWalletData] = useState(false);
  const [balancePatchM, setBalancePatchM] = useState({});
  const baseData = useMemo(
    () => (Array.isArray(data) ? data : data ? [data] : []),
    [data],
  );
  const walletBaseData = useMemo(
    () => (Array.isArray(walletData) ? walletData : walletData ? [walletData] : []),
    [walletData],
  );
  const baseChainNames = useMemo(
    () => baseData.map((chainE) => chainE.chain).filter(Boolean),
    [baseData],
  );
  const balanceChainNames = useMemo(
    () =>
      [
        ...new Set(
          [...baseData, ...walletBaseData]
            .map((chainE) => chainE.chain)
            .filter(Boolean),
        ),
      ],
    [baseData, walletBaseData],
  );
  const balanceChainNameKey = balanceChainNames.join("|");
  const effectiveCustomCoinM = useMemo(() => {
    const merged = { ...(customCoinM || {}) };
    for (const [chain, coins] of Object.entries(localCustomCoinM || {})) {
      merged[chain] = { ...(merged[chain] || {}), ...(coins || {}) };
    }

    return merged;
  }, [customCoinM, localCustomCoinM]);
  const effectiveData = useMemo(() => {
    const sourceData = localWalletData || baseData;
    const tradeChainSet = new Set(baseChainNames);
    const mergedData = sourceData
      .filter((chainE) => tradeChainSet.has(chainE.chain))
      .map((chainE) => {
        const localCoins = effectiveCustomCoinM[chainE.chain] || {};
        const localCoinNames = Object.keys(localCoins);
        if (!localCoinNames.length) return chainE;

        return {
          ...chainE,
          allCoins: [...new Set([...(chainE.allCoins || []), ...localCoinNames])],
          coins: [...new Set([...(chainE.coins || []), ...localCoinNames])],
          coinInfoM: {
            ...(chainE.coinInfoM || {}),
            ...localCoins,
          },
        };
      });

    return applyBalancePatches(mergedData, balancePatchM);
  }, [balancePatchM, baseChainNames, baseData, effectiveCustomCoinM, localWalletData]);
  const effectiveYieldData = useMemo(() => {
    const sourceData = localWalletData || walletBaseData;
    const hyperliquidE = sourceData.find((chainE) => chainE.chain == "Hyperliquid");
    if (!hyperliquidE) return effectiveData;

    const hasHyperliquid = effectiveData.some(
      (chainE) => chainE.chain == "Hyperliquid",
    );
    return hasHyperliquid ? effectiveData : [...effectiveData, hyperliquidE];
  }, [effectiveData, localWalletData, walletBaseData]);
  const effectiveWalletEntriesM = useMemo(
    () => ({
      evm: mergeWalletEntries(
        walletEntriesM.evm || [],
        filterReservedWalletEntries(localWalletEntriesM.evm || []),
      ),
      solana: mergeWalletEntries(
        walletEntriesM.solana || [],
        filterReservedWalletEntries(localWalletEntriesM.solana || []),
      ),
    }),
    [walletEntriesM, localWalletEntriesM],
  );
  const localSelectedWalletEntries = useMemo(
    () =>
      getLocalSelectedWalletEntries({
        entries: localWalletEntriesM[walletType] || [],
        favAddrs: localFavAddrs,
        requestedWallet,
        selectedAddress,
        selectedWallet,
        selectedWalletName,
        walletType,
      }),
    [
      localWalletEntriesM,
      localFavAddrs,
      requestedWallet,
      selectedAddress,
      selectedWallet,
      selectedWalletName,
      walletType,
    ],
  );
  const effectiveWalletEntries = useMemo(
    () => mergeWalletEntries(walletEntries, localSelectedWalletEntries),
    [walletEntries, localSelectedWalletEntries],
  );
  const wallets = useMemo(() => {
    const entries = getWalletOptions(
      effectiveWalletEntries,
      walletPkM,
      walletType,
    );
    const showConnectedEntry =
      connectedWallet?.address &&
      selectedAddress &&
      sameAddress(connectedWallet.address, selectedAddress);
    const connectedSavedEntry = showConnectedEntry
      ? findWalletEntryByAddress(
          [
            ...entries,
            ...(effectiveWalletEntriesM[connectedWallet.type] || []),
          ],
          connectedWallet.address,
        )
      : null;
    const connectedEntry = showConnectedEntry
      ? {
          value: `connected:${connectedWallet.type}:${connectedWallet.address}`,
          name: "connected",
          savedName: connectedSavedEntry?.name || "",
          label: `${connectedWallet.label} ..${connectedWallet.address.slice(-3)}`,
          address: connectedWallet.address,
          hasPrivateKey: false,
          isBrowserWallet: true,
          browserWallet: connectedWallet.wallet,
          type: connectedWallet.type,
        }
      : null;
    const withConnected = connectedEntry
      ? [
          connectedEntry,
          ...entries.filter(
            (entry) =>
              !sameAddress(entry.address, connectedEntry.address) ||
              (selectedWalletName && entry.name == selectedWalletName),
          ),
        ]
      : entries;

    if (withConnected.length) return withConnected;

    const fallbackName = selectedWalletName || "addr";

    if (selectedAddress) {
      return [
        {
          value: fallbackName,
          name: fallbackName,
          label: selectedWalletName || selectedAddress,
          address: selectedAddress,
          hasPrivateKey: getWalletPrivateKeyFlag(
            walletPkM,
            walletType,
            fallbackName,
          ),
          type: walletType,
        },
      ];
    }

    return [
      {
        value: selectedWallet || "wallet",
        name: selectedWallet || "wallet",
        label: selectedWallet || "wallet",
        address: "",
        hasPrivateKey: getWalletPrivateKeyFlag(
          walletPkM,
          walletType,
          selectedWallet || "wallet",
        ),
        type: walletType,
      },
    ];
  }, [
    selectedAddress,
    selectedWallet,
    selectedWalletName,
    connectedWallet,
    effectiveWalletEntries,
    effectiveWalletEntriesM,
    walletPkM,
    walletType,
  ]);
  const [show, setShow] = useState(
    () => getInitialCookie(initialCookieM, tradeShowCookie) == "1",
  );
  const [tradeType, setTradeType] = useState(() =>
    tradeTypes.includes(initialLeftPane) ? initialLeftPane : tradeTypes[0],
  );
  const [showRightPane, setShowRightPane] = useState(() =>
    initialRightPaneVisible === undefined
      ? false
      : initialRightPaneVisible == "1",
  );
  const [pane, setPane] = useState(
    () =>
      paneTypes.includes(initialRightPane)
        ? initialRightPane
        : paneTypes.includes("Lend")
          ? "Lend"
          : paneTypes[0],
  );
  const [paneCookiesLoaded, setPaneCookiesLoaded] = useState(false);
  const [wallet, setWallet] = useState(wallets[0]?.value || "");
  const [connectedAutoSelected, setConnectedAutoSelected] = useState(false);
  const selectedIndex = Math.max(
    0,
    wallets.findIndex((entry) => entry.value == wallet),
  );
  const selectedWalletEntry = wallets[selectedIndex] || wallets[0];
  const selectedSavedWalletEntry = selectedWalletEntry?.isBrowserWallet
    ? findWalletEntryByAddress(
        [
          ...(effectiveWalletEntriesM[selectedWalletEntry.type || walletType] ||
            []),
          ...effectiveWalletEntries,
        ],
        selectedWalletEntry.address,
      )
    : null;
  const browserSignerReady = selectedWalletEntry?.isBrowserWallet;
  const privateKeyMissing =
    !!selectedWalletEntry?.address &&
    !selectedWalletEntry.hasPrivateKey &&
    !selectedWalletEntry.isBrowserWallet;

  useEffect(() => {
    if (!useLocalStorageEditor()) {
      setLocalWalletEntriesM({ evm: [], solana: [] });
      setLocalFavAddrs([]);
      setLocalCustomCoinM({});
      setLocalOffAddrs([]);
      setLocalOffCoinM({});
      setLocalWalletData(null);
      return;
    }

    function loadLocalWalletEntries() {
      setLocalWalletEntriesM({
        evm: readLocalWalletEntries("evm", "", { includeReserved: true }),
        solana: readLocalWalletEntries("solana", "", { includeReserved: true }),
      });
      setLocalFavAddrs(parseFavAddrs(getCookie(favAddrCookie)));
      setLocalCustomCoinM(getAllLocalCustomCoinM(balanceChainNames));
      setLocalOffAddrs(readLocalLineFileValues("cookie/offAddr.txt"));
      setLocalOffCoinM(
        Object.fromEntries(
          balanceChainNames
            .map((chain) => [
              chain,
              readLocalLineFileValues(`cookie/offCoins/${chain}.txt`),
            ])
            .filter(([, coins]) => coins.length),
        ),
      );
    }

    loadLocalWalletEntries();
    window.addEventListener(localEditorStorageEvent, loadLocalWalletEntries);
    window.addEventListener("storage", loadLocalWalletEntries);
    return () => {
      window.removeEventListener(
        localEditorStorageEvent,
        loadLocalWalletEntries,
      );
      window.removeEventListener("storage", loadLocalWalletEntries);
    };
  }, [balanceChainNameKey]);

  useEffect(() => {
    setLocalWalletData(null);
    if (!useLocalStorageEditor() || !localSelectedWalletEntries.length) {
      setLoadingLocalWalletData(false);
      return;
    }

    let cancelled = false;
    setLoadingLocalWalletData(true);
    getLocalWalletBalanceData({
      walletType,
      walletEntries: localSelectedWalletEntries,
      chains: balanceChainNames,
      customCoinM: effectiveCustomCoinM,
      disabledCoinM: Object.fromEntries(
        balanceChainNames.map((chain) => [
          chain,
          [
            ...(disabledCoinM?.[chain] || []),
            ...(offCoinM?.[chain] || []),
            ...(localOffCoinM?.[chain] || []),
          ],
        ]),
      ),
      disabledWallets,
      disabledWalletNames: [...(offAddrs || []), ...localOffAddrs],
      useAlchemy,
      alchemyMinUsd,
    })
      .then((nextData) => {
        if (!cancelled) setLocalWalletData(nextData);
      })
      .catch((e) => {
        if (!cancelled) console.error(e);
      })
      .finally(() => {
        if (!cancelled) setLoadingLocalWalletData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    walletType,
    localSelectedWalletEntries,
    balanceChainNameKey,
    JSON.stringify(effectiveCustomCoinM),
    JSON.stringify(disabledCoinM),
    JSON.stringify(offCoinM),
    JSON.stringify(localOffCoinM),
    JSON.stringify(disabledWallets),
    JSON.stringify(offAddrs),
    JSON.stringify(localOffAddrs),
    useAlchemy,
    alchemyMinUsd,
  ]);

  useEffect(() => {
    const loadConnectedWallet = () =>
      setConnectedWallet(readStoredWallet(walletType));

    loadConnectedWallet();
    window.addEventListener(walletConnectEvent, loadConnectedWallet);

    return () => {
      window.removeEventListener(walletConnectEvent, loadConnectedWallet);
    };
  }, [walletType]);

  useEffect(() => {
    if (selectedWalletName) {
      const selectedNameEntry = wallets.find(
        (entry) => !entry.isBrowserWallet && entry.name == selectedWalletName,
      );
      if (selectedNameEntry && wallet != selectedNameEntry.value) {
        setWallet(selectedNameEntry.value);
        return;
      }
    }

    const connectedEntry = wallets.find((entry) => entry.isBrowserWallet);
    if (
      connectedEntry &&
      !connectedAutoSelected &&
      selectedAddress &&
      sameAddress(connectedEntry.address, selectedAddress) &&
      wallet != connectedEntry.value
    ) {
      setConnectedAutoSelected(true);
      setWallet(connectedEntry.value);
      return;
    }

    if (!wallets.some((entry) => entry.value == wallet)) {
      setWallet(wallets[0]?.value || "");
    }
  }, [
    connectedAutoSelected,
    selectedAddress,
    selectedWalletName,
    wallet,
    wallets,
  ]);

  useEffect(() => {
    setConnectedAutoSelected(false);
  }, [connectedWallet?.address, selectedAddress]);

  useEffect(() => {
    setShow(getCookie(tradeShowCookie) == "1");
    const rightPaneCookie = getCookie(tradeRightPaneCookie);
    if (rightPaneCookie !== undefined) {
      setShowRightPane(rightPaneCookie == "1");
    }
    const leftPaneCookie = getCookie(tradeLeftPaneCookie);
    const rightPaneSelectCookie = getCookie(tradeRightPaneSelectCookie);
    if (tradeTypes.includes(leftPaneCookie)) setTradeType(leftPaneCookie);
    if (paneTypes.includes(rightPaneSelectCookie))
      setPane(rightPaneSelectCookie);
    setPaneCookiesLoaded(true);
  }, []);

  useEffect(() => {
    if (!paneCookiesLoaded || !tradeTypes.includes(tradeType)) return;
    setCookie(tradeLeftPaneCookie, tradeType, {
      maxAge: cookieMaxAge,
    });
  }, [paneCookiesLoaded, tradeType]);

  useEffect(() => {
    if (!paneCookiesLoaded || !paneTypes.includes(pane)) return;
    setCookie(tradeRightPaneSelectCookie, pane, {
      maxAge: cookieMaxAge,
    });
  }, [pane, paneCookiesLoaded]);

  function cycleWallet(direction) {
    if (wallets.length < 2) return;
    const nextIndex =
      direction == "prev"
        ? (selectedIndex - 1 + wallets.length) % wallets.length
        : (selectedIndex + 1) % wallets.length;
    setWallet(wallets[nextIndex].value);
  }

  function cycleTradeType() {
    setTradeType(
      tradeTypes[(tradeTypes.indexOf(tradeType) + 1) % tradeTypes.length],
    );
  }

  function cyclePane() {
    setPane(paneTypes[(paneTypes.indexOf(pane) + 1) % paneTypes.length]);
  }

  function toggleShow(checked) {
    setShow(checked);
    setCookie(tradeShowCookie, checked ? "1" : "0", {
      maxAge: cookieMaxAge,
    });
  }

  function toggleRightPane(checked) {
    setShowRightPane(checked);
    setCookie(tradeRightPaneCookie, checked ? "1" : "0", {
      maxAge: cookieMaxAge,
    });
  }

  const refreshWalletBalances = useCallback((res = {}) => {
    const rawTargets = Array.isArray(res?.refreshTargets)
      ? res.refreshTargets
      : [];
    const targetM = new Map();

    for (const target of rawTargets) {
      const clean = {
        chain: String(target?.chain || "").trim(),
        coin: String(target?.coin || "").trim(),
        address: String(target?.address || "").trim(),
      };
      if (target?.coinE && typeof target.coinE == "object") {
        const decimals = Number(target.coinE.decimals);
        clean.coinE = {
          address: target.coinE.address ? String(target.coinE.address) : "",
          native: !!target.coinE.native,
        };
        if (Number.isInteger(decimals)) clean.coinE.decimals = decimals;
      }
      const key = getBalancePatchKey(clean);
      if (clean.chain && clean.coin && clean.address && !targetM.has(key)) {
        targetM.set(key, clean);
      }
    }

    const targets = [...targetM.values()];
    if (!targets.length || targets.some((target) => target.chain == "Hyperliquid")) {
      router.refresh();
      return;
    }

    const txs = Array.isArray(res?.txs) ? res.txs : [];
    const hasSolanaTx =
      txs.some((tx) => tx?.chain == "Solana") ||
      targets.some((target) => target.chain == "Solana");
    const delays = hasSolanaTx ? [0, 2500, 7000, 14000] : [0, 4000];

    async function refreshTargets() {
      const patches = (
        await Promise.all(
          targets.map(async (target) => {
            try {
              const balance = await getTradeCoinBalance(target);
              return { ...target, balance };
            } catch (e) {
              console.error(e);
              return null;
            }
          }),
        )
      ).filter(Boolean);

      if (!patches.length) return;
      setBalancePatchM((patchM) => {
        const next = { ...patchM };
        for (const patch of patches) {
          next[getBalancePatchKey(patch)] = patch;
        }
        return next;
      });
      emitBalancePatches(patches);
    }

    delays.forEach((delay) => {
      if (delay) setTimeout(refreshTargets, delay);
      else refreshTargets();
    });
  }, [router]);

  function renderTradePane(panelType, setPanelType, cyclePanelType) {
    return panelType == "Swap" ? (
      <SwapPanel
        data={effectiveData}
        walletEntriesM={effectiveWalletEntriesM}
        selectedWalletEntry={selectedWalletEntry}
        walletType={walletType}
        initialCookieM={initialCookieM}
        tradeType={panelType}
        tradeTypes={tradeTypes}
        onTradeTypeChange={setPanelType}
        onCycleTradeType={cyclePanelType}
        showGasAutoLabel={showGasAutoLabel}
        onTxComplete={refreshWalletBalances}
      />
    ) : panelType == "Lend" ? (
      <LendPanel
        data={effectiveData}
        selectedWalletEntry={selectedWalletEntry}
        walletType={walletType}
        initialCookieM={initialCookieM}
        tradeType={panelType}
        tradeTypes={tradeTypes}
        onTradeTypeChange={setPanelType}
        onCycleTradeType={cyclePanelType}
        showGasAutoLabel={showGasAutoLabel}
        onTxComplete={refreshWalletBalances}
      />
    ) : panelType == "Yield" ? (
      <YieldPanel
        data={effectiveYieldData}
        selectedWalletEntry={selectedWalletEntry}
        walletType={walletType}
        initialCookieM={initialCookieM}
        tradeType={panelType}
        tradeTypes={tradeTypes}
        onTradeTypeChange={setPanelType}
        onCycleTradeType={cyclePanelType}
        showGasAutoLabel={showGasAutoLabel}
        onTxComplete={refreshWalletBalances}
      />
    ) : panelType == "Send" ? (
      <SendPanel
        data={effectiveData}
        walletEntriesM={effectiveWalletEntriesM}
        wallets={wallets}
        selectedWalletEntry={selectedWalletEntry}
        walletType={walletType}
        initialCookieM={initialCookieM}
        tradeType={panelType}
        tradeTypes={tradeTypes}
        onTradeTypeChange={setPanelType}
        onCycleTradeType={cyclePanelType}
        onFromWalletChange={setWallet}
        showGasAutoLabel={showGasAutoLabel}
        onTxComplete={refreshWalletBalances}
      />
    ) : null;
  }

  return (
    <div className="stickyB p-2 mxWidth tradePanel">
      <div className="stickyL w-screen tradePanelInner">
        <div className="flex tradePanelBar">
          <label className="switch">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => toggleShow(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
          <span className="gray">Trade</span>
          <label htmlFor="tradeWallet">
            {wallets.length != 1 && (
              <button
                type="button"
                className="btn small bgGray"
                onClick={() => cycleWallet("prev")}
              >
                {"<"}
              </button>
            )}
            <select
              id="tradeWallet"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
            >
              {wallets.map((entry) => (
                <option
                  key={`${entry.value}_${entry.address}`}
                  value={entry.value}
                >
                  {entry.label}
                </option>
              ))}
            </select>
            {wallets.length != 1 && (
              <button
                type="button"
                className="btn small bgGray"
                onClick={() => cycleWallet("next")}
              >
                {">"}
              </button>
            )}
          </label>
          {!!selectedWalletEntry?.address && (
            <span className="infoHover hoverOnlyInfo tradeWalletAddress">
              <span className="gray">
                {shortAddress(selectedWalletEntry.address)}
              </span>
              {selectedSavedWalletEntry?.name && (
                <span className="gray">{selectedSavedWalletEntry.name}</span>
              )}
              <span className="infoCard">
                <span className="infoCardTitle">
                  {selectedWalletEntry.label || selectedWalletEntry.name}
                </span>
                {selectedSavedWalletEntry?.name && (
                  <span>
                    wallet:{" "}
                    <span className="white">
                      {selectedSavedWalletEntry.name}
                    </span>
                  </span>
                )}
                <span className="gray swapHashFull">
                  {selectedWalletEntry.address}
                </span>
              </span>
            </span>
          )}
          <span className="tradePaneControls">
            <label
              className="switch small tradePaneSwitch"
              aria-label="show right pane"
            >
              <input
                type="checkbox"
                checked={showRightPane}
                onChange={(e) => toggleRightPane(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
            <label htmlFor="tradePane">
              <span className="gray">pane:</span>
              <select
                id="tradePane"
                value={pane}
                onChange={(e) => setPane(e.target.value)}
              >
                {paneTypes.map((paneType) => (
                  <option key={paneType} value={paneType}>
                    {paneType}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn small bgGray"
                onClick={cyclePane}
              >
                {">"}
              </button>
            </label>
          </span>
          {browserSignerReady && <span className="gray">browser wallet</span>}
          {loadingLocalWalletData && (
            <span className="yellow">loading balance...</span>
          )}
          {privateKeyMissing && <span className="red">no private key</span>}
        </div>
        {show && (
          <div className="flex gap2 tradePanelBody">
            {renderTradePane(tradeType, setTradeType, cycleTradeType)}
            {showRightPane && renderTradePane(pane, setPane, cyclePane)}
          </div>
        )}
      </div>
    </div>
  );
}

export default Panels;
