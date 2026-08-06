"use client";

import { useState } from "react";
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
        ),
      ),
      homeDraggable: path.length === 0,
      homeFavoriteKey: path.length === 0 ? favoriteKey : "",
      homeFavoriteProjection: true,
      homeFavoriteProjectionRoot: path.length === 0,
      homeMatrixKey: matrixKey,
      homePinned: false,
      homeSourceKey: sourceKey,
      homeSpanRemaining: false,
    };
  }

  favoriteKeys.forEach((favoriteKeyValue) => {
    const favoriteKey = String(favoriteKeyValue || "");
    if (!favoriteKey || seenFavoriteKeys.has(favoriteKey)) return;
    seenFavoriteKeys.add(favoriteKey);

    const sourceNode = getFavoriteNode(favoriteKey);
    if (!sourceNode) return;

    const sourceChildren = Array.from(getChildren(sourceNode, 0) || []);
    if (sourceChildren.length) {
      parentBranches.push(projectBranch(sourceNode, favoriteKey));
      return;
    }

    const item = getFavoriteItem(sourceNode, favoriteKey);
    if (item) leafItems.push(item);
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

    return {
      children: measuredChildren,
      node: {
        ...node,
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
  if (
    !dragNode?.homeNodeKey ||
    !targetNode?.homeNodeKey ||
    dragNode.homePinned ||
    targetNode.homePinned ||
    dragNode.homeDraggable === false ||
    targetNode.homeDraggable === false ||
    dragNode.homeParentKey !== targetNode.homeParentKey
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
    .map((cell) => cell.node.homeNodeKey);
  const draggedKey = dragNode.homeNodeKey;
  const targetKey = targetNode.homeNodeKey;
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
    [dragNode.homeParentKey]: nextOrder,
  };
}

export function HomeNavigationMatrix({
  matrix,
  renderNode,
  sortable = false,
  onMoveNode,
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
              node?.type === "history" ? "history" : "",
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
            {!cell.empty && renderNode?.(node, cell, index)}
          </div>
        );
      })}
    </div>
  );
}

export function HomeFavoritesColumn({ label = "home favorites" }) {
  return (
    <div
      className="homeNavFavoriteColumn"
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">★</span>
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
