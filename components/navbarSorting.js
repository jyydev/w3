import { ckPrefix } from "@/sets";

const navbarOrderCookiePrefix = `${ckPrefix ?? ""}navOrder_`;
const navbarOrderStoragePrefix = `${ckPrefix ?? ""}navOrder:`;
const navbarSortResetEvent = `${ckPrefix ?? ""}navbarSortReset`;
const rootNavbarSortPath = "root";

function getNavbarOrderCookie(scope = "navbar") {
  const token = String(scope || "navbar")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .slice(0, 120);

  return `${navbarOrderCookiePrefix}${token || "navbar"}`;
}

function parseNavbarOrder(value) {
  try {
    let parsed = value;
    if (!parsed || typeof parsed != "object") {
      let text = String(value || "{}");
      if (text.startsWith("%")) text = decodeURIComponent(text);
      parsed = JSON.parse(text);
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed != "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([path, keys]) => {
        if (!Array.isArray(keys)) return [];

        return [
          [String(path), [...new Set(keys.map(String).filter(Boolean))]],
        ];
      }),
    );
  } catch {
    return {};
  }
}

function encodeNavbarOrder(orderM = {}) {
  return JSON.stringify(parseNavbarOrder(JSON.stringify(orderM)));
}

function readLocalNavbarOrder(cookieName) {
  try {
    const value = window.localStorage.getItem(
      `${navbarOrderStoragePrefix}${cookieName}`,
    );
    return value === null ? null : parseNavbarOrder(value);
  } catch {
    return null;
  }
}

function saveLocalNavbarOrder(cookieName, orderM) {
  try {
    window.localStorage.setItem(
      `${navbarOrderStoragePrefix}${cookieName}`,
      encodeNavbarOrder(orderM),
    );
  } catch {}
}

function getNavbarSortKey(entry, index = 0) {
  return String(
    entry?.navbarSortId ||
      entry?.key ||
      entry?.value ||
      entry?.href ||
      `${entry?.type || "item"}:${entry?.label || index}`,
  );
}

function getChildSortPath(parentPath, key) {
  return `${parentPath}/${encodeURIComponent(key)}`;
}

function applyNavbarOrder(
  entries = [],
  orderM = {},
  parentPath = rootNavbarSortPath,
) {
  const duplicateM = new Map();
  const keyedEntries = entries.map((entry, index) => {
    const baseKey = getNavbarSortKey(entry, index);
    const duplicateIndex = duplicateM.get(baseKey) ?? 0;
    duplicateM.set(baseKey, duplicateIndex + 1);
    const key = duplicateIndex ? `${baseKey}#${duplicateIndex + 1}` : baseKey;

    return {
      ...entry,
      navbarSortKey: key,
      navbarSortParentPath: parentPath,
      navbarSortDefaultIndex: index,
    };
  });
  const order = orderM[parentPath] ?? [];
  const orderKeySet = new Set(order);
  const missingDefaultOrderAnchors = keyedEntries
    .filter(
      (entry) =>
        entry.navbarDefaultOrderAnchor &&
        !orderKeySet.has(entry.navbarSortKey),
    )
    .map((entry) => entry.navbarSortKey);
  const effectiveOrder = [...missingDefaultOrderAnchors, ...order];
  const rankM = new Map(
    effectiveOrder.map((key, index) => [key, index]),
  );

  keyedEntries.sort((a, b) => {
    const aRank = rankM.get(a.navbarSortKey);
    const bRank = rankM.get(b.navbarSortKey);
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;
    return a.navbarSortDefaultIndex - b.navbarSortDefaultIndex;
  });

  return keyedEntries.map((entry) => ({
    ...entry,
    children: applyNavbarOrder(
      entry.children ?? [],
      orderM,
      getChildSortPath(parentPath, entry.navbarSortKey),
    ),
  }));
}

function moveNavbarEntry(
  orderM,
  parentPath,
  siblingKeys,
  sourceKey,
  targetKey,
  placeAfter,
) {
  if (!sourceKey || !targetKey || sourceKey == targetKey) return orderM;

  const cleanKeys = [...new Set(siblingKeys.map(String).filter(Boolean))];
  if (!cleanKeys.includes(sourceKey) || !cleanKeys.includes(targetKey)) {
    return orderM;
  }

  const withoutSource = cleanKeys.filter((key) => key != sourceKey);
  const targetIndex = withoutSource.indexOf(targetKey);
  if (targetIndex < 0) return orderM;

  const insertIndex = targetIndex + (placeAfter ? 1 : 0);
  return {
    ...orderM,
    [parentPath]: [
      ...withoutSource.slice(0, insertIndex),
      sourceKey,
      ...withoutSource.slice(insertIndex),
    ],
  };
}

export {
  applyNavbarOrder,
  encodeNavbarOrder,
  getNavbarOrderCookie,
  getNavbarSortKey,
  moveNavbarEntry,
  navbarOrderCookiePrefix,
  navbarOrderStoragePrefix,
  navbarSortResetEvent,
  parseNavbarOrder,
  readLocalNavbarOrder,
  rootNavbarSortPath,
  saveLocalNavbarOrder,
};
