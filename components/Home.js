"use client";

import { deleteCookie, setCookie } from "cookies-next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { localEditorStorageEvent } from "@/app/_editorData/browserEditorStorage";
import { parseWalletHistoryValue } from "@/app/w/walletHistory";
import FavoriteButton from "./FavoriteButton";
import {
  encodeHomeCollapsedKeys,
  encodeHomeWalletFavKeys,
  encodeHomeWalletOrder,
  homeCollapsedCookieM,
  homeNavigationCookieMaxAge,
  homeWalletFavsCookie,
  homeWalletModeCookie,
  homeWalletOrderCookie,
  homeWalletSortModeCookie,
  parseHomeCollapsedKeys,
  parseHomeWalletFavKeys,
  parseHomeWalletMode,
  parseHomeWalletOrder,
  parseHomeWalletSortMode,
} from "./homeNavigationState";
import {
  getLocalWalletTree,
  getWalletNavUrl,
  mergeTrees,
} from "./NavbarWalletMenu";

function buildTreeMatrix(
  nodes = [],
  getChildren = (node) => node.children || [],
  isCollapsed = () => false,
  orderChildren = (children) => children,
) {
  let columnCount = 0;
  let collapsedCount = 0;

  function measureNode(node, depth, parentKey) {
    const nodeKey = getNodeSortKey(node);
    const children = orderChildren(getChildren(node, depth) || [], nodeKey);
    const collapsed = !!children.length && isCollapsed(node);
    if (collapsed) collapsedCount++;
    const visibleChildren = collapsed ? [] : children;
    const measuredChildren = visibleChildren.map((child) =>
      measureNode(child, depth + 1, nodeKey),
    );
    const rowSpan =
      measuredChildren.reduce((sum, child) => sum + child.rowSpan, 0) || 1;
    columnCount = Math.max(columnCount, depth + 1);

    return {
      children: measuredChildren,
      node: {
        ...node,
        homeHasChildren: !!children.length,
        homeCollapsed: collapsed,
        homeNodeKey: nodeKey,
        homeParentKey: parentKey,
      },
      rowSpan,
    };
  }

  const rootParentKey = "home:root";
  const measuredRoots = orderChildren(nodes, rootParentKey).map((node) =>
    measureNode(node, 0, rootParentKey),
  );
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
    rowCount: Math.max(0, rowStart - 1),
  };
}

function getNodeIdentity(node) {
  return [
    node.homeKey,
    node.href,
    node.walletType,
    node.filePath,
    node.walletName,
    node.value,
    node.label,
  ]
    .filter((value) => value !== undefined && value !== "")
    .join(":");
}

function getNodeSortKey(node) {
  if (node.homeKey) return String(node.homeKey);
  if (node.walletType) {
    if (node.walletName) {
      return `${node.walletType}:wallet:${node.filePath || ""}:${
        node.walletName
      }`;
    }
    if (node.filePath) return `${node.walletType}:path:${node.filePath}`;
    return `${node.walletType}:root`;
  }
  if (node.href) return String(node.href);
  if (node.value) return String(node.value);

  return String(node.label || "");
}

function sortHomeChildren(children = [], order = []) {
  const pinned = children.filter((node) => node.homePinned);
  const sortable = children.filter((node) => !node.homePinned);
  const orderIndexM = new Map(order.map((nodeKey, index) => [nodeKey, index]));

  sortable.sort((a, b) => {
    const aIndex = orderIndexM.get(getNodeSortKey(a));
    const bIndex = orderIndexM.get(getNodeSortKey(b));
    const aOrder = aIndex === undefined ? Infinity : aIndex;
    const bOrder = bIndex === undefined ? Infinity : bIndex;
    return aOrder - bOrder;
  });

  return [...pinned, ...sortable];
}

function getNodeKey(node, index) {
  return `${getNodeIdentity(node)}:${index}`;
}

function getSectionCollapseNode(section = "") {
  return {
    homeKey: `home:${section}:section`,
  };
}

function useBranchToggle(cookieName, initialCollapsedKeys = []) {
  const [collapsedKeys, setCollapsedKeys] = useState(
    () => new Set(parseHomeCollapsedKeys(initialCollapsedKeys)),
  );

  useEffect(() => {
    if (!cookieName) return;

    if (!collapsedKeys.size) {
      deleteCookie(cookieName);
      return;
    }

    setCookie(cookieName, encodeHomeCollapsedKeys(collapsedKeys), {
      maxAge: homeNavigationCookieMaxAge,
    });
  }, [collapsedKeys, cookieName]);

  function toggleNode(node) {
    const key = getNodeIdentity(node);
    if (!key) return;

    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAll() {
    setCollapsedKeys(new Set());
  }

  return { collapsedKeys, expandAll, toggleNode };
}

function useWalletSort(initialSortMode = "default", initialOrderM = {}) {
  const [sortMode, setSortMode] = useState(() =>
    parseHomeWalletSortMode(initialSortMode),
  );
  const [customOrderM, setCustomOrderM] = useState(() =>
    parseHomeWalletOrder(initialOrderM),
  );

  useEffect(() => {
    if (sortMode == "custom") {
      setCookie(homeWalletSortModeCookie, sortMode, {
        maxAge: homeNavigationCookieMaxAge,
      });
    } else {
      deleteCookie(homeWalletSortModeCookie);
    }
  }, [sortMode]);

  useEffect(() => {
    if (!Object.keys(customOrderM).length) {
      deleteCookie(homeWalletOrderCookie);
      return;
    }

    setCookie(homeWalletOrderCookie, encodeHomeWalletOrder(customOrderM), {
      maxAge: homeNavigationCookieMaxAge,
    });
  }, [customOrderM]);

  function resetToDefault() {
    setCustomOrderM({});
    setSortMode("default");
  }

  return {
    customOrderM,
    resetToDefault,
    setCustomOrderM,
    setSortMode,
    sortMode,
  };
}

function useWalletFavorites(initialFavoriteKeys = []) {
  const [favoriteKeys, setFavoriteKeys] = useState(() =>
    parseHomeWalletFavKeys(initialFavoriteKeys),
  );

  useEffect(() => {
    if (!favoriteKeys.length) {
      deleteCookie(homeWalletFavsCookie);
      return;
    }

    setCookie(homeWalletFavsCookie, encodeHomeWalletFavKeys(favoriteKeys), {
      maxAge: homeNavigationCookieMaxAge,
      path: "/",
    });
  }, [favoriteKeys]);

  function toggleFavorite(nodeOrKey) {
    const nodeKey =
      typeof nodeOrKey == "string"
        ? nodeOrKey
        : getNodeSortKey(nodeOrKey || {});
    if (!nodeKey) return;

    setFavoriteKeys((current) => {
      const clean = parseHomeWalletFavKeys(current);
      return clean.includes(nodeKey)
        ? clean.filter((key) => key != nodeKey)
        : [...clean, nodeKey];
    });
  }

  function moveFavorite(dragKey, targetKey, placeAfter) {
    if (!dragKey || !targetKey || dragKey == targetKey) return;

    setFavoriteKeys((current) => {
      const clean = parseHomeWalletFavKeys(current);
      if (!clean.includes(dragKey) || !clean.includes(targetKey)) {
        return current;
      }

      const withoutDragged = clean.filter((key) => key != dragKey);
      const targetIndex = withoutDragged.indexOf(targetKey);
      if (targetIndex < 0) return current;

      const insertIndex = targetIndex + (placeAfter ? 1 : 0);
      return [
        ...withoutDragged.slice(0, insertIndex),
        dragKey,
        ...withoutDragged.slice(insertIndex),
      ];
    });
  }

  return {
    favoriteKeys,
    moveFavorite,
    toggleFavorite,
  };
}

function WalletHistoryNode({ node }) {
  return (
    <div
      className="homeNavHistory"
      aria-label={`${node.walletType || ""} wallet history`}
    >
      <span className="homeNavHistoryLabel">history:</span>
      <span className="homeNavHistoryLinks">
        {node.items?.length ? (
          node.items.map((item) =>
            item.href ? (
              <Link
                href={item.href}
                className="homeNavHistoryLink"
                title={item.title || item.label}
                key={item.homeKey}
              >
                {item.label}
              </Link>
            ) : (
              <span
                className="homeNavHistoryLink disabled"
                title={item.title || item.label}
                key={item.homeKey}
              >
                {item.label}
              </span>
            ),
          )
        ) : (
          <span className="homeNavHistoryEmpty">empty</span>
        )}
      </span>
    </div>
  );
}

function HomeWalletFavoritesNode({ node, onMoveFavorite, onToggleFavorite }) {
  const [dragKey, setDragKey] = useState("");
  const [dropSpot, setDropSpot] = useState(null);

  return (
    <div
      className="homeNavFavorites"
      aria-label={`${node.walletType || ""} home wallet favorites`}
    >
      <span
        className="homeNavFavoritesLabel"
        title="home wallet favorites"
        aria-hidden="true"
      >
        ★<span className="homeNavFavoritesSeparator">:</span>
      </span>
      <span className="homeNavFavoritesLinks">
        {node.items?.length ? (
          node.items.map((item) => {
            const isDropSpot = dropSpot?.key == item.favoriteKey;
            const dropClass = isDropSpot
              ? dropSpot.placeAfter
                ? "dropAfter"
                : "dropBefore"
              : "";

            return (
              <span
                className={[
                  "homeNavQuickFav",
                  dragKey == item.favoriteKey ? "dragging" : "",
                  dropClass,
                ]
                  .filter(Boolean)
                  .join(" ")}
                draggable
                key={item.favoriteKey}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.favoriteKey);
                  setDragKey(item.favoriteKey);
                }}
                onDragOver={(event) => {
                  if (!dragKey || dragKey == item.favoriteKey) return;

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const rect = event.currentTarget.getBoundingClientRect();
                  const placeAfter = event.clientX > rect.left + rect.width / 2;
                  setDropSpot((current) =>
                    current?.key == item.favoriteKey &&
                    current?.placeAfter == placeAfter
                      ? current
                      : { key: item.favoriteKey, placeAfter },
                  );
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setDropSpot((current) =>
                      current?.key == item.favoriteKey ? null : current,
                    );
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  onMoveFavorite?.(
                    event.dataTransfer.getData("text/plain"),
                    item.favoriteKey,
                    event.clientX > rect.left + rect.width / 2,
                  );
                  setDragKey("");
                  setDropSpot(null);
                }}
                onDragEnd={() => {
                  setDragKey("");
                  setDropSpot(null);
                }}
              >
                <Link
                  href={item.href}
                  className="homeNavQuickFavLink"
                  title={item.title || item.label}
                >
                  {item.label}
                </Link>
                <button
                  type="button"
                  className="homeNavQuickUnfav"
                  title={`remove ${item.label} from home favorites`}
                  aria-label={`remove ${item.label} from home favorites`}
                  draggable="false"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleFavorite?.(item.favoriteKey);
                  }}
                >
                  ★
                </button>
              </span>
            );
          })
        ) : (
          <span className="homeNavFavoritesEmpty">empty</span>
        )}
      </span>
    </div>
  );
}

function NavigationNode({
  node,
  favoriteKeySet,
  getHref,
  onMoveFavorite,
  onToggleFavorite,
  onToggleNode,
}) {
  if (node.type == "history") return <WalletHistoryNode node={node} />;
  if (node.type == "homeFavorites") {
    return (
      <HomeWalletFavoritesNode
        node={node}
        onMoveFavorite={onMoveFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    );
  }

  const href = getHref(node);
  const hasChildren = !!node.children?.length || !!node.homeHasChildren;
  const favoriteKey = getNodeSortKey(node);
  const showFavoriteButton =
    !!onToggleFavorite && !!node.walletType && !node.homePinned;
  const favoriteActive = showFavoriteButton && favoriteKeySet?.has(favoriteKey);
  const className = [
    "homeNavNode",
    node.type == "wallet" ? "walletLeaf" : "",
    hasChildren ? "hasChildren" : "",
    node.homeCollapsed ? "collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const label =
    href && !node.disabled ? (
      <Link href={href} className="homeNavNodeLink">
        {node.label}
      </Link>
    ) : (
      <span className="homeNavNodeLink disabled">{node.label}</span>
    );
  const toggleLabel = `${
    node.homeCollapsed ? "show" : "hide"
  } ${node.label} children`;

  return (
    <div className={className}>
      {label}
      {(showFavoriteButton || hasChildren) && (
        <span className="homeNavNodeActions">
          {showFavoriteButton && (
            <FavoriteButton
              active={favoriteActive}
              className="homeNavFavBtn"
              label={node.label}
              scope="home"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleFavorite(node);
              }}
            />
          )}
          {hasChildren && (
            <button
              type="button"
              className="homeNavBranchToggle"
              aria-label={toggleLabel}
              aria-expanded={!node.homeCollapsed}
              title={toggleLabel}
              onClick={() => onToggleNode?.(node)}
            >
              <span
                className={`homeNavBranchCaret ${
                  node.homeCollapsed ? "collapsed" : ""
                }`}
                aria-hidden="true"
              ></span>
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function NavigationMatrix({
  matrix,
  favoriteKeySet,
  getHref,
  onMoveFavorite,
  onToggleNode,
  onToggleFavorite,
  sortable = false,
  onMoveNode,
}) {
  const [dragNode, setDragNode] = useState(null);
  const [dropSpot, setDropSpot] = useState(null);

  if (!matrix?.cells?.length) return null;

  return (
    <div
      className={`homeNavMatrix ${sortable ? "customSort" : ""}`}
      style={{
        "--home-nav-column-count": matrix.columnCount,
        "--home-nav-row-count": matrix.rowCount,
      }}
    >
      {matrix.cells.map((cell, index) => {
        const node = cell.node;
        const canDrag = sortable && !cell.empty && !node?.homePinned;
        const dragging = canDrag && dragNode?.homeNodeKey == node?.homeNodeKey;
        const isDropSpot = canDrag && dropSpot?.nodeKey == node?.homeNodeKey;
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
              node?.type == "history" ? "history" : "",
              node?.type == "homeFavorites" ? "favorites" : "",
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
                : `${getNodeKey(node, index)}:${cell.column}:${cell.rowStart}`
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
                      dragNode.homeNodeKey == node.homeNodeKey ||
                      dragNode.homeParentKey != node.homeParentKey
                    ) {
                      return;
                    }

                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const rect = event.currentTarget.getBoundingClientRect();
                    const placeAfter =
                      event.clientY > rect.top + rect.height / 2;
                    setDropSpot((current) =>
                      current?.nodeKey == node.homeNodeKey &&
                      current?.placeAfter == placeAfter
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
                        current?.nodeKey == node.homeNodeKey ? null : current,
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
                      dragNode.homeNodeKey != node.homeNodeKey &&
                      dragNode.homeParentKey == node.homeParentKey
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
            {!cell.empty && (
              <NavigationNode
                node={node}
                favoriteKeySet={favoriteKeySet}
                getHref={getHref}
                onMoveFavorite={onMoveFavorite}
                onToggleFavorite={onToggleFavorite}
                onToggleNode={onToggleNode}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RouteSection({
  section,
  title,
  href,
  tree = [],
  initialCollapsedKeys = [],
}) {
  const { collapsedKeys, expandAll, toggleNode } = useBranchToggle(
    homeCollapsedCookieM[section],
    initialCollapsedKeys,
  );
  const sectionCollapseNode = getSectionCollapseNode(section);
  const sectionCollapsed = collapsedKeys.has(
    getNodeIdentity(sectionCollapseNode),
  );
  const matrix = useMemo(
    () =>
      buildTreeMatrix(tree, undefined, (node) =>
        collapsedKeys.has(getNodeIdentity(node)),
      ),
    [collapsedKeys, tree],
  );

  return (
    <section
      className={`homeNavSection ${sectionCollapsed ? "collapsed" : ""}`}
    >
      <header className="homeNavHeader">
        <div className="homeNavSectionTitle">
          <h2>
            <Link href={href}>{title}</Link>
          </h2>
          <button
            type="button"
            className="homeNavBranchToggle homeNavSectionToggle"
            aria-label={`${sectionCollapsed ? "show" : "hide"} ${title} table`}
            aria-expanded={!sectionCollapsed}
            title={`${sectionCollapsed ? "show" : "hide"} ${title} table`}
            onClick={() => toggleNode(sectionCollapseNode)}
          >
            <span
              className={`homeNavBranchCaret ${
                sectionCollapsed ? "collapsed" : ""
              }`}
              aria-hidden="true"
            ></span>
          </button>
        </div>
        {(sectionCollapsed || !!matrix.collapsedCount) && (
          <button
            type="button"
            className="homeNavExpandAll"
            onClick={expandAll}
          >
            expand all
          </button>
        )}
      </header>
      {!sectionCollapsed && (
        <NavigationMatrix
          matrix={matrix}
          getHref={(node) => node.href || ""}
          onToggleNode={toggleNode}
        />
      )}
    </section>
  );
}

function getFavoriteWalletChildren(
  favAddrs = [],
  walletType = "evm",
  routeBase = "/w",
) {
  return favAddrs
    .filter((fav) => fav.type == walletType)
    .map((fav, index) => {
      const address = String(fav.address || "").trim();
      const label =
        String(fav.name || "").trim() ||
        `fav_${address.slice(-6) || index + 1}`;

      return {
        type: "wallet",
        label,
        walletType,
        walletAddress: address,
        href: getWalletNavUrl(routeBase, {
          walletType,
          walletAddress: address,
        }),
        homeKey: `${walletType}:fav:${address}`,
      };
    })
    .filter((node) => node.walletAddress);
}

function getWalletHistoryItems(
  historyValues = [],
  walletType = "evm",
  routeBase = "/w",
) {
  return historyValues
    .map((historyValue, index) => {
      const entry = parseWalletHistoryValue(historyValue);
      const base = {
        homeKey: `${walletType}:history:${historyValue}:${index}`,
      };

      if (entry.type == "favs") {
        return {
          ...base,
          label: "favs",
          href: getWalletNavUrl(routeBase, { walletType }),
        };
      }
      if (entry.type == "all") {
        return {
          ...base,
          label: "all",
          href: getWalletNavUrl(routeBase, {
            walletType,
            filePath: "all",
          }),
        };
      }
      if (entry.type == "walletName" && entry.value) {
        return {
          ...base,
          label: `w: ${entry.value}`,
          href: getWalletNavUrl(routeBase, {
            walletType,
            walletName: entry.value,
          }),
        };
      }
      if (entry.type == "address" && entry.value) {
        return {
          ...base,
          label: `addr: ..${entry.value.slice(-3)}`,
          title: entry.value,
          href: getWalletNavUrl(routeBase, {
            walletType,
            walletAddress: entry.value,
          }),
        };
      }
      if (entry.type == "notFound") {
        return {
          ...base,
          label: `not found${entry.value ? `: ${entry.value}` : ""}`,
          href: entry.value
            ? getWalletNavUrl(routeBase, {
                walletType,
                filePath: entry.value,
              })
            : "",
        };
      }
      if (entry.type == "connected") {
        return {
          ...base,
          label: "connected",
          title: "Connected wallet address is not stored in this cookie.",
        };
      }
      if (entry.type == "file" && entry.value) {
        return {
          ...base,
          label: entry.value,
          href: getWalletNavUrl(routeBase, {
            walletType,
            filePath: entry.value,
          }),
        };
      }

      return null;
    })
    .filter(Boolean);
}

function getWalletNavigationChildren(node, routeBase, favAddrs) {
  const walletType = node.walletType || "evm";

  return [
    {
      type: "special",
      label: "favs",
      walletType,
      href: getWalletNavUrl(routeBase, { walletType }),
      homeKey: `${walletType}:favs`,
      children: getFavoriteWalletChildren(favAddrs, walletType, routeBase),
    },
    {
      type: "special",
      label: "all",
      walletType,
      href: getWalletNavUrl(routeBase, {
        walletType,
        filePath: "all",
      }),
      homeKey: `${walletType}:all`,
    },
    ...(node.children || []),
  ];
}

function buildWalletFavoriteCatalog(walletTree, routeBase, favAddrs) {
  const catalog = new Map();

  function addNode(node) {
    const nodeKey = getNodeSortKey(node);
    if (nodeKey && !catalog.has(nodeKey)) catalog.set(nodeKey, node);
    for (const child of node.children || []) addNode(child);
  }

  for (const root of walletTree || []) {
    const rootKey = getNodeSortKey(root);
    if (rootKey) catalog.set(rootKey, root);
    for (const child of getWalletNavigationChildren(
      root,
      routeBase,
      favAddrs,
    )) {
      addNode(child);
    }
  }

  return catalog;
}

function getWalletFavoriteItems(
  favoriteKeys,
  favoriteCatalog,
  walletType,
  routeBase,
) {
  return favoriteKeys
    .map((favoriteKey) => {
      const node = favoriteCatalog.get(favoriteKey);
      if (!node || node.walletType != walletType) return null;

      const detail = [
        node.walletType,
        node.filePath,
        node.walletName && `w: ${node.walletName}`,
        node.walletAddress && `addr: ${node.walletAddress}`,
      ]
        .filter(Boolean)
        .join(" / ");

      return {
        favoriteKey,
        label: node.label,
        title: detail || node.label,
        href: node.href || getWalletNavUrl(routeBase, node),
      };
    })
    .filter(Boolean);
}

function getWalletRootChildren(
  node,
  routeBase,
  favAddrs,
  walletHistoryM,
  favoriteKeys,
  favoriteCatalog,
) {
  const walletType = node.walletType || "evm";
  return [
    {
      type: "history",
      label: "history",
      walletType,
      homeKey: `${walletType}:history`,
      homePinned: true,
      homeSpanRemaining: true,
      items: getWalletHistoryItems(
        walletHistoryM?.[walletType],
        walletType,
        routeBase,
      ),
    },
    {
      type: "homeFavorites",
      label: "home favorites",
      walletType,
      homeKey: `${walletType}:homeFavorites`,
      homePinned: true,
      homeSpanRemaining: true,
      items: getWalletFavoriteItems(
        favoriteKeys,
        favoriteCatalog,
        walletType,
        routeBase,
      ),
    },
    ...getWalletNavigationChildren(node, routeBase, favAddrs),
  ];
}

function WalletSection({
  walletTree = [],
  favAddrs = [],
  walletHistoryM = {},
  initialCollapsedKeys = [],
  initialMode = "trade",
  initialSortMode = "default",
  initialOrderM = {},
  initialFavoriteKeys = [],
}) {
  const [mode, setMode] = useState(() => parseHomeWalletMode(initialMode));
  const { collapsedKeys, expandAll, toggleNode } = useBranchToggle(
    homeCollapsedCookieM.wallet,
    initialCollapsedKeys,
  );
  const sectionCollapseNode = getSectionCollapseNode("wallet");
  const sectionCollapsed = collapsedKeys.has(
    getNodeIdentity(sectionCollapseNode),
  );
  const {
    customOrderM,
    resetToDefault,
    setCustomOrderM,
    setSortMode,
    sortMode,
  } = useWalletSort(initialSortMode, initialOrderM);
  const { favoriteKeys, moveFavorite, toggleFavorite } =
    useWalletFavorites(initialFavoriteKeys);

  useEffect(() => {
    setCookie(homeWalletModeCookie, mode, {
      maxAge: homeNavigationCookieMaxAge,
    });
  }, [mode]);

  const routeBase = mode == "trade" ? "/t" : "/w";
  const favoriteCatalog = useMemo(
    () => buildWalletFavoriteCatalog(walletTree, routeBase, favAddrs),
    [favAddrs, routeBase, walletTree],
  );
  const favoriteKeySet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);
  const matrix = useMemo(
    () =>
      buildTreeMatrix(
        walletTree,
        (node, depth) =>
          depth == 0
            ? getWalletRootChildren(
                node,
                routeBase,
                favAddrs,
                walletHistoryM,
                favoriteKeys,
                favoriteCatalog,
              )
            : node.children || [],
        (node) => collapsedKeys.has(getNodeIdentity(node)),
        (children, parentKey) =>
          sortHomeChildren(
            children,
            sortMode == "custom" ? customOrderM[parentKey] || [] : [],
          ),
      ),
    [
      collapsedKeys,
      customOrderM,
      favAddrs,
      favoriteCatalog,
      favoriteKeys,
      routeBase,
      sortMode,
      walletHistoryM,
      walletTree,
    ],
  );

  function moveNode(dragNode, targetNode, placeAfter) {
    if (
      sortMode != "custom" ||
      !dragNode?.homeNodeKey ||
      !targetNode?.homeNodeKey ||
      dragNode.homeParentKey != targetNode.homeParentKey
    ) {
      return;
    }

    const siblingKeys = matrix.cells
      .filter(
        (cell) =>
          cell.node &&
          !cell.node.homePinned &&
          cell.node.homeParentKey == dragNode.homeParentKey,
      )
      .sort((a, b) => a.rowStart - b.rowStart)
      .map((cell) => cell.node.homeNodeKey);
    const draggedKey = dragNode.homeNodeKey;
    const targetKey = targetNode.homeNodeKey;
    const draggedIndex = siblingKeys.indexOf(draggedKey);
    if (draggedIndex < 0 || !siblingKeys.includes(targetKey)) return;

    const withoutDragged = siblingKeys.filter((key) => key != draggedKey);
    const targetIndex = withoutDragged.indexOf(targetKey);
    if (targetIndex < 0) return;
    const insertIndex = targetIndex + (placeAfter ? 1 : 0);
    const nextOrder = [
      ...withoutDragged.slice(0, insertIndex),
      draggedKey,
      ...withoutDragged.slice(insertIndex),
    ];
    if (nextOrder.every((key, index) => key == siblingKeys[index])) return;

    setCustomOrderM((current) => ({
      ...current,
      [dragNode.homeParentKey]: nextOrder,
    }));
  }

  return (
    <section
      className={`homeNavSection homeWalletSection ${
        sectionCollapsed ? "collapsed" : ""
      }`}
    >
      <header className="homeNavHeader">
        <div className="homeNavSectionTitle">
          <div className="homeNavMode" aria-label="wallet or trade">
            <button
              type="button"
              className={mode == "wallet" ? "active" : ""}
              aria-pressed={mode == "wallet"}
              onClick={() => setMode("wallet")}
            >
              wallet
            </button>
            <button
              type="button"
              className={mode == "trade" ? "active" : ""}
              aria-pressed={mode == "trade"}
              onClick={() => setMode("trade")}
            >
              trade
            </button>
          </div>
          <button
            type="button"
            className="homeNavBranchToggle homeNavSectionToggle"
            aria-label={`${
              sectionCollapsed ? "show" : "hide"
            } wallet/trade table`}
            aria-expanded={!sectionCollapsed}
            title={`${sectionCollapsed ? "show" : "hide"} wallet/trade table`}
            onClick={() => toggleNode(sectionCollapseNode)}
          >
            <span
              className={`homeNavBranchCaret ${
                sectionCollapsed ? "collapsed" : ""
              }`}
              aria-hidden="true"
            ></span>
          </button>
        </div>
        <div className="homeNavSort">
          <span className="homeNavSortLabel">sort:</span>
          <div className="homeNavSortMode" aria-label="wallet row sorting">
            <button
              type="button"
              className={sortMode == "custom" ? "active" : ""}
              aria-pressed={sortMode == "custom"}
              onClick={() => setSortMode("custom")}
            >
              custom
            </button>
            <button
              type="button"
              className={sortMode == "default" ? "active" : ""}
              aria-pressed={sortMode == "default"}
              onClick={() => setSortMode("default")}
            >
              default
            </button>
          </div>
        </div>
        {sortMode == "custom" && (
          <button
            type="button"
            className="homeNavResetSort"
            onClick={resetToDefault}
          >
            reset to default
          </button>
        )}
        {(sectionCollapsed || !!matrix.collapsedCount) && (
          <button
            type="button"
            className="homeNavExpandAll"
            onClick={expandAll}
          >
            expand all
          </button>
        )}
      </header>
      {!sectionCollapsed && (
        <NavigationMatrix
          matrix={matrix}
          favoriteKeySet={favoriteKeySet}
          getHref={(node) => node.href || getWalletNavUrl(routeBase, node)}
          onMoveFavorite={moveFavorite}
          onToggleNode={toggleNode}
          onToggleFavorite={toggleFavorite}
          sortable={sortMode == "custom"}
          onMoveNode={moveNode}
        />
      )}
    </section>
  );
}

export default function Home({
  walletTree = [],
  dataTree = [],
  refTree = [],
  initialCollapsedM = {},
  favAddrs = [],
  walletHistoryM = {},
  initialWalletMode = "trade",
  initialWalletSortMode = "default",
  initialWalletOrderM = {},
  initialWalletFavKeys = [],
}) {
  const [localTree, setLocalTree] = useState([]);
  const mergedWalletTree = useMemo(
    () => mergeTrees(walletTree, localTree),
    [walletTree, localTree],
  );

  useEffect(() => {
    function refreshLocalTree() {
      setLocalTree(getLocalWalletTree());
    }

    refreshLocalTree();
    window.addEventListener(localEditorStorageEvent, refreshLocalTree);
    window.addEventListener("storage", refreshLocalTree);

    return () => {
      window.removeEventListener(localEditorStorageEvent, refreshLocalTree);
      window.removeEventListener("storage", refreshLocalTree);
    };
  }, []);

  return (
    <nav className="homeNav" aria-label="Site navigation">
      <RouteSection
        section="data"
        title="data"
        href="/d"
        tree={dataTree}
        initialCollapsedKeys={initialCollapsedM.data}
      />
      <WalletSection
        walletTree={mergedWalletTree}
        favAddrs={favAddrs}
        walletHistoryM={walletHistoryM}
        initialCollapsedKeys={initialCollapsedM.wallet}
        initialMode={initialWalletMode}
        initialSortMode={initialWalletSortMode}
        initialOrderM={initialWalletOrderM}
        initialFavoriteKeys={initialWalletFavKeys}
      />
      <RouteSection
        section="ref"
        title="ref"
        href="/ref"
        tree={refTree}
        initialCollapsedKeys={initialCollapsedM.ref}
      />
    </nav>
  );
}
