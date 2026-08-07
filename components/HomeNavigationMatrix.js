"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import HomeNavigationSearch, {
  buildSearchEntries,
} from "./HomeNavigationSearch";
import {
  getHomeNavigationHistory,
  removeHomeNavigationHistory,
  saveHomeNavigationHistory,
} from "./homeNavigationHistoryClient";
import {
  homeNavigationHistoryCap,
  homeNavigationHistoryEvent,
  parseHomeNavigationHistory,
} from "./homeNavigationState";
import NavbarHoverCard from "./NavbarHoverCard";
import {
  NavbarHideButton,
  NavbarVisibilityToggle,
} from "./navbarVisibility";
import useResetConfirmation from "./useResetConfirmation";

const emptyHomeMatrixHiddenKeys = new Set();

function readHomeMatrixHiddenKeys(storageKey) {
  if (!storageKey || typeof window == "undefined") return new Set();

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return new Set(
      (Array.isArray(parsed) ? parsed : []).map(String).filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

function saveHomeMatrixHiddenKeys(storageKey, hiddenKeys) {
  if (!storageKey || typeof window == "undefined") return;

  try {
    if (hiddenKeys.size) {
      window.localStorage.setItem(storageKey, JSON.stringify([...hiddenKeys]));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {}
}

export function useHomeMatrixVisibility(storageKey) {
  const [hiddenKeys, setHiddenKeys] = useState(emptyHomeMatrixHiddenKeys);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    setHiddenKeys(readHomeMatrixHiddenKeys(storageKey));
    setShowHidden(false);

    function syncHiddenKeys(event) {
      if (event.key == storageKey || event.key === null) {
        setHiddenKeys(readHomeMatrixHiddenKeys(storageKey));
      }
    }

    window.addEventListener("storage", syncHiddenKeys);
    return () => window.removeEventListener("storage", syncHiddenKeys);
  }, [storageKey]);

  function toggleHidden(key) {
    const visibilityKey = String(key || "");
    if (!visibilityKey) return;

    setHiddenKeys((current) => {
      const next = new Set(current);
      if (next.has(visibilityKey)) next.delete(visibilityKey);
      else next.add(visibilityKey);
      saveHomeMatrixHiddenKeys(storageKey, next);
      return next;
    });
  }

  function resetHidden() {
    const next = new Set();
    setHiddenKeys(next);
    setShowHidden(false);
    saveHomeMatrixHiddenKeys(storageKey, next);
  }

  const pruneHiddenKeys = useCallback(
    (validKeys = []) => {
      const validKeySet = new Set(
        Array.from(validKeys || []).map(String).filter(Boolean),
      );

      setHiddenKeys((current) => {
        const next = new Set(
          [...current].filter((key) => validKeySet.has(key)),
        );
        if (
          next.size == current.size &&
          [...next].every((key) => current.has(key))
        ) {
          return current;
        }

        saveHomeMatrixHiddenKeys(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return {
    hiddenKeys,
    hiddenCount: hiddenKeys.size,
    showHidden,
    pruneHiddenKeys,
    setShowHidden,
    toggleHidden,
    resetHidden,
  };
}

export function HomeMatrixVisibilityToggle({
  label = "table links",
  visibility,
}) {
  return <NavbarVisibilityToggle label={label} visibility={visibility} />;
}

function defaultGetChildren(node) {
  return node?.children ?? [];
}

function defaultGetNodeKey(node = {}) {
  if (node?.homeKey) return String(node.homeKey);
  if (Array.isArray(node?.path)) return `account:${node.path.join("/")}`;
  return String(node?.href || node?.value || node?.label || "");
}

export function getHomeMatrixNodeKey(
  node,
  getNodeKey = defaultGetNodeKey,
) {
  return String(node?.homeMatrixKey || getNodeKey(node) || "");
}

export function getHomeSourceNodeKey(
  node,
  getNodeKey = defaultGetNodeKey,
) {
  return String(node?.homeSourceKey || getNodeKey(node) || "");
}

function getHomeHorizontalPlaceAfter(
  items = [],
  dragKey = "",
  targetKey = "",
  getKey = (item) => item,
) {
  const sourceKey = String(dragKey || "");
  const destinationKey = String(targetKey || "");
  const dragIndex = items.findIndex(
    (item, index) => String(getKey(item, index) || "") == sourceKey,
  );
  const targetIndex = items.findIndex(
    (item, index) => String(getKey(item, index) || "") == destinationKey,
  );

  if (dragIndex < 0 || targetIndex < 0 || dragIndex == targetIndex) {
    return null;
  }

  return dragIndex < targetIndex;
}

export function getHomeQuickFavoritePlaceAfter(
  items = [],
  dragKey = "",
  targetKey = "",
) {
  return getHomeHorizontalPlaceAfter(
    items,
    dragKey,
    targetKey,
    (item) => item?.favoriteKey,
  );
}

function getHomeVisitHistoryItemKey(item, index = 0) {
  return String(
    item?.historyValue ||
      item?.href ||
      item?.homeKey ||
      `history-item:${index}`,
  );
}

export function buildHomeFavoritesMatrixGroup({
  favoriteKeys = [],
  getChildren = defaultGetChildren,
  getFavoriteItem = (node, favoriteKey) => ({
    favoriteKey,
    href: node?.href || "",
    label: node?.label || favoriteKey,
    title: node?.title || node?.href || node?.label || favoriteKey,
  }),
  getFavoriteNode = () => null,
  getNodeKey = defaultGetNodeKey,
  rootKey = "home:favorites",
} = {}) {
  const leafItems = [];
  const parentBranches = [];
  const seenFavoriteKeys = new Set();

  function projectBranch(
    sourceNode,
    favoriteKey,
    path = [],
    ancestors = new Set(),
    sourceParentKey = "",
  ) {
    const sourceKey = String(getNodeKey(sourceNode) || "");
    const pathKey = path.length ? path.join(".") : "root";
    const matrixKey = `${rootKey}:projection:${encodeURIComponent(
      favoriteKey,
    )}:${pathKey}`;
    const cyclic = ancestors.has(sourceNode);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(sourceNode);
    const sourceChildren =
      cyclic || path.length >= 48
        ? []
        : Array.from(getChildren(sourceNode, path.length) || []);

    return {
      ...sourceNode,
      children: sourceChildren.map((child, childIndex) =>
        projectBranch(
          child,
          favoriteKey,
          [...path, childIndex],
          nextAncestors,
          sourceKey,
        ),
      ),
      homeDraggable:
        path.length === 0 ||
        (!sourceNode.homePinned && sourceNode.homeDraggable !== false),
      homeFavoriteKey: path.length === 0 ? favoriteKey : "",
      homeFavoriteProjection: true,
      homeFavoriteProjectionRoot: path.length === 0,
      homeMatrixKey: matrixKey,
      homePinned: path.length > 0 && !!sourceNode.homePinned,
      homeSourceKey: sourceKey,
      homeSourceParentKey: sourceParentKey,
      homeSpanRemaining: false,
    };
  }

  favoriteKeys.forEach((favoriteKeyValue) => {
    const favoriteKey = String(favoriteKeyValue || "");
    if (!favoriteKey || seenFavoriteKeys.has(favoriteKey)) return;
    seenFavoriteKeys.add(favoriteKey);

    const sourceNode = getFavoriteNode(favoriteKey);
    if (!sourceNode) return;
    const sourceKey = String(getNodeKey(sourceNode) || "");

    const sourceChildren = Array.from(getChildren(sourceNode, 0) || []);
    if (sourceChildren.length) {
      parentBranches.push(projectBranch(sourceNode, favoriteKey));
      return;
    }

    const item = getFavoriteItem(sourceNode, favoriteKey);
    if (item) {
      leafItems.push({
        ...item,
        homeSourceKey: sourceKey,
      });
    }
  });

  const children = [];
  if (leafItems.length || !parentBranches.length) {
    children.push({
      type: "homeFavoriteLinks",
      homeKey: `${rootKey}:links`,
      homeMatrixKey: `${rootKey}:links`,
      homePinned: true,
      homeDraggable: false,
      homeSpanRemaining: true,
      children: [],
      items: leafItems,
    });
  }
  children.push(...parentBranches);

  return {
    type: "homeFavorites",
    label: "home favorites",
    homeKey: rootKey,
    homeMatrixKey: rootKey,
    homeDefaultOrderAnchor: true,
    homePinned: false,
    homeDraggable: true,
    children,
  };
}

export function buildHomeVisitHistoryMatrixNode({
  auto = false,
  items = [],
  rootKey = "home:visit-history",
} = {}) {
  return {
    type: "homeVisitHistory",
    label: "history",
    homeKey: rootKey,
    homeMatrixKey: rootKey,
    homeDefaultOrderAnchor: true,
    homePinned: false,
    homeDraggable: true,
    homeAutoHistory: !!auto,
    homeSpanRemaining: true,
    children: [],
    items: Array.from(items || []),
  };
}

export function sortHomeMatrixChildren(
  children = [],
  order = [],
  getKey = defaultGetNodeKey,
) {
  const pinned = children.filter((node) => node.homePinned);
  const sortable = children.filter((node) => !node.homePinned);
  const savedOrder = Array.from(order || []).map(String);
  const savedOrderSet = new Set(savedOrder);
  const defaultOrderAnchors = sortable
    .filter((node) => node.homeDefaultOrderAnchor)
    .map((node) => String(getKey(node) || ""))
    .filter(Boolean);
  const missingDefaultOrderAnchors = defaultOrderAnchors.filter(
    (key) => !savedOrderSet.has(key),
  );
  const effectiveOrder =
    savedOrder.length && missingDefaultOrderAnchors.length
      ? [...missingDefaultOrderAnchors, ...savedOrder]
      : savedOrder;
  const orderIndexM = new Map(
    effectiveOrder.map((nodeKey, index) => [nodeKey, index]),
  );

  const ordered = sortable
    .map((node, index) => ({
      index,
      node,
      order: orderIndexM.get(getKey(node)) ?? Infinity,
    }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.node);

  return [...pinned, ...ordered];
}

const homeSyntheticNodeTypes = new Set([
  "history",
  "homeVisitHistory",
  "homeFavorites",
  "homeFavoriteLinks",
]);

function isHomeSyntheticNode(node) {
  return (
    !!node?.homeFavoriteProjection || homeSyntheticNodeTypes.has(node?.type)
  );
}

function getHomePathValue(value, separator = "/") {
  if (Array.isArray(value)) {
    return value
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(separator);
  }

  return value === undefined || value === null
    ? ""
    : String(value).trim();
}

function getHomePathLabel(node) {
  return (
    getHomePathValue(node?.label) ||
    getHomePathValue(node?.value) ||
    getHomePathValue(node?.title) ||
    getHomePathValue(node?.href)
  );
}

function getHomeFullPath(node, pathLabels) {
  return (
    getHomePathValue(node?.fullPath) ||
    getHomePathValue(node?.filePath) ||
    getHomePathValue(node?.path) ||
    pathLabels.filter(Boolean).join(" > ")
  );
}

function getHomePathDetail(node, pathLabels) {
  return (
    getHomePathValue(node?.homePathDetail) ||
    getHomePathValue(node?.detail) ||
    getHomePathValue(node?.address) ||
    getHomePathValue(node?.editorFile) ||
    getHomePathValue(node?.editorFolder) ||
    getHomePathValue(node?.href) ||
    getHomePathValue(node?.title) ||
    getHomeFullPath(node, pathLabels)
  );
}

function buildHomePathInfoMaps(
  nodes,
  getChildren,
  getNodeKey,
  pathPrefix = [],
) {
  const byHref = new Map();
  const bySourceKey = new Map();
  const rootPathLabels = Array.from(pathPrefix || [])
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  function addNode(node, parentLabels = [], depth = 0, ancestors = new Set()) {
    if (
      !node ||
      depth > 48 ||
      ancestors.has(node) ||
      isHomeSyntheticNode(node)
    ) {
      return;
    }

    const label = getHomePathLabel(node);
    const pathLabels = label ? [...parentLabels, label] : parentLabels;
    const info = {
      context: parentLabels.filter(Boolean).join(" > ") || "navbar",
      detail: getHomePathDetail(node, pathLabels),
    };
    const sourceKey = getHomeSourceNodeKey(node, getNodeKey);
    const href = getHomePathValue(node?.href);

    if (sourceKey && !bySourceKey.has(sourceKey)) {
      bySourceKey.set(sourceKey, info);
    }
    if (href && !byHref.has(href)) byHref.set(href, info);

    if (depth >= 48) return;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(node);
    const children = Array.from(getChildren(node, depth) || []);
    for (const child of children) {
      addNode(child, pathLabels, depth + 1, nextAncestors);
    }
  }

  for (const node of Array.from(nodes || [])) {
    addNode(node, rootPathLabels);
  }
  return { byHref, bySourceKey };
}

export function buildHomeNavigationMatrix({
  history = true,
  historyRootKey,
  nodes = [],
  getChildren = defaultGetChildren,
  getNodeKey = defaultGetNodeKey,
  isCollapsed = () => false,
  orderChildren = (children) => children,
  pathPrefix = [],
  rootParentKey = "home:root",
  visibility,
} = {}) {
  const sourceNodes = Array.from(nodes || []);
  const hasExplicitHistory = sourceNodes.some(
    (node) => node?.type == "history" || node?.type == "homeVisitHistory",
  );
  const matrixNodes =
    history !== false && !hasExplicitHistory
      ? [
          buildHomeVisitHistoryMatrixNode({
            auto: true,
            rootKey: String(
              historyRootKey || `${rootParentKey}:history`,
            ),
          }),
          ...sourceNodes,
        ]
      : sourceNodes;
  let columnCount = 0;
  let collapsedCount = 0;
  const fullSiblingOrderM = {};
  const searchEntries = buildSearchEntries({
    getChildren,
    getNodeKey,
    includeHome: false,
    pathPrefix,
    skipNode: isHomeSyntheticNode,
    tree: matrixNodes,
  });
  const hiddenKeys = visibility?.hiddenKeys ?? emptyHomeMatrixHiddenKeys;
  const showHidden = !!visibility?.showHidden;
  const pathInfoMaps = buildHomePathInfoMaps(
    matrixNodes,
    getChildren,
    getNodeKey,
    pathPrefix,
  );
  const visibilityKeySet = new Set();

  function collectVisibilityKeys(
    entries,
    depth = 0,
    ancestors = new Set(),
  ) {
    if (depth > 48) return;

    for (const node of Array.from(entries || [])) {
      if (!node || ancestors.has(node)) continue;
      if (!homeSyntheticNodeTypes.has(node.type)) {
        const key = getHomeSourceNodeKey(node, getNodeKey);
        if (key) visibilityKeySet.add(key);
      }

      const nextAncestors = new Set(ancestors);
      nextAncestors.add(node);
      collectVisibilityKeys(
        getChildren(node, depth) || [],
        depth + 1,
        nextAncestors,
      );
    }
  }

  collectVisibilityKeys(matrixNodes);

  function getMappedPathInfo(node) {
    const sourceKey = getHomeSourceNodeKey(node, getNodeKey);
    const href = getHomePathValue(node?.href);
    return (
      pathInfoMaps.bySourceKey.get(sourceKey) ||
      pathInfoMaps.byHref.get(href) ||
      null
    );
  }

  function enrichFavoriteLinkItems(items = []) {
    return Array.from(items || [])
      .map((item) => {
        const sourceKey = getHomePathValue(item?.homeSourceKey);
        const href = getHomePathValue(item?.href);
        const info =
          pathInfoMaps.bySourceKey.get(sourceKey) ||
          pathInfoMaps.byHref.get(href);
        const label = getHomePathLabel(item);
        const homeVisibilityKey = getHomePathValue(
          item?.homeVisibilityKey || sourceKey,
        );
        const homeHidden =
          !!homeVisibilityKey && hiddenKeys.has(homeVisibilityKey);

        return {
          ...item,
          homeHidden,
          homePathContext:
            info?.context ||
            getHomePathValue(item?.homePathContext) ||
            "navbar",
          homePathDetail:
            info?.detail || getHomePathDetail(item, label ? [label] : []),
          homeVisibilityKey,
        };
      })
      .filter((item) => showHidden || !item.homeHidden);
  }

  function getNodeVisibility(node) {
    if (homeSyntheticNodeTypes.has(node?.type)) {
      return { homeHidden: false, homeVisibilityKey: "" };
    }

    const homeVisibilityKey = String(
      node?.homeVisibilityKey || getHomeSourceNodeKey(node, getNodeKey) || "",
    );

    return {
      homeHidden: !!homeVisibilityKey && hiddenKeys.has(homeVisibilityKey),
      homeVisibilityKey,
    };
  }

  function recordFullSiblingOrder(children, parentKey, parentNode) {
    const usesSourceOrder = !!parentNode?.homeFavoriteProjection;
    const orderParentKey = String(
      (usesSourceOrder
        ? getHomeSourceNodeKey(parentNode, getNodeKey)
        : parentKey) || "",
    );
    if (!orderParentKey) return;

    fullSiblingOrderM[orderParentKey] = children
      .filter(
        (child) => !child?.homePinned && child?.homeDraggable !== false,
      )
      .map((child) =>
        String(
          (usesSourceOrder
            ? getHomeSourceNodeKey(child, getNodeKey)
            : getHomeMatrixNodeKey(child, getNodeKey)) || "",
        ),
      )
      .filter(Boolean);
  }

  function measureNode(node, depth, parentKey) {
    const nodeKey = getNodeKey(node);
    const nodeVisibility = getNodeVisibility(node);
    if (nodeVisibility.homeHidden && !showHidden) return null;

    const children = Array.from(
      orderChildren(getChildren(node, depth) ?? [], nodeKey, node) || [],
    );
    recordFullSiblingOrder(children, nodeKey, node);
    const visibleChildren = children.filter((child) => {
      const childVisibility = getNodeVisibility(child);
      return showHidden || !childVisibility.homeHidden;
    });
    const collapsed = !!visibleChildren.length && isCollapsed(node, nodeKey);
    if (collapsed) collapsedCount += 1;
    const measuredChildren = (collapsed ? [] : visibleChildren)
      .map((child) => measureNode(child, depth + 1, nodeKey))
      .filter(Boolean);
    const rowSpan =
      measuredChildren.reduce((sum, child) => sum + child.rowSpan, 0) || 1;
    columnCount = Math.max(columnCount, depth + 1);
    const pathInfo = getMappedPathInfo(node);
    const pathProps =
      pathInfo &&
      !homeSyntheticNodeTypes.has(node?.type)
        ? {
            homePathContext: pathInfo.context,
            homePathDetail: pathInfo.detail,
          }
        : {};
    const favoriteItems =
      node?.type === "homeFavoriteLinks"
        ? { items: enrichFavoriteLinkItems(node.items) }
        : {};

    return {
      children: measuredChildren,
      node: {
        ...node,
        ...pathProps,
        ...favoriteItems,
        homeCollapsed: collapsed,
        homeHidden: nodeVisibility.homeHidden,
        homeHasChildren: !!visibleChildren.length,
        homeNodeKey: nodeKey,
        homeParentKey: parentKey,
        homeVisibilityKey: nodeVisibility.homeVisibilityKey,
      },
      rowSpan,
    };
  }

  const orderedRoots = Array.from(
    orderChildren(matrixNodes, rootParentKey, null) || [],
  );
  recordFullSiblingOrder(orderedRoots, rootParentKey, null);
  const measuredRoots = orderedRoots
    .map((node) => measureNode(node, 0, rootParentKey))
    .filter(Boolean);
  const cells = [];

  function placeNode(entry, depth, rowStart) {
    const columnSpan = entry.node.homeSpanRemaining
      ? Math.max(1, columnCount - depth)
      : 1;
    cells.push({
      column: depth + 1,
      columnSpan,
      node: entry.node,
      rowSpan: entry.rowSpan,
      rowStart,
    });

    if (entry.node.homeSpanRemaining) return;

    if (!entry.children.length) {
      for (let column = depth + 2; column <= columnCount; column++) {
        cells.push({
          column,
          columnSpan: 1,
          empty: true,
          rowSpan: 1,
          rowStart,
        });
      }
      return;
    }

    let childRow = rowStart;
    for (const child of entry.children) {
      placeNode(child, depth + 1, childRow);
      childRow += child.rowSpan;
    }
  }

  let rowStart = 1;
  for (const root of measuredRoots) {
    placeNode(root, 0, rowStart);
    rowStart += root.rowSpan;
  }

  return {
    cells,
    collapsedCount,
    columnCount,
    fullSiblingOrderM,
    rowCount: Math.max(0, rowStart - 1),
    searchEntries,
    visibilityKeys: [...visibilityKeySet],
  };
}

export function getHomeMatrixMove(
  currentOrder = {},
  matrix,
  dragNode,
  targetNode,
  placeAfter,
) {
  const usesSourceOrder =
    !!dragNode?.homeFavoriteProjection &&
    !dragNode?.homeFavoriteProjectionRoot;
  const targetUsesSourceOrder =
    !!targetNode?.homeFavoriteProjection &&
    !targetNode?.homeFavoriteProjectionRoot;
  const dragParentKey = String(
    (usesSourceOrder
      ? dragNode?.homeSourceParentKey
      : dragNode?.homeParentKey) || "",
  );
  const targetParentKey = String(
    (targetUsesSourceOrder
      ? targetNode?.homeSourceParentKey
      : targetNode?.homeParentKey) || "",
  );
  const getMoveNodeKey = (node) =>
    String(
      (usesSourceOrder ? node?.homeSourceKey : node?.homeNodeKey) || "",
    );

  if (
    !dragNode?.homeNodeKey ||
    !targetNode?.homeNodeKey ||
    dragNode.homePinned ||
    targetNode.homePinned ||
    dragNode.homeDraggable === false ||
    targetNode.homeDraggable === false ||
    dragNode.homeParentKey !== targetNode.homeParentKey ||
    usesSourceOrder !== targetUsesSourceOrder ||
    !dragParentKey ||
    dragParentKey !== targetParentKey
  ) {
    return currentOrder;
  }

  const visibleSiblingKeys = (matrix?.cells || [])
    .filter(
      (cell) =>
        cell.node &&
        !cell.node.homePinned &&
        cell.node.homeDraggable !== false &&
        cell.node.homeParentKey === dragNode.homeParentKey,
    )
    .sort((a, b) => a.rowStart - b.rowStart)
    .map((cell) => getMoveNodeKey(cell.node));
  const draggedKey = getMoveNodeKey(dragNode);
  const targetKey = getMoveNodeKey(targetNode);
  const fullSiblingKeys = matrix?.fullSiblingOrderM?.[dragParentKey];
  const siblingKeys =
    Array.isArray(fullSiblingKeys) &&
    fullSiblingKeys.includes(draggedKey) &&
    fullSiblingKeys.includes(targetKey)
      ? fullSiblingKeys
      : visibleSiblingKeys;
  if (!siblingKeys.includes(draggedKey) || !siblingKeys.includes(targetKey)) {
    return currentOrder;
  }

  const withoutDragged = siblingKeys.filter((key) => key !== draggedKey);
  const targetIndex = withoutDragged.indexOf(targetKey);
  if (targetIndex < 0) return currentOrder;
  const insertIndex = targetIndex + (placeAfter ? 1 : 0);
  const nextOrder = [
    ...withoutDragged.slice(0, insertIndex),
    draggedKey,
    ...withoutDragged.slice(insertIndex),
  ];
  if (nextOrder.every((key, index) => key === siblingKeys[index])) {
    return currentOrder;
  }

  return {
    ...currentOrder,
    [dragParentKey]: nextOrder,
  };
}

const emptyHomeNavigationHistory = [];

function getHomeHistoryHrefLookupKeys(value = "") {
  const href = String(value || "").trim();
  if (!href) return [];

  const withoutHash = href.split("#", 1)[0];
  const withoutQuery = withoutHash.split("?", 1)[0];
  return [...new Set([href, withoutHash, withoutQuery].filter(Boolean))];
}

function getHomeHistoryPathname(value = "") {
  const href = String(value || "").trim();
  if (!href) return "";

  if (/^\/(?!\/)/.test(href)) {
    return href.split(/[?#]/, 1)[0] || "/";
  }
  return "";
}

function normalizeHomeHistoryBasePath(value = "/") {
  let pathname = getHomeHistoryPathname(value);
  if (!pathname && /^https?:\/\//i.test(String(value || ""))) {
    try {
      pathname = new URL(String(value)).pathname;
    } catch {}
  }
  pathname ||= "/";
  const normalized = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return normalized || "/";
}

function buildHomeHistorySearchEntryMap(entries = []) {
  const result = new Map();

  for (const entry of Array.from(entries || [])) {
    for (const key of getHomeHistoryHrefLookupKeys(entry?.href)) {
      if (!result.has(key)) result.set(key, entry);
    }
  }

  return result;
}

function getHomeHistorySearchEntry(entryMap, href = "") {
  for (const key of getHomeHistoryHrefLookupKeys(href)) {
    const entry = entryMap.get(key);
    if (entry) return entry;
  }
  return null;
}

function isHomeHistoryEntryInScope(entry, basePath, searchEntry) {
  const pathname = getHomeHistoryPathname(entry?.href);
  if (pathname) {
    const normalizedPathname = normalizeHomeHistoryBasePath(pathname);
    if (normalizedPathname == basePath) return false;
    return (
      basePath == "/" || normalizedPathname.startsWith(`${basePath}/`)
    );
  }

  return basePath == "/" || !!searchEntry;
}

function buildDefaultHomeHistoryItems({
  basePath = "/",
  entries = [],
  getFavoriteKey,
  rootKey = "home:auto-history",
  searchEntries = [],
} = {}) {
  const normalizedBasePath = normalizeHomeHistoryBasePath(basePath);
  const searchEntryMap = buildHomeHistorySearchEntryMap(searchEntries);
  const result = [];

  for (const entry of parseHomeNavigationHistory(entries)) {
    const searchEntry = getHomeHistorySearchEntry(
      searchEntryMap,
      entry.href,
    );
    if (!isHomeHistoryEntryInScope(entry, normalizedBasePath, searchEntry)) {
      continue;
    }

    const resolvedFavoriteKey =
      typeof getFavoriteKey == "function"
        ? getFavoriteKey(entry, searchEntry)
        : searchEntry?.favoriteKey;
    result.push({
      ...entry,
      favoriteKey: String(resolvedFavoriteKey || ""),
      historyContext:
        searchEntry?.context || entry.context || "navbar",
      historyValue: entry.href,
      homeKey: `${rootKey}:item:${encodeURIComponent(entry.href)}`,
      detail: entry.href,
    });
    if (result.length >= homeNavigationHistoryCap) break;
  }

  return result;
}

function reorderDefaultHomeHistory(
  historyEntries = [],
  currentItems = [],
  nextItems = [],
) {
  const currentHrefSet = new Set(
    currentItems
      .map((item) => String(item?.historyValue || item?.href || ""))
      .filter(Boolean),
  );
  const orderedHrefs = nextItems
    .map((item) => String(item?.historyValue || item?.href || ""))
    .filter((href) => currentHrefSet.has(href));
  if (
    orderedHrefs.length != currentHrefSet.size ||
    new Set(orderedHrefs).size != currentHrefSet.size
  ) {
    return parseHomeNavigationHistory(historyEntries);
  }

  const historyByHref = new Map(
    parseHomeNavigationHistory(historyEntries).map((entry) => [
      entry.href,
      entry,
    ]),
  );
  let orderedIndex = 0;

  return parseHomeNavigationHistory(historyEntries).map((entry) => {
    if (!currentHrefSet.has(entry.href)) return entry;
    const nextHref = orderedHrefs[orderedIndex++];
    return historyByHref.get(nextHref) || entry;
  });
}

function useDefaultHomeNavigationHistory(enabled, initialHistory = []) {
  const initialHistoryText = JSON.stringify(
    parseHomeNavigationHistory(initialHistory),
  );
  const [historyEntries, setHistoryEntries] = useState(
    emptyHomeNavigationHistory,
  );

  useEffect(() => {
    if (!enabled) {
      setHistoryEntries(emptyHomeNavigationHistory);
      return undefined;
    }

    const serverHistory = JSON.parse(initialHistoryText);

    function refreshHistory(event) {
      const eventHistory = event?.detail?.history;
      setHistoryEntries(
        parseHomeNavigationHistory(
          Array.isArray(eventHistory)
            ? eventHistory
            : getHomeNavigationHistory(serverHistory),
        ),
      );
    }

    refreshHistory();
    window.addEventListener(homeNavigationHistoryEvent, refreshHistory);
    return () =>
      window.removeEventListener(homeNavigationHistoryEvent, refreshHistory);
  }, [enabled, initialHistoryText]);

  return historyEntries;
}

export function HomeNavigationMatrix({
  historyFavoriteKeySet,
  historyOptions,
  matrix,
  renderNode,
  sortable = false,
  onMoveHistory,
  onMoveNode,
  onRemoveHistory,
  onToggleHistoryFavorite,
  search = true,
  searchControls,
  searchOptions,
}) {
  const [dragNode, setDragNode] = useState(null);
  const [dropSpot, setDropSpot] = useState(null);
  const autoHistoryNode = matrix?.cells?.find(
    (cell) => cell?.node?.homeAutoHistory,
  )?.node;
  const defaultHistoryEntries = useDefaultHomeNavigationHistory(
    !!autoHistoryNode,
    historyOptions?.initialHistory,
  );
  const defaultHistoryItems = useMemo(
    () =>
      buildDefaultHomeHistoryItems({
        basePath:
          historyOptions?.basePath ?? searchOptions?.homeHref ?? "/",
        entries: defaultHistoryEntries,
        getFavoriteKey: historyOptions?.getFavoriteKey,
        rootKey:
          autoHistoryNode?.homeNodeKey ||
          autoHistoryNode?.homeKey ||
          "home:auto-history",
        searchEntries: matrix?.searchEntries || [],
      }),
    [
      autoHistoryNode?.homeKey,
      autoHistoryNode?.homeNodeKey,
      defaultHistoryEntries,
      historyOptions?.basePath,
      historyOptions?.getFavoriteKey,
      matrix?.searchEntries,
      searchOptions?.homeHref,
    ],
  );
  const resolvedHistoryFavoriteKeySet =
    historyFavoriteKeySet ?? historyOptions?.favoriteKeySet;
  const resolvedToggleHistoryFavorite =
    onToggleHistoryFavorite ?? historyOptions?.onToggleFavorite;

  function moveDefaultHistory(items) {
    const customMoveHistory = historyOptions?.onMoveHistory;
    if (typeof customMoveHistory == "function") {
      customMoveHistory(items);
      return;
    }

    saveHomeNavigationHistory(
      reorderDefaultHomeHistory(
        defaultHistoryEntries,
        defaultHistoryItems,
        items,
      ),
    );
  }

  function removeDefaultHistory(href, item) {
    const customRemoveHistory = historyOptions?.onRemoveHistory;
    if (typeof customRemoveHistory == "function") {
      customRemoveHistory(href, item);
      return;
    }

    removeHomeNavigationHistory(href);
  }

  const searchBar = search ? (
    <HomeNavigationSearch
      entries={matrix?.searchEntries || []}
      {...searchOptions}
    />
  ) : null;
  const searchContent =
    searchBar && searchControls ? (
      <div className="homeWalletSearchRow">
        {searchBar}
        {searchControls}
      </div>
    ) : searchBar;

  if (!matrix?.cells?.length) return searchContent;

  return (
    <>
      {searchContent}
      <div
        className={`homeNavMatrix${sortable ? " customSort" : ""}`}
        style={{
          "--home-nav-column-count": matrix.columnCount,
          "--home-nav-row-count": matrix.rowCount,
        }}
      >
        {matrix.cells.map((cell, index) => {
        const node = cell.node;
        const canDrag =
          sortable &&
          !cell.empty &&
          !node.homePinned &&
          node.homeDraggable !== false;
        const dragging = canDrag && dragNode?.homeNodeKey === node.homeNodeKey;
        const isDropSpot = canDrag && dropSpot?.nodeKey === node.homeNodeKey;
        const dropClass = isDropSpot
          ? dropSpot.placeAfter
            ? "dropAfter"
            : "dropBefore"
          : "";

        return (
          <div
            className={[
              "homeNavCell",
              cell.empty ? "empty" : "",
              node?.type === "history" || node?.type === "homeVisitHistory"
                ? "history"
                : "",
              node?.type === "homeFavorites" ? "favorites" : "",
              node?.type === "homeFavoriteLinks" ? "favoriteLinks" : "",
              node?.homeHidden ? "homeHidden" : "",
              node?.homeCellClassName || "",
              canDrag ? "sortable" : "",
              dragging ? "dragging" : "",
              dropClass,
            ]
              .filter(Boolean)
              .join(" ")}
            draggable={canDrag || undefined}
            key={
              cell.empty
                ? `empty:${cell.column}:${cell.rowStart}`
                : `${node.homeParentKey}:${node.homeNodeKey}:${cell.column}`
            }
            style={{
              gridColumn:
                cell.columnSpan > 1
                  ? `${cell.column} / span ${cell.columnSpan}`
                  : cell.column,
              gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
            }}
            aria-hidden={cell.empty || undefined}
            onDragStart={
              canDrag
                ? (event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", node.homeNodeKey);
                    setDragNode(node);
                  }
                : undefined
            }
            onDragOver={
              canDrag
                ? (event) => {
                    if (
                      !dragNode ||
                      dragNode.homeNodeKey === node.homeNodeKey ||
                      dragNode.homeParentKey !== node.homeParentKey
                    ) {
                      return;
                    }

                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const rect = event.currentTarget.getBoundingClientRect();
                    const placeAfter =
                      event.clientY > rect.top + rect.height / 2;
                    setDropSpot((current) =>
                      current?.nodeKey === node.homeNodeKey &&
                      current?.placeAfter === placeAfter
                        ? current
                        : { nodeKey: node.homeNodeKey, placeAfter },
                    );
                  }
                : undefined
            }
            onDragLeave={
              canDrag
                ? (event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setDropSpot((current) =>
                        current?.nodeKey === node.homeNodeKey ? null : current,
                      );
                    }
                  }
                : undefined
            }
            onDrop={
              canDrag
                ? (event) => {
                    event.preventDefault();
                    if (
                      dragNode &&
                      dragNode.homeNodeKey !== node.homeNodeKey &&
                      dragNode.homeParentKey === node.homeParentKey
                    ) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      onMoveNode?.(
                        dragNode,
                        node,
                        event.clientY > rect.top + rect.height / 2,
                      );
                    }
                    setDragNode(null);
                    setDropSpot(null);
                  }
                : undefined
            }
            onDragEnd={
              canDrag
                ? () => {
                    setDragNode(null);
                    setDropSpot(null);
                  }
                : undefined
            }
          >
            {!cell.empty &&
              (node.type === "homeVisitHistory" ? (
                <HomeVisitHistoryRow
                  historyFavoriteKeySet={resolvedHistoryFavoriteKeySet}
                  node={
                    node.homeAutoHistory
                      ? { ...node, items: defaultHistoryItems }
                      : node
                  }
                  onMoveHistory={
                    node.homeAutoHistory
                      ? onMoveHistory || moveDefaultHistory
                      : onMoveHistory
                  }
                  onRemoveHistory={
                    node.homeAutoHistory
                      ? onRemoveHistory || removeDefaultHistory
                      : onRemoveHistory
                  }
                  onToggleHistoryFavorite={resolvedToggleHistoryFavorite}
                />
              ) : (
                renderNode?.(node, cell, index)
              ))}
          </div>
        );
        })}
      </div>
    </>
  );
}

function HomeVisitHistoryTrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getHomeVisitExternalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ""))
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

function getHomeFixedCardPosition(element) {
  const rect = element.getBoundingClientRect();
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const alignRight = rect.left + rect.width / 2 > viewportWidth / 2;
  const inset = Math.max(
    4,
    alignRight ? viewportWidth - rect.right : rect.left,
  );

  return {
    left: alignRight ? "auto" : inset,
    maxWidth: Math.max(80, Math.min(440, viewportWidth - inset - 4)),
    right: alignRight ? inset : "auto",
    top: rect.top + 2,
  };
}

export function HomeNavigationPathHover({
  children,
  context = "navbar",
  detail = "",
  className = "",
  hidden = false,
  label = "table item",
  onToggleHidden,
  visibilityKey = "",
}) {
  const [cardPosition, setCardPosition] = useState(null);
  const hideable = !!visibilityKey && typeof onToggleHidden == "function";

  function positionCard(event) {
    const trigger = event.currentTarget;
    const anchor = trigger.firstElementChild || trigger;
    setCardPosition(getHomeFixedCardPosition(anchor));
  }

  return (
    <NavbarHoverCard
      className={["homeNavPathHover", className].filter(Boolean).join(" ")}
      panelClassName="homeNavPathCard"
      triggerClassName="homeNavPathTrigger"
    >
      <span
        className="homeNavPathTrigger"
        onFocus={positionCard}
        onMouseEnter={positionCard}
        onPointerDown={positionCard}
      >
        {children}
      </span>
      <span
        className={`navQuickFavCard homeVisitHistoryCard homeNavPathCard${
          hideable ? " interactive" : ""
        }`}
        style={cardPosition || undefined}
      >
        {hideable && (
          <NavbarHideButton
            hidden={hidden}
            label={label}
            className="homeNavPathHideButton"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleHidden(visibilityKey);
            }}
          />
        )}
        <span className="homeVisitHistoryPathInfo">
          <span className="homeVisitHistoryPathContext">
            {String(context || "navbar")}
          </span>
          <span className="homeVisitHistoryPathDetail">
            {String(detail || "")}
          </span>
        </span>
      </span>
    </NavbarHoverCard>
  );
}

function HomeVisitHistoryItem({
  dragClassName = "",
  dragProps,
  historyFavoriteKeySet,
  item,
  onRemoveHistory,
  onToggleHistoryFavorite,
}) {
  const [cardPosition, setCardPosition] = useState(null);
  const href = String(item?.href || "");
  const label = String(item?.label || item?.title || href || "history item");
  const favoriteKey = String(item?.favoriteKey || "");
  const canFavorite =
    !!favoriteKey && typeof onToggleHistoryFavorite == "function";
  const favoriteActive =
    canFavorite && historyFavoriteKeySet?.has(favoriteKey);
  const context = String(
    item?.historyContext || item?.context || "navbar",
  );
  const detail = String(item?.detail || item?.address || href);

  function positionCard(event) {
    setCardPosition(getHomeFixedCardPosition(event.currentTarget));
  }

  return (
    <NavbarHoverCard
      className={[
        "homeVisitHistoryItem",
        "navQuickFavTrigger",
        dragClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {href ? (
        <Link
          href={href}
          className="homeVisitHistoryLink"
          draggable={!!dragProps}
          data-history-label={label}
          data-history-title={item?.title || label}
          data-history-context={context}
          onFocus={positionCard}
          onMouseEnter={positionCard}
          onPointerDown={positionCard}
          {...dragProps}
          {...getHomeVisitExternalLinkProps(href)}
        >
          {label}
        </Link>
      ) : (
        <span
          className="homeVisitHistoryLink disabled"
          draggable={!!dragProps}
          onFocus={positionCard}
          onMouseEnter={positionCard}
          onPointerDown={positionCard}
          {...dragProps}
        >
          {label}
        </span>
      )}
      <span
        className="navQuickFavCard homeVisitHistoryCard"
        style={cardPosition || undefined}
      >
        {canFavorite && (
          <button
            type="button"
            className={`homeVisitHistoryFavoriteButton${
              favoriteActive ? " active" : ""
            }`}
            aria-label={`${favoriteActive ? "remove" : "add"} ${label} ${
              favoriteActive ? "from" : "to"
            } favorites`}
            draggable={false}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleHistoryFavorite(favoriteKey, item);
            }}
          >
            {favoriteActive ? "★" : "☆"}
          </button>
        )}
        <button
          type="button"
          className="homeVisitHistoryRemoveButton"
          aria-label={`remove ${label} from history`}
          title="remove from history"
          draggable={false}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemoveHistory?.(href, item);
          }}
        >
          <HomeVisitHistoryTrashIcon />
        </button>
        <span className="homeVisitHistoryPathInfo">
          <span className="homeVisitHistoryPathContext">{context}</span>
          <span className="homeVisitHistoryPathDetail">{detail}</span>
        </span>
      </span>
    </NavbarHoverCard>
  );
}

export function HomeVisitHistoryRow({
  historyFavoriteKeySet,
  node,
  onMoveHistory,
  onRemoveHistory,
  onToggleHistoryFavorite,
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [dragKey, setDragKey] = useState("");
  const [dropSpot, setDropSpot] = useState(null);
  const dragKeyRef = useRef("");
  const linksRef = useRef(null);
  const items = node?.items || [];
  const canDrag = items.length > 1 && typeof onMoveHistory == "function";
  const toggleLabel = `${expanded ? "collapse" : "expand"} page history`;

  useEffect(() => {
    const links = linksRef.current;
    if (!links || typeof ResizeObserver === "undefined") return;

    function syncOverflow() {
      const next = links.scrollWidth > links.clientWidth + 1;
      setOverflowing((current) => (current === next ? current : next));
    }

    syncOverflow();
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(links);
    return () => observer.disconnect();
  }, [expanded, items]);

  return (
    <div
      className={[
        "homeVisitHistory",
        expanded ? "expanded" : "",
        dragKey ? "historyDragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="recently visited pages"
    >
      <button
        type="button"
        className="homeVisitHistoryLabel"
        aria-expanded={expanded}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => setExpanded((current) => !current)}
      >
        history:
      </button>
      <span ref={linksRef} className="homeVisitHistoryLinks">
        {items.length ? (
          items.map((item, index) => {
            const itemKey = getHomeVisitHistoryItemKey(item, index);
            const isDropSpot = dropSpot?.key == itemKey;
            const dropClass = isDropSpot
              ? dropSpot.placeAfter
                ? "dropAfter"
                : "dropBefore"
              : "";
            const dragProps = canDrag
              ? {
                  onDragStart(event) {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", itemKey);
                    dragKeyRef.current = itemKey;
                    setDragKey(itemKey);
                  },
                  onDragOver(event) {
                    const activeDragKey = dragKeyRef.current || dragKey;
                    if (!activeDragKey) return;
                    event.stopPropagation();
                    const placeAfter = getHomeHorizontalPlaceAfter(
                      items,
                      activeDragKey,
                      itemKey,
                      getHomeVisitHistoryItemKey,
                    );
                    if (placeAfter === null) return;

                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropSpot((current) =>
                      current?.key == itemKey &&
                      current?.placeAfter == placeAfter
                        ? current
                        : { key: itemKey, placeAfter },
                    );
                  },
                  onDragLeave(event) {
                    if (!dragKeyRef.current && !dragKey) return;
                    event.stopPropagation();
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setDropSpot((current) =>
                        current?.key == itemKey ? null : current,
                      );
                    }
                  },
                  onDrop(event) {
                    const rowDragKey = dragKeyRef.current || dragKey;
                    if (!rowDragKey) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const activeDragKey =
                      event.dataTransfer.getData("text/plain") ||
                      rowDragKey;
                    const placeAfter = getHomeHorizontalPlaceAfter(
                      items,
                      activeDragKey,
                      itemKey,
                      getHomeVisitHistoryItemKey,
                    );

                    if (placeAfter !== null) {
                      const draggedIndex = items.findIndex(
                        (entry, entryIndex) =>
                          getHomeVisitHistoryItemKey(entry, entryIndex) ==
                          activeDragKey,
                      );
                      const draggedItem = items[draggedIndex];
                      const withoutDragged = items.filter(
                        (_entry, entryIndex) => entryIndex != draggedIndex,
                      );
                      const targetIndex = withoutDragged.findIndex(
                        (entry, entryIndex) =>
                          getHomeVisitHistoryItemKey(entry, entryIndex) ==
                          itemKey,
                      );

                      if (draggedItem && targetIndex >= 0) {
                        const insertIndex =
                          targetIndex + (placeAfter ? 1 : 0);
                        onMoveHistory([
                          ...withoutDragged.slice(0, insertIndex),
                          draggedItem,
                          ...withoutDragged.slice(insertIndex),
                        ]);
                      }
                    }

                    dragKeyRef.current = "";
                    setDragKey("");
                    setDropSpot(null);
                  },
                  onDragEnd(event) {
                    if (dragKeyRef.current || dragKey) {
                      event.stopPropagation();
                    }
                    dragKeyRef.current = "";
                    setDragKey("");
                    setDropSpot(null);
                  },
                }
              : undefined;

            return (
              <HomeVisitHistoryItem
                dragClassName={[
                  dragKey == itemKey ? "dragging" : "",
                  dropClass,
                ]
                  .filter(Boolean)
                  .join(" ")}
                dragProps={dragProps}
                historyFavoriteKeySet={historyFavoriteKeySet}
                key={itemKey}
                item={item}
                onRemoveHistory={onRemoveHistory}
                onToggleHistoryFavorite={onToggleHistoryFavorite}
              />
            );
          })
        ) : (
          <span className="homeVisitHistoryEmpty">empty</span>
        )}
      </span>
      {!expanded && overflowing && (
        <button
          type="button"
          className="homeVisitHistoryMore"
          aria-label="expand page history"
          title="expand history"
          onClick={() => setExpanded(true)}
        >
          ..
        </button>
      )}
    </div>
  );
}

export function HomeFavoritesColumn({
  label = "home favorites",
  node,
  onToggleNode,
}) {
  const collapsed = !!node?.homeCollapsed;
  const hasChildren = !!node?.homeHasChildren;
  const toggleLabel = `${collapsed ? "show" : "hide"} ${label}`;

  return (
    <div
      className={`homeNavNode homeNavFavoriteColumn${
        hasChildren ? " hasChildren" : ""
      }${collapsed ? " collapsed" : ""}`}
      aria-label={label}
      title={label}
    >
      <span className="homeNavNodeLink homeNavFavoriteIcon" aria-hidden="true">
        ★
      </span>
      {hasChildren && (
        <span className="homeNavNodeActions">
          <button
            type="button"
            className="homeNavBranchToggle"
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            title={toggleLabel}
            draggable="false"
            onClick={() => onToggleNode?.(node)}
          >
            <span
              className={`homeNavBranchCaret ${collapsed ? "collapsed" : ""}`}
              aria-hidden="true"
            ></span>
          </button>
        </span>
      )}
    </div>
  );
}

function HomeResetSortingButton({ label, onResetSorting }) {
  const [resetConfirmed, showResetConfirmation] = useResetConfirmation();

  return (
    <button
      type="button"
      className="navQuickUnfav navResetSortingButton"
      aria-label={`reset ${label} sorting`}
      title={`reset ${label} sorting`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onResetSorting?.();
        showResetConfirmation();
      }}
    >
      reset sorting
      <span
        className={`navResetConfirmation${resetConfirmed ? " visible" : ""}`}
        aria-hidden="true"
      >
        ✓
      </span>
    </button>
  );
}

export function HomeSectionSortLabel({ children, label, onResetSorting }) {
  return (
    <NavbarHoverCard className="homeNavSectionSortLabel navQuickFavTrigger">
      <button
        type="button"
        className="homeNavSectionSortLabelButton"
        aria-label={`show ${label} sorting actions`}
      >
        {children}
      </button>
      <span className="navQuickFavCard homeNavSectionSortResetCard">
        <HomeResetSortingButton
          label={label}
          onResetSorting={onResetSorting}
        />
      </span>
    </NavbarHoverCard>
  );
}

export function HomeSectionSortToggle({
  collapsed = false,
  label,
  onExpandAll,
  onResetSorting,
  onToggle,
  showExpandAll = false,
}) {
  const toggleLabel = `${collapsed ? "show" : "hide"} ${label} table`;
  const showActionCard = !!onResetSorting || showExpandAll;

  return (
    <NavbarHoverCard className="homeNavSectionSortToggle navQuickFavTrigger">
      <button
        type="button"
        className="homeNavBranchToggle homeNavSectionToggle"
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={toggleLabel}
        onClick={onToggle}
      >
        <span
          className={`homeNavBranchCaret ${collapsed ? "collapsed" : ""}`}
          aria-hidden="true"
        ></span>
      </button>
      {showActionCard && (
        <span className="navQuickFavCard homeNavSectionSortResetCard">
          {onResetSorting && (
            <HomeResetSortingButton
              label={label}
              onResetSorting={onResetSorting}
            />
          )}
          {showExpandAll && (
            <button
              type="button"
              className="navQuickUnfav navResetSortingButton homeNavSectionExpandAllButton"
              aria-label={`expand all ${label}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onExpandAll?.();
              }}
            >
              expand all
            </button>
          )}
        </span>
      )}
    </NavbarHoverCard>
  );
}
