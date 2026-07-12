"use client";

const walletBalanceClientCacheM = new Map();
let walletBalanceClientViewSequence = 0;

export function createWalletBalanceClientViewId() {
  walletBalanceClientViewSequence += 1;
  return `wallet-view-${Date.now()}-${walletBalanceClientViewSequence}`;
}

function clone(value) {
  if (value === undefined) return undefined;

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function getWalletTypeKey(walletType = "evm") {
  return String(walletType || "evm").trim() || "evm";
}

function getAddressKey(address = "", walletType = "evm") {
  const text = String(address || "").trim();
  if (!text) return "";

  return getWalletTypeKey(walletType) == "solana" ? text : text.toLowerCase();
}

function getAddressCacheKey({
  walletType = "evm",
  address = "",
} = {}) {
  const type = getWalletTypeKey(walletType);
  const addressKey = getAddressKey(address, type);
  return type && addressKey ? `${type}:${addressKey}` : "";
}

function getAddressCacheEntry(scope = {}, create = false) {
  const key = getAddressCacheKey(scope);
  if (!key) return null;

  if (!walletBalanceClientCacheM.has(key) && create) {
    walletBalanceClientCacheM.set(key, {
      at: Date.now(),
      walletType: getWalletTypeKey(scope.walletType),
      addressKey: getAddressKey(scope.address, scope.walletType),
      chains: new Map(),
    });
  }

  return walletBalanceClientCacheM.get(key) || null;
}

function getChainCacheEntry({
  walletType = "evm",
  chain = "",
  address = "",
} = {}) {
  const entry = getAddressCacheEntry({ walletType, address });
  return entry?.chains?.get(chain) || null;
}

function isCacheScopeMatch(entry = {}, { walletType = "", address = "" } = {}) {
  const type = String(walletType || "").trim();
  const addressText = String(address || "").trim();
  if (type && entry.walletType != type) return false;
  if (
    addressText &&
    entry.addressKey != getAddressKey(addressText, type || entry.walletType)
  ) {
    return false;
  }

  return true;
}

function hasBalances(row = {}) {
  return !!Object.keys(row?.balances || {}).length;
}

function shouldStoreRow(row = {}) {
  if (!row?.address) return false;

  return hasBalances(row) || !row.error;
}

function getStoredRow(row = {}) {
  const next = clone(row) || {};
  delete next.clientCached;
  delete next.clientReloaded;
  delete next.clientFresh;
  delete next.clientCacheSource;
  return next;
}

function getChainMeta(chainE = {}) {
  const { rows, ...meta } = chainE || {};
  return clone(meta);
}

function getRequestedChainSet(chains = []) {
  const list = (Array.isArray(chains) ? chains : [])
    .map((chain) => String(chain || "").trim())
    .filter(Boolean);

  return list.length ? new Set(list) : null;
}

function getRequestedAddressSet(addresses = [], walletType = "evm") {
  const list = (Array.isArray(addresses) ? addresses : [])
    .map((address) => getAddressKey(address, walletType))
    .filter(Boolean);

  return list.length ? new Set(list) : null;
}

export function clearWalletBalanceClientCache(scope = {}) {
  const hasScope = scope?.walletType || scope?.address;
  if (!hasScope) {
    walletBalanceClientCacheM.clear();
    return { ok: true };
  }

  for (const [key, entry] of walletBalanceClientCacheM.entries()) {
    if (isCacheScopeMatch(entry, scope)) walletBalanceClientCacheM.delete(key);
  }

  return { ok: true };
}

export function getWalletBalanceClientCacheMeta(scope = {}) {
  const addressEntries = [...walletBalanceClientCacheM.values()].filter((entry) =>
    isCacheScopeMatch(entry, scope),
  );
  const chainEntries = addressEntries.flatMap((entry) => [
    ...entry.chains.values(),
  ]);
  const at = chainEntries.reduce(
    (latest, entry) => Math.max(latest, Number(entry?.at || 0)),
    0,
  );
  const chains = [
    ...new Set(chainEntries.map((entry) => entry.chain).filter(Boolean)),
  ];

  return {
    source: chainEntries.length ? "cache" : "",
    location: "client",
    at,
    ttlMs: 0,
    expiresAt: 0,
    entries: addressEntries.length,
    chainEntries: chainEntries.length,
    chains,
  };
}

export function writeWalletBalanceClientCache(
  data = [],
  { walletType = "evm", viewId = "" } = {},
) {
  const chainList = Array.isArray(data) ? data : data ? [data] : [];
  const type = getWalletTypeKey(walletType);

  for (const chainE of chainList) {
    const chain = String(chainE?.chain || "");
    if (!chain) continue;

    for (const row of chainE?.rows || []) {
      if (!shouldStoreRow(row)) continue;

      const addressEntry = getAddressCacheEntry(
        { walletType: type, address: row.address },
        true,
      );
      if (!addressEntry) continue;

      const at = Date.now();
      const existing = addressEntry.chains.get(chain);
      const entryViewId = row.clientCached
        ? existing?.viewId || ""
        : viewId || existing?.viewId || "";
      addressEntry.at = at;
      addressEntry.chains.set(chain, {
        at,
        chain,
        viewId: entryViewId,
        chainMeta: getChainMeta(chainE),
        row: getStoredRow(row),
      });
    }
  }
}

export function isWalletBalanceAddressCached({
  walletType = "evm",
  address = "",
  chains = [],
  requireAllChains = true,
  requireViewId = false,
} = {}) {
  const addressEntry = getAddressCacheEntry({ walletType, address });
  if (!addressEntry) return false;

  const chainList = (Array.isArray(chains) ? chains : [])
    .map((chain) => String(chain || "").trim())
    .filter(Boolean);
  if (!chainList.length) return addressEntry.chains.size > 0;

  const hasChainCache = (chain) => {
    const entry = addressEntry.chains.get(chain);
    return !!entry && (!requireViewId || !!entry.viewId);
  };

  return requireAllChains
    ? chainList.every(hasChainCache)
    : chainList.some(hasChainCache);
}

export function getWalletBalanceClientCacheData({
  walletType = "evm",
  addresses = [],
  chains = [],
  viewId = "",
} = {}) {
  const type = getWalletTypeKey(walletType);
  const addressSet = getRequestedAddressSet(addresses, type);
  const chainSet = getRequestedChainSet(chains);
  const chainOrder = Array.isArray(chains) ? chains : [];
  const chainM = new Map();

  for (const addressEntry of walletBalanceClientCacheM.values()) {
    if (type && addressEntry.walletType != type) continue;
    if (addressSet && !addressSet.has(addressEntry.addressKey)) continue;

    for (const entry of addressEntry.chains.values()) {
      if (chainSet && !chainSet.has(entry.chain)) continue;

      if (!chainM.has(entry.chain)) {
        chainM.set(entry.chain, {
          ...(clone(entry.chainMeta) || {}),
          chain: entry.chain,
          rows: [],
        });
      }

      const chainE = chainM.get(entry.chain);
      const isFreshView = !!viewId && entry.viewId == viewId;
      const row = {
        ...(clone(entry.row) || {}),
        clientCached: !isFreshView,
        clientReloaded: false,
        clientFresh: isFreshView,
      };
      const balanceCoins = Object.keys(row.balances || {});
      chainE.allCoins = [
        ...new Set([...(chainE.allCoins || []), ...balanceCoins]),
      ];
      chainE.coins = [...new Set([...(chainE.coins || []), ...balanceCoins])];
      chainE.rows.push(row);
    }
  }

  return [...chainM.values()].sort((a, b) => {
    const aIndex = chainOrder.indexOf(a.chain);
    const bIndex = chainOrder.indexOf(b.chain);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return String(a.chain).localeCompare(String(b.chain));
  });
}

export function mergeWalletBalanceData(...dataLists) {
  const chainM = new Map();

  for (const data of dataLists) {
    const chainList = Array.isArray(data) ? data : data ? [data] : [];
    for (const chainE of chainList) {
      const chain = String(chainE?.chain || "");
      if (!chain) continue;

      if (!chainM.has(chain)) {
        chainM.set(chain, {
          ...(clone(chainE) || {}),
          rows: [],
        });
      }

      const existing = chainM.get(chain);
      const rowM = new Map(
        (existing.rows || []).map((row) => [
          getAddressKey(row.address) || row.name,
          row,
        ]),
      );

      Object.assign(existing, {
        ...(clone(chainE) || {}),
        allCoins: [
          ...new Set([...(existing.allCoins || []), ...(chainE.allCoins || [])]),
        ],
        coins: [
          ...new Set([...(existing.coins || []), ...(chainE.coins || [])]),
        ],
        coinInfoM: {
          ...(existing.coinInfoM || {}),
          ...(chainE.coinInfoM || {}),
        },
      });

      for (const row of chainE.rows || []) {
        rowM.set(getAddressKey(row.address) || row.name, clone(row));
      }

      existing.rows = [...rowM.values()];
    }
  }

  return [...chainM.values()];
}

export function markWalletBalanceDataFresh(data = []) {
  const chainList = Array.isArray(data) ? data : data ? [data] : [];

  return chainList.map((chainE) => ({
    ...chainE,
    rows: (chainE.rows || []).map((row) => ({
      ...row,
      clientCached: false,
      clientReloaded: false,
      clientFresh: true,
    })),
  }));
}

export function applyWalletBalanceClientCache(
  data = [],
  { walletType = "evm", viewId = "" } = {},
) {
  const chainList = Array.isArray(data) ? data : data ? [data] : [];
  if (!chainList.length || !walletBalanceClientCacheM.size) return data;

  return chainList.map((chainE) => {
    const chain = String(chainE?.chain || "");
    if (!chain || !Array.isArray(chainE?.rows)) return chainE;

    return {
      ...chainE,
      rows: chainE.rows.map((row) => {
        const cachedEntry = getChainCacheEntry({
          walletType,
          chain,
          address: row?.address,
        });
        const cached = cachedEntry?.row;
        if (row?.clientFresh || row?.clientReloaded) return row;
        if (!cached || !hasBalances(cached)) return row;
        const isFreshView = !!viewId && cachedEntry.viewId == viewId;

        return {
          ...row,
          ...cached,
          balances: {
            ...(row.balances || {}),
            ...(cached.balances || {}),
          },
          errors: row.errors || cached.errors,
          clientCached: !isFreshView,
          clientReloaded: false,
          clientFresh: isFreshView,
        };
      }),
    };
  });
}

export function patchWalletBalanceClientCache({
  walletType = "evm",
  chain = "",
  address = "",
  coin = "",
  balance = null,
} = {}) {
  if (!chain || !coin || !balance) return;

  const addressEntry = getAddressCacheEntry({ walletType, address }, true);
  if (!addressEntry) return;

  const cached = addressEntry.chains.get(chain) || {
    at: Date.now(),
    chain,
    chainMeta: { chain },
    row: {
      address,
      balances: {},
    },
  };
  const row = getStoredRow(cached.row || {});

  row.address ||= address;
  row.balances = {
    ...(row.balances || {}),
    [coin]: {
      ...(row.balances?.[coin] || {}),
      ...clone(balance),
    },
  };

  const at = Date.now();
  addressEntry.at = at;
  addressEntry.chains.set(chain, {
    at,
    chain,
    viewId: cached.viewId || "",
    chainMeta: cached.chainMeta || { chain },
    row: getStoredRow(row),
  });
}
