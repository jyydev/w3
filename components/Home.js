"use client";

import { deleteCookie, setCookie } from "cookies-next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { localEditorStorageEvent } from "@/app/_editorData/browserEditorStorage";
import {
  readStoredWallet,
  walletConnectEvent,
} from "@/app/w/browserWalletStorage";
import {
  getDefaultWalletName,
  isAddressOnlyWalletName,
} from "@/app/w/favAddrs";
import {
  getWalletHistoryCookie,
  parseWalletHistoryValue,
  writeWalletHistoryStorage,
} from "@/app/w/walletHistory";
import { encodeSelectionOrder } from "@/fn/selectionOrder";
import FavoriteButton from "./FavoriteButton";
import Logo from "./Logo";
import { HistoryRemoveButton, InteractiveInfoCard } from "./Shared";
import {
  encodeHomeCollapsedKeys,
  encodeHomeSectionOrder,
  encodeHomeWalletFavKeys,
  encodeHomeWalletOrder,
  defaultHomeSectionOrder,
  homeCollapsedCookieM,
  homeNavigationCookieMaxAge,
  homeSectionOrderCookie,
  homeWalletFavsCookie,
  homeWalletModeCookie,
  homeWalletOrderCookie,
  homeWalletSortModeCookie,
  parseHomeCollapsedKeys,
  parseHomeSectionOrder,
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

function SectionDragHandle({ section, onDragEnd, onDragStart }) {
  return (
    <span
      className="homeNavSectionDragHandle"
      draggable
      title={`drag ${section} section`}
      aria-label={`drag ${section} section`}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    ></span>
  );
}

function getSectionClassName(baseClassName = "", sectionDrag = {}) {
  return [
    "homeNavSection",
    baseClassName,
    sectionDrag.dragging ? "sectionDragging" : "",
    sectionDrag.dropPosition == "before" ? "sectionDropBefore" : "",
    sectionDrag.dropPosition == "after" ? "sectionDropAfter" : "",
  ]
    .filter(Boolean)
    .join(" ");
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

function WalletHistoryNode({ node, onRemoveHistory }) {
  return (
    <div
      className="homeNavHistory"
      aria-label={`${node.walletType || ""} wallet history`}
    >
      <span className="homeNavHistoryLabel">history:</span>
      <span className="homeNavHistoryLinks">
        {node.items?.length ? (
          node.items.map((item) => (
            <InteractiveInfoCard
              activation="hover"
              className="homeNavHistoryItem"
              key={item.homeKey}
            >
              {item.href ? (
                <Link
                  href={item.href}
                  className="homeNavHistoryLink"
                  title={item.title || item.label}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="homeNavHistoryLink disabled"
                  title={item.title || item.label}
                >
                  {item.label}
                </span>
              )}
              <span className="infoCard homeNavHistoryInfoCard">
                <span className="homeNavHistoryInfoRow">
                  <span>remove from history</span>
                  <HistoryRemoveButton
                    label={item.label}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemoveHistory?.(
                        node.walletType,
                        item.historyValue,
                      );
                    }}
                  />
                </span>
              </span>
            </InteractiveInfoCard>
          ))
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
  onRemoveHistory,
  onToggleFavorite,
  onToggleNode,
}) {
  if (node.type == "history") {
    return (
      <WalletHistoryNode
        node={node}
        onRemoveHistory={onRemoveHistory}
      />
    );
  }
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
  onRemoveHistory,
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
                onRemoveHistory={onRemoveHistory}
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
  sectionDrag = {},
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
      className={getSectionClassName(
        sectionCollapsed ? "collapsed" : "",
        sectionDrag,
      )}
      onDragOver={sectionDrag.onDragOver}
      onDragLeave={sectionDrag.onDragLeave}
      onDrop={sectionDrag.onDrop}
    >
      <header className="homeNavHeader">
        <SectionDragHandle
          section={section}
          onDragStart={sectionDrag.onDragStart}
          onDragEnd={sectionDrag.onDragEnd}
        />
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
        getDefaultWalletName(address) ||
        `fav_${index + 1}`;
      const addressOnly = isAddressOnlyWalletName(label);

      return {
        type: "wallet",
        label,
        walletType,
        walletAddress: addressOnly ? address : "",
        walletName: addressOnly ? "" : label,
        href: getWalletNavUrl(routeBase, {
          walletType,
          walletAddress: addressOnly ? address : "",
          walletName: addressOnly ? "" : label,
        }),
        homeKey: `${walletType}:fav:${address}`,
      };
    })
    .filter((node) => node.walletAddress || node.walletName);
}

function getWalletHistoryItems(
  historyValues = [],
  walletType = "evm",
  routeBase = "/w",
  connectedWalletM = {},
) {
  return historyValues
    .map((historyValue, index) => {
      const entry = parseWalletHistoryValue(historyValue);
      const base = {
        homeKey: `${walletType}:history:${historyValue}:${index}`,
        historyValue,
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
      if (
        entry.type == "walletPathName" &&
        entry.filePath &&
        entry.walletName
      ) {
        return {
          ...base,
          label: `${entry.filePath}:${entry.walletName}`,
          href: getWalletNavUrl(routeBase, {
            walletType,
            filePath: entry.filePath,
            walletName: entry.walletName,
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
        const connectedWallet = connectedWalletM?.[walletType];
        return {
          ...base,
          label: "connected",
          title: connectedWallet?.address
            ? `connected: ${connectedWallet.label || "wallet"} ${
                connectedWallet.address
              }`
            : "Connected wallet address is not available.",
          href: connectedWallet?.address
            ? getWalletNavUrl(routeBase, {
                walletType,
                walletAddress: connectedWallet.address,
              })
            : "",
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
  connectedWalletM,
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
        connectedWalletM,
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
  sectionDrag = {},
}) {
  const [mode, setMode] = useState(() => parseHomeWalletMode(initialMode));
  const [connectedWalletM, setConnectedWalletM] = useState({});
  const [walletHistoryOrderM, setWalletHistoryOrderM] = useState(
    () => walletHistoryM,
  );
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

  useEffect(() => {
    function loadConnectedWallets() {
      setConnectedWalletM(
        Object.fromEntries(
          ["evm", "solana", "tron"]
            .map((walletType) => [
              walletType,
              readStoredWallet(walletType),
            ])
            .filter(([, wallet]) => wallet?.address),
        ),
      );
    }

    loadConnectedWallets();
    window.addEventListener(walletConnectEvent, loadConnectedWallets);
    window.addEventListener("storage", loadConnectedWallets);

    return () => {
      window.removeEventListener(walletConnectEvent, loadConnectedWallets);
      window.removeEventListener("storage", loadConnectedWallets);
    };
  }, []);

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
                walletHistoryOrderM,
                connectedWalletM,
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
      connectedWalletM,
      customOrderM,
      favAddrs,
      favoriteCatalog,
      favoriteKeys,
      routeBase,
      sortMode,
      walletHistoryOrderM,
      walletTree,
    ],
  );

  function removeWalletHistory(walletType, historyValue) {
    if (!walletType || !historyValue) return;

    setWalletHistoryOrderM((current) => {
      const previous = current?.[walletType] || [];
      const next = previous.filter((entry) => entry != historyValue);
      if (next.length == previous.length) return current;

      const encoded = encodeSelectionOrder(next);
      setCookie(getWalletHistoryCookie(walletType), encoded, {
        maxAge: homeNavigationCookieMaxAge,
        path: "/",
      });
      writeWalletHistoryStorage(walletType, encoded);

      return {
        ...current,
        [walletType]: next,
      };
    });
  }

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
      className={getSectionClassName(
        `homeWalletSection ${sectionCollapsed ? "collapsed" : ""}`,
        sectionDrag,
      )}
      onDragOver={sectionDrag.onDragOver}
      onDragLeave={sectionDrag.onDragLeave}
      onDrop={sectionDrag.onDrop}
    >
      <header className="homeNavHeader">
        <SectionDragHandle
          section="wallet/trade"
          onDragStart={sectionDrag.onDragStart}
          onDragEnd={sectionDrag.onDragEnd}
        />
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
          onRemoveHistory={removeWalletHistory}
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
  initialSectionOrder = defaultHomeSectionOrder,
  favAddrs = [],
  walletHistoryM = {},
  initialWalletMode = "trade",
  initialWalletSortMode = "default",
  initialWalletOrderM = {},
  initialWalletFavKeys = [],
}) {
  const [localTree, setLocalTree] = useState([]);
  const [sectionOrder, setSectionOrder] = useState(() =>
    parseHomeSectionOrder(initialSectionOrder),
  );
  const [dragSection, setDragSection] = useState("");
  const dragSectionRef = useRef("");
  const [sectionDrop, setSectionDrop] = useState(null);
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

  useEffect(() => {
    if (
      sectionOrder.every(
        (section, index) => section == defaultHomeSectionOrder[index],
      )
    ) {
      deleteCookie(homeSectionOrderCookie);
      return;
    }

    setCookie(homeSectionOrderCookie, encodeHomeSectionOrder(sectionOrder), {
      maxAge: homeNavigationCookieMaxAge,
      path: "/",
    });
  }, [sectionOrder]);

  function moveSection(source, target, placeAfter) {
    if (!source || !target || source == target) return;

    setSectionOrder((current) => {
      if (!current.includes(source) || !current.includes(target)) {
        return current;
      }

      const withoutSource = current.filter((section) => section != source);
      const targetIndex = withoutSource.indexOf(target);
      if (targetIndex < 0) return current;

      const insertIndex = targetIndex + (placeAfter ? 1 : 0);
      return [
        ...withoutSource.slice(0, insertIndex),
        source,
        ...withoutSource.slice(insertIndex),
      ];
    });
  }

  function resetSectionOrder() {
    setSectionOrder([...defaultHomeSectionOrder]);
  }

  function isSectionDropAfter(event) {
    const header = event.currentTarget.querySelector(
      ":scope > .homeNavHeader",
    );
    const rect = (header || event.currentTarget).getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  }

  function getSectionDrag(section) {
    const dropPosition =
      sectionDrop?.section == section
        ? sectionDrop.placeAfter
          ? "after"
          : "before"
        : "";

    return {
      dragging: dragSection == section,
      dropPosition,
      onDragStart(event) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", section);
        dragSectionRef.current = section;
        setDragSection(section);
      },
      onDragOver(event) {
        const source = dragSectionRef.current;
        if (!source || source == section) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const placeAfter = isSectionDropAfter(event);
        setSectionDrop((current) =>
          current?.section == section &&
          current?.placeAfter == placeAfter
            ? current
            : { section, placeAfter },
        );
      },
      onDragLeave(event) {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setSectionDrop((current) =>
            current?.section == section ? null : current,
          );
        }
      },
      onDrop(event) {
        event.preventDefault();
        const source =
          event.dataTransfer.getData("text/plain") || dragSectionRef.current;
        moveSection(source, section, isSectionDropAfter(event));
        dragSectionRef.current = "";
        setDragSection("");
        setSectionDrop(null);
      },
      onDragEnd() {
        dragSectionRef.current = "";
        setDragSection("");
        setSectionDrop(null);
      },
    };
  }

  function renderSection(section) {
    const sectionDrag = getSectionDrag(section);

    if (section == "data") {
      return (
        <RouteSection
          key={section}
          section="data"
          title="data"
          href="/d"
          tree={dataTree}
          initialCollapsedKeys={initialCollapsedM.data}
          sectionDrag={sectionDrag}
        />
      );
    }

    if (section == "wallet") {
      return (
        <WalletSection
          key={section}
          walletTree={mergedWalletTree}
          favAddrs={favAddrs}
          walletHistoryM={walletHistoryM}
          initialCollapsedKeys={initialCollapsedM.wallet}
          initialMode={initialWalletMode}
          initialSortMode={initialWalletSortMode}
          initialOrderM={initialWalletOrderM}
          initialFavoriteKeys={initialWalletFavKeys}
          sectionDrag={sectionDrag}
        />
      );
    }

    return (
      <RouteSection
        key={section}
        section="ref"
        title="ref"
        href="/ref"
        tree={refTree}
        initialCollapsedKeys={initialCollapsedM.ref}
        sectionDrag={sectionDrag}
      />
    );
  }

  return (
    <>
      <Logo
        page={
          <InteractiveInfoCard
            activation="hover"
            className="homeSectionOrderInfo"
            tabIndex={0}
          >
            <span>home</span>
            <span className="infoCard homeSectionOrderCard">
              <button
                type="button"
                className="homeNavResetSort"
                onClick={resetSectionOrder}
              >
                reset sections to default
              </button>
            </span>
          </InteractiveInfoCard>
        }
      />
      <nav className="homeNav" aria-label="Site navigation">
        {sectionOrder.map(renderSection)}
      </nav>
    </>
  );
}
