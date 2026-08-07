"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import NavbarHoverCard from "./NavbarHoverCard";

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
    homePinned: true,
    homeDraggable: false,
    children,
  };
}

export function buildHomeVisitHistoryMatrixNode({
  items = [],
  rootKey = "home:visit-history",
} = {}) {
  return {
    type: "homeVisitHistory",
    label: "history",
    homeKey: rootKey,
    homeMatrixKey: rootKey,
    homePinned: true,
    homeDraggable: false,
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
  const orderIndexM = new Map(
    order.map((nodeKey, index) => [nodeKey, index]),
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

function buildHomePathInfoMaps(nodes, getChildren, getNodeKey) {
  const byHref = new Map();
  const bySourceKey = new Map();

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

  for (const node of Array.from(nodes || [])) addNode(node);
  return { byHref, bySourceKey };
}

export function buildHomeNavigationMatrix({
  nodes = [],
  getChildren = defaultGetChildren,
  getNodeKey = defaultGetNodeKey,
  isCollapsed = () => false,
  orderChildren = (children) => children,
  rootParentKey = "home:root",
} = {}) {
  let columnCount = 0;
  let collapsedCount = 0;
  const pathInfoMaps = buildHomePathInfoMaps(nodes, getChildren, getNodeKey);

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
    return Array.from(items || []).map((item) => {
      const sourceKey = getHomePathValue(item?.homeSourceKey);
      const href = getHomePathValue(item?.href);
      const info =
        pathInfoMaps.bySourceKey.get(sourceKey) ||
        pathInfoMaps.byHref.get(href);
      const label = getHomePathLabel(item);

      return {
        ...item,
        homePathContext:
          info?.context || getHomePathValue(item?.homePathContext) || "navbar",
        homePathDetail:
          info?.detail || getHomePathDetail(item, label ? [label] : []),
      };
    });
  }

  function measureNode(node, depth, parentKey) {
    const nodeKey = getNodeKey(node);
    const children = orderChildren(
      getChildren(node, depth) ?? [],
      nodeKey,
      node,
    );
    const collapsed = !!children.length && isCollapsed(node, nodeKey);
    if (collapsed) collapsedCount += 1;
    const measuredChildren = (collapsed ? [] : children).map((child) =>
      measureNode(child, depth + 1, nodeKey),
    );
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
        homeHasChildren: !!children.length,
        homeNodeKey: nodeKey,
        homeParentKey: parentKey,
      },
      rowSpan,
    };
  }

  const measuredRoots = orderChildren(nodes, rootParentKey, null).map((node) =>
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
    rowCount: Math.max(0, rowStart - 1),
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

  const siblingKeys = (matrix?.cells || [])
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

export function HomeNavigationMatrix({
  matrix,
  renderNode,
  sortable = false,
  onMoveNode,
  onRemoveHistory,
}) {
  const [dragNode, setDragNode] = useState(null);
  const [dropSpot, setDropSpot] = useState(null);

  if (!matrix?.cells?.length) return null;

  return (
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
                  node={node}
                  onRemoveHistory={onRemoveHistory}
                />
              ) : (
                renderNode?.(node, cell, index)
              ))}
          </div>
        );
      })}
    </div>
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
}) {
  const [cardPosition, setCardPosition] = useState(null);

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
        className="navQuickFavCard homeVisitHistoryCard homeNavPathCard"
        style={cardPosition || undefined}
      >
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

function HomeVisitHistoryItem({ item, onRemoveHistory }) {
  const [cardPosition, setCardPosition] = useState(null);
  const href = String(item?.href || "");
  const label = String(item?.label || item?.title || href || "history item");
  const context = String(
    item?.historyContext || item?.context || "navbar",
  );
  const detail = String(item?.detail || item?.address || href);

  function positionCard(event) {
    setCardPosition(getHomeFixedCardPosition(event.currentTarget));
  }

  return (
    <NavbarHoverCard className="homeVisitHistoryItem navQuickFavTrigger">
      {href ? (
        <Link
          href={href}
          className="homeVisitHistoryLink"
          data-history-label={label}
          data-history-title={item?.title || label}
          data-history-context={context}
          onFocus={positionCard}
          onMouseEnter={positionCard}
          onPointerDown={positionCard}
          {...getHomeVisitExternalLinkProps(href)}
        >
          {label}
        </Link>
      ) : (
        <span
          className="homeVisitHistoryLink disabled"
          onFocus={positionCard}
          onMouseEnter={positionCard}
          onPointerDown={positionCard}
        >
          {label}
        </span>
      )}
      <span
        className="navQuickFavCard homeVisitHistoryCard"
        style={cardPosition || undefined}
      >
        <button
          type="button"
          className="homeVisitHistoryRemoveButton"
          aria-label={`remove ${label} from history`}
          title="remove from history"
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

export function HomeVisitHistoryRow({ node, onRemoveHistory }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const linksRef = useRef(null);
  const items = node?.items || [];
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
      className={`homeVisitHistory ${expanded ? "expanded" : ""}`}
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
          items.map((item, index) => (
            <HomeVisitHistoryItem
              key={item.homeKey || `${item.href}:${index}`}
              item={item}
              onRemoveHistory={onRemoveHistory}
            />
          ))
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

export function HomeSectionSortToggle({
  collapsed = false,
  label,
  onResetSorting,
  onToggle,
}) {
  const toggleLabel = `${collapsed ? "show" : "hide"} ${label} table`;

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
      <span className="navQuickFavCard homeNavSectionSortResetCard">
        <button
          type="button"
          className="navQuickUnfav"
          aria-label={`reset ${label} sorting`}
          title={`reset ${label} sorting`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onResetSorting?.();
          }}
        >
          reset sorting
        </button>
      </span>
    </NavbarHoverCard>
  );
}
