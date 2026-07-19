export const walletConnectStorageKey = "w3_walletConnect";
export const walletConnectEvent = "w3_walletConnectChange";

function cleanWalletMeta(meta) {
  if (!meta?.type || !meta?.wallet || !meta?.label || !meta?.address) {
    return null;
  }

  return {
    type: ["evm", "solana", "tron"].includes(meta.type)
      ? meta.type
      : "evm",
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

    return {
      current,
      wallets: Object.fromEntries(
        Object.entries(wallets)
          .map(([type, meta]) => [type, cleanWalletMeta({ ...meta, type })])
          .filter(([, meta]) => meta),
      ),
    };
  } catch {
    return { current: null, wallets: {} };
  }
}

export function readStoredWallet(type = "") {
  if (typeof window == "undefined") return null;

  const store = readWalletStore();
  const cleanType = ["evm", "solana", "tron"].includes(type) ? type : "";
  if (cleanType) return store.wallets[cleanType] || null;

  return store.current;
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

  window.localStorage.setItem(
    walletConnectStorageKey,
    JSON.stringify({
      ...cleanMeta,
      wallets,
    }),
  );
  window.dispatchEvent(new CustomEvent(walletConnectEvent));
}

export function clearStoredWallet(type = "") {
  if (typeof window == "undefined") return;

  const cleanType = ["evm", "solana", "tron"].includes(type) ? type : "";
  if (!cleanType) {
    window.localStorage.removeItem(walletConnectStorageKey);
    window.dispatchEvent(new CustomEvent(walletConnectEvent));
    return;
  }

  const store = readWalletStore();
  const wallets = { ...store.wallets };
  delete wallets[cleanType];
  const current =
    store.current?.type == cleanType
      ? Object.values(wallets)[0] || null
      : store.current;

  if (!current && !Object.keys(wallets).length) {
    window.localStorage.removeItem(walletConnectStorageKey);
  } else {
    window.localStorage.setItem(
      walletConnectStorageKey,
      JSON.stringify({
        ...(current || {}),
        wallets,
      }),
    );
  }
  window.dispatchEvent(new CustomEvent(walletConnectEvent));
}
