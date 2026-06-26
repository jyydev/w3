"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  buildAcrossSwapTxs,
  buildRelaySwapSteps,
  buildUniswapSwapTxs,
  executeAcrossSwap,
  executeRelaySwap,
  executeUniswapSwap,
  getAcrossSwapPreview,
  getRelaySwapPreview,
  getTradeCoinBalance,
  getTradeCoinPrice,
  getUniswapSwapPreview,
} from "./act";
import {
  clampInputValue,
  dexOptions,
  fmt,
  fmtPrice,
  fmtRate,
  getChainCoins,
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
  toNum,
} from "../sharedClient";

export default function SwapPanel({
  data = [],
  walletEntriesM = {},
  selectedWalletEntry,
  walletType = "evm",
  tradeType,
  tradeTypes = [],
  onTradeTypeChange,
  onCycleTradeType,
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
  const [defi, setDefi] = useState(dexOptions[0]?.value || "");
  const [fromChain, setFromChain] = useState(sellChainNames[0] || "");
  const [toChain, setToChain] = useState(chainNames[0] || "");
  const [fromCoin, setFromCoin] = useState("");
  const [toCoin, setToCoin] = useState("");
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
  const recipientDefaultKeyRef = useRef("");
  const [recipientBalanceE, setRecipientBalanceE] = useState({
    key: "",
    balance: {},
    loading: false,
    error: "",
  });
  const defiE = dexOptions.find((entry) => entry.value == defi) || noDex;
  const fromChainE =
    chainList.find((chainE) => chainE.chain == fromChain) || chainList[0];
  const toChainE =
    chainList.find((chainE) => chainE.chain == toChain) || fromChainE;
  const fromCoins = useMemo(() => getChainCoins(fromChainE), [fromChainE]);
  const toCoins = useMemo(() => getChainCoins(toChainE), [toChainE]);
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
  const needsPrivateKey = ["relay", "uniswap", "across"].includes(defi);
  const canBrowserSignEvm =
    selectedWalletEntry?.isBrowserWallet && selectedWalletEntry?.type == "evm";
  const canBrowserSignSolana =
    selectedWalletEntry?.isBrowserWallet &&
    selectedWalletEntry?.type == "solana" &&
    ["relay", "across"].includes(defi);
  const canBrowserSign = canBrowserSignEvm || canBrowserSignSolana;
  const swapCanExecute =
    !needsPrivateKey || !!selectedWalletEntry?.hasPrivateKey || canBrowserSign;
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

  useEffect(() => {
    if (!chainNames.length) return;
    if (sellChainNames.length && !sellChainNames.includes(fromChain)) {
      setFromChain(sellChainNames[0]);
    }
    if (!chainNames.includes(toChain)) setToChain(chainNames[0]);
  }, [chainNames, fromChain, sellChainNames, toChain]);

  useEffect(() => {
    if (!defiE.bridge && fromChain && toChain != fromChain) {
      setToChain(fromChain);
    }
  }, [defiE.bridge, fromChain, toChain]);

  useEffect(() => {
    if (fromCoins.length && !fromCoins.includes(fromCoin)) {
      setFromCoin(fromCoins[0]);
    } else if (!fromCoins.length && fromCoin) {
      setFromCoin("");
    }
  }, [fromCoin, fromCoins]);

  useEffect(() => {
    if (toCoins.length && !toCoins.includes(toCoin)) {
      setToCoin(toCoins[0]);
    } else if (!toCoins.length && toCoin) {
      setToCoin("");
    }
  }, [toCoin, toCoins]);

  useEffect(() => {
    const qty = inputQty(fromBalance.balance);
    setQtyInputSide("sell");
    setFromQty(qty);
    setToQty(swapRate > 0 ? inputQty(toNum(qty) * swapRate) : "0");
  }, [selectedWalletEntry?.value, fromChain, fromCoin, fromBalance.balance]);

  useEffect(() => {
    if (swapRate <= 0) {
      if (qtyInputSide == "buy") setFromQty("0");
      else setToQty("0");
      return;
    }

    if (qtyInputSide == "buy") {
      setFromQty(inputQty(toNum(toQty) / swapRate));
    } else {
      setToQty(inputQty(toNum(fromQty) * swapRate));
    }
  }, [fromChain, fromCoin, qtyInputSide, swapRate, toChain, toCoin]);

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
    if (!["relay", "uniswap", "across"].includes(defi)) {
      toast(`${defiE.label}: swap not wired yet`);
      return;
    }
    const useBrowserEvmWallet =
      selectedWalletEntry?.isBrowserWallet &&
      selectedWalletEntry?.type == "evm";
    const useBrowserSolanaWallet =
      selectedWalletEntry?.isBrowserWallet &&
      selectedWalletEntry?.type == "solana" &&
      defi == "relay";
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
    if (fromChain == "Solana" && !["relay", "across"].includes(defi)) {
      toast.error(`${defiE.label} is not available for Solana-origin swaps`);
      return;
    }
    if (defi == "across" && fromChain == toChain) {
      toast.error(
        "Across is for cross-chain swaps; choose a different buy chain",
      );
      return;
    }
    if (!sellQty) {
      toast.error("sell qty is 0");
      return;
    }

    const toAddress = isSolanaBridge ? recipient : selectedWalletEntry.address;
    if (!useBrowserWallet) {
      const ok = window.confirm(
        `Execute ${defiE.label} swap?\n\nwallet: ${swapWalletLabel}\nsell: ${fromQty} ${fromCoin} on ${fromChain}\nbuy: ${toCoin} on ${toChain}\nrecipient: ${toAddress}`,
      );
      if (!ok) return;
    }

    setSwapPending(true);
    setSwapResult(null);
    const toastId = toast.loading(`${defiE.label}: preparing swap...`);
    try {
      let res;
      if (defi == "relay") {
        toast.loading(`${defiE.label}: submitting tx...`, { id: toastId });
        if (useBrowserWallet) {
          const built = await buildRelaySwapSteps({
            walletAddress: selectedWalletEntry.address,
            fromChain,
            toChain,
            fromCoin,
            toCoin,
            amount: readQtyInput(fromQty),
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
              if (useBrowserSolanaWallet) {
                throw new Error("Relay Solana signature step is not supported");
              }
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
            amount: readQtyInput(fromQty),
            recipient: toAddress,
          });
          let approvalAmount = "";

          if (preview.approvalNeeded) {
            approvalAmount = window.prompt(
              `Approval needed for ${fromCoin}.\n\nEnter approval qty.\nSell qty: ${readQtyInput(fromQty)}`,
              readQtyInput(fromQty),
            );
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
            amount: readQtyInput(fromQty),
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
            amount: readQtyInput(fromQty),
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
            amount: readQtyInput(fromQty),
            recipient: toAddress,
          });
          let approvalAmount = "";

          if (preview.approvalNeeded) {
            approvalAmount = window.prompt(
              `Approval needed for ${fromCoin}.\n\nEnter approval qty.\nSell qty: ${readQtyInput(fromQty)}`,
              readQtyInput(fromQty),
            );
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
            amount: readQtyInput(fromQty),
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
            amount: readQtyInput(fromQty),
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
            amount: readQtyInput(fromQty),
          });
          let approvalAmount = "";

          if (preview.approvalNeeded) {
            approvalAmount = window.prompt(
              `Approval needed for ${fromCoin}.\n\nEnter approval qty.\nSell qty: ${readQtyInput(fromQty)}`,
              readQtyInput(fromQty),
            );
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
            amount: readQtyInput(fromQty),
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
    } catch (e) {
      const message = e?.message || `${defiE.label} swap failed`;
      setSwapResult({ ok: false, error: message });
      toast.error(message, { id: toastId });
    } finally {
      setSwapPending(false);
    }
  }

  function setMaxSell() {
    updateSellQty(inputQty(maxSell));
  }

  function getBuyQty(value) {
    return swapRate > 0 ? inputQty(toNum(value) * swapRate) : "0";
  }

  function getSellQty(value) {
    return swapRate > 0 ? inputQty(toNum(value) / swapRate) : "0";
  }

  function updateSellQty(value) {
    const qty = normalizeQtyInput(clampInputValue(value, maxSell));
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
    const endQty = clampInputValue(value, maxSell);
    setSellEndDraft(readQtyInput(endQty));
    updateSellQty(inputQty(Math.max(0, maxSell - toNum(endQty))));
  }

  function updateBuyEnd(value) {
    const endQty = normalizeQtyInput(clampInputValue(value, maxBuyEnd));
    setBuyEndDraft(readQtyInput(endQty));
    updateBuyQty(inputQty(Math.max(0, toNum(endQty) - maxBuy)));
  }

  function nextFromChain() {
    const next = nextValue(sellChainNames, fromChain);
    if (next) setFromChain(next);
  }

  function nextToChain() {
    const next = nextValue(chainNames, toChain);
    if (next) setToChain(next);
  }

  function nextFromCoin() {
    const next = nextValue(fromCoins, fromCoin);
    if (next) setFromCoin(next);
  }

  function nextToCoin() {
    const next = nextValue(toCoins, toCoin);
    if (next) setToCoin(next);
  }

  function nextDex() {
    const next = nextValue(
      dexOptions.map((option) => option.value),
      defi,
    );
    if (next) setDefi(next);
  }

  function reverseRoute() {
    if (defiE.bridge) {
      setFromChain(toChain);
      setToChain(fromChain);
    }
    setFromCoin(toCoin);
    setToCoin(fromCoin);
    setQtyInputSide("sell");
    setFromQty(inputQty(toBalance.balance));
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
            value={defi}
            onChange={(e) => setDefi(e.target.value)}
          >
            {dexOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn nx bgGray"
            onClick={nextDex}
            disabled={dexOptions.length < 2}
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
            <span className="selectCycle">
              <select
                value={fromChain}
                onChange={(e) => setFromChain(e.target.value)}
              >
                {sellChainNames.map((chain) => (
                  <option key={chain} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn small bgGray"
                onClick={nextFromChain}
                disabled={sellChainNames.length < 2}
              >
                {">"}
              </button>
            </span>
            <span className="selectCycle">
              <select
                value={fromCoin}
                onChange={(e) => setFromCoin(e.target.value)}
              >
                {fromCoins.map((coin) => (
                  <option key={coin} value={coin}>
                    {coin}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn small bgGray"
                onClick={nextFromCoin}
                disabled={fromCoins.length < 2}
              >
                {">"}
              </button>
            </span>
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
              type="number"
              min="0"
              max={maxSell || 0}
              step="any"
              value={sellEndDraft || inputQty(sellEnd)}
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
              type="number"
              min="0"
              max={maxSell || 0}
              step="any"
              value={fromQty}
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
              <option value="default">default</option>
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
            <span className="selectCycle">
              <select
                value={toChain}
                onChange={(e) => setToChain(e.target.value)}
                disabled={!defiE.bridge}
                title={defiE.bridge ? "" : "DEX swap uses the same chain"}
              >
                {chainNames.map((chain) => (
                  <option key={chain} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn small bgGray"
                onClick={nextToChain}
                disabled={!defiE.bridge || chainNames.length < 2}
              >
                {">"}
              </button>
            </span>
            <span className="selectCycle">
              <select
                value={toCoin}
                onChange={(e) => setToCoin(e.target.value)}
              >
                {toCoins.map((coin) => (
                  <option key={coin} value={coin}>
                    {coin}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn small bgGray"
                onClick={nextToCoin}
                disabled={toCoins.length < 2}
              >
                {">"}
              </button>
            </span>
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
              type="number"
              min="0"
              max={maxBuyEnd || maxBuy || 0}
              step="any"
              value={buyEndDraft || inputQty(buyEnd)}
              onChange={(e) => updateBuyEnd(e.target.value)}
              onBlur={() => setBuyEndDraft("")}
            />
            {toPrice > 0 && <span className="gray">${fmt(buyEndUsd, 2)}</span>}
          </div>
          <div className="swapAmountLine">
            <span className="gray">buy</span>
            <input
              type="number"
              min="0"
              max={maxBuyInput || 0}
              step="any"
              value={toQty}
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
