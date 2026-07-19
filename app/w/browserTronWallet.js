"use client";

import { getUnsignedTronTransaction } from "@/fn/tronTx";

const tronWallets = [
  ["tronlink", "TronLink"],
  ["metamask", "MetaMask"],
  ["binance", "Binance"],
];

const addressM = new Map();
let metaMaskAdapter = null;
let metaMaskAdapterPromise = null;

export const tronBrowserWallets = tronWallets;

export function getTronBrowserWalletLabel(wallet = "") {
  return (
    tronWallets.find(([value]) => value == wallet)?.[1] ||
    (wallet ? wallet : "Tron wallet")
  );
}

function withTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function getTronLinkProvider() {
  if (typeof window == "undefined") return null;

  const provider = window.tronLink || window.tronWeb?.provider || null;
  const tronWeb = provider?.tronWeb || window.tronWeb || null;
  if (!provider && !tronWeb) return null;

  return provider || { tronWeb };
}

function getBinanceProvider() {
  if (typeof window == "undefined") return null;

  return window.binancew3w?.tron || null;
}

async function getMetaMaskAdapter() {
  if (typeof window == "undefined") return null;

  metaMaskAdapterPromise ??= import(
    "@tronweb3/tronwallet-adapter-metamask-tron"
  ).then(({ MetaMaskAdapter }) => {
    metaMaskAdapter = new MetaMaskAdapter({
      openAppWithDeeplink: true,
      openUrlWhenWalletNotFound: true,
    });

    return metaMaskAdapter;
  });

  return metaMaskAdapterPromise;
}

function getTronWeb(provider) {
  if (typeof window == "undefined") return null;

  return provider?.tronWeb || window.tronWeb || null;
}

function getAddressFromResult(result) {
  if (typeof result == "string") return result.trim();
  if (Array.isArray(result)) return String(result[0] || "").trim();

  const accounts = result?.accounts;
  return String(
    result?.address ||
      result?.base58 ||
      (Array.isArray(accounts) ? accounts[0] : accounts) ||
      "",
  ).trim();
}

export function getBrowserTronAddress(
  provider,
  wallet = "tronlink",
  result = null,
) {
  const explicitEmpty =
    (typeof result == "string" && !result.trim()) ||
    (Array.isArray(result) && !result.length) ||
    (Array.isArray(result?.accounts) && !result.accounts.length);
  if (explicitEmpty) {
    addressM.delete(wallet);
    return "";
  }

  const resultAddress = getAddressFromResult(result);
  const tronWeb = wallet == "tronlink" ? getTronWeb(provider) : null;
  const address = String(
    resultAddress ||
      provider?.address ||
      addressM.get(wallet) ||
      tronWeb?.defaultAddress?.base58 ||
      "",
  ).trim();

  if (address) addressM.set(wallet, address);

  return address;
}

export function getBrowserTronProvider(wallet = "tronlink") {
  if (wallet == "tronlink") return getTronLinkProvider();
  if (wallet == "binance") return getBinanceProvider();
  if (wallet == "metamask") return metaMaskAdapter;

  return null;
}

export async function getBrowserTronProviderReady(wallet = "tronlink") {
  if (wallet == "metamask") return getMetaMaskAdapter();

  let provider = getBrowserTronProvider(wallet);
  if (provider || typeof window == "undefined") return provider;

  await new Promise((resolve) => setTimeout(resolve, 300));
  provider = getBrowserTronProvider(wallet);

  return provider;
}

async function connectTronLink(provider) {
  let lastError;
  const tronWeb = getTronWeb(provider);
  const requestOwner = provider?.request ? provider : tronWeb;
  const request = requestOwner?.request;

  if (request) {
    try {
      const result = await withTimeout(
        request.call(requestOwner, { method: "tron_requestAccounts" }),
        45000,
        "TronLink connect timed out",
      );
      const address = getBrowserTronAddress(provider, "tronlink", result);
      if (address) return address;
    } catch (error) {
      lastError = error;
      if (error?.code == 4001) throw error;
    }
  }

  const address = getBrowserTronAddress(provider, "tronlink");
  if (address) return address;

  throw lastError || new Error("TronLink returned no address");
}

export async function connectBrowserTronWallet(wallet = "tronlink") {
  const label = getTronBrowserWalletLabel(wallet);
  const provider = await getBrowserTronProviderReady(wallet);
  if (!provider) throw new Error(`${label} Tron wallet not found`);

  let result;
  if (wallet == "tronlink") {
    result = await connectTronLink(provider);
  } else if (wallet == "metamask") {
    await withTimeout(
      provider.connect(),
      45000,
      `${label} Tron connect timed out`,
    );
    result = provider.address;
  } else if (wallet == "binance") {
    result = await withTimeout(
      provider.getAccount(),
      45000,
      `${label} Tron connect timed out`,
    );
  }

  const address = getBrowserTronAddress(provider, wallet, result);
  if (!address) throw new Error(`${label} returned no Tron address`);

  return { provider, address };
}

export function subscribeBrowserTronAccounts({
  provider,
  wallet = "tronlink",
  onChange,
} = {}) {
  if (!provider || typeof onChange != "function") return () => {};

  const handleAccounts = (accounts = []) => {
    const address = getBrowserTronAddress(provider, wallet, accounts);
    if (!address) addressM.delete(wallet);
    onChange(address);
  };
  const handleDisconnect = () => {
    addressM.delete(wallet);
    onChange("");
  };
  const handleMessage = (event) => {
    const message = event?.data?.message;
    if (message?.action != "accountsChanged") return;

    handleAccounts(message.data?.address || message.data);
  };

  provider.on?.("accountsChanged", handleAccounts);
  provider.on?.("disconnect", handleDisconnect);
  if (wallet == "tronlink" && typeof window != "undefined") {
    window.addEventListener("message", handleMessage);
  }

  return () => {
    provider.removeListener?.("accountsChanged", handleAccounts);
    provider.off?.("accountsChanged", handleAccounts);
    provider.removeListener?.("disconnect", handleDisconnect);
    provider.off?.("disconnect", handleDisconnect);
    if (wallet == "tronlink" && typeof window != "undefined") {
      window.removeEventListener("message", handleMessage);
    }
  };
}

export async function disconnectBrowserTronWallet({
  provider,
  wallet = "tronlink",
} = {}) {
  addressM.delete(wallet);

  try {
    await provider?.disconnect?.();
  } catch {}
}

export async function signBrowserTronTransaction({
  wallet = "tronlink",
  address = "",
  transaction = null,
} = {}) {
  if (!transaction) throw new Error("Tron transaction missing");

  const label = getTronBrowserWalletLabel(wallet);
  const { provider, address: signerAddress } =
    await connectBrowserTronWallet(wallet);
  if (address && signerAddress != address) {
    throw new Error(`connected wallet is ${shortTronAddress(signerAddress)}`);
  }

  let signed;
  const unsignedTransaction = getUnsignedTronTransaction(transaction);
  if (wallet == "tronlink") {
    const tronWeb = getTronWeb(provider);
    signed = await tronWeb?.trx?.sign?.(unsignedTransaction);
  } else {
    signed = await provider.signTransaction(unsignedTransaction);
  }

  if (typeof signed == "string") {
    try {
      signed = JSON.parse(signed);
    } catch {}
  }
  if (!signed || !Array.isArray(signed.signature) || !signed.signature.length) {
    throw new Error(`${label} did not sign transaction`);
  }

  return signed;
}

function shortTronAddress(address = "") {
  return address ? `${address.slice(0, 4)}..${address.slice(-4)}` : "";
}
