export const discoveryCacheMs = 60 * 60 * 1000;
export const discoveryCacheGlobalMaxEntries = 100;

const discoveryCacheRegistry = new Map();
const discoveryCacheMapIds = new WeakMap();
let nextDiscoveryCacheMapId = 1;

export function makeDiscoveryCacheMeta({
  source = "api",
  at = Date.now(),
  ttlMs = discoveryCacheMs,
  location = "server",
  cacheLocation = "",
} = {}) {
  const ts = Number(at || Date.now());
  const ttl = Number(ttlMs || discoveryCacheMs);

  return {
    source,
    location: cacheLocation || location,
    at: ts,
    ttlMs: ttl,
    expiresAt: ts + ttl,
  };
}

export function isDiscoveryCacheFresh(entry = {}, ttlMs = discoveryCacheMs) {
  const at = Number(entry?.at || entry?.cache?.at || 0);
  if (!at) return false;

  return Date.now() - at < Number(ttlMs || discoveryCacheMs);
}

function getDiscoveryEntryAt(entry = {}) {
  return Number(entry?.at || entry?.cache?.at || 0);
}

function getDiscoveryCacheMapId(cacheM = {}) {
  if (!cacheM || typeof cacheM != "object") return "";
  if (!discoveryCacheMapIds.has(cacheM)) {
    discoveryCacheMapIds.set(cacheM, nextDiscoveryCacheMapId++);
  }

  return discoveryCacheMapIds.get(cacheM);
}

function getDiscoveryRegistryKey(cacheM = {}, key = "") {
  const mapId = getDiscoveryCacheMapId(cacheM);
  return mapId && key ? `${mapId}:${key}` : "";
}

export function pruneGlobalDiscoveryCache({
  ttlMs = discoveryCacheMs,
  maxEntries = discoveryCacheGlobalMaxEntries,
} = {}) {
  for (const [registryKey, ref] of discoveryCacheRegistry.entries()) {
    const entry = ref?.cacheM?.[ref.key];
    if (!entry || !isDiscoveryCacheFresh(entry, ttlMs)) {
      if (entry) delete ref.cacheM[ref.key];
      discoveryCacheRegistry.delete(registryKey);
    }
  }

  const limit = Number(maxEntries || discoveryCacheGlobalMaxEntries);
  const entries = [...discoveryCacheRegistry.entries()];
  if (limit <= 0 || entries.length <= limit) return;

  entries
    .sort(([, a], [, b]) => {
      const aAt = getDiscoveryEntryAt(a?.cacheM?.[a.key]);
      const bAt = getDiscoveryEntryAt(b?.cacheM?.[b.key]);
      return aAt - bAt;
    })
    .slice(0, entries.length - limit)
    .forEach(([registryKey, ref]) => {
      if (ref?.cacheM && ref.key) delete ref.cacheM[ref.key];
      discoveryCacheRegistry.delete(registryKey);
    });
}

export function getDiscoveryCacheMapEntry(
  cacheM = {},
  key = "",
  options = {},
) {
  pruneGlobalDiscoveryCache(options);
  const entry = cacheM?.[key];
  if (isDiscoveryCacheFresh(entry, options.ttlMs || discoveryCacheMs)) return entry;

  if (cacheM && key) delete cacheM[key];
  discoveryCacheRegistry.delete(getDiscoveryRegistryKey(cacheM, key));
  return null;
}

export function setDiscoveryCacheMapEntry(
  cacheM = {},
  key = "",
  entry = {},
  options = {},
) {
  if (!cacheM || !key) return null;

  const at = getDiscoveryEntryAt(entry) || Date.now();
  cacheM[key] = { ...entry, at };
  const registryKey = getDiscoveryRegistryKey(cacheM, key);
  if (registryKey) {
    discoveryCacheRegistry.set(registryKey, { cacheM, key });
  }
  pruneGlobalDiscoveryCache(options);

  return cacheM[key] || null;
}

export function clearDiscoveryCacheMap(cacheM = {}) {
  if (!cacheM || typeof cacheM != "object") return cacheM;

  for (const key of Object.keys(cacheM)) {
    delete cacheM[key];
  }
  for (const [registryKey, ref] of discoveryCacheRegistry.entries()) {
    if (ref?.cacheM == cacheM) discoveryCacheRegistry.delete(registryKey);
  }

  return cacheM;
}

export function getDiscoveryCacheAgeMs(cacheMeta = {}) {
  const at = Number(cacheMeta?.at || 0);
  return at ? Math.max(0, Date.now() - at) : 0;
}

export function getDiscoveryCacheRemainingMs(cacheMeta = {}) {
  const expiresAt = Number(cacheMeta?.expiresAt || 0);
  return expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
}

export function formatDiscoveryCacheDuration(ms = 0) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
