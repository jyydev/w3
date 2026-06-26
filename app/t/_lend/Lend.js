"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  buildAaveLendTxs,
  buildVenusLendTxs,
  executeAaveLend,
  executeVenusLend,
  getAaveLendPreview,
  getTradeCoinPrice,
  getVenusLendPreview,
} from "./act";
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
        .filter((chainE) => chainMarketsM[chainE.chain]?.length)
        .map((chainE) => chainE.chain),
    [chainList, chainMarketsM],
  );
  const chainE =
    chainList.find((entry) => entry.chain == chain) ||
    chainList.find((entry) => marketChains.includes(entry.chain)) ||
    chainList[0];
  const markets = chainMarketsM[chainE?.chain] || [];
  const marketE = markets.find((entry) => entry.value == market) || markets[0];
  const underlyingCoin = marketE?.underlyingCoin || "";
  const lendCoin = marketE?.lendCoin || "";
  const lendName = marketE?.lendName || lendCoin;
  const underlyingBalance = getSelectedBalance(
    chainE,
    underlyingCoin,
    selectedWalletEntry,
  );
  const receiptBalance = getSelectedBalance(chainE, lendCoin, selectedWalletEntry);
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
    if (markets.length && !markets.some((entry) => entry.value == market)) {
      setMarket(markets[0].value);
    } else if (!markets.length && market) {
      setMarket("");
    }
  }, [market, markets]);

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
    selectedWalletEntry?.address,
    underlyingCoin,
  ]);

  useEffect(() => {
    const qty = inputQty(maxUnderlying);
    setQtyInputSide("lend");
    setLendQty(qty);
    setReceiptQty(inputQty(toNum(qty) * receiptRate));
  }, [chainE?.chain, lendCoin, maxUnderlying, selectedWalletEntry?.value]);

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
    const next = nextValue(
      markets.map((entry) => entry.value),
      market,
    );
    if (next) setMarket(next);
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
    if (!toNum(qty)) {
      toast.error(`${action} qty is 0`);
      return;
    }

    const useBrowserWallet = !!selectedWalletEntry?.isBrowserWallet;
    const buildTxs = isVenus ? buildVenusLendTxs : buildAaveLendTxs;
    const executeLend = isVenus ? executeVenusLend : executeAaveLend;
    const previewLend = isVenus ? getVenusLendPreview : getAaveLendPreview;
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
          });

          if (preview.approvalNeeded) {
            approvalAmount = window.prompt(
              `Approval needed for ${underlyingCoin}.\n\nEnter approval qty.\nLend qty: ${qty}`,
              qty,
            );
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
        });
      }

      setLendResult(res);
      toast.success(`${protocol} ${action} submitted ${res.txs?.length || 0} tx`, {
        id: toastId,
      });
    } catch (e) {
      const message = e?.message || `${protocol} ${action} failed`;
      setLendResult({ ok: false, error: message });
      toast.error(message, { id: toastId });
    } finally {
      setLendPending(false);
      setLendPendingAction("");
    }
  }

  return (
    <div className="tradePane swapPane lendPane">
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
        <span className="selectCycle">
          <select
            value={marketE?.value || ""}
            onChange={(e) => setMarket(e.target.value)}
            disabled={!markets.length}
          >
            {!markets.length && <option value="">no coin</option>}
            {markets.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.underlyingCoin} ({entry.lendCoin})
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
              {fmt(underlyingBalance.balance)}
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
              {fmt(receiptBalance.balance)}
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
