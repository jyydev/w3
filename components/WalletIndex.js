"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { localEditorStorageEvent } from "@/app/_editorData/browserEditorStorage";
import {
  buildWalletFavoriteCatalog,
  getDirectWalletSearchEntry,
  getNodeIdentity,
  getNodeSortKey,
  getWalletFavoriteItem,
  getWalletNavigationChildren,
  NavigationNode,
  useBranchToggle,
  useWalletFavorites,
  useWalletSort,
} from "./Home";
import {
  buildHomeFavoritesMatrixGroup,
  buildHomeNavigationMatrix,
  getHomeMatrixMove,
  getHomeMatrixNodeKey,
  getHomeSourceNodeKey,
  HomeMatrixVisibilityToggle,
  HomeNavigationMatrix,
  HomeSectionSortLabel,
  HomeSectionSortToggle,
  sortHomeMatrixChildren,
  useHomeMatrixVisibility,
} from "./HomeNavigationMatrix";
import {
  getLocalWalletTree,
  getWalletNavUrl,
  mergeTrees,
} from "./NavbarWalletMenu";
import { homeCollapsedCookieM } from "./homeNavigationState";

const walletTypes = new Set(["evm", "solana", "tron"]);
const walletTypeOptions = [
  ["", "all"],
  ["evm", "EVM"],
  ["solana", "Solana"],
  ["tron", "Tron"],
];

export function normalizeWalletIndexType(value = "") {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const walletType = String(rawValue || "").trim().toLowerCase();
  if (!walletType) return "";
  return walletTypes.has(walletType) ? walletType : "evm";
}

function getHistoryWalletType(entry, routeBase = "/w") {
  const href = String(entry?.href || "").trim();
  const base = String(routeBase || "/w").replace(/\/+$/, "") || "/w";
  if (!href.startsWith("/")) return "";

  try {
    const url = new URL(href, "http://w3.local");
    if (url.pathname != base && !url.pathname.startsWith(`${base}/`)) {
      return "";
    }

    return normalizeWalletIndexType(url.searchParams.get("chain")) || "evm";
  } catch {
    return "";
  }
}

function isWalletSelectionHistoryEntry(entry) {
  try {
    const url = new URL(String(entry?.href || ""), "http://w3.local");
    return url.searchParams.has("addr") || url.searchParams.has("w");
  } catch {
    return false;
  }
}

export default function WalletIndex({
  favAddrs = [],
  initialCollapsedKeys = [],
  initialFavoriteKeys = [],
  initialHistory = [],
  initialOrderM = {},
  routeBase = "/w",
  walletTree = [],
  walletType = "",
}) {
  const router = useRouter();
  const pageLabel = routeBase == "/t" ? "trade" : "wallet";
  const selectedWalletType = normalizeWalletIndexType(walletType);
  const sectionKey = `home:${pageLabel}:section`;
  const matrixVisibility = useHomeMatrixVisibility(
    `w3_homeMatrixHidden:${pageLabel}`,
  );
  const [localWalletTree, setLocalWalletTree] = useState([]);
  const [walletTreeReady, setWalletTreeReady] = useState(false);
  const { collapsedKeys, expandAll, toggleNode } = useBranchToggle(
    homeCollapsedCookieM.wallet,
    initialCollapsedKeys,
  );
  const { customOrderM, resetSorting, setCustomOrderM } =
    useWalletSort(initialOrderM);
  const { favoriteKeys, moveFavorite, toggleFavorite } =
    useWalletFavorites(initialFavoriteKeys);

  useEffect(() => {
    function refreshLocalTree() {
      setLocalWalletTree(getLocalWalletTree());
      setWalletTreeReady(true);
    }

    refreshLocalTree();
    window.addEventListener(localEditorStorageEvent, refreshLocalTree);
    window.addEventListener("storage", refreshLocalTree);
    return () => {
      window.removeEventListener(localEditorStorageEvent, refreshLocalTree);
      window.removeEventListener("storage", refreshLocalTree);
    };
  }, []);

  const mergedWalletTree = useMemo(
    () => mergeTrees(walletTree, localWalletTree),
    [localWalletTree, walletTree],
  );
  const visibleWalletTree = useMemo(
    () =>
      mergedWalletTree
        .filter(
          (node) =>
            !selectedWalletType || node.walletType == selectedWalletType,
        )
        .map((node) => ({
          ...node,
          href: getWalletNavUrl(routeBase, node),
        })),
    [mergedWalletTree, routeBase, selectedWalletType],
  );
  const favoriteCatalog = useMemo(
    () =>
      buildWalletFavoriteCatalog(visibleWalletTree, routeBase, favAddrs),
    [favAddrs, routeBase, visibleWalletTree],
  );
  const favoriteKeySet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);
  const matrix = useMemo(() => {
    const walletRootKeySet = new Set(visibleWalletTree.map(getNodeSortKey));
    const getFavoriteSourceChildren = (node) =>
      walletRootKeySet.has(getNodeSortKey(node))
        ? getWalletNavigationChildren(node, routeBase, favAddrs)
        : node.children || [];
    const favoritesGroup = buildHomeFavoritesMatrixGroup({
      favoriteKeys,
      getChildren: getFavoriteSourceChildren,
      getFavoriteItem: (node, favoriteKey) =>
        getWalletFavoriteItem(node, favoriteKey, routeBase),
      getFavoriteNode: (favoriteKey) => favoriteCatalog.get(favoriteKey),
      getNodeKey: getNodeSortKey,
      rootKey: "home:walletFavorites",
    });

    return buildHomeNavigationMatrix({
      nodes: [favoritesGroup, ...visibleWalletTree],
      getChildren: (node, depth) => {
        if (node.type == "homeFavorites" || node.homeFavoriteProjection) {
          return node.children || [];
        }

        return depth == 0
          ? getWalletNavigationChildren(node, routeBase, favAddrs)
          : node.children || [];
      },
      getNodeKey: (node) => getHomeMatrixNodeKey(node, getNodeSortKey),
      isCollapsed: (node) => collapsedKeys.has(getNodeIdentity(node)),
      orderChildren: (children, parentKey, parentNode) => {
        if (parentNode?.type == "homeFavorites") return children;

        const sourceParentKey = parentNode
          ? getHomeSourceNodeKey(parentNode, getNodeSortKey)
          : parentKey;
        return sortHomeMatrixChildren(
          children,
          customOrderM[sourceParentKey] || [],
          (node) => getHomeSourceNodeKey(node, getNodeSortKey),
        );
      },
      pathPrefix: [pageLabel],
      visibility: {
        hiddenKeys: matrixVisibility.hiddenKeys,
        showHidden: matrixVisibility.showHidden,
      },
    });
  }, [
    collapsedKeys,
    customOrderM,
    favAddrs,
    favoriteCatalog,
    favoriteKeys,
    matrixVisibility.hiddenKeys,
    matrixVisibility.showHidden,
    pageLabel,
    routeBase,
    visibleWalletTree,
  ]);
  const sectionCollapsed = collapsedKeys.has(sectionKey);

  useEffect(() => {
    if (!walletTreeReady || selectedWalletType) return;
    matrixVisibility.pruneHiddenKeys(matrix.visibilityKeys);
  }, [
    matrix.visibilityKeys,
    matrixVisibility.pruneHiddenKeys,
    selectedWalletType,
    walletTreeReady,
  ]);

  const filterHistoryEntry = useCallback(
    (entry) =>
      !selectedWalletType ||
      getHistoryWalletType(entry, routeBase) == selectedWalletType,
    [routeBase, selectedWalletType],
  );

  const getHistoryFavoriteKey = useCallback((entry, searchEntry) => {
    return searchEntry?.href == entry?.href ? searchEntry.favoriteKey : "";
  }, []);

  function moveNode(dragNode, targetNode, placeAfter) {
    if (
      dragNode.homeFavoriteProjectionRoot &&
      targetNode.homeFavoriteProjectionRoot
    ) {
      moveFavorite(
        dragNode.homeFavoriteKey,
        targetNode.homeFavoriteKey,
        placeAfter,
      );
      return;
    }

    setCustomOrderM((current) =>
      getHomeMatrixMove(current, matrix, dragNode, targetNode, placeAfter),
    );
  }

  return (
    <main className="homePage editorIndexPage walletIndexPage">
      <div className="flex mb-1 homeNavLogoRow">
        <span className="orange">W3</span>
        <span className="homeNavSectionTitle">
          <HomeMatrixVisibilityToggle
            label={`${pageLabel} table`}
            visibility={matrixVisibility}
          />
          <HomeSectionSortLabel
            label={pageLabel}
            onResetSorting={resetSorting}
          >
            {pageLabel}
          </HomeSectionSortLabel>
          <HomeSectionSortToggle
            collapsed={sectionCollapsed}
            label={pageLabel}
            onExpandAll={expandAll}
            onToggle={() => toggleNode({ homeKey: sectionKey })}
            showExpandAll={sectionCollapsed || !!matrix.collapsedCount}
          />
        </span>
      </div>
      <nav className="homeNav" aria-label={`${pageLabel} wallets`}>
        <section
          className={`homeNavSection ${sectionCollapsed ? "collapsed" : ""}`}
        >
          {!sectionCollapsed && (
            <HomeNavigationMatrix
              historyFavoriteKeySet={favoriteKeySet}
              historyOptions={{
                basePath: routeBase,
                filterEntry: filterHistoryEntry,
                getFavoriteKey: getHistoryFavoriteKey,
                includeBasePathEntry: isWalletSelectionHistoryEntry,
                initialHistory,
              }}
              matrix={matrix}
              onMoveNode={moveNode}
              onToggleHistoryFavorite={toggleFavorite}
              renderNode={(node) => (
                <NavigationNode
                  node={node}
                  favoriteKeySet={favoriteKeySet}
                  getHref={(entry) =>
                    entry.href || getWalletNavUrl(routeBase, entry)
                  }
                  onMoveFavorite={moveFavorite}
                  onToggleFavorite={toggleFavorite}
                  onToggleHidden={matrixVisibility.toggleHidden}
                  onToggleNode={toggleNode}
                />
              )}
              searchOptions={{
                emptyLabel: "no added wallet matches",
                getDirectEntry: (query) => {
                  const entry = getDirectWalletSearchEntry(query, routeBase);
                  return !selectedWalletType ||
                    entry?.walletType == selectedWalletType
                    ? entry
                    : null;
                },
                includeHome: false,
                placeholder: "wallet name or address",
                searchLabel: "search added wallets by name or address",
                submitLabel: "search wallets",
              }}
              searchControls={
                <div
                  className="homeNavMode"
                  aria-label="all, EVM, Solana, or Tron wallets"
                >
                  {walletTypeOptions.map(([type, label]) => (
                    <button
                      type="button"
                      className={selectedWalletType == type ? "active" : ""}
                      aria-pressed={selectedWalletType == type}
                      key={type || "all"}
                      onClick={() =>
                        router.push(
                          type
                            ? getWalletNavUrl(routeBase, {
                                type: "folder",
                                walletType: type,
                              })
                            : routeBase,
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
              sortable
            />
          )}
        </section>
      </nav>
    </main>
  );
}
