"use client";

import { useEffect, useMemo, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import {
  localEditorStorageEvent,
  readLocalWalletEntries,
  useLocalStorageEditor,
} from "../browserEditorStorage";
import { readStoredWallet, walletConnectEvent } from "../w/browserWalletStorage";
import { favAddrCookie, getFavAddrKey, parseFavAddrs } from "../w/favAddrs";
import LendPanel from "./_lend/Lend";
import SendPanel from "./_send/Send";
import SwapPanel from "./_swap/Swap";
import {
  cookieMaxAge,
  findWalletEntryByAddress,
  getWalletPrivateKeyFlag,
  getWalletOptions,
  sameAddress,
  shortAddress,
  tradeShowCookie,
} from "./sharedClient";

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
  if (address) return entries.filter((entry) => sameAddress(entry.address, address));

  const name = String(selectedWalletName || "").trim();
  if (name) return entries.filter((entry) => entry.name == name);

  if (selectedWallet == "all") return filterReservedWalletEntries(entries);

  const source = String(requestedWallet || selectedWallet || "")
    .trim()
    .replace(/\/+$/, "");
  if (source) {
    return entries.filter(
      (entry) => entry.source == source || entry.source?.startsWith(`${source}/`),
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

function TradePanels({
  data = [],
  walletEntries = [],
  walletEntriesM = {},
  walletPkM = {},
  selectedAddress = "",
  selectedWalletName = "",
  selectedWallet = "",
  requestedWallet = "",
  walletType = "evm",
}) {
  const tradeTypes = ["Swap", "Lend", "Send", "Approve"];
  const paneTypes = ["Wallet", "Order", "History", "Risk"];
  const [connectedWallet, setConnectedWallet] = useState(null);
  const [localWalletEntriesM, setLocalWalletEntriesM] = useState({
    evm: [],
    solana: [],
  });
  const [localFavAddrs, setLocalFavAddrs] = useState([]);
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
    const entries = getWalletOptions(effectiveWalletEntries, walletPkM, walletType);
    const showConnectedEntry =
      connectedWallet?.address &&
      selectedAddress &&
      sameAddress(connectedWallet.address, selectedAddress);
    const connectedSavedEntry = showConnectedEntry
      ? findWalletEntryByAddress(
          [...entries, ...(effectiveWalletEntriesM[connectedWallet.type] || [])],
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
  const [show, setShow] = useState(false);
  const [tradeType, setTradeType] = useState(tradeTypes[0]);
  const [pane, setPane] = useState(paneTypes[0]);
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
          ...(effectiveWalletEntriesM[selectedWalletEntry.type || walletType] || []),
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
      return;
    }

    function loadLocalWalletEntries() {
      setLocalWalletEntriesM({
        evm: readLocalWalletEntries("evm", "", { includeReserved: true }),
        solana: readLocalWalletEntries("solana", "", { includeReserved: true }),
      });
      setLocalFavAddrs(parseFavAddrs(getCookie(favAddrCookie)));
    }

    loadLocalWalletEntries();
    window.addEventListener(localEditorStorageEvent, loadLocalWalletEntries);
    window.addEventListener("storage", loadLocalWalletEntries);
    return () => {
      window.removeEventListener(localEditorStorageEvent, loadLocalWalletEntries);
      window.removeEventListener("storage", loadLocalWalletEntries);
    };
  }, []);

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
  }, []);

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
          {browserSignerReady && <span className="gray">browser wallet</span>}
          {privateKeyMissing && <span className="red">no private key</span>}
        </div>
        {show && (
          <div className="flex gap2 tradePanelBody">
            {tradeType == "Swap" ? (
              <SwapPanel
                data={data}
                walletEntriesM={effectiveWalletEntriesM}
                selectedWalletEntry={selectedWalletEntry}
                walletType={walletType}
                tradeType={tradeType}
                tradeTypes={tradeTypes}
                onTradeTypeChange={setTradeType}
                onCycleTradeType={cycleTradeType}
              />
            ) : tradeType == "Lend" ? (
              <LendPanel
                data={data}
                selectedWalletEntry={selectedWalletEntry}
                tradeType={tradeType}
                tradeTypes={tradeTypes}
                onTradeTypeChange={setTradeType}
                onCycleTradeType={cycleTradeType}
              />
            ) : tradeType == "Send" ? (
              <SendPanel
                data={data}
                walletEntriesM={effectiveWalletEntriesM}
                wallets={wallets}
                selectedWalletEntry={selectedWalletEntry}
                walletType={walletType}
                tradeType={tradeType}
                tradeTypes={tradeTypes}
                onTradeTypeChange={setTradeType}
                onCycleTradeType={cycleTradeType}
                onFromWalletChange={setWallet}
              />
            ) : (
              <div className="tradePane">
                <label htmlFor="tradeTypeLeft">
                  <span className="gray">trade:</span>
                  <select
                    id="tradeTypeLeft"
                    value={tradeType}
                    onChange={(e) => setTradeType(e.target.value)}
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
                    onClick={cycleTradeType}
                  >
                    {">"}
                  </button>
                </label>
                <div>
                  <span className="gray">chain:</span> {walletType}
                </div>
                <div>
                  <span className="gray">wallet:</span>{" "}
                  {selectedWalletEntry?.label || "-"}
                </div>
              </div>
            )}
            <div className="tradePane">
              <div>
                <span className="gray">right pane:</span> {pane}
              </div>
              <div>
                <span className="gray">wallet:</span>{" "}
                {selectedWalletEntry?.label || "-"}
              </div>
              <div>
                <span className="gray">address:</span>{" "}
                {selectedWalletEntry?.address || "-"}
              </div>
              <div className="gray">quote/execution panel placeholder</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TradePanels;
