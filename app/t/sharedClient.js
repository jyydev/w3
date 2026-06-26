"use client";

import { ethers } from "ethers";
import { VersionedTransaction } from "@solana/web3.js";
import { dexs, lendings, scanners } from "@/sets";
import {
  confirmSolanaTransaction,
  sendSolanaRawTransaction,
  submitRelaySignature,
} from "./sharedAct";

export const tradeShowCookie = "w3_trade_show";
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

function cleanInputValue(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (/^0+[^.]/.test(text)) return text.replace(/^0+/, "") || "0";

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
  return value === "" ? "0" : fp(value);
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

export async function signBrowserRelayItem({
  item,
  wallet = "",
  address = "",
}) {
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
  const label = `${tx.chain} ${tx.type ? `${tx.type} ` : ""}${shortHash(tx.hash)}`;

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
      </span>
    </span>
  );
}
