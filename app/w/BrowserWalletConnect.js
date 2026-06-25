"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  clearStoredWallet,
  readStoredWallet,
  saveStoredWallet,
} from "./browserWalletStorage";

const eip6963ProviderDetails = [];
let eip6963Listening = false;
const walletStandardWallets = [];
let walletStandardListening = false;
const walletStandardApi = Object.freeze({
  register: (...wallets) => {
    addWalletStandardWallets(...wallets);
    return () => {};
  },
});

function shortAddress(address = "") {
  if (!address) return "";
  return address.startsWith("0x")
    ? `${address.slice(0, 5)}..${address.slice(-3)}`
    : `${address.slice(0, 4)}..${address.slice(-4)}`;
}

function getAddressKey(type = "evm", address = "") {
  const clean = String(address || "").trim();
  if (!clean) return "";

  const cleanType = type == "solana" ? "solana" : "evm";
  return `${cleanType}:${cleanType == "solana" ? clean : clean.toLowerCase()}`;
}

function findWalletEntryByAddress(
  entries = [],
  type = "evm",
  address = "",
) {
  const key = getAddressKey(type, address);
  if (!key) return null;

  return (
    entries.find((entry) => getAddressKey(type, entry?.address) == key) ?? null
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

function listenEip6963Providers() {
  if (typeof window == "undefined" || eip6963Listening) return;

  window.addEventListener("eip6963:announceProvider", (event) => {
    addEip6963Provider(event?.detail);
  });
  eip6963Listening = true;
}

function requestEip6963Providers() {
  if (typeof window == "undefined") return;

  listenEip6963Providers();
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

function getEip6963Info(provider) {
  return eip6963ProviderDetails.find((entry) => entry?.provider == provider)
    ?.info;
}

function addWalletStandardWallets(...wallets) {
  wallets.forEach((wallet) => {
    if (!wallet || walletStandardWallets.includes(wallet)) return;
    walletStandardWallets.push(wallet);
  });
}

function listenWalletStandardWallets() {
  if (typeof window == "undefined" || walletStandardListening) return;

  window.addEventListener("wallet-standard:register-wallet", (event) => {
    event?.detail?.(walletStandardApi);
  });
  walletStandardListening = true;
}

function requestWalletStandardWallets() {
  if (typeof window == "undefined") return;

  listenWalletStandardWallets();

  const event = new Event("wallet-standard:app-ready", {
    bubbles: false,
    cancelable: false,
    composed: false,
  });
  Object.defineProperty(event, "detail", { value: walletStandardApi });
  window.dispatchEvent(event);
}

function getEvmProviders() {
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
  if (!provider) return false;

  const name = getProviderName(provider);
  return (
    provider?.isRabby ||
    name.includes("rabby") ||
    (typeof window != "undefined" && provider == window.rabby)
  );
}

function isBinanceEvmProvider(provider) {
  if (!provider) return false;

  const name = getProviderName(provider);
  return (
    provider?.isBinance ||
    name.includes("binance") ||
    (typeof window != "undefined" && provider == window.BinanceChain)
  );
}

function isMetaMaskEvmProvider(provider) {
  if (!provider || isRabbyProvider(provider) || isBinanceEvmProvider(provider)) {
    return false;
  }

  const name = getProviderName(provider);
  return (
    provider?.isMetaMask ||
    provider?._metamask ||
    name.includes("metamask")
  );
}

function getEvmProvider(wallet = "") {
  const providers = getEvmProviders();

  if (wallet == "rabby") {
    return providers.find(isRabbyProvider);
  }
  if (wallet == "metamask") {
    return providers.find(isMetaMaskEvmProvider);
  }
  if (wallet == "binance") {
    return providers.find(isBinanceEvmProvider);
  }

  return null;
}

async function getEvmProviderReady(wallet = "") {
  let provider = getEvmProvider(wallet);
  if (provider || typeof window == "undefined") return provider;

  requestEip6963Providers();
  await new Promise((resolve) => setTimeout(resolve, 150));

  return getEvmProvider(wallet);
}

async function requestEvmAccounts(provider) {
  if (provider?.request) {
    return provider.request({ method: "eth_requestAccounts" });
  }
  if (provider?.enable) return provider.enable();

  return [];
}

function withTimeout(promise, ms, message) {
  let timeoutId;

  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timeoutId)),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

function getPhantomSolanaProvider() {
  if (typeof window == "undefined") return null;

  return window.phantom?.solana || (window.solana?.isPhantom && window.solana);
}

function isPhantomSupportedOrigin() {
  if (typeof window == "undefined") return false;

  const { hostname, protocol } = window.location;
  return (
    protocol == "https:" ||
    hostname == "localhost" ||
    hostname == "127.0.0.1"
  );
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
    accounts: wallet.accounts || [],
    isMetaMask: lowerName.includes("metamask"),
    isBinance: lowerName.includes("binance"),
    connect: () => wallet.features["standard:connect"].connect({ silent: false }),
    disconnect: () =>
      wallet.features?.["standard:disconnect"]?.disconnect?.(),
  };
}

function getWalletStandardSolanaProviders() {
  return walletStandardWallets
    .filter(isWalletStandardSolanaWallet)
    .map(getWalletStandardProvider);
}

function getProviderName(provider = {}) {
  const eip6963Info = getEip6963Info(provider);

  return String(
    eip6963Info?.name ||
      eip6963Info?.rdns ||
      provider?.name ||
      provider?.walletName ||
      provider?.metadata?.name ||
      provider?.providerName ||
      "",
  ).toLowerCase();
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
    getEvmProviders().some(
      (evmProvider) =>
        isMetaMaskEvmProvider(evmProvider) && evmProvider?.solana == provider,
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
    getEvmProviders().some(
      (evmProvider) =>
        isBinanceEvmProvider(evmProvider) && evmProvider?.solana == provider,
    )
  );
}

function getSolanaProviderCandidates() {
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
    ...getEvmProviders().map((provider) => provider?.solana),
    window.BinanceChain?.solana,
    ...getWalletStandardSolanaProviders(),
  ]);
}

function getSolanaProviders() {
  if (typeof window == "undefined") return {};

  const candidates = getSolanaProviderCandidates();

  return {
    phantom: getPhantomSolanaProvider(),
    metamask: candidates.find(isMetaMaskSolanaProvider) || null,
    binance: candidates.find(isBinanceSolanaProvider) || null,
  };
}

function getSolanaProvider(wallet = "") {
  return getSolanaProviders()[wallet] || null;
}

async function getSolanaProviderReady(wallet = "") {
  let provider = getSolanaProvider(wallet);
  if (provider || typeof window == "undefined") return provider;

  requestWalletStandardWallets();
  await new Promise((resolve) => setTimeout(resolve, 150));

  return getSolanaProvider(wallet);
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
  if (Array.isArray(result)) {
    return getSolanaAddressFromAccount(result[0]);
  }

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
    getSolanaAddressFromAccount(provider?.walletStandardWallet?.accounts?.[0]) ||
    ""
  );
}

async function requestSolanaAddress(provider) {
  const attempts = [
    provider?.connect
      ? () => provider.connect({ onlyIfTrusted: false })
      : null,
    provider?.request
      ? () =>
          provider.request({
            method: "connect",
            params: { onlyIfTrusted: false },
          })
      : null,
    provider?.request
      ? () => provider.request({ method: "solana_connect" })
      : null,
    provider?.request
      ? () => provider.request({ method: "solana_requestAccounts" })
      : null,
    provider?.request
      ? () =>
          provider.request({
            method: "wallet_requestAccounts",
            params: { chains: ["solana:mainnet"] },
          })
      : null,
    provider?.request
      ? () =>
          provider.request({
            method: "wallet_requestAccounts",
            params: [{ chains: ["solana:mainnet"] }],
          })
      : null,
  ].filter(Boolean);

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const result = await withTimeout(
        attempt(),
        45000,
        "Solana wallet connect timed out",
      );
      const address = getSolanaAddress(result, provider);
      if (address) return address;
    } catch (e) {
      lastError = e;
      if (e?.code == 4001) throw e;
    }
  }

  const address = getSolanaAddress(null, provider);
  if (address) return address;

  throw lastError || new Error("Solana wallet returned no public key");
}

function getWalletUrl({ routeBase = "/w", walletType = "evm", address = "" }) {
  const base = String(routeBase || "/w").replace(/\/+$/, "") || "/w";
  const params = new URLSearchParams();

  if (walletType && walletType != "evm") params.set("chain", walletType);
  if (address) params.set("addr", address);

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function getProviderForMeta(meta) {
  if (!meta) return null;

  return meta.type == "solana"
    ? getSolanaProvider(meta.wallet)
    : getEvmProvider(meta.wallet);
}

function getConnectType(walletType = "evm") {
  return walletType == "solana" ? "solana" : "evm";
}

function readWalletMeta(type = "") {
  const meta = readStoredWallet(type);
  if (!meta) return null;

  return {
    ...meta,
    provider: getProviderForMeta(meta),
  };
}

async function getCurrentEvmAddress(provider) {
  if (!provider) return "";
  if (provider.selectedAddress) return provider.selectedAddress;

  try {
    const accounts = provider.request
      ? await provider.request({ method: "eth_accounts" })
      : [];
    return accounts?.[0] || "";
  } catch {
    return "";
  }
}

function getCurrentSolanaAddress(provider) {
  if (!provider) return "";

  return getSolanaAddress(null, provider);
}

async function getSameWalletMetaForType(sourceMeta, targetType) {
  if (!sourceMeta?.wallet || sourceMeta.type == targetType) return null;

  if (targetType == "evm") {
    const provider = await getEvmProviderReady(sourceMeta.wallet);
    const address = await getCurrentEvmAddress(provider);
    return address
      ? {
          type: "evm",
          wallet: sourceMeta.wallet,
          label: sourceMeta.label,
          address,
          provider,
        }
      : null;
  }

  const provider = await getSolanaProviderReady(sourceMeta.wallet);
  const address = getCurrentSolanaAddress(provider);
  return address
    ? {
        type: "solana",
        wallet: sourceMeta.wallet,
        label: sourceMeta.label,
        address,
        provider,
      }
    : null;
}

async function resolveWalletMeta(walletType = "evm") {
  const targetType = getConnectType(walletType);
  const stored = readWalletMeta(targetType);
  if (stored) return stored;

  const current = readWalletMeta();
  const sameWalletMeta = await getSameWalletMetaForType(current, targetType);
  if (sameWalletMeta) {
    saveStoredWallet(sameWalletMeta);
    return sameWalletMeta;
  }

  return null;
}

function BrowserWalletConnect({
  routeBase = "/w",
  walletType = "evm",
  selectedAddress = "",
  walletEntries = [],
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState("");
  const [connectedWallet, setConnectedWallet] = useState(null);
  const displayAddress = connected;
  const currentType =
    (connectedWallet?.type || walletType) == "solana" ? "Solana" : "EVM";
  const savedWalletEntry = findWalletEntryByAddress(
    walletEntries,
    connectedWallet?.type || walletType,
    displayAddress,
  );
  const savedWalletName = savedWalletEntry?.name || "";
  const evmWallets = useMemo(
    () => [
      ["rabby", "Rabby"],
      ["metamask", "MetaMask"],
      ["binance", "Binance"],
    ],
    [],
  );
  const solanaWallets = useMemo(
    () => [
      ["phantom", "Phantom"],
      ["metamask", "MetaMask"],
      ["binance", "Binance"],
    ],
    [],
  );

  useEffect(() => {
    requestEip6963Providers();
    requestWalletStandardWallets();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWalletMeta() {
      const meta = await resolveWalletMeta(walletType);
      if (cancelled) return;

      setConnected(meta?.address || "");
      setConnectedWallet(meta);
    }

    loadWalletMeta();

    return () => {
      cancelled = true;
    };
  }, [selectedAddress, walletType]);

  useEffect(() => {
    const provider = connectedWallet?.provider;
    if (!provider) return;

    const handleEvmAccounts = (accounts = []) => {
      const address = accounts?.[0] || "";
      if (!address) return disconnect(false);

      openAddress(address, "evm", connectedWallet);
    };
    const handleSolanaAccount = (publicKey) => {
      const address = getSolanaAddress(publicKey, provider);
      if (!address) return disconnect(false);

      openAddress(address, "solana", connectedWallet);
    };
    const handleSolanaAccounts = (accounts = []) => {
      const address = getSolanaAddress({ accounts }, provider);
      if (!address) return disconnect(false);

      openAddress(address, "solana", connectedWallet);
    };

    if (connectedWallet.type == "evm" && provider.on) {
      provider.on("accountsChanged", handleEvmAccounts);
      return () => {
        provider.removeListener?.("accountsChanged", handleEvmAccounts);
      };
    }

    if (connectedWallet.type == "solana" && provider.on) {
      provider.on("accountChanged", handleSolanaAccount);
      provider.on("accountsChanged", handleSolanaAccounts);
      return () => {
        provider.removeListener?.("accountChanged", handleSolanaAccount);
        provider.removeListener?.("accountsChanged", handleSolanaAccounts);
        provider.off?.("accountChanged", handleSolanaAccount);
        provider.off?.("accountsChanged", handleSolanaAccounts);
      };
    }
  }, [connectedWallet]);

  function openAddress(address, type, walletMeta = connectedWallet) {
    setConnected(address);
    if (walletMeta) {
      const nextMeta = { ...walletMeta, type, address };
      setConnectedWallet(nextMeta);
      saveStoredWallet(nextMeta);
    }
    setOpen(false);
    router.push(getWalletUrl({ routeBase, walletType: type, address }));
  }

  async function connectEvm(wallet, label) {
    try {
      const provider = await getEvmProviderReady(wallet);
      if (!provider) {
        toast.error(`${label} wallet not found`);
        return;
      }

      const accounts = await requestEvmAccounts(provider);
      const address = accounts?.[0] || provider.selectedAddress || "";
      if (!address) throw new Error(`${label} returned no address`);

      toast.success(`connected ${label}`);
      openAddress(address, "evm", { type: "evm", wallet, label, provider });
    } catch (e) {
      toast.error(e?.message || `${label} connect failed`);
    }
  }

  async function connectPhantom() {
    if (!isPhantomSupportedOrigin()) {
      toast.error("Phantom requires https, localhost, or 127.0.0.1");
      return;
    }

    const provider = getPhantomSolanaProvider();
    if (!provider) {
      toast.error("Phantom Solana wallet not found");
      return;
    }
    if (!provider.connect) {
      toast.error("Phantom Solana connect is not available");
      return;
    }

    const toastId = toast.loading("connecting Phantom Solana...");

    try {
      const result = await withTimeout(
        provider.connect(),
        30000,
        "Phantom connect timed out",
      );
      const address = getSolanaAddress(result, provider);
      if (!address) throw new Error("Phantom returned no public key");

      toast.success("connected Phantom", { id: toastId });
      openAddress(address, "solana", {
        type: "solana",
        wallet: "phantom",
        label: "Phantom",
        provider,
      });
    } catch (e) {
      toast.error(e?.message || "Phantom connect failed", { id: toastId });
    }
  }

  async function connectSolana(wallet, label) {
    const toastId = toast.loading(`connecting ${label} Solana...`);

    try {
      const provider = await getSolanaProviderReady(wallet);
      if (!provider) {
        toast.error(`${label} Solana wallet not found`, { id: toastId });
        return;
      }

      const address = await requestSolanaAddress(provider);
      if (!address) throw new Error(`${label} returned no public key`);

      toast.success(`connected ${label}`, { id: toastId });
      openAddress(address, "solana", {
        type: "solana",
        wallet,
        label,
        provider,
      });
    } catch (e) {
      toast.error(e?.message || `${label} connect failed`, { id: toastId });
    }
  }

  function disconnect(closeCard = true) {
    try {
      const disconnectResult = connectedWallet?.provider?.disconnect?.();
      disconnectResult?.catch?.(() => {});
    } catch {}
    setConnected("");
    setConnectedWallet(null);
    clearStoredWallet(connectedWallet?.type || getConnectType(walletType));
    if (closeCard) setOpen(false);
    router.push(getWalletUrl({ routeBase, walletType }));
  }

  return (
    <span
      className={`infoHover clickInfo walletConnect${open ? " infoOpen" : ""}`}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`walletConnectBtn${displayAddress ? " connected" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="walletConnectDot"></span>
        {displayAddress ? (
          <>
            <span>{connectedWallet?.label || "wallet"}</span>
            <span className="gray">{currentType}</span>
            <span>{shortAddress(displayAddress)}</span>
            {savedWalletName && <span className="gray">{savedWalletName}</span>}
          </>
        ) : (
          "connect"
        )}
      </button>
      <span className="infoCard walletConnectCard">
        <span className="walletConnectCardTop">
          <span className="infoCardTitle">Browser wallet</span>
          {displayAddress && (
            <button
              type="button"
              className="walletConnectDisconnect"
              onClick={() => disconnect()}
            >
              disconnect
            </button>
          )}
        </span>
        {displayAddress && (
          <>
            <span className="walletConnectConnected">
              <span className="gray">
                {connectedWallet?.label || "connected"}{" "}
                <span className="walletConnectType">{currentType}</span>
              </span>
              <span className="walletConnectAddress">{displayAddress}</span>
              {savedWalletName && (
                <span>
                  wallet: <span className="white">{savedWalletName}</span>
                </span>
              )}
            </span>
          </>
        )}
        <span className="walletConnectGroup">
          <span className="walletConnectGroupTitle">EVM</span>
          <span className="walletConnectOptionGrid">
            {evmWallets.map(([value, label]) => (
              <button
                type="button"
                className="walletConnectOption"
                key={value}
                onClick={() => connectEvm(value, label)}
              >
                {label}
              </button>
            ))}
          </span>
        </span>
        <span className="walletConnectGroup">
          <span className="walletConnectGroupTitle">Solana</span>
          <span className="walletConnectOptionGrid">
            {solanaWallets.map(([value, label]) => (
              <button
                type="button"
                className="walletConnectOption"
                key={value}
                onClick={() =>
                  value == "phantom"
                    ? connectPhantom()
                    : connectSolana(value, label)
                }
              >
                {label}
              </button>
            ))}
          </span>
        </span>
      </span>
    </span>
  );
}

export default BrowserWalletConnect;
