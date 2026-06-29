"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import {
  buildSendTx,
  executeSend,
  getTradeCoinBalance,
  getTradeCoinPrice,
} from "./act";
import {
  clampInputValue,
  cookieMaxAge,
  emitTradeChainSelect,
  fmt,
  fmtPrice,
  getChainCoins,
  getTradeModeCookie,
  getWalletOptions,
  inputQty,
  nextValue,
  normalizeQtyInput,
  priceKey,
  readQtyInput,
  sameAddress,
  sendBrowserSolanaTx,
  sendBrowserTx,
  shortAddress,
  SwapTxLink,
  tradeSendChainCookie,
  tradeSendCoinCookie,
  tradeSendToWalletCookie,
  toNum,
} from "../sharedClient";

const walletBalancePatchEvent = "w3:walletBalancePatch";

function getChainCoinCookie(base = "", walletType = "evm", chain = "") {
  return `${getTradeModeCookie(base, walletType)}_${chain}`;
}

export default function SendPanel({
  data = [],
  walletEntriesM = {},
  wallets = [],
  selectedWalletEntry,
  walletType = "evm",
  tradeType,
  tradeTypes = [],
  onTradeTypeChange,
  onCycleTradeType,
  onFromWalletChange = () => {},
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
  const [chain, setChain] = useState(chainNames[0] || "");
  const [coin, setCoin] = useState("");
  const [qty, setQty] = useState("0");
  const [fromEndDraft, setFromEndDraft] = useState("");
  const [toEndDraft, setToEndDraft] = useState("");
  const [fallbackBalanceM, setFallbackBalanceM] = useState({});
  const [balanceLoadingM, setBalanceLoadingM] = useState({});
  const [balanceErrorM, setBalanceErrorM] = useState({});
  const [fallbackPriceM, setFallbackPriceM] = useState({});
  const [priceLoadingM, setPriceLoadingM] = useState({});
  const [sendPending, setSendPending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [showToWalletMenu, setShowToWalletMenu] = useState(false);
  const toWalletPickerRef = useRef(null);
  const [fromWallet, setFromWallet] = useState(
    selectedWalletEntry?.value || "",
  );
  const [toWallet, setToWallet] = useState("");
  const chainE =
    chainList.find((entry) => entry.chain == chain) || chainList[0] || {};
  const coins = useMemo(() => getChainCoins(chainE), [chainE]);
  const fromWallets = useMemo(
    () => wallets.filter((entry) => entry?.address),
    [wallets],
  );
  const toWallets = useMemo(
    () => getWalletOptions(walletEntriesM[walletType] || [], {}, walletType),
    [walletEntriesM, walletType],
  );
  const currentToWallets = fromWallets;
  const toWalletButtonWidth = useMemo(() => {
    const maxLabelLength = Math.max(
      6,
      ...[...currentToWallets, ...toWallets].map(
        (entry) => String(entry?.label || "").length,
      ),
    );

    return `${Math.min(Math.max(maxLabelLength - 1, 1), 38)}ch`;
  }, [currentToWallets, toWallets]);
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
  const canSwitchWallets = !!loadedToEntry && !!fromEntry?.address;
  const fromBalanceKey = getBalanceKey(chain, coin, fromEntry?.address);
  const toBalanceKey = getBalanceKey(chain, coin, toEntry?.address);
  const fromHasTableBalance = hasTableBalance(chainE, coin, fromEntry);
  const toHasTableBalance = hasTableBalance(chainE, coin, toEntry);
  const fromBalance = getSelectedBalance(chainE, coin, fromEntry);
  const toBalance = getSelectedBalance(chainE, coin, toEntry);
  const fromBalanceLoading = !!balanceLoadingM[fromBalanceKey];
  const toBalanceLoading = !!balanceLoadingM[toBalanceKey];
  const fromBalanceError = balanceErrorM[fromBalanceKey] || "";
  const toBalanceError = balanceErrorM[toBalanceKey] || "";
  const maxSend = toNum(fromBalance.balance);
  const currentToBal = toNum(toBalance.balance);
  const sendQty = toNum(qty);
  const sliderValue = Math.min(sendQty, maxSend);
  const priceMKey = priceKey(chain, coin);
  const listPrice = toNum(fromBalance.price || toBalance.price);
  const fallbackPrice = fallbackPriceM[priceMKey];
  const priceLoading = !!priceLoadingM[priceMKey];
  const price = listPrice || toNum(fallbackPrice);
  const fromUsd = price ? maxSend * price : 0;
  const toUsd = price ? currentToBal * price : 0;
  const fromEnd = Math.max(0, maxSend - sendQty);
  const toEnd = currentToBal + sendQty;
  const qtyUsd = price ? sendQty * price : 0;
  const fromEndUsd = price ? fromEnd * price : 0;
  const toEndUsd = price ? toEnd * price : 0;
  const priceStatus = priceLoading
    ? "querying price..."
    : coin && listPrice <= 0 && fallbackPrice === 0
      ? `price n/a: ${coin}`
      : "";

  useEffect(() => {
    const savedChain = getCookie(
      getTradeModeCookie(tradeSendChainCookie, walletType),
    );
    if (savedChain && chainNames.includes(savedChain)) {
      setChain(savedChain);
    }
  }, [chainNames, walletType]);

  useEffect(() => {
    if (chainNames.length && !chainNames.includes(chain)) {
      setChain(chainNames[0]);
    }
  }, [chain, chainNames]);

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
    const savedEntry = [...currentToWallets, ...toWallets].find(
      (entry) =>
        entry.value == savedToWallet &&
        !sameAddress(entry.address, fromEntry?.address),
    );
    const next = savedEntry || getDefaultToWallet();
    setToWallet(next?.value || "");
  }, [
    currentToWallets,
    fromEntry?.address,
    toEntry?.address,
    toWallet,
    toWallets,
    walletType,
  ]);

  function getDefaultToWallet() {
    return (
      currentToWallets.find(
        (entry) => !sameAddress(entry.address, fromEntry?.address),
      ) || toWallets[0]
    );
  }

  useEffect(() => {
    setQty("0");
  }, [chain, coin, fromEntry?.value]);

  useEffect(() => {
    function closeToWalletMenu(e) {
      if (!toWalletPickerRef.current?.contains(e.target)) {
        setShowToWalletMenu(false);
      }
    }

    document.addEventListener("mousedown", closeToWalletMenu);

    return () => {
      document.removeEventListener("mousedown", closeToWalletMenu);
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
    getTradeCoinBalance({ chain, coin, address: fromEntry.address })
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
    getTradeCoinBalance({ chain, coin, address: toEntry.address })
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
    if (!chain || !coin || listPrice > 0) return;
    if (fallbackPrice !== undefined) return;

    let cancelled = false;
    setPriceLoadingM((priceM) => ({ ...priceM, [priceMKey]: true }));
    getTradeCoinPrice({ chain, coin })
      .then((res) => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({
          ...priceM,
          [priceMKey]: toNum(res?.price),
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setFallbackPriceM((priceM) => ({ ...priceM, [priceMKey]: 0 }));
      })
      .finally(() => {
        if (cancelled) return;
        setPriceLoadingM((priceM) => ({ ...priceM, [priceMKey]: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [chain, coin, fallbackPrice, listPrice, priceMKey]);

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

  function getBalanceKey(selectedChain = "", selectedCoin = "", address = "") {
    if (!selectedChain || !selectedCoin || !address) return "";

    return `${selectedChain}:${selectedCoin}:${String(address).toLowerCase()}`;
  }

  function findBalanceRow(chainEntry, walletEntry) {
    return chainEntry?.rows?.find(
      (entry) =>
        sameAddress(entry.address, walletEntry?.address) ||
        entry.name == walletEntry?.name,
    );
  }

  function hasTableBalance(chainEntry, selectedCoin, walletEntry) {
    const row = findBalanceRow(chainEntry, walletEntry);
    const balance = row?.balances?.[selectedCoin];

    return !!(
      row?.balances &&
      Object.prototype.hasOwnProperty.call(row.balances, selectedCoin) &&
      balance?.balance !== undefined &&
      balance?.balance !== null
    );
  }

  function getSelectedBalance(chainEntry, selectedCoin, walletEntry) {
    if (!chainEntry || !selectedCoin || !walletEntry) return {};

    const row = findBalanceRow(chainEntry, walletEntry);
    if (hasTableBalance(chainEntry, selectedCoin, walletEntry)) {
      return row.balances[selectedCoin] || {};
    }

    return (
      fallbackBalanceM[
        getBalanceKey(chainEntry.chain, selectedCoin, walletEntry.address)
      ] || {}
    );
  }

  function nextChain() {
    const next = nextValue(chainNames, chain);
    if (next) selectChain(next);
  }

  function selectChain(chain) {
    setChain(chain);
    saveSendChainCookie(chain);
    emitTradeChainSelect(chain);
  }

  function focusSelectedChain() {
    if (chain) emitTradeChainSelect(chain);
  }

  function saveSendChainCookie(chain) {
    if (!chain) return;
    setCookie(getTradeModeCookie(tradeSendChainCookie, walletType), chain, {
      maxAge: cookieMaxAge,
    });
  }

  function nextCoin() {
    const next = nextValue(coins, coin);
    if (next) selectCoin(next);
  }

  function selectCoin(coin) {
    setCoin(coin);
    saveSendCoinCookie(coin);
  }

  function saveSendCoinCookie(coin) {
    if (!chain || !coin) return;
    setCookie(getChainCoinCookie(tradeSendCoinCookie, walletType, chain), coin, {
      maxAge: cookieMaxAge,
    });
  }

  function cycleWalletSelection(list, value, direction = "next") {
    if (!list.length) return "";
    const index = list.findIndex((entry) => entry.value == value);
    if (index < 0) {
      return direction == "prev"
        ? list[list.length - 1]?.value || ""
        : list[0]?.value || "";
    }
    const nextIndex =
      direction == "prev"
        ? (index - 1 + list.length) % list.length
        : (index + 1) % list.length;

    return list[nextIndex]?.value || "";
  }

  function cycleFromWallet(direction) {
    const next = cycleWalletSelection(fromWallets, fromWallet, direction);
    if (next) selectFromWallet(next);
  }

  function cycleToWallet(direction) {
    const next = cycleWalletSelection(currentToWallets, toWallet, direction);
    if (next) selectToWallet(next);
  }

  function selectFromWallet(value, syncParent = true) {
    setFromWallet(value);
    if (syncParent) onFromWalletChange(value);
  }

  function selectToWallet(value) {
    setToWallet(value);
    saveSendToWalletCookie(value);
    setShowToWalletMenu(false);
  }

  function saveSendToWalletCookie(value) {
    const entry = [...currentToWallets, ...toWallets].find(
      (entry) => entry.value == value,
    );
    if (!entry?.address) return;
    setCookie(getTradeModeCookie(tradeSendToWalletCookie, walletType), value, {
      maxAge: cookieMaxAge,
    });
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

  function shortTail(address = "") {
    return address ? `..${String(address).slice(-3)}` : "";
  }

  function updateQty(value) {
    setQty(normalizeQtyInput(clampInputValue(value, maxSend)));
  }

  function setMaxSend() {
    updateQty(inputQty(maxSend));
  }

  function updateFromEnd(value) {
    const endQty = clampInputValue(value, maxSend);
    setFromEndDraft(readQtyInput(endQty));
    updateQty(inputQty(Math.max(0, maxSend - toNum(endQty))));
  }

  function updateToEnd(value) {
    const endQty = normalizeQtyInput(
      clampInputValue(value, maxSend + currentToBal),
    );
    setToEndDraft(readQtyInput(endQty));
    updateQty(inputQty(Math.max(0, toNum(endQty) - currentToBal)));
  }

  async function runSend() {
    if (!fromEntry?.address) {
      toast.error("sender missing");
      return;
    }
    if (!toEntry?.address) {
      toast.error("recipient missing");
      return;
    }
    if (sameAddress(fromEntry.address, toEntry.address)) {
      toast.error("sender and recipient are the same");
      return;
    }
    if (!sendQty) {
      toast.error("send qty is 0");
      return;
    }

    const useBrowserWallet = !!fromEntry.isBrowserWallet;
    if (!useBrowserWallet && !fromEntry.hasPrivateKey) {
      toast.error("no private key");
      return;
    }

    if (!useBrowserWallet) {
      const ok = window.confirm(
        `Send ${readQtyInput(qty)} ${coin} on ${chain}?\n\nfrom: ${
          fromEntry.label || fromEntry.name
        } ${shortAddress(fromEntry.address)}\nto: ${
          toEntry.label || toEntry.name
        } ${shortAddress(toEntry.address)}`,
      );
      if (!ok) return;
    }

    setSendPending(true);
    setSendResult(null);
    const toastId = toast.loading("Send: preparing tx...");
    try {
      let res;

      if (useBrowserWallet) {
        const built = await buildSendTx({
          walletAddress: fromEntry.address,
          chain,
          coin,
          amount: readQtyInput(qty),
          recipient: toEntry.address,
        });
        const txs = [];

        for (const tx of built.txs || []) {
          toast.loading(`Send: confirm ${tx.chain} ${tx.type}...`, {
            id: toastId,
          });
          txs.push(
            tx.chain == "Solana" || tx.format?.startsWith("solana:")
              ? await sendBrowserSolanaTx({
                  tx,
                  wallet: fromEntry.browserWallet,
                  address: fromEntry.address,
                })
              : await sendBrowserTx({
                  tx,
                  wallet: fromEntry.browserWallet,
                  address: fromEntry.address,
                }),
          );
        }
        res = { ...built, txs };
      } else {
        toast.loading("Send: submitting tx...", { id: toastId });
        res = await executeSend({
          walletName: fromEntry.name,
          walletAddress: fromEntry.address,
          chain,
          coin,
          amount: readQtyInput(qty),
          recipient: toEntry.address,
        });
      }

      setSendResult(res);
      toast.success(`Send submitted ${res.txs?.length || 0} tx`, {
        id: toastId,
      });
      onTxComplete({
        ...res,
        refreshTargets: [
          { chain, coin, address: fromEntry.address },
          { chain, coin, address: toEntry.address },
        ],
      });
    } catch (e) {
      const message = e?.message || "send failed";
      setSendResult({ ok: false, error: message });
      toast.error(message, { id: toastId });
    } finally {
      setSendPending(false);
    }
  }

  return (
    <div className="tradePane swapPane sendPane">
      <div className="flex tradePaneTop">
        <label htmlFor="tradeTypeSend">
          <select
            id="tradeTypeSend"
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
        <span className="selectCycle">
          <select
            value={chain}
            onChange={(e) => selectChain(e.target.value)}
            onClick={focusSelectedChain}
            onFocus={focusSelectedChain}
          >
            {chainNames.map((chainName) => (
              <option key={chainName} value={chainName}>
                {chainName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small bgGray"
            onClick={nextChain}
            disabled={chainNames.length < 2}
          >
            {">"}
          </button>
        </span>
        <span className="selectCycle">
          <select value={coin} onChange={(e) => selectCoin(e.target.value)}>
            {coins.map((coinName) => (
              <option key={coinName} value={coinName}>
                {coinName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small bgGray"
            onClick={nextCoin}
            disabled={coins.length < 2}
          >
            {">"}
          </button>
        </span>
        <span className="swapCoinPrice">
          <span className="gray">{fmtPrice(price)}</span>
          {priceStatus && <span className="gray"> {priceStatus}</span>}
        </span>
      </div>

      <div className="swapRows">
        <div className="swapBox">
          <div className="swapAssetLine">
            <span className="gray">from:</span>
            <span className="selectCycle walletCycle">
              <button
                type="button"
                className="btn small bgGray"
                onClick={() => cycleFromWallet("prev")}
                disabled={fromWallets.length < 2}
              >
                {"<"}
              </button>
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
              <button
                type="button"
                className="btn small bgGray"
                onClick={() => cycleFromWallet("next")}
                disabled={fromWallets.length < 2}
              >
                {">"}
              </button>
              <span className="gray sendWalletTail">
                {shortTail(fromEntry?.address)}
              </span>
            </span>
          </div>
          <div className="swapBalanceLine">
            <button
              type="button"
              className="tradeTextButton swapAssetBalance"
              onClick={setMaxSend}
            >
              <span className="gray">{coin}: </span>
              {fromBalanceLoading ? "..." : fmt(fromBalance.balance)}
              {fromUsd > 0 && <span className="gray"> ${fmt(fromUsd, 2)}</span>}
              {fromBalanceError && (
                <span className="red"> {fromBalanceError}</span>
              )}
            </button>
          </div>
          <div className="swapAmountLine">
            <span className="gray">end</span>
            <input
              type="number"
              min="0"
              max={maxSend || 0}
              step="any"
              value={fromEndDraft || inputQty(fromEnd)}
              onChange={(e) => updateFromEnd(e.target.value)}
              onBlur={() => setFromEndDraft("")}
            />
            {price > 0 && <span className="gray">${fmt(fromEndUsd, 2)}</span>}
          </div>
          <div className="swapAmountLine">
            <span className="gray">qty</span>
            <input
              className="sendQtyInput"
              type="number"
              min="0"
              max={maxSend || 0}
              step="any"
              value={qty}
              onChange={(e) => updateQty(e.target.value)}
            />
            {price > 0 && <span className="gray">${fmt(qtyUsd, 2)}</span>}
          </div>
        </div>

        <div className="swapMiddle">
          <div className="sendQtyControl">
            <label className="swapGasSelect">
              <span className="gray">gas:</span>
              <select value="default" disabled>
                <option value="default">default</option>
              </select>
            </label>
            <input
              className="swapMiddleRange"
              type="range"
              min="0"
              max={maxSend || 0}
              step="any"
              value={sliderValue}
              onChange={(e) => updateQty(inputQty(e.target.value))}
              disabled={!maxSend}
            />
            <button
              type="button"
              className="btn small bgGray"
              onClick={setMaxSend}
              disabled={!maxSend}
            >
              max
            </button>
            <button
              type="button"
              className="btn swapActionButton bgCyan"
              onClick={runSend}
              disabled={sendPending}
            >
              {sendPending ? "SENDING" : "SEND"}
            </button>
          </div>
        </div>

        <div className="swapBox">
          <div className="swapAssetLine">
            <span className="gray">to:</span>
            <span className="selectCycle walletCycle toWalletCycle">
              <button
                type="button"
                className="btn small bgGray"
                onClick={() => cycleToWallet("prev")}
                disabled={currentToWallets.length < 2}
              >
                {"<"}
              </button>
              <span className="sendWalletPicker" ref={toWalletPickerRef}>
                <button
                  type="button"
                  className="sendWalletPickerButton"
                  style={{ width: toWalletButtonWidth }}
                  onClick={() => setShowToWalletMenu((show) => !show)}
                >
                  {toEntry?.label || "wallet"}
                </button>
                {showToWalletMenu && (
                  <span className="sendWalletMenu">
                    <span className="sendWalletMenuCol">
                      <span className="sendWalletMenuTitle">loaded</span>
                      {currentToWallets.length ? (
                        currentToWallets.map((entry) => (
                          <button
                            key={`loaded_${entry.value}_${entry.address}`}
                            type="button"
                            className={
                              entry.value == toWallet
                                ? "sendWalletMenuItem on"
                                : "sendWalletMenuItem"
                            }
                            onClick={() => selectToWallet(entry.value)}
                          >
                            <span>{entry.label}</span>
                            <span className="gray">
                              {shortTail(entry.address)}
                            </span>
                          </button>
                        ))
                      ) : (
                        <span className="gray">-</span>
                      )}
                    </span>
                    <span className="sendWalletMenuCol">
                      <span className="sendWalletMenuTitle">all</span>
                      {toWallets.map((entry) => (
                        <button
                          key={`all_${entry.value}_${entry.address}`}
                          type="button"
                          className={
                            entry.value == toWallet
                              ? "sendWalletMenuItem on"
                              : "sendWalletMenuItem"
                          }
                          onClick={() => selectToWallet(entry.value)}
                        >
                          <span>{entry.label}</span>
                          <span className="gray">
                            {shortTail(entry.address)}
                          </span>
                        </button>
                      ))}
                    </span>
                  </span>
                )}
              </span>
              <button
                type="button"
                className="btn small bgGray"
                onClick={() => cycleToWallet("next")}
                disabled={currentToWallets.length < 2}
              >
                {">"}
              </button>
              <span className="gray sendWalletTail">
                {shortTail(toEntry?.address)}
              </span>
            </span>
          </div>
          <div className="swapBalanceLine">
            <span className="swapAssetBalance">
              <span className="gray">{coin}: </span>
              {toBalanceLoading ? "..." : fmt(toBalance.balance)}
              {toUsd > 0 && <span className="gray"> ${fmt(toUsd, 2)}</span>}
              {toBalanceError && <span className="red"> {toBalanceError}</span>}
            </span>
          </div>
          <div className="swapAmountLine">
            <span className="gray">end</span>
            <input
              type="number"
              min="0"
              max={maxSend + currentToBal || currentToBal || 0}
              step="any"
              value={toEndDraft || inputQty(toEnd)}
              onChange={(e) => updateToEnd(e.target.value)}
              onBlur={() => setToEndDraft("")}
            />
            {price > 0 && <span className="gray">${fmt(toEndUsd, 2)}</span>}
          </div>
          <div className="swapAmountLine">
            <button
              type="button"
              className="swapDownButton"
              onClick={switchWallets}
              disabled={!canSwitchWallets}
            >
              {"→"}
            </button>
          </div>
        </div>
      </div>

      {sendResult && (
        <div className="swapResult">
          {sendResult.ok ? (
            <>
              <span className="gray">Send:</span>{" "}
              {sendResult.txs?.map((tx) => (
                <SwapTxLink key={tx.hash} tx={tx} />
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
