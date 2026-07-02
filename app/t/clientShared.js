"use client";

import "ygb/client";
import { ethers } from "ethers";
import { VersionedTransaction } from "@solana/web3.js";
import toast from "react-hot-toast";
import { dexs, lendings, scanners, yields } from "@/sets";
import {
  confirmSolanaTransaction,
  sendSolanaRawTransaction,
  submitRelaySignature,
} from "./svShared";

export const tradeShowCookie = "w3_trade_show";
export const tradeRightPaneCookie = "w3_trade_right_pane";
export const tradeLeftPaneCookie = "w3_trade_left_pane";
export const tradeRightPaneSelectCookie = "w3_trade_right_pane_select";
export const tradeSwapDexCookie = "w3_trade_swap_dex";
export const tradeSwapFromChainCookie = "w3_trade_swap_from_chain";
export const tradeSwapFromCoinCookie = "w3_trade_swap_from_coin";
export const tradeSwapToChainCookie = "w3_trade_swap_to_chain";
export const tradeSwapToCoinCookie = "w3_trade_swap_to_coin";
export const tradeAutoApprovalCookie = "w3_trade_auto_approval";
export const tradeLendDefiCookie = "w3_trade_lend_defi";
export const tradeLendChainCookie = "w3_trade_lend_chain";
export const tradeLendMarketCookie = "w3_trade_lend_market";
export const tradeYieldDefiCookie = "w3_trade_yield_defi";
export const tradeYieldChainCookie = "w3_trade_yield_chain";
export const tradeYieldMarketCookie = "w3_trade_yield_market";
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
export const tradeSendChainCookie = "w3_trade_send_chain";
export const tradeSendCoinCookie = "w3_trade_send_coin";
export const tradeSendToWalletCookie = "w3_trade_send_to_wallet";
export const tradeChainSelectEvent = "w3:tradeChainSelect";
export const cookieMaxAge = 60 * 60 * 24 * 365;
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

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function getPickerSortText(value = "") {
  return String(value ?? "").toLowerCase();
}

function getPickerSortNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

export function TradePickerMenu({ className = "", children }) {
  return <div className={cn("sendWalletMenu", className)}>{children}</div>;
}

export function TradePickerColumn({ title = "", children }) {
  return (
    <div className="sendWalletMenuCol">
      <span className="sendWalletMenuTitle">{title}</span>
      {children}
    </div>
  );
}

export function TradePickerTable({ className = "", headers = [], children }) {
  return (
    <table className={cn("lendMarketTable", "tradePickerTable", className)}>
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th key={`${index}_${String(header?.key || header)}`}>{header}</th>
          ))}
        </tr>
      </thead>
      {children}
    </table>
  );
}

export function TradePickerRow({
  active = false,
  unsupported = false,
  onClick,
  children,
}) {
  return (
    <tr
      className={cn(
        "lendMarketRow",
        active ? "on" : "",
        unsupported ? "unsupported" : "",
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TradePickerCell({ className = "", colSpan, children }) {
  return (
    <td className={className} colSpan={colSpan}>
      {children}
    </td>
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
    <button
      type="button"
      className={
        activeSort == sortKey
          ? "lendMarketSortHeader on"
          : "lendMarketSortHeader"
      }
      onClick={() => onSort(sortKey)}
    >
      {children}
    </button>
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

function getWalletStandardAccount(provider, address = "") {
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

export function qtyInputSize(value = "") {
  return Math.max(String(value ?? "").length + 1, 10);
}

export function qtyInputStyle(value = "") {
  return {
    maxWidth: "none",
    width: `${qtyInputSize(value)}ch`,
  };
}

export function rangeQtyInput(value, maxValue, maxQty, decimals = 18) {
  const n = toNum(value);
  const maxN = toNum(maxValue);

  if (maxN > 0 && n >= maxN) return formatTradeQty(maxQty, decimals);

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

function base64ToBytes(text = "") {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

function relaySignMessageBytes(sign = {}) {
  const message =
    sign.message ?? sign.data ?? sign.value ?? sign.signableMessage ?? "";
  if (message instanceof Uint8Array) return message;
  if (Array.isArray(message)) return Uint8Array.from(message);
  if (Array.isArray(message?.data)) return Uint8Array.from(message.data);
  if (typeof message != "string") {
    return ethers.toUtf8Bytes(JSON.stringify(message || ""));
  }

  const text = message.trim();
  if (ethers.isHexString(text)) return ethers.getBytes(text);
  if (
    /^[A-Za-z0-9+/]+={0,2}$/.test(text) &&
    text.length % 4 == 0 &&
    text.length > 16
  ) {
    try {
      return base64ToBytes(text);
    } catch {
      // Fall through to UTF-8.
    }
  }

  return ethers.toUtf8Bytes(message);
}

function bytesToBase58(bytes = []) {
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

function getSolanaSignature(result) {
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

async function getBrowserSigner({ wallet = "", address = "", chainId }) {
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

async function getBrowserSolanaSigner({ wallet = "", address = "" }) {
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

function isRelaySolanaSignatureItem(item = {}) {
  const signatureKind = String(item?.sign?.signatureKind || "").toLowerCase();

  return (
    Number(item?.chainId) == 792703809 ||
    ["ed25519", "solana", "svm"].some((key) => signatureKind.includes(key))
  );
}

async function signBrowserRelaySolanaItem({ item, wallet = "", address = "" }) {
  const provider = await getBrowserSolanaSigner({ wallet, address });
  const message = relaySignMessageBytes(item.sign || {});
  let result;

  if (provider.walletStandard) {
    const standardWallet = provider.walletStandardWallet;
    const account = getWalletStandardAccount(provider, address);
    const signMessage =
      standardWallet?.features?.["solana:signMessage"]?.signMessage;
    if (!account) throw new Error("Solana wallet account missing");
    if (signMessage) {
      result = await signMessage({
        account,
        message,
      });
    }
  }

  if (!result && provider.signMessage) {
    result = await provider.signMessage(message, "utf8");
  }
  if (!result) throw new Error("Solana wallet cannot sign Relay message");

  const signature = getSolanaSignature(result);
  if (!signature) throw new Error("Solana wallet returned no signature");
  await submitRelaySignature({ post: item.post, signature });

  return { signatureKind: item.sign?.signatureKind || "ed25519" };
}

export async function signBrowserRelayItem({
  item,
  wallet = "",
  address = "",
}) {
  if (isRelaySolanaSignatureItem(item)) {
    return signBrowserRelaySolanaItem({ item, wallet, address });
  }

  const signer = await getBrowserSigner({
    wallet,
    address,
    chainId: item.chainId,
  });
  const sign = item.sign || {};
  let signature = "";

  if (sign.signatureKind == "eip191") {
    const message = sign.message || "";
    signature = await signer.signMessage(
      ethers.isHexString(message) ? ethers.getBytes(message) : message,
    );
  } else if (sign.signatureKind == "eip712") {
    const types = { ...(sign.types || {}) };
    delete types.EIP712Domain;
    signature = await signer.signTypedData(sign.domain, types, sign.value);
  } else {
    throw new Error(`Relay signature unsupported: ${sign.signatureKind}`);
  }

  await submitRelaySignature({ post: item.post, signature });

  return { signatureKind: sign.signatureKind };
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
