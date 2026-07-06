"use client";

import "ygb/client";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { VersionedTransaction } from "@solana/web3.js";
import toast from "react-hot-toast";
import { pc } from "@/fn/basic";
import {
  CustomPicker,
  CustomPickerButton,
  CustomPickerCell,
  CustomPickerColumn,
  CustomPickerMenu,
  CustomPickerRow,
  CustomPickerSortHeader,
  CustomPickerTable,
  CycleButton,
} from "@/components/Shared";
import { dexs, lendings, scanners, yields } from "@/sets";
import {
  confirmSolanaTransaction,
  sendSolanaRawTransaction,
} from "./svShared";

export const tradeShowCookie = "w3_trade_show";
export const tradeRightPaneCookie = "w3_trade_right_pane";
export const tradeLeftPaneCookie = "w3_trade_left_pane";
export const tradeRightPaneSelectCookie = "w3_trade_right_pane_select";
export const tradePaneOrderCookie = "w3_trade_pane_order";
export const walletBalancePatchEvent = "w3:walletBalancePatch";
export const tradeSwapDexCookie = "w3_trade_swap_dex";
export const tradeSwapFromChainCookie = "w3_trade_swap_from_chain";
export const tradeSwapFromCoinCookie = "w3_trade_swap_from_coin";
export const tradeSwapToChainCookie = "w3_trade_swap_to_chain";
export const tradeSwapToCoinCookie = "w3_trade_swap_to_coin";
export const tradeSwapDexOrderCookie = "w3_trade_swap_dex_order";
export const tradeSwapFromChainOrderCookie =
  "w3_trade_swap_from_chain_order";
export const tradeSwapFromCoinOrderCookie = "w3_trade_swap_from_coin_order";
export const tradeSwapToChainOrderCookie = "w3_trade_swap_to_chain_order";
export const tradeSwapToCoinOrderCookie = "w3_trade_swap_to_coin_order";
export const tradeAutoApprovalCookie = "w3_trade_auto_approval";
export const tradeLendDefiCookie = "w3_trade_lend_defi";
export const tradeLendChainCookie = "w3_trade_lend_chain";
export const tradeLendMarketCookie = "w3_trade_lend_market";
export const tradeLendDefiOrderCookie = "w3_trade_lend_defi_order";
export const tradeLendChainOrderCookie = "w3_trade_lend_chain_order";
export const tradeLendMarketOrderCookie = "w3_trade_lend_market_order";
export const tradeYieldDefiCookie = "w3_trade_yield_defi";
export const tradeYieldChainCookie = "w3_trade_yield_chain";
export const tradeYieldMarketCookie = "w3_trade_yield_market";
export const tradeYieldDefiOrderCookie = "w3_trade_yield_defi_order";
export const tradeYieldChainOrderCookie = "w3_trade_yield_chain_order";
export const tradeYieldMarketOrderCookie = "w3_trade_yield_market_order";
export const tradeYieldHyperliquidModeCookie =
  "w3_trade_yield_hyperliquid_mode";
export const tradeYieldHyperliquidChainCookie =
  "w3_trade_yield_hyperliquid_chain";
export const tradeYieldHyperliquidCoinCookie =
  "w3_trade_yield_hyperliquid_coin";
export const tradeYieldHyperliquidDepositCoinCookie =
  "w3_trade_yield_hyperliquid_deposit_coin";
export const tradeYieldHyperliquidWithdrawCoinCookie =
  "w3_trade_yield_hyperliquid_withdraw_coin";
export const tradeYieldHyperliquidModeOrderCookie =
  "w3_trade_yield_hyperliquid_mode_order";
export const tradeYieldHyperliquidChainOrderCookie =
  "w3_trade_yield_hyperliquid_chain_order";
export const tradeYieldHyperliquidCoinOrderCookie =
  "w3_trade_yield_hyperliquid_coin_order";
export const tradeYieldHyperliquidDepositCoinOrderCookie =
  "w3_trade_yield_hyperliquid_deposit_coin_order";
export const tradeYieldHyperliquidWithdrawCoinOrderCookie =
  "w3_trade_yield_hyperliquid_withdraw_coin_order";
export const tradeSendChainCookie = "w3_trade_send_chain";
export const tradeSendCoinCookie = "w3_trade_send_coin";
export const tradeSendToWalletCookie = "w3_trade_send_to_wallet";
export const tradeSendChainOrderCookie = "w3_trade_send_chain_order";
export const tradeSendCoinOrderCookie = "w3_trade_send_coin_order";
export const tradeChainSelectEvent = "w3:tradeChainSelect";
export const cookieMaxAge = 60 * 60 * 24 * 365;

export function getInitialCookie(initialCookieM = {}, name = "") {
  const value = initialCookieM?.[name];
  return value === undefined ? undefined : String(value);
}

export function getInitialAutoApproval(initialCookieM = {}) {
  return String(initialCookieM?.[tradeAutoApprovalCookie] ?? "") == "1";
}

export function getProtocolCookie(
  base = "",
  walletType = "evm",
  defi = "",
  chain = "",
) {
  return [getTradeModeCookie(base, walletType), defi || "defi", chain || ""]
    .filter(Boolean)
    .join("_");
}
const eip6963ProviderDetails = [];
let eip6963Listening = false;
const walletStandardWallets = [];
let walletStandardListening = false;
const walletStandardApi = Object.freeze({
  register: (...wallets) => {
    wallets.forEach((wallet) => {
      if (wallet && !walletStandardWallets.includes(wallet)) {
        walletStandardWallets.push(wallet);
      }
    });

    return () => {};
  },
});
export const dexOptions = (Array.isArray(dexs) ? dexs : [])
  .filter((entry) => entry?.value && entry?.label)
  .map((entry) => ({
    value: String(entry.value),
    label: String(entry.label),
    bridge: !!entry.bridge,
  }));
export const noDex = { value: "", label: "DEX", bridge: false };
export const lendingOptions = (Array.isArray(lendings) ? lendings : [])
  .filter((entry) => entry?.value && entry?.label)
  .map((entry) => ({
    value: String(entry.value),
    label: String(entry.label),
  }));
export const noLending = { value: "", label: "DeFi" };
export const yieldOptions = (Array.isArray(yields) ? yields : [])
  .filter((entry) => entry?.value && entry?.label)
  .map((entry) => ({
    value: String(entry.value),
    label: String(entry.label),
  }));
export const noYield = { value: "", label: "Yield" };

function getPickerSortText(value = "") {
  return String(value ?? "").toLowerCase();
}

function getPickerSortNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

export function sameAddressText(a = "", b = "") {
  return (
    String(a || "").trim().toLowerCase() ==
    String(b || "").trim().toLowerCase()
  );
}

export function getTokenAddressKey(chain = "", address = "") {
  const value = String(address || "").trim();
  if (!value) return "";

  return chain == "Solana" ? value : value.toLowerCase();
}

export function getCoinTypeOptions(chainList = [], extraType = "") {
  const types = new Set(["token"]);

  for (const chainE of chainList || []) {
    for (const coinE of Object.values(chainE?.coinInfoM || {})) {
      if (coinE?.type) types.add(String(coinE.type));
    }
  }
  if (extraType) types.add(String(extraType));

  return [...types].sort((a, b) => a.localeCompare(b));
}

export function withClientTimeout(promise, ms, message) {
  if (!ms) return promise;

  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function useTradeAllMarkets({
  enabled = false,
  cacheKey = "",
  chain = "",
  protocolLabel = "Trade",
  getAllMarkets,
  timeoutMs = 25000,
} = {}) {
  const [marketM, setMarketM] = useState({});
  const [loadingM, setLoadingM] = useState({});
  const [errorM, setErrorM] = useState({});
  const [retryTick, setRetryTick] = useState(0);
  const markets = marketM[cacheKey] || [];
  const loading = !!loadingM[cacheKey];
  const error = errorM[cacheKey] || "";

  useEffect(() => {
    if (!enabled || !cacheKey || !chain || !getAllMarkets) return;
    if (marketM[cacheKey] !== undefined || loadingM[cacheKey]) return;

    let cancelled = false;
    setLoadingM((current) => ({ ...current, [cacheKey]: true }));
    setErrorM((current) => ({ ...current, [cacheKey]: "" }));
    withClientTimeout(
      getAllMarkets({ chain }),
      timeoutMs,
      `${chain} ${protocolLabel} loading timeout`,
    )
      .then((res) => {
        if (cancelled) return;
        setMarketM((current) => ({
          ...current,
          [cacheKey]: Array.isArray(res?.markets) ? res.markets : [],
        }));
      })
      .catch((e) => {
        if (cancelled) return;
        setMarketM((current) => ({ ...current, [cacheKey]: [] }));
        setErrorM((current) => ({
          ...current,
          [cacheKey]: e?.message || `${protocolLabel} markets failed`,
        }));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingM((current) => ({ ...current, [cacheKey]: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    chain,
    enabled,
    getAllMarkets,
    protocolLabel,
    retryTick,
    timeoutMs,
  ]);

  function retry(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setMarketM((current) => {
      const next = { ...current };
      delete next[cacheKey];
      return next;
    });
    setErrorM((current) => ({ ...current, [cacheKey]: "" }));
    setLoadingM((current) => ({ ...current, [cacheKey]: false }));
    setRetryTick((tick) => tick + 1);
  }

  return { markets, loading, error, retry };
}

export function useTradeDirectMarketBalance({
  enabled = false,
  cacheKey = "",
  walletAddress = "",
  chain = "",
  marketE = {},
  getMarketBalance,
  protocolLabel = "Trade",
  timeoutMs = 12000,
} = {}) {
  const [balanceM, setBalanceM] = useState({});
  const [loadingM, setLoadingM] = useState({});
  const balance = balanceM[cacheKey] || {};
  const loading = !!loadingM[cacheKey];
  const underlyingAddress = marketE?.underlyingAddress;
  const underlyingDecimals = marketE?.underlyingDecimals;
  const lendAddress = marketE?.lendAddress;
  const lendDecimals = marketE?.lendDecimals;

  useEffect(() => {
    if (
      !enabled ||
      !cacheKey ||
      !walletAddress ||
      !chain ||
      !underlyingAddress ||
      !lendAddress ||
      !getMarketBalance ||
      balanceM[cacheKey] ||
      loadingM[cacheKey]
    ) {
      return;
    }

    let cancelled = false;
    setLoadingM((current) => ({ ...current, [cacheKey]: true }));
    withClientTimeout(
      getMarketBalance({
        walletAddress,
        chain,
        underlyingAddress,
        underlyingDecimals,
        lendAddress,
        lendDecimals,
      }),
      timeoutMs,
      `${chain} ${protocolLabel} balance timeout`,
    )
      .then((res) => {
        if (cancelled) return;
        setBalanceM((current) => ({
          ...current,
          [cacheKey]: {
            underlying: res?.underlying || {},
            lend: res?.lend || {},
          },
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setBalanceM((current) => ({
          ...current,
          [cacheKey]: { underlying: {}, lend: {} },
        }));
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingM((current) => ({ ...current, [cacheKey]: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    chain,
    enabled,
    getMarketBalance,
    lendAddress,
    lendDecimals,
    protocolLabel,
    timeoutMs,
    underlyingAddress,
    underlyingDecimals,
    walletAddress,
  ]);

  function clear() {
    setBalanceM((current) => {
      const next = { ...current };
      delete next[cacheKey];
      return next;
    });
    setLoadingM((current) => ({ ...current, [cacheKey]: false }));
  }

  return { balance, loading, clear };
}

const tradeFallbackPriceCacheM = {};
const tradeFallbackPricePromiseM = {};

export function clearTradeClientRuntimeCache() {
  for (const key of Object.keys(tradeFallbackPriceCacheM)) {
    delete tradeFallbackPriceCacheM[key];
  }
  for (const key of Object.keys(tradeFallbackPricePromiseM)) {
    delete tradeFallbackPricePromiseM[key];
  }
}

export function useTradeFallbackPrice({
  enabled = true,
  cacheKey = "",
  chain = "",
  coin = "",
  coinE = null,
  listPrice = 0,
  getPrice,
} = {}) {
  const [fallbackPriceE, setFallbackPriceE] = useState({
    cacheKey,
    price: cacheKey ? tradeFallbackPriceCacheM[cacheKey] : undefined,
  });
  const [loading, setLoading] = useState(false);
  const fallbackPrice =
    fallbackPriceE.cacheKey == cacheKey ? fallbackPriceE.price : undefined;

  useEffect(() => {
    if (!enabled || !cacheKey || !chain || !coin || toNum(listPrice) > 0) return;
    if (fallbackPrice !== undefined) return;
    if (tradeFallbackPriceCacheM[cacheKey] !== undefined) {
      setFallbackPriceE({
        cacheKey,
        price: tradeFallbackPriceCacheM[cacheKey],
      });
      return;
    }

    let cancelled = false;
    setLoading(true);

    if (!tradeFallbackPricePromiseM[cacheKey]) {
      tradeFallbackPricePromiseM[cacheKey] = getPrice({ chain, coin, coinE })
        .then((res) => {
          const price = toNum(res?.price);
          tradeFallbackPriceCacheM[cacheKey] = price;
          return price;
        })
        .catch(() => {
          tradeFallbackPriceCacheM[cacheKey] = 0;
          return 0;
        })
        .finally(() => {
          delete tradeFallbackPricePromiseM[cacheKey];
        });
    }

    tradeFallbackPricePromiseM[cacheKey]
      .then((price) => {
        if (!cancelled) setFallbackPriceE({ cacheKey, price });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    chain,
    coin,
    coinE,
    enabled,
    fallbackPrice,
    getPrice,
    listPrice,
  ]);

  return { fallbackPrice, loading };
}

export function getExplorerAddressUrl(chain = "", address = "") {
  const scanner = scanners?.[chain];
  if (!scanner || !address) return "";

  return `${String(scanner).replace(/\/+$/, "")}/address/${address}`;
}

export function CustomCoinConfirmModal({
  preview,
  draft,
  setDraft = () => {},
  adding = false,
  coinTypeOptions = [],
  idPrefix = "coinConfirm",
  onCancel = () => {},
  onConfirm = () => {},
}) {
  if (!preview) return null;

  const entry = preview.entry || {};
  const typeOptions = coinTypeOptions.length ? coinTypeOptions : ["token"];
  const typeSelectWidth = Math.max(...typeOptions.map((type) => type.length), 5) + 2;
  const addressUrl = getExplorerAddressUrl(preview.chain, entry.address);

  return (
    <div className="walletCoinConfirmBackdrop">
      <form
        className="walletCoinConfirmCard"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <div className="walletCoinConfirmTitle">Confirm coin</div>
        <div className="walletCoinConfirmGrid">
          <span className="gray">chain</span>
          <span className="white">{preview.chain}</span>

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

          <label className="gray" htmlFor={`${idPrefix}Key`}>
            coin
          </label>
          <input
            id={`${idPrefix}Key`}
            type="text"
            value={draft.coin}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                coin: e.target.value,
              }))
            }
            disabled={adding}
            style={{
              width: `${Math.max(draft.coin.length || 0, 5) + 2}ch`,
            }}
            autoFocus
          />

          <label className="gray" htmlFor={`${idPrefix}Name`}>
            name
          </label>
          <input
            id={`${idPrefix}Name`}
            type="text"
            value={draft.name}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                name: e.target.value,
              }))
            }
            disabled={adding}
            style={{
              width: `${Math.max(draft.name.length || 0, 10) + 2}ch`,
            }}
          />

          <label className="gray" htmlFor={`${idPrefix}Type`}>
            type
          </label>
          <span className="walletCoinConfirmTypeRow">
            <select
              id={`${idPrefix}Type`}
              value={draft.type}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  type: e.target.value,
                  customType: e.target.value,
                }))
              }
              disabled={adding}
              style={{ width: `${typeSelectWidth}ch` }}
            >
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={draft.customType}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  customType: e.target.value,
                }))
              }
              placeholder="custom type"
              disabled={adding}
              style={{
                width: `${Math.max(draft.customType.length || 0, 11) + 2}ch`,
              }}
            />
          </span>

          <label className="gray" htmlFor={`${idPrefix}Ref`}>
            ref
          </label>
          <input
            id={`${idPrefix}Ref`}
            type="text"
            value={draft.ref}
            onChange={(e) =>
              setDraft((current) => ({
                ...current,
                ref: e.target.value,
              }))
            }
            placeholder="optional note"
            disabled={adding}
            style={{
              width: `${Math.max(draft.ref.length || 0, 13) + 2}ch`,
            }}
          />
        </div>
        <div className="walletCoinConfirmBtns">
          <button
            type="button"
            className="btn small bgGray"
            onClick={onCancel}
            disabled={adding}
          >
            cancel
          </button>
          <button type="submit" className="btn small bgCyan" disabled={adding}>
            {adding ? "..." : "confirm"}
          </button>
        </div>
      </form>
    </div>
  );
}

const customCoinInitialDraft = {
  coin: "",
  name: "",
  type: "",
  customType: "",
  ref: "",
};

export function useCustomCoinConfirm({
  useLocalEditorStore = false,
  addLocalCustomCoinAction,
  addCustomCoinAction,
  setLocallyAddedAddressM = () => {},
  onTxComplete = () => {},
} = {}) {
  const [customCoinPreview, setCustomCoinPreview] = useState(null);
  const [customCoinDraft, setCustomCoinDraft] = useState(customCoinInitialDraft);
  const [addingCoin, setAddingCoin] = useState(false);

  function clearCustomCoinPreview() {
    setCustomCoinPreview(null);
    setCustomCoinDraft(customCoinInitialDraft);
  }

  function setCustomCoinPreviewData(res = {}) {
    setCustomCoinPreview(res);
    setCustomCoinDraft({
      coin: res.coin || "",
      name: res.entry?.name || "",
      type: res.entry?.type || "token",
      customType: res.entry?.type || "token",
      ref: res.entry?.ref || "",
    });
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
        ? addLocalCustomCoinAction?.({
            chain: customCoinPreview.chain,
            coin,
            entry,
          })
        : await addCustomCoinAction?.({
            chain: customCoinPreview.chain,
            address: entry.address,
            coin,
            name: entry.name,
            type: entry.type,
            ref: entry.ref || "",
          });

      if (!res?.ok) throw new Error(res?.msg || "add coin failed");
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

  return {
    customCoinPreview,
    customCoinDraft,
    setCustomCoinDraft,
    addingCoin,
    setAddingCoin,
    clearCustomCoinPreview,
    setCustomCoinPreviewData,
    confirmCustomCoin,
  };
}

export function hasLoadedBalance(balance = {}) {
  return Object.prototype.hasOwnProperty.call(balance || {}, "balance");
}

export function getKnownCoinPrice(chainE, coin = "") {
  if (!chainE || !coin) return 0;

  for (const row of chainE.rows || []) {
    const balance = row?.balances?.[coin];
    const price = toNum(balance?.price);
    if (price > 0) return price;
  }

  return 0;
}

export function getSelectedBalance(chainE, coin, selectedWalletEntry) {
  if (!chainE || !coin || !selectedWalletEntry) return {};

  const row = chainE.rows?.find(
    (entry) =>
      sameAddress(entry.address, selectedWalletEntry.address) ||
      entry.name == selectedWalletEntry.name,
  );

  const balance = row?.balances?.[coin];
  if (hasLoadedBalance(balance)) return balance;

  if (
    row &&
    row.balances &&
    Object.prototype.hasOwnProperty.call(chainE?.coinInfoM || {}, coin) &&
    !row.errors?.[coin]
  ) {
    const price = getKnownCoinPrice(chainE, coin);
    return { balance: 0, price, usd: 0 };
  }

  return {};
}

export function getCoinByAddress(chainE, address = "") {
  const addressKey = getTokenAddressKey(chainE?.chain, address);
  if (!addressKey) return "";

  return (
    getChainCoins(chainE).find(
      (coin) =>
        getTokenAddressKey(chainE?.chain, chainE?.coinInfoM?.[coin]?.address) ==
        addressKey,
    ) || ""
  );
}

export function canonicalizeTradeMarketEntry(chainE = {}, entry = {}) {
  const underlyingCoin =
    getCoinByAddress(chainE, entry.underlyingAddress) || entry.underlyingCoin;
  const lendCoin = getCoinByAddress(chainE, entry.lendAddress) || entry.lendCoin;
  const underlyingE = chainE?.coinInfoM?.[underlyingCoin] || {};
  const lendE = chainE?.coinInfoM?.[lendCoin] || {};

  return {
    ...entry,
    underlyingCoin,
    underlyingName: underlyingE.name || entry.underlyingName,
    underlyingDecimals: Number.isInteger(underlyingE.decimals)
      ? underlyingE.decimals
      : entry.underlyingDecimals,
    lendCoin,
    lendName: lendE.name || entry.lendName,
    lendDecimals: Number.isInteger(lendE.decimals)
      ? lendE.decimals
      : entry.lendDecimals,
  };
}

export function getCoinBalanceByAddress(
  chainE,
  coin = "",
  address = "",
  selectedWalletEntry,
) {
  const localCoin =
    getCoinByAddress(chainE, address) || (chainE?.coinInfoM?.[coin] ? coin : "");

  return localCoin
    ? getSelectedBalance(chainE, localCoin, selectedWalletEntry)
    : {};
}

export function TradePickerMenu({ className = "", children }) {
  return <CustomPickerMenu className={className}>{children}</CustomPickerMenu>;
}

export function TradePickerColumn({ title = "", children }) {
  return <CustomPickerColumn title={title}>{children}</CustomPickerColumn>;
}

export function TradePickerTable({ className = "", headers = [], children }) {
  return (
    <CustomPickerTable className={className} headers={headers}>
      {children}
    </CustomPickerTable>
  );
}

export function TradePickerRow({
  active = false,
  unsupported = false,
  onClick,
  children,
}) {
  return (
    <CustomPickerRow
      active={active}
      unsupported={unsupported}
      onClick={onClick}
    >
      {children}
    </CustomPickerRow>
  );
}

export function TradePickerCell({ className = "", colSpan, children }) {
  return (
    <CustomPickerCell className={className} colSpan={colSpan}>
      {children}
    </CustomPickerCell>
  );
}

export function sortTradePickerRows(
  rows = [],
  sortKey = "",
  getterM = {},
  directionM = {},
) {
  if (!sortKey) return rows;

  const getter = getterM[sortKey] || ((entry) => entry?.[sortKey]);
  const direction = directionM[sortKey] || "asc";
  const multiplier = direction == "desc" ? -1 : 1;

  return [...rows].sort((a, b) => {
    const aValue = getter(a);
    const bValue = getter(b);
    const aNumber = getPickerSortNumber(aValue);
    const bNumber = getPickerSortNumber(bValue);
    const useNumber =
      typeof aValue == "number" ||
      typeof bValue == "number" ||
      (aValue !== "" &&
        aValue !== null &&
        aValue !== undefined &&
        bValue !== "" &&
        bValue !== null &&
        bValue !== undefined &&
        Number.isFinite(Number(aValue)) &&
        Number.isFinite(Number(bValue)));

    if (useNumber) return (aNumber - bNumber) * multiplier;

    return (
      getPickerSortText(aValue).localeCompare(getPickerSortText(bValue)) *
      multiplier
    );
  });
}

export function toggleTradePickerSort(setter, sortKey = "") {
  setter((current) => (current == sortKey ? "" : sortKey));
}

export function TradePickerSortHeader({
  activeSort = "",
  sortKey = "",
  onSort = () => {},
  children,
}) {
  return (
    <CustomPickerSortHeader
      activeSort={activeSort}
      sortKey={sortKey}
      onSort={onSort}
    >
      {children}
    </CustomPickerSortHeader>
  );
}

export function formatTradeMarketApr(apr) {
  const value = toNum(apr);
  if (value <= 0) return "";
  if (value < 0.01) return "<0.01%";
  return `${fmt(value, value >= 10 ? 1 : 2)}%`;
}

export function TradeMarketAprText({ apr, label = true }) {
  const text = formatTradeMarketApr(apr);
  return text ? (
    <span className="lendApr">
      {label && <span className="gray">apr: </span>}
      {text}
    </span>
  ) : null;
}

export function TradeMarketCoinInfoCard({
  coin,
  name,
  lockedUntilTimestamp = 0,
  formatLockedUntil = () => "",
}) {
  const cleanCoin = String(coin || "").trim();
  const cleanName = String(name || "").trim();
  const lockText = formatLockedUntil(lockedUntilTimestamp);
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

export function getTradeMarketCoinBalance(
  chainE,
  coin = "",
  address = "",
  selectedWalletEntry,
) {
  return getCoinBalanceByAddress(chainE, coin, address, selectedWalletEntry);
}

export function TradeMarketCoinBalance({ balance = {} }) {
  if (!hasLoadedBalance(balance)) return null;

  return <span>{pc(balance.balance)}</span>;
}

export function getTradeMarketBalanceQty(balance = {}) {
  return hasLoadedBalance(balance) ? toNum(balance.balance) : 0;
}

export function isSameTradeWalletEntry(entryA = {}, entryB = {}) {
  return (
    sameAddress(entryA?.address, entryB?.address) ||
    entryA?.value == entryB?.value ||
    entryA?.name == entryB?.name
  );
}

export function getBestLoadedTradeBalance(balances = []) {
  return (
    balances
      .filter(hasLoadedBalance)
      .sort((a, b) => toNum(b.balance) - toNum(a.balance))[0] || {}
  );
}

export function getTradeWalletMarketBalance({
  chainE,
  coin = "",
  address = "",
  walletEntry,
  selectedWalletEntry,
  selectedBalances = [],
} = {}) {
  const localBalance = getTradeMarketCoinBalance(
    chainE,
    coin,
    address,
    walletEntry,
  );
  const selected = isSameTradeWalletEntry(walletEntry, selectedWalletEntry);

  if (selected) {
    return getBestLoadedTradeBalance([...selectedBalances, localBalance]);
  }

  return localBalance;
}

export function getTradeMarketCoinEntry({
  chainE,
  coin = "",
  address = "",
  decimals,
} = {}) {
  const info = chainE?.coinInfoM?.[coin] || {};

  return {
    ...(info || {}),
    ...(address ? { address } : {}),
    decimals: Number.isInteger(decimals)
      ? decimals
    : getQtyDecimals(info?.decimals),
  };
}

export function getTradeMarketSideMeta({
  side = "underlying",
  marketE = {},
  underlyingCoin = "",
  lendCoin = "",
} = {}) {
  const receiptSide = side == "lend" || side == "receipt";

  return {
    coin: receiptSide ? lendCoin : underlyingCoin,
    address: receiptSide ? marketE?.lendAddress : marketE?.underlyingAddress,
    decimals: receiptSide ? marketE?.lendDecimals : marketE?.underlyingDecimals,
  };
}

export function getTradeMarketSideCoinEntry({
  chainE,
  side = "underlying",
  marketE = {},
  underlyingCoin = "",
  lendCoin = "",
} = {}) {
  return getTradeMarketCoinEntry({
    chainE,
    ...getTradeMarketSideMeta({ side, marketE, underlyingCoin, lendCoin }),
  });
}

export function sortTradeMarketRows(rows = [], key = "") {
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

function defaultMarketSelectValue(entry = {}) {
  return entry.addedValue || entry.value;
}

export function TradeMarketPicker({
  marketPickerRef,
  marketButtonWidth,
  chainName = "",
  defi = "",
  market = "",
  marketE,
  getMarketLabel = () => "",
  showMarketMenu = false,
  setShowMarketMenu = () => {},
  prevMarket = () => {},
  nextMarket = () => {},
  visibleAddedMarkets = [],
  addedRows = [],
  allRows = [],
  allLoading = false,
  allError = "",
  allProtocolLabel = "",
  retryAllMarkets = () => {},
  addedMarketSort = "",
  setAddedMarketSort = () => {},
  allMarketSort = "",
  setAllMarketSort = () => {},
  selectMarket = () => {},
  openProtocolCoinConfirm = () => {},
  addingCoin = false,
  marketSupplyApr = 0,
  getLockedUntil = () => 0,
  formatLockedUntil = () => "",
  allEmptyText = "-",
  showAllEmptyRetry = true,
  showAllAddedOnError = false,
  getAllMarketSelectValue = defaultMarketSelectValue,
  MarketCoinBalance = TradeMarketCoinBalance,
  AprText = TradeMarketAprText,
  LendCoinInfoCard = TradeMarketCoinInfoCard,
}) {
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

  const allErrorLooksAdded =
    showAllAddedOnError && allError && visibleAddedMarkets.length > 0;

  return (
    <div className="selectCycle walletCycle tradeMarketCycle">
      <CycleButton
        direction="prev"
        onClick={prevMarket}
        disabled={visibleAddedMarkets.length < 2}
      />
      <CustomPicker ref={marketPickerRef}>
        <CustomPickerButton
          style={{ width: marketButtonWidth }}
          disabled={!chainName}
          onClick={() => setShowMarketMenu((show) => !show)}
        >
          {marketE ? getMarketLabel(marketE) : "no coin"}
        </CustomPickerButton>
        {showMarketMenu && (
          <TradePickerMenu className="tradeMarketMenu">
            <TradePickerColumn title="added">
              <TradePickerTable
                className="customPickerAddedTable"
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
                    sortTradeMarketRows(addedRows, addedMarketSort).map(
                      (entry) => (
                        <tr
                          key={`wallet_${entry.value}`}
                          className={
                            entry.value == market
                              ? "customPickerRow on"
                              : "customPickerRow"
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
                            <span className="infoHover hoverOnlyInfo customPickerCoinHover">
                              <span className="gray">{entry.lendCoin}</span>
                              <LendCoinInfoCard
                                coin={entry.lendCoin}
                                name={entry.lendName}
                                lockedUntilTimestamp={getLockedUntil(
                                  entry.lendCoin,
                                )}
                                formatLockedUntil={formatLockedUntil}
                              />
                            </span>
                          </td>
                          <td>
                            <MarketCoinBalance balance={entry.lendBalance} />
                          </td>
                          <td>
                            <AprText apr={entry.supplyApr} label={false} />
                          </td>
                        </tr>
                      ),
                    )
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
                className="customPickerAllTable"
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
                  {!allLoading && allErrorLooksAdded && (
                    <tr>
                      <td colSpan={7} className="gray">
                        all added
                      </td>
                    </tr>
                  )}
                  {!allLoading && allError && !allErrorLooksAdded && (
                    <tr>
                      <td colSpan={7}>
                        <span className="red">{allError}</span>{" "}
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
                  {!allLoading && !allError && !allRows.length && (
                    <tr>
                      <td colSpan={7}>
                        <span className="gray">{allEmptyText}</span>
                        {showAllEmptyRetry ? (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="btn small bgGray"
                              onClick={retryAllMarkets}
                            >
                              retry
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  )}
                  {!allLoading &&
                    !allError &&
                    sortTradeMarketRows(allRows, allMarketSort).map((entry) => {
                      const selectedValue = getAllMarketSelectValue(entry);

                      return (
                        <tr
                          key={`${defi}_${entry.value}`}
                          className={
                            selectedValue == market
                              ? "customPickerRow on"
                              : "customPickerRow"
                          }
                        >
                          <td>
                            <button
                              type="button"
                              className="customPickerSelect"
                              onClick={() => selectMarket(selectedValue)}
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
                                openProtocolCoinConfirm(e, entry, "underlying")
                              }
                              disabled={entry.addedUnderlying || addingCoin}
                              title={entry.underlyingName}
                            >
                              {entry.addedUnderlying ? "✓" : "+"}
                            </button>
                          </td>
                          <td>
                            <span className="infoHover hoverOnlyInfo customPickerCoinHover">
                              <button
                                type="button"
                                className="customPickerSelect customPickerSecondarySelect"
                                onClick={() => selectMarket(selectedValue)}
                              >
                                <span className="gray">{entry.lendCoin}</span>
                              </button>
                              <LendCoinInfoCard
                                coin={entry.lendCoin}
                                name={entry.lendName}
                                lockedUntilTimestamp={getLockedUntil(
                                  entry.lendCoin,
                                )}
                                formatLockedUntil={formatLockedUntil}
                              />
                            </span>
                          </td>
                          <td>
                            <MarketCoinBalance balance={entry.lendBalance} />
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
                      );
                    })}
                </tbody>
              </TradePickerTable>
            </TradePickerColumn>
          </TradePickerMenu>
        )}
      </CustomPicker>
      <CycleButton
        onClick={nextMarket}
        disabled={visibleAddedMarkets.length < 2}
      />
      <span className="tradeSelectedApr">
        <AprText apr={marketSupplyApr} />
      </span>
    </div>
  );
}

export function getTradeWalletLabel(entry = {}) {
  return String(entry.label || entry.name || entry.value || "wallet");
}

export function getTradeWalletToastText(entry = {}, loopRun = false, message = "") {
  return loopRun ? `${getTradeWalletLabel(entry)}: ${message}` : message;
}

export function createTradeToast(entry = {}, loopRun = false) {
  const text = (message = "") =>
    getTradeWalletToastText(entry, loopRun, message);

  return {
    text,
    show: (message, options) => toast(text(message), options),
    loading: (message, options) => toast.loading(text(message), options),
    success: (message, options) => toast.success(text(message), options),
    error: (message, options) => toast.error(text(message), options),
  };
}

export function withTradeWalletResult(result, entry = {}) {
  if (!result) return result;

  return {
    ...result,
    walletLabel: getTradeWalletLabel(entry),
    walletName: entry.name || "",
    walletAddress: entry.address || "",
  };
}

export function createTradeLoopResult(results = [], fallback = {}) {
  const entries = (Array.isArray(results) ? results : [])
    .filter(Boolean)
    .map((result) => ({
      ...result,
      walletLabel: result.walletLabel || getTradeWalletLabel(result),
    }));
  if (!entries.length) return null;

  const txs = entries.flatMap((entry) =>
    (entry.txs || []).map((tx) => ({
      ...tx,
      walletLabel: entry.walletLabel,
      walletName: entry.walletName,
      walletAddress: entry.walletAddress,
    })),
  );
  const loopErrors = entries
    .filter((entry) => entry.ok === false || entry.error)
    .map((entry) => ({
      walletLabel: entry.walletLabel,
      error: entry.error || "failed",
    }));
  const lastOk = [...entries].reverse().find((entry) => entry.ok !== false);

  return {
    ...(lastOk || entries[entries.length - 1]),
    ...fallback,
    ok: !!txs.length,
    loop: true,
    results: entries,
    txs,
    loopErrors,
    error: txs.length
      ? ""
      : loopErrors
          .map((entry) => `${entry.walletLabel}: ${entry.error}`)
          .join("; ") || "loop failed",
  };
}

export async function sendBrowserTradeTx({
  tx,
  walletEntry = {},
  tradeToast,
  toastId,
  message = "",
  solana = false,
} = {}) {
  if (message) tradeToast?.loading(message, { id: toastId });

  return solana || tx?.chain == "Solana" || tx?.format?.startsWith("solana:")
    ? sendBrowserSolanaTx({
        tx,
        wallet: walletEntry.browserWallet,
        address: walletEntry.address,
      })
    : sendBrowserTx({
        tx,
        wallet: walletEntry.browserWallet,
        address: walletEntry.address,
      });
}

export async function runTradeWalletLoop({
  loopWallets = false,
  getLoopWalletEntries = () => [],
  selectedWalletEntry,
  actionLabel = "action",
  runOne = async () => {},
} = {}) {
  const loopEntries = loopWallets ? getLoopWalletEntries() : [];
  if (!loopEntries.length) {
    return runOne(selectedWalletEntry, { skipConfirm: false, loopRun: false });
  }

  const seen = new Set();
  const walletEntries = [selectedWalletEntry, ...loopEntries].filter((entry) => {
    const key = `${entry?.value || ""}:${String(entry?.address || "").toLowerCase()}`;
    if (!entry?.address || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const labels = walletEntries.map(getTradeWalletLabel).join(", ");
  const ok = window.confirm(`WARN: confirm loop ${actionLabel} for all: ${labels}?`);
  if (!ok) return null;

  const results = [];
  const toastId = toast.loading(`looping: ${labels}`);
  try {
    for (const entry of walletEntries) {
      const result = await runOne(entry, { skipConfirm: true, loopRun: true });
      if (result) results.push(withTradeWalletResult(result, entry));
    }
    toast.success(`loop done: ${labels}`, { id: toastId });
  } catch (e) {
    toast.error(e?.message || `loop failed: ${labels}`, { id: toastId });
    throw e;
  }

  return results;
}

export function getTradeModeCookie(base = "", walletType = "evm") {
  return `${base}_${walletType == "solana" ? "solana" : "evm"}`;
}

export function emitTradeChainSelect(chain = "") {
  if (typeof window == "undefined" || !chain) return;
  window.dispatchEvent(
    new CustomEvent(tradeChainSelectEvent, {
      detail: { chain },
    }),
  );
}

function uniqueProviders(providers = []) {
  const seen = new Set();

  return providers.filter((provider) => {
    if (!provider || seen.has(provider)) return false;
    seen.add(provider);

    return true;
  });
}

function addEip6963Provider(detail) {
  const provider = detail?.provider;
  if (!provider) return;

  const exists = eip6963ProviderDetails.some(
    (entry) =>
      entry?.provider == provider ||
      (entry?.info?.rdns && entry.info.rdns == detail?.info?.rdns),
  );
  if (!exists) eip6963ProviderDetails.push(detail);
}

function requestEip6963Providers() {
  if (typeof window == "undefined") return;

  if (!eip6963Listening) {
    window.addEventListener("eip6963:announceProvider", (event) => {
      addEip6963Provider(event?.detail);
    });
    eip6963Listening = true;
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

function getEip6963Info(provider) {
  return eip6963ProviderDetails.find((entry) => entry?.provider == provider)
    ?.info;
}

function getProviderName(provider = {}) {
  const info = getEip6963Info(provider);

  return String(
    info?.name ||
      info?.rdns ||
      provider?.name ||
      provider?.walletName ||
      provider?.metadata?.name ||
      provider?.providerName ||
      "",
  ).toLowerCase();
}

function getBrowserEvmProviders() {
  if (typeof window == "undefined") return [];

  requestEip6963Providers();

  return uniqueProviders([
    ...eip6963ProviderDetails.map((entry) => entry?.provider),
    window.rabby,
    ...(window.ethereum?.providers || []),
    window.ethereum,
    window.BinanceChain,
  ]);
}

function isRabbyProvider(provider) {
  const name = getProviderName(provider);

  return (
    provider?.isRabby || name.includes("rabby") || provider == window.rabby
  );
}

function isBinanceProvider(provider) {
  const name = getProviderName(provider);

  return (
    provider?.isBinance ||
    name.includes("binance") ||
    provider == window.BinanceChain
  );
}

function isMetaMaskProvider(provider) {
  const name = getProviderName(provider);

  return (
    !isRabbyProvider(provider) &&
    !isBinanceProvider(provider) &&
    (provider?.isMetaMask || provider?._metamask || name.includes("metamask"))
  );
}

async function getBrowserEvmProvider(wallet = "") {
  const pickProvider = () => {
    const providers = getBrowserEvmProviders();
    if (wallet == "rabby") return providers.find(isRabbyProvider);
    if (wallet == "metamask") return providers.find(isMetaMaskProvider);
    if (wallet == "binance") return providers.find(isBinanceProvider);

    return providers.find((provider) => provider?.request);
  };
  const provider = pickProvider();
  if (provider || typeof window == "undefined") return provider;

  requestEip6963Providers();
  await new Promise((resolve) => setTimeout(resolve, 150));

  return pickProvider();
}

function requestWalletStandardWallets() {
  if (typeof window == "undefined") return;

  if (!walletStandardListening) {
    window.addEventListener("wallet-standard:register-wallet", (event) => {
      event?.detail?.(walletStandardApi);
    });
    walletStandardListening = true;
  }

  const event = new Event("wallet-standard:app-ready", {
    bubbles: false,
    cancelable: false,
    composed: false,
  });
  Object.defineProperty(event, "detail", { value: walletStandardApi });
  window.dispatchEvent(event);
}

function getPhantomSolanaProvider() {
  if (typeof window == "undefined") return null;

  return window.phantom?.solana || (window.solana?.isPhantom && window.solana);
}

function isWalletStandardSolanaWallet(wallet) {
  return (
    wallet?.features?.["standard:connect"]?.connect &&
    wallet?.chains?.some?.((chain) => String(chain).startsWith("solana:"))
  );
}

function getWalletStandardProvider(wallet) {
  const name = String(wallet?.name || "");
  const lowerName = name.toLowerCase();

  return {
    walletStandard: true,
    walletStandardWallet: wallet,
    name,
    walletName: name,
    metadata: { name },
    isMetaMask: lowerName.includes("metamask"),
    isBinance: lowerName.includes("binance"),
    connect: () =>
      wallet.features["standard:connect"].connect({ silent: false }),
    disconnect: () => wallet.features?.["standard:disconnect"]?.disconnect?.(),
  };
}

function getWalletStandardSolanaProviders() {
  return walletStandardWallets
    .filter(isWalletStandardSolanaWallet)
    .map(getWalletStandardProvider);
}

function isMetaMaskSolanaProvider(provider) {
  if (typeof window == "undefined" || !provider) return false;

  const name = getProviderName(provider);
  return (
    provider?.isMetaMask ||
    name.includes("metamask") ||
    provider == window.MetaMask?.solana ||
    provider == window.metamask?.solana ||
    provider == window.metaMask?.solana ||
    getBrowserEvmProviders().some(
      (evmProvider) =>
        isMetaMaskProvider(evmProvider) && evmProvider?.solana == provider,
    )
  );
}

function isBinanceSolanaProvider(provider) {
  if (typeof window == "undefined" || !provider) return false;

  const name = getProviderName(provider);
  return (
    provider?.isBinance ||
    name.includes("binance") ||
    provider == window.BinanceChain?.solana ||
    getBrowserEvmProviders().some(
      (evmProvider) =>
        isBinanceProvider(evmProvider) && evmProvider?.solana == provider,
    )
  );
}

function getBrowserSolanaProviderCandidates() {
  if (typeof window == "undefined") return [];

  requestWalletStandardWallets();

  return uniqueProviders([
    getPhantomSolanaProvider(),
    window.solana,
    window.solflare,
    window.backpack?.solana,
    window.MetaMask?.solana,
    window.metamask?.solana,
    window.metaMask?.solana,
    window.ethereum?.solana,
    ...getBrowserEvmProviders().map((provider) => provider?.solana),
    window.BinanceChain?.solana,
    ...getWalletStandardSolanaProviders(),
  ]);
}

function getBrowserSolanaProvider(wallet = "") {
  const candidates = getBrowserSolanaProviderCandidates();
  if (wallet == "phantom") return getPhantomSolanaProvider();
  if (wallet == "metamask") {
    return candidates.find(isMetaMaskSolanaProvider) || null;
  }
  if (wallet == "binance") {
    return candidates.find(isBinanceSolanaProvider) || null;
  }

  return candidates.find((provider) => provider?.connect) || null;
}

async function getBrowserSolanaProviderReady(wallet = "") {
  let provider = getBrowserSolanaProvider(wallet);
  if (provider || typeof window == "undefined") return provider;

  requestWalletStandardWallets();
  await new Promise((resolve) => setTimeout(resolve, 150));

  return getBrowserSolanaProvider(wallet);
}

function getSolanaAddressFromAccount(account) {
  if (!account) return "";
  if (typeof account == "string") return account;

  const stringValue = account?.toString?.();

  return (
    account?.address ||
    account?.publicKey?.toBase58?.() ||
    account?.publicKey?.toString?.() ||
    account?.publicKey ||
    account?.toBase58?.() ||
    (stringValue && stringValue != "[object Object]" ? stringValue : "") ||
    ""
  );
}

function getSolanaAddress(result, provider) {
  if (Array.isArray(result)) return getSolanaAddressFromAccount(result[0]);

  return (
    result?.publicKey?.toBase58?.() ||
    result?.publicKey?.toString?.() ||
    result?.publicKey ||
    getSolanaAddressFromAccount(result) ||
    getSolanaAddressFromAccount(result?.account) ||
    getSolanaAddressFromAccount(result?.accounts?.[0]) ||
    getSolanaAddressFromAccount(result?.addresses?.[0]) ||
    result?.address ||
    provider?.publicKey?.toBase58?.() ||
    provider?.publicKey?.toString?.() ||
    getSolanaAddressFromAccount(provider?.accounts?.[0]) ||
    ""
  );
}

function getWalletStandardAccountsFromResult(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.accounts)) return result.accounts;
  if (result.account) return [result.account];

  return [];
}

export function getWalletStandardAccount(provider, address = "") {
  const accounts = [
    ...(provider?.walletStandardAccounts || []),
    ...(provider?.walletStandardWallet?.accounts || []),
  ].filter(Boolean);
  if (!accounts.length) return null;

  return (
    accounts.find(
      (account) => getSolanaAddressFromAccount(account) == address,
    ) || accounts[0]
  );
}

async function requestSolanaAddress(provider) {
  const result = provider?.connect
    ? await provider.connect({ onlyIfTrusted: false })
    : provider?.request
      ? await provider.request({ method: "connect" })
      : null;
  if (provider?.walletStandard) {
    const accounts = getWalletStandardAccountsFromResult(result);
    if (accounts.length) {
      provider.walletStandardAccounts = accounts;
      provider.walletStandardAccount = accounts[0];
    }
  }

  return getSolanaAddress(result, provider) || getSolanaAddress(null, provider);
}

function getWalletLabel(entry) {
  if (!entry) return "";
  return entry.name || entry.label || "";
}

export function getWalletPrivateKeyFlag(
  walletPkM = {},
  walletType = "evm",
  name = "",
) {
  if (!name) return false;

  const typedKey = `${walletType}:${name}`;
  if (Object.prototype.hasOwnProperty.call(walletPkM, typedKey)) {
    return !!walletPkM[typedKey];
  }

  return !!walletPkM[name];
}

export function getWalletOptions(
  entries = [],
  walletPkM = {},
  walletType = "evm",
) {
  const names = new Set();

  return entries
    .filter((entry) => entry?.name && entry?.address)
    .filter((entry) => {
      if (names.has(entry.name)) return false;
      names.add(entry.name);

      return true;
    })
    .map((entry) => ({
      value: `${entry.source || ""}:${entry.name}:${entry.address}`,
      name: entry.name,
      label: getWalletLabel(entry),
      address: entry.address,
      hasPrivateKey: getWalletPrivateKeyFlag(walletPkM, walletType, entry.name),
      type: walletType,
    }));
}

export function sameAddress(a = "", b = "") {
  const addressA = String(a || "").trim();
  const addressB = String(b || "").trim();
  if (!addressA || !addressB) return false;

  return (
    addressA.toLowerCase() == addressB.toLowerCase() || addressA == addressB
  );
}

export function findWalletEntryByAddress(entries = [], address = "") {
  return entries.find((entry) => sameAddress(entry?.address, address)) || null;
}

export function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function fmt(value, pc = 6) {
  const n = toNum(value);
  if (!n || !Number(toFixedSafe(n, pc))) return "0";

  return Number(toFixedSafe(n, pc)).toLocaleString("en-US", {
    maximumFractionDigits: pc,
  });
}

function toFixedSafe(value, pc = 6) {
  const n = toNum(value);
  if (!n) return "0";

  return n.toFixed(pc);
}

export function inputQty(value) {
  const n = toNum(value);
  if (!n || Math.abs(n) < 1e-12) return "0";

  const clean = n.toFixed(12).replace(/\.?0+$/, "");

  return clean == "-0" ? "0" : clean;
}

export function getQtyDecimals(decimals, fallback = 18) {
  const n = Number(decimals);

  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function formatTradeQty(value, decimals = 18) {
  const decimalLimit = getQtyDecimals(decimals);
  let text = String(value ?? "")
    .trim()
    .replace(/,/g, "");

  if (!text) return "0";
  if (/e/i.test(text)) {
    const n = Number(text);
    text = Number.isFinite(n) ? n.toFixed(Math.min(decimalLimit, 30)) : "0";
  }

  const negative = text.startsWith("-");
  text = text.replace(/[^\d.]/g, "");

  const dotIndex = text.indexOf(".");
  if (dotIndex >= 0) {
    text =
      text.slice(0, dotIndex + 1) + text.slice(dotIndex + 1).replace(/\./g, "");
  }
  if (text.startsWith(".")) text = `0${text}`;
  if (/^0+(?=\.)/.test(text)) text = text.replace(/^0+(?=\.)/, "0");
  if (/^0+(?=\d)/.test(text)) text = text.replace(/^0+(?=\d)/, "") || "0";

  const [whole = "0", fraction = ""] = text.split(".");
  const limitedFraction = fraction.slice(0, decimalLimit);
  const trimmedFraction = limitedFraction.replace(/0+$/, "");
  const formatted = trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  const clean = formatted.replace(/^0+(?=\d)/, "") || "0";

  return negative && clean != "0" ? `-${clean}` : clean;
}

function incrementWholeText(whole = "0") {
  try {
    return (BigInt(whole || "0") + 1n).toString();
  } catch {
    return String(toNum(whole) + 1);
  }
}

function incrementFractionPrefix(whole = "0", prefix = "") {
  if (!prefix) return { whole: incrementWholeText(whole), fraction: "" };

  const digits = prefix.split("");
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    if (digits[i] != "9") {
      digits[i] = String(Number(digits[i]) + 1);
      return { whole, fraction: digits.join("") };
    }
    digits[i] = "0";
  }

  return { whole: incrementWholeText(whole), fraction: digits.join("") };
}

function cleanComputedFraction(whole = "0", fraction = "") {
  if (fraction.length < 13) return { whole, fraction };

  let nextWhole = whole;
  let nextFraction = fraction;
  const zeroTail = nextFraction.match(/^(.*?[1-9])0{10,}\d{1,6}$/);
  const allZeroDust = /^0{10,}\d{1,6}$/.test(nextFraction);

  if (zeroTail) {
    nextFraction = zeroTail[1];
  } else if (nextWhole != "0" && allZeroDust) {
    nextFraction = "";
  } else {
    const nineTail = nextFraction.match(/^(.*?)9{10,}\d{0,6}$/);
    if (nineTail) {
      ({ whole: nextWhole, fraction: nextFraction } = incrementFractionPrefix(
        nextWhole,
        nineTail[1],
      ));
    }
  }

  return {
    whole: nextWhole,
    fraction: nextFraction.replace(/0+$/, ""),
  };
}

export function formatComputedTradeQty(value, decimals = 18) {
  const formatted = formatTradeQty(value, decimals);
  const negative = formatted.startsWith("-");
  const clean = negative ? formatted.slice(1) : formatted;
  const [whole = "0", fraction = ""] = clean.split(".");
  const next = cleanComputedFraction(whole, fraction);
  const text = next.fraction ? `${next.whole}.${next.fraction}` : next.whole;

  return negative && text != "0" ? `-${text}` : text;
}

export function limitQtyInputDecimals(value, decimals = 18) {
  const decimalLimit = getQtyDecimals(decimals);
  const text = String(value ?? "");
  const dotIndex = text.indexOf(".");

  if (dotIndex < 0) return text;

  return text.slice(0, dotIndex + 1 + decimalLimit);
}

export function cleanTradeInput(value) {
  let text = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "");
  const dotIndex = text.indexOf(".");

  if (dotIndex >= 0) {
    text =
      text.slice(0, dotIndex + 1) + text.slice(dotIndex + 1).replace(/\./g, "");
  }
  if (!text) return "0";
  if (text.startsWith(".")) text = `0${text}`;
  if (/^0+(?=\.)/.test(text)) return text.replace(/^0+(?=\.)/, "0");
  if (/^0+(?=\d)/.test(text)) return text.replace(/^0+(?=\d)/, "") || "0";

  return text;
}

export function absTradeQty(value, decimals = 18) {
  return formatTradeQty(String(value ?? "").replace(/^-/, ""), decimals);
}

function tradeQtyToUnits(value, decimals = 18) {
  const decimalLimit = getQtyDecimals(decimals);
  const formatted = formatTradeQty(value, decimalLimit);
  const negative = formatted.startsWith("-");
  const clean = negative ? formatted.slice(1) : formatted;
  const [whole = "0", fraction = ""] = clean.split(".");
  const unitText = `${whole || "0"}${fraction.padEnd(decimalLimit, "0")}`;
  const units = BigInt(unitText.replace(/^0+(?=\d)/, "") || "0");

  return negative ? -units : units;
}

function tradeUnitsToQty(units, decimals = 18) {
  const decimalLimit = getQtyDecimals(decimals);
  const negative = units < 0n;
  const absUnits = negative ? -units : units;
  const scale = 10n ** BigInt(decimalLimit);
  const whole = absUnits / scale;
  const fraction = (absUnits % scale)
    .toString()
    .padStart(decimalLimit, "0")
    .replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : whole.toString();

  return negative && text != "0" ? `-${text}` : text;
}

export function addTradeQtyText(left, right, decimals = 18) {
  return tradeUnitsToQty(
    tradeQtyToUnits(left, decimals) + tradeQtyToUnits(right, decimals),
    decimals,
  );
}

export function subtractTradeQtyText(left, right, decimals = 18) {
  return tradeUnitsToQty(
    tradeQtyToUnits(left, decimals) - tradeQtyToUnits(right, decimals),
    decimals,
  );
}

export function getTradeEndInputValue(maxQty, qty, addQty, decimals = 18) {
  const absQty = absTradeQty(qty, decimals);
  if (toNum(absQty) <= 0) return formatTradeQty(maxQty, decimals);

  const next = addQty
    ? addTradeQtyText(maxQty, absQty, decimals)
    : subtractTradeQtyText(maxQty, absQty, decimals);

  return formatComputedTradeQty(next, decimals);
}

export function getTradeEndDiffQty(maxQty, endQty, decimals = 18) {
  return formatComputedTradeQty(
    subtractTradeQtyText(
      formatTradeQty(maxQty, decimals),
      formatTradeQty(endQty, decimals),
      decimals,
    ),
    decimals,
  );
}

export function getTradeReceiptQty(value, receiptRate = 1, decimals = 18) {
  return formatComputedTradeQty(toNum(value) * receiptRate, decimals);
}

export function getTradeUnderlyingQty(value, receiptRate = 1, decimals = 18) {
  return receiptRate > 0
    ? formatComputedTradeQty(toNum(value) / receiptRate, decimals)
    : "0";
}

export function getSignedTradeReceiptQty(value, receiptRate = 1, decimals = 18) {
  return formatComputedTradeQty(-toNum(value) * receiptRate, decimals);
}

export function getSignedTradeUnderlyingQty(
  value,
  receiptRate = 1,
  decimals = 18,
) {
  return receiptRate > 0
    ? formatComputedTradeQty(-toNum(value) / receiptRate, decimals)
    : "0";
}

export function getTradeMarketQtyConverters({
  receiptRate = 1,
  underlyingDecimals = 18,
  receiptDecimals = 18,
} = {}) {
  return {
    getReceiptQty: (value) =>
      getTradeReceiptQty(value, receiptRate, receiptDecimals),
    getUnderlyingQty: (value) =>
      getTradeUnderlyingQty(value, receiptRate, underlyingDecimals),
    getSignedReceiptQty: (value) =>
      getSignedTradeReceiptQty(value, receiptRate, receiptDecimals),
    getSignedUnderlyingQty: (value) =>
      getSignedTradeUnderlyingQty(value, receiptRate, underlyingDecimals),
  };
}

export function getTradeMarketSyncedQty({
  qtyInputSide = "lend",
  lendQty = "0",
  receiptQty = "0",
  getSignedReceiptQty = () => "0",
  getSignedUnderlyingQty = () => "0",
} = {}) {
  if (qtyInputSide == "redeem") {
    const next = getSignedUnderlyingQty(receiptQty);
    return next != lendQty ? { side: "lend", value: next } : null;
  }

  const next = getSignedReceiptQty(lendQty);
  return next != receiptQty ? { side: "receipt", value: next } : null;
}

export function qtyInputSize(value = "") {
  return Math.max(String(value ?? "").length + 1, 10);
}

export function qtyInputStyle(value = "") {
  return {
    maxWidth: "none",
    width: `${qtyInputSize(value)}ch`,
  };
}

export function getTradePickerButtonWidth(
  labels = [],
  { minLength = 8, maxLength = 32, offset = -1 } = {},
) {
  const maxLabelLength = Math.max(
    minLength,
    ...labels.map((label) => String(label ?? "").length),
  );

  return `${Math.min(Math.max(maxLabelLength + offset, 1), maxLength)}ch`;
}

export function rangeQtyInput(value, maxValue, maxQty, decimals = 18) {
  const n = toNum(value);
  const maxN = toNum(maxValue);
  const maxDiff = maxN - n;
  const maxTolerance = Math.max(Math.abs(maxN) * 1e-12, 1e-12);

  if (maxN > 0 && (n >= maxN || maxDiff <= maxTolerance)) {
    return formatTradeQty(maxQty, decimals);
  }

  return formatTradeQty(value, decimals);
}

export function normalizeSignedQtyInput(
  value,
  maxPositive,
  maxNegative,
  decimals = 18,
) {
  const raw = String(value ?? "").trim();
  const negative = raw.startsWith("-");
  const qty = limitQtyInputDecimals(
    cleanTradeInput(negative ? raw.slice(1) : raw),
    decimals,
  );
  const max = negative ? maxNegative : maxPositive;
  const n = toNum(qty);

  if (Number.isFinite(max) && n > max) {
    const maxQty = formatTradeQty(max, decimals);
    return negative && maxQty != "0" ? `-${maxQty}` : maxQty;
  }

  return negative && n ? `-${qty}` : qty;
}

export function getTradeMarketSideState({
  qtyInputSide = "lend",
  underlyingQty = "0",
  receiptQty = "0",
  maxUnderlyingQty = "0",
  maxReceiptQty = "0",
  underlyingDecimals = 18,
  receiptDecimals = 18,
} = {}) {
  const underlyingQtyNum = toNum(underlyingQty);
  const receiptQtyNum = toNum(receiptQty);
  const signedLendRedeem = qtyInputSide == "lend" && underlyingQtyNum < 0;
  const signedRedeemLend = qtyInputSide == "redeem" && receiptQtyNum < 0;
  const isRedeem =
    signedLendRedeem || (qtyInputSide == "redeem" && !signedRedeemLend);

  return {
    underlyingQtyNum,
    receiptQtyNum,
    signedLendRedeem,
    signedRedeemLend,
    isRedeem,
    underlyingEndInputValue: getTradeEndInputValue(
      maxUnderlyingQty,
      underlyingQty,
      isRedeem,
      underlyingDecimals,
    ),
    receiptEndInputValue: getTradeEndInputValue(
      maxReceiptQty,
      receiptQty,
      !isRedeem,
      receiptDecimals,
    ),
  };
}

export function getTradeMarketQtyPair({
  side = "lend",
  value = "",
  receiptRate = 1,
  maxUnderlying = 0,
  maxReceipt = 0,
  underlyingDecimals = 18,
  receiptDecimals = 18,
} = {}) {
  if (side == "redeem") {
    const maxLendReceipt = maxUnderlying * receiptRate;
    const receiptQty = normalizeSignedQtyInput(
      value,
      maxReceipt,
      maxLendReceipt,
      receiptDecimals,
    );

    return {
      qtyInputSide: "redeem",
      lendQty: getSignedTradeUnderlyingQty(
        receiptQty,
        receiptRate,
        underlyingDecimals,
      ),
      receiptQty,
    };
  }

  const maxRedeemUnderlying = receiptRate > 0 ? maxReceipt / receiptRate : 0;
  const lendQty = normalizeSignedQtyInput(
    value,
    maxUnderlying,
    maxRedeemUnderlying,
    underlyingDecimals,
  );

  return {
    qtyInputSide: "lend",
    lendQty,
    receiptQty: getSignedTradeReceiptQty(lendQty, receiptRate, receiptDecimals),
  };
}

export function applyTradeMarketQtyState(
  next = {},
  {
    setQtyInputSide = () => {},
    setLendQty = () => {},
    setReceiptQty = () => {},
  } = {},
) {
  setQtyInputSide(next.qtyInputSide);
  if (next.qtyInputSide == "redeem") {
    setReceiptQty(next.receiptQty);
    setLendQty(next.lendQty);
    return;
  }

  setLendQty(next.lendQty);
  setReceiptQty(next.receiptQty);
}

export function getTradeMarketEndPair({
  side = "lend",
  value = "",
  maxQty = "0",
  receiptRate = 1,
  underlyingDecimals = 18,
  receiptDecimals = 18,
} = {}) {
  const decimals = side == "redeem" ? receiptDecimals : underlyingDecimals;
  const endQty = limitQtyInputDecimals(cleanTradeInput(value), decimals);
  const qty = getTradeEndDiffQty(maxQty, endQty, decimals);

  if (side == "redeem") {
    return {
      endQty,
      qtyInputSide: "redeem",
      lendQty: getSignedTradeUnderlyingQty(
        qty,
        receiptRate,
        underlyingDecimals,
      ),
      receiptQty: qty,
    };
  }

  return {
    endQty,
    qtyInputSide: "lend",
    lendQty: qty,
    receiptQty: getSignedTradeReceiptQty(qty, receiptRate, receiptDecimals),
  };
}

export function applyTradeMarketEndState(
  next = {},
  {
    setEndDraft = () => {},
    formatEnd = false,
    decimals = 18,
    setQtyInputSide = () => {},
    setLendQty = () => {},
    setReceiptQty = () => {},
  } = {},
) {
  setEndDraft(
    formatEnd ? formatTradeQty(next.endQty, decimals) : next.endQty,
  );
  applyTradeMarketQtyState(next, {
    setQtyInputSide,
    setLendQty,
    setReceiptQty,
  });
}

export function getTradeMarketEndTargetText({
  draft = "",
  value = "",
  decimals = 18,
} = {}) {
  return formatTradeQty(draft || value, decimals);
}

export function getTradeMarketEndTarget(args = {}) {
  return toNum(getTradeMarketEndTargetText(args));
}

export async function getTradeMarketQtyForWallet({
  endWith = false,
  qty = "",
  decimals = 18,
  getWalletBalance = async () => ({}),
  getEndTargetText = () => "0",
  hasBalance = (balance) => balance?.balance != null,
} = {}) {
  if (!endWith) return formatTradeQty(qty, decimals);

  const balance = await getWalletBalance();
  if (!hasBalance(balance)) return null;

  return formatComputedTradeQty(
    subtractTradeQtyText(
      formatTradeQty(balance.balance, decimals),
      getEndTargetText(),
      decimals,
    ),
    decimals,
  );
}

export function getTradeMarketPriceSummary({
  underlyingPrice = 0,
  receiptPrice = 0,
  maxUnderlying = 0,
  maxReceipt = 0,
  underlyingQty = 0,
  receiptQty = 0,
  underlyingEndQty = "0",
  receiptEndQty = "0",
  underlyingLoading = false,
  receiptLoading = false,
  marketLoading = false,
  underlyingLabel = "",
  receiptLabel = "",
} = {}) {
  const priceLoading = !!underlyingLoading || !!receiptLoading;
  const noPriceCoins = [
    underlyingLabel && toNum(underlyingPrice) <= 0 ? underlyingLabel : "",
    receiptLabel && toNum(receiptPrice) <= 0 ? receiptLabel : "",
  ].filter(Boolean);

  return {
    underlyingUsd: underlyingPrice ? maxUnderlying * underlyingPrice : 0,
    receiptUsd: receiptPrice ? maxReceipt * receiptPrice : 0,
    underlyingQtyUsd: underlyingPrice ? underlyingQty * underlyingPrice : 0,
    receiptQtyUsd: receiptPrice ? receiptQty * receiptPrice : 0,
    underlyingEndUsd: underlyingPrice
      ? toNum(underlyingEndQty) * underlyingPrice
      : 0,
    receiptEndUsd: receiptPrice ? toNum(receiptEndQty) * receiptPrice : 0,
    priceLoading,
    noPriceCoins,
    priceStatus: marketLoading
      ? "querying market..."
      : priceLoading
        ? "querying price..."
        : noPriceCoins.length
          ? `price n/a: ${[...new Set(noPriceCoins)].join(", ")}`
          : "",
  };
}

function cleanInputValue(value) {
  let text = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  text = text.replace(/[^\d.]/g, "");
  const dotIndex = text.indexOf(".");
  if (dotIndex >= 0) {
    text =
      text.slice(0, dotIndex + 1) + text.slice(dotIndex + 1).replace(/\./g, "");
  }
  if (!text) return "";
  if (text.startsWith(".")) text = `0${text}`;
  if (/^0+(?=\.)/.test(text)) return text.replace(/^0+(?=\.)/, "0");
  if (/^0+(?=\d)/.test(text)) return text.replace(/^0+(?=\d)/, "") || "0";

  return text;
}

export function clampInputValue(value, maxValue) {
  const text = cleanInputValue(value);
  if (!text) return "";

  const n = toNum(text);
  if (n < 0) return "0";
  if (Number.isFinite(maxValue) && n > maxValue) return inputQty(maxValue);

  return text;
}

export function normalizeQtyInput(value) {
  const text = cleanInputValue(value);

  if (text === "") return "0";
  if (text.endsWith(".")) return text;
  if (text.includes(".") && /0$/.test(text)) return text;

  return String(globalThis.fp(text));
}

export function readQtyInput(value) {
  return inputQty(normalizeQtyInput(value));
}

export function fmtPrice(value) {
  const n = toNum(value);
  if (!n) return "-";

  return `$${fmt(n, n < 1 ? 8 : 4)}`;
}

export function fmtRate(value) {
  const n = toNum(value);
  if (!n) return "-";

  return fmt(n, n < 1 ? 8 : 6);
}

export function priceKey(chain, coin) {
  return `${chain}:${coin}`;
}

export function getChainCoins(chainE) {
  if (!chainE) return [];
  if (chainE.allCoins?.length) return chainE.allCoins;
  if (chainE.coins?.length) return chainE.coins;

  return Object.keys(chainE.coinInfoM || {});
}

export function nextValue(list = [], value = "") {
  if (!list.length) return "";
  const index = list.indexOf(value);
  return list[(index + 1) % list.length];
}

export function prevValue(list = [], value = "") {
  if (!list.length) return "";
  const index = list.indexOf(value);
  if (index < 0) return list[list.length - 1];

  return list[(index - 1 + list.length) % list.length];
}

function shortHash(hash = "") {
  return hash ? `${hash.slice(0, 10)}...${hash.slice(-4)}` : "-";
}

export function shortAddress(address = "") {
  return address ? `${address.slice(0, 5)}..${address.slice(-3)}` : "-";
}

function bytesToBase64(bytes) {
  const bytesE =
    bytes instanceof Uint8Array
      ? bytes
      : bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : Array.isArray(bytes)
          ? Uint8Array.from(bytes)
          : bytes?.buffer instanceof ArrayBuffer
            ? new Uint8Array(
                bytes.buffer,
                bytes.byteOffset || 0,
                bytes.byteLength,
              )
            : new Uint8Array();
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytesE.length; i += chunkSize) {
    binary += String.fromCharCode(...bytesE.slice(i, i + chunkSize));
  }

  return btoa(binary);
}

export function base64ToBytes(text = "") {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export function bytesToBase58(bytes = []) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = [0];

  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] == 0) zeroes += 1;

  return (
    "1".repeat(zeroes) +
    digits
      .reverse()
      .map((digit) => alphabet[digit])
      .join("")
  );
}

export function getSolanaSignature(result) {
  if (Array.isArray(result) && result[0]?.signature) {
    return getSolanaSignature(result[0].signature);
  }

  const signature =
    result?.signature ||
    result?.signatures?.[0] ||
    result?.value?.signature ||
    result;
  if (typeof signature == "string") return signature;
  if (signature instanceof Uint8Array) return bytesToBase58(signature);
  if (Array.isArray(signature))
    return bytesToBase58(Uint8Array.from(signature));
  if (Array.isArray(signature?.data)) {
    return bytesToBase58(Uint8Array.from(signature.data));
  }

  return "";
}

function getSignedTransaction(result) {
  if (Array.isArray(result) && result[0])
    return getSignedTransaction(result[0]);

  return (
    result?.signedTransaction ||
    result?.transaction ||
    result?.transactions?.[0] ||
    result
  );
}

function getTxUrl(chain = "", hash = "") {
  if (chain == "Hyperliquid") return "";

  const scanner = scanners?.[chain];
  if (!scanner || !hash) return "";

  return `${String(scanner).replace(/\/+$/, "")}/tx/${hash}`;
}

export async function getBrowserSigner({ wallet = "", address = "", chainId }) {
  const eipProvider = await getBrowserEvmProvider(wallet);
  if (!eipProvider?.request) throw new Error("browser EVM wallet not found");

  if (chainId) {
    await eipProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ethers.toQuantity(Number(chainId)) }],
    });
  }

  const provider = new ethers.BrowserProvider(eipProvider);
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();

  if (
    address &&
    ethers.isAddress(address) &&
    ethers.getAddress(signerAddress) != ethers.getAddress(address)
  ) {
    throw new Error(`connected wallet is ${shortAddress(signerAddress)}`);
  }

  return signer;
}

export async function getBrowserEvmChainId(wallet = "") {
  const eipProvider = await getBrowserEvmProvider(wallet);
  if (!eipProvider?.request) throw new Error("browser EVM wallet not found");
  const chainId = await eipProvider.request({ method: "eth_chainId" });

  return Number(BigInt(chainId));
}

function positiveTxBigInt(value) {
  if (value === undefined || value === null || value === "") return null;

  const n = BigInt(value);

  return n > 0n ? n : null;
}

function getBrowserTxOverrides(tx = {}) {
  const gasLimit = positiveTxBigInt(tx.gasLimit) || positiveTxBigInt(tx.gas);
  const gasPrice = positiveTxBigInt(tx.gasPrice);
  const maxFeePerGas = positiveTxBigInt(tx.maxFeePerGas);
  const maxPriorityFeePerGas = positiveTxBigInt(tx.maxPriorityFeePerGas);

  return {
    ...(gasLimit ? { gasLimit } : {}),
    ...(gasPrice ? { gasPrice } : {}),
    ...(maxFeePerGas ? { maxFeePerGas } : {}),
    ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
  };
}

export async function sendBrowserTx({ tx, wallet = "", address = "" }) {
  const signer = await getBrowserSigner({
    wallet,
    address,
    chainId: tx.chainId,
  });
  const sent = await signer.sendTransaction({
    to: tx.to,
    data: tx.data || "0x",
    value: BigInt(tx.value || 0),
    ...getBrowserTxOverrides(tx),
  });
  const receipt = await sent.wait();

  return {
    chain: tx.chain,
    type: tx.type || "tx",
    hash: sent.hash,
    blockNumber: receipt?.blockNumber ?? null,
  };
}

export async function signBrowserTypedData({
  sign,
  wallet = "",
  address = "",
  chainId,
}) {
  const requestedChainId = chainId ?? sign?.chainId ?? sign?.domain?.chainId;
  const skipChainSwitch = !!sign?.skipChainSwitch;
  const isHyperliquidSigningChain = Number(requestedChainId) == 1337;
  const signer = await getBrowserSigner({
    wallet,
    address,
    chainId: skipChainSwitch || isHyperliquidSigningChain
      ? null
      : requestedChainId,
  });
  if (sign?.signatureKind && sign.signatureKind != "eip712") {
    throw new Error(`signature unsupported: ${sign.signatureKind}`);
  }

  if (isHyperliquidSigningChain) {
    try {
      return await signer.signTypedData(sign.domain, sign.types, sign.value);
    } catch (e) {
      const eipProvider = await getBrowserEvmProvider(wallet);
      const providerName = getProviderName(eipProvider) || "This browser wallet";
      throw new Error(
        `${providerName} cannot sign direct Hyperliquid vault actions from this site. Approve the local Hyperliquid agent first.`,
      );
    }
  }

  return signer.signTypedData(sign.domain, sign.types, sign.value);
}

function getHyperliquidBrowserAgentStorageKey(walletAddress = "") {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }

  return `w3_hl_browser_agent_${ethers.getAddress(walletAddress).toLowerCase()}`;
}

function getStoredHyperliquidBrowserAgent(walletAddress = "") {
  if (typeof window == "undefined") {
    throw new Error("browser storage unavailable");
  }

  const key = getHyperliquidBrowserAgentStorageKey(walletAddress);
  let stored = {};
  try {
    stored = JSON.parse(window.localStorage.getItem(key) || "{}");
  } catch {
    window.localStorage.removeItem(key);
  }
  if (stored?.privateKey) {
    try {
      const wallet = new ethers.Wallet(stored.privateKey);

      return { key, wallet };
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  const wallet = ethers.Wallet.createRandom();
  window.localStorage.setItem(
    key,
    JSON.stringify({
      address: wallet.address,
      privateKey: wallet.privateKey,
      createdAt: Date.now(),
    }),
  );

  return { key, wallet };
}

export function getHyperliquidBrowserAgent(walletAddress = "") {
  const { wallet } = getStoredHyperliquidBrowserAgent(walletAddress);

  return {
    address: wallet.address,
  };
}

export async function signHyperliquidBrowserAgentTypedData({
  walletAddress = "",
  sign,
}) {
  const { wallet } = getStoredHyperliquidBrowserAgent(walletAddress);

  return wallet.signTypedData(sign.domain, sign.types, sign.value);
}

export async function getBrowserSolanaSigner({ wallet = "", address = "" }) {
  const provider = await getBrowserSolanaProviderReady(wallet);
  if (!provider) throw new Error("browser Solana wallet not found");

  const providerAddress = await requestSolanaAddress(provider);
  if (address && providerAddress && providerAddress != address) {
    throw new Error(`connected wallet is ${shortAddress(providerAddress)}`);
  }

  return provider;
}

export async function sendBrowserSolanaTx({ tx, wallet = "", address = "" }) {
  const provider = await getBrowserSolanaSigner({ wallet, address });
  const txBytes = base64ToBytes(tx.transaction);
  const transaction = VersionedTransaction.deserialize(txBytes);

  if (provider.walletStandard) {
    const standardWallet = provider.walletStandardWallet;
    const account = getWalletStandardAccount(provider, address);
    if (!account) throw new Error("Solana wallet account missing");
    const signAndSend =
      standardWallet?.features?.["solana:signAndSendTransaction"]
        ?.signAndSendTransaction;
    const signTransaction =
      standardWallet?.features?.["solana:signTransaction"]?.signTransaction;

    if (signAndSend) {
      const result = await signAndSend({
        account,
        transaction: txBytes,
        chain: "solana:mainnet",
      });
      const hash = getSolanaSignature(result);
      if (!hash) throw new Error("Solana wallet returned no signature");
      await confirmSolanaTransaction({ signature: hash });

      return {
        chain: "Solana",
        type: tx.type || "tx",
        hash,
        blockNumber: null,
      };
    }

    if (signTransaction) {
      const result = await signTransaction({
        account,
        transaction: txBytes,
        chain: "solana:mainnet",
      });
      const signedBytes = getSignedTransaction(result);
      const signedBase64 = bytesToBase64(signedBytes);
      const sent = await sendSolanaRawTransaction({
        transaction: signedBase64,
      });

      return {
        chain: "Solana",
        type: tx.type || "tx",
        hash: sent.hash,
        blockNumber: null,
      };
    }
  }

  if (provider.signAndSendTransaction) {
    const result = await provider.signAndSendTransaction(transaction);
    const hash = getSolanaSignature(result);
    if (!hash) throw new Error("Solana wallet returned no signature");
    await confirmSolanaTransaction({ signature: hash });

    return {
      chain: "Solana",
      type: tx.type || "tx",
      hash,
      blockNumber: null,
    };
  }

  if (provider.signTransaction) {
    const signed = await provider.signTransaction(transaction);
    const signedBase64 = bytesToBase64(signed.serialize());
    const sent = await sendSolanaRawTransaction({ transaction: signedBase64 });

    return {
      chain: "Solana",
      type: tx.type || "tx",
      hash: sent.hash,
      blockNumber: null,
    };
  }

  throw new Error("Solana wallet cannot sign transactions");
}

export function SwapTxLink({ tx }) {
  const txUrl = getTxUrl(tx.chain, tx.hash);
  const walletLabel = tx.walletLabel ? `${tx.walletLabel} ` : "";
  const label = `${walletLabel}${tx.chain} ${tx.type ? `${tx.type} ` : ""}${shortHash(tx.hash)}`;

  return (
    <span className="infoHover hoverOnlyInfo swapTxInfo">
      {txUrl ? (
        <a href={txUrl} target="_blank" rel="noreferrer">
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
      <span className="infoCard">
        <span className="infoCardTitle">{tx.type || "tx"}</span>
        {tx.walletLabel && (
          <span>
            wallet: <span className="gray">{tx.walletLabel}</span>
          </span>
        )}
        <span>
          chain: <span className="gray">{tx.chain}</span>
        </span>
        <span>
          hash: <span className="gray swapHashFull">{tx.hash}</span>
        </span>
        {tx.blockNumber != null && (
          <span>
            block: <span className="gray">{tx.blockNumber}</span>
          </span>
        )}
        {txUrl && (
          <span>
            explorer:{" "}
            <a href={txUrl} target="_blank" rel="noreferrer">
              open
            </a>
          </span>
        )}
        {tx.response && (
          <span>
            response:{" "}
            <span className="gray swapHashFull">
              {JSON.stringify(tx.response)}
            </span>
          </span>
        )}
      </span>
    </span>
  );
}
