export const walletConnectStorageKey = "w3_walletConnect";
export const walletConnectEvent = "w3_walletConnectChange";
const walletTypes = ["evm", "solana", "tron"];

function cleanWalletType(type = "") {
  return walletTypes.includes(type) ? type : "";
}

function cleanWalletMeta(meta) {
  if (!meta?.type || !meta?.wallet || !meta?.label || !meta?.address) {
    return null;
  }

  return {
    type: cleanWalletType(meta.type) || "evm",
    wallet: String(meta.wallet),
    label: String(meta.label),
    address: String(meta.address),
  };
}

function readWalletStore() {
  try {
    const data = JSON.parse(
      window.localStorage.getItem(walletConnectStorageKey) || "null",
    );
    const current = cleanWalletMeta(data);
    const wallets = {
      ...(data?.wallets || {}),
      ...(current ? { [current.type]: current } : {}),
    };
    const blockedTypes = [
      ...new Set(
        (Array.isArray(data?.blockedTypes) ? data.blockedTypes : [])
          .map(cleanWalletType)
          .filter(Boolean),
      ),
    ];

    return {
      current,
      blockedTypes,
      wallets: Object.fromEntries(
        Object.entries(wallets)
          .map(([type, meta]) => [type, cleanWalletMeta({ ...meta, type })])
          .filter(([, meta]) => meta),
      ),
    };
  } catch {
    return { current: null, blockedTypes: [], wallets: {} };
  }
}

export function readStoredWallet(type = "") {
  if (typeof window == "undefined") return null;

  const store = readWalletStore();
  const cleanType = cleanWalletType(type);
  if (cleanType) return store.wallets[cleanType] || null;

  return store.current;
}

export function isWalletTypeInferenceBlocked(type = "") {
  if (typeof window == "undefined") return false;

  const cleanType = cleanWalletType(type);
  return !!cleanType && readWalletStore().blockedTypes.includes(cleanType);
}

export function saveStoredWallet(meta) {
  if (typeof window == "undefined" || !meta?.address) return;

  const cleanMeta = cleanWalletMeta(meta);
  if (!cleanMeta) return;

  const store = readWalletStore();
  const wallets = {
    ...store.wallets,
    [cleanMeta.type]: cleanMeta,
  };
  const blockedTypes = store.blockedTypes.filter(
    (type) => type != cleanMeta.type,
  );

  window.localStorage.setItem(
    walletConnectStorageKey,
    JSON.stringify({
      ...cleanMeta,
      blockedTypes,
      wallets,
    }),
  );
  window.dispatchEvent(new CustomEvent(walletConnectEvent));
}

export function clearStoredWallet(type = "") {
  if (typeof window == "undefined") return;

  const cleanType = cleanWalletType(type);
  if (!cleanType) {
    window.localStorage.removeItem(walletConnectStorageKey);
    window.dispatchEvent(new CustomEvent(walletConnectEvent));
    return;
  }

  const store = readWalletStore();
  const wallets = { ...store.wallets };
  delete wallets[cleanType];
  const blockedTypes = [...new Set([...store.blockedTypes, cleanType])];
  const current =
    store.current?.type == cleanType
      ? Object.values(wallets)[0] || null
      : store.current;

  window.localStorage.setItem(
    walletConnectStorageKey,
    JSON.stringify({
      ...(current || {}),
      blockedTypes,
      wallets,
    }),
  );
  window.dispatchEvent(new CustomEvent(walletConnectEvent));
}
