"use client";

const walletBalanceClientCacheM = new Map();

function clone(value) {
  if (value === undefined) return undefined;

  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function getAddressKey(address = "") {
  return String(address || "").trim().toLowerCase();
}

function getCacheKey({
  walletType = "evm",
  chain = "",
  address = "",
} = {}) {
  const addressKey = getAddressKey(address);
  return walletType && chain && addressKey
    ? `${walletType}:${chain}:${addressKey}`
    : "";
}

function isCacheScopeMatch(entry = {}, { walletType = "", address = "" } = {}) {
  const type = String(walletType || "").trim();
  const addressKey = getAddressKey(address);
  if (type && entry.walletType != type) return false;
  if (addressKey && entry.addressKey != addressKey) return false;

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

function getRequestedAddressSet(addresses = []) {
  const list = (Array.isArray(addresses) ? addresses : [])
    .map(getAddressKey)
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
  const entries = [...walletBalanceClientCacheM.values()].filter((entry) =>
    isCacheScopeMatch(entry, scope),
  );
  const at = entries.reduce(
    (latest, entry) => Math.max(latest, Number(entry?.at || 0)),
    0,
  );
  const chains = [...new Set(entries.map((entry) => entry.chain).filter(Boolean))];

  return {
    source: entries.length ? "cache" : "",
    location: "client",
    at,
    ttlMs: 0,
    expiresAt: 0,
    entries: entries.length,
    chains,
  };
}

export function writeWalletBalanceClientCache(data = [], { walletType = "evm" } = {}) {
  const chainList = Array.isArray(data) ? data : data ? [data] : [];

  for (const chainE of chainList) {
    const chain = String(chainE?.chain || "");
    if (!chain) continue;

    for (const row of chainE?.rows || []) {
      if (!shouldStoreRow(row)) continue;

      const key = getCacheKey({ walletType, chain, address: row.address });
      if (!key) continue;

      walletBalanceClientCacheM.set(key, {
        at: Date.now(),
        walletType,
        chain,
        addressKey: getAddressKey(row.address),
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
} = {}) {
  const addressKey = getAddressKey(address);
  if (!addressKey) return false;

  const chainList = (Array.isArray(chains) ? chains : [])
    .map((chain) => String(chain || "").trim())
    .filter(Boolean);
  if (!chainList.length) {
    return [...walletBalanceClientCacheM.values()].some((entry) =>
      isCacheScopeMatch(entry, { walletType, address }),
    );
  }

  const hasChainCache = (chain) =>
    walletBalanceClientCacheM.has(
      getCacheKey({ walletType, chain, address: addressKey }),
    );

  return requireAllChains
    ? chainList.every(hasChainCache)
    : chainList.some(hasChainCache);
}

export function getWalletBalanceClientCacheData({
  walletType = "evm",
  addresses = [],
  chains = [],
} = {}) {
  const addressSet = getRequestedAddressSet(addresses);
  const chainSet = getRequestedChainSet(chains);
  const chainOrder = Array.isArray(chains) ? chains : [];
  const chainM = new Map();

  for (const entry of walletBalanceClientCacheM.values()) {
    if (walletType && entry.walletType != walletType) continue;
    if (addressSet && !addressSet.has(entry.addressKey)) continue;
    if (chainSet && !chainSet.has(entry.chain)) continue;

    if (!chainM.has(entry.chain)) {
      chainM.set(entry.chain, {
        ...(clone(entry.chainMeta) || {}),
        chain: entry.chain,
        rows: [],
      });
    }

    const chainE = chainM.get(entry.chain);
    const row = {
      ...(clone(entry.row) || {}),
      clientCached: true,
      clientReloaded: false,
    };
    const balanceCoins = Object.keys(row.balances || {});
    chainE.allCoins = [...new Set([...(chainE.allCoins || []), ...balanceCoins])];
    chainE.coins = [...new Set([...(chainE.coins || []), ...balanceCoins])];
    chainE.rows.push(row);
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
  { walletType = "evm" } = {},
) {
  const chainList = Array.isArray(data) ? data : data ? [data] : [];
  if (!chainList.length || !walletBalanceClientCacheM.size) return data;

  return chainList.map((chainE) => {
    const chain = String(chainE?.chain || "");
    if (!chain || !Array.isArray(chainE?.rows)) return chainE;

    return {
      ...chainE,
      rows: chainE.rows.map((row) => {
        const key = getCacheKey({ walletType, chain, address: row?.address });
        const cached = key ? walletBalanceClientCacheM.get(key)?.row : null;
        if (row?.clientFresh || row?.clientReloaded) return row;
        if (!cached || !hasBalances(cached)) return row;

        return {
          ...row,
          ...cached,
          balances: {
            ...(row.balances || {}),
            ...(cached.balances || {}),
          },
          errors: row.errors || cached.errors,
          clientCached: true,
          clientReloaded: false,
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
  const key = getCacheKey({ walletType, chain, address });
  if (!key || !coin || !balance) return;

  const cached = walletBalanceClientCacheM.get(key) || {
    at: Date.now(),
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
  walletBalanceClientCacheM.set(key, {
    at: Date.now(),
    walletType,
    chain,
    addressKey: getAddressKey(address),
    chainMeta: cached.chainMeta || { chain },
    row: getStoredRow(row),
  });
}
