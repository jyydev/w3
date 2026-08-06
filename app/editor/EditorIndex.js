"use client";

import { deleteCookie, getCookie, setCookie } from "cookies-next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  editorHistoryEvent,
  getEditorHistory,
  listLocalEditorFiles,
  localEditorStorageEvent,
  removeEditorHistory,
  saveEditorHistory,
  shouldUseLocalStorageEditor,
} from "@/app/_editorData/browserEditorStorage";
import FavoriteButton from "@/components/FavoriteButton";
import Logo from "@/components/Logo";
import {
  HistoryRemoveButton,
  HoverInfoCard,
  InteractiveInfoCard,
} from "@/components/Shared";
import {
  buildEditorNavTree,
  getEditorFileHref,
} from "@/components/editorNavigation";
import {
  editorHomeFavsCookie,
  editorHomeOrderCookie,
  editorHomeSortModeCookie,
  editorStateMaxAge,
  encodeEditorFavs,
  encodeEditorOrder,
  parseEditorFavs,
  parseEditorOrder,
  parseEditorSortMode,
} from "./editorNavigationState";

const editorRootKey = "editor:root";
const editorSectionKey = "editor:section";

function getCurrentEditorCookie(cookieName, initialValue, emptyValue) {
  if (typeof window == "undefined") return initialValue;
  return getCookie(cookieName) ?? emptyValue;
}

function orderEditorChildren(children = [], order = []) {
  const pinned = children.filter((node) => node.homePinned);
  const sortable = children.filter((node) => !node.homePinned);
  const orderIndex = new Map(order.map((key, index) => [key, index]));

  const ordered = sortable
    .map((node, index) => ({
      index,
      node,
      order: orderIndex.get(node.homeKey) ?? Infinity,
    }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.node);

  return [...pinned, ...ordered];
}

function buildTreeMatrix(
  nodes = [],
  collapsedKeys = new Set(),
  sortMode = "default",
  customOrder = {},
) {
  let columnCount = 0;
  let collapsedCount = 0;

  function measureNode(node, depth, parentKey) {
    const nodeKey = node.homeKey;
    const children = orderEditorChildren(
      node.children || [],
      sortMode == "custom" ? customOrder[nodeKey] || [] : [],
    );
    const collapsed = !!children.length && collapsedKeys.has(nodeKey);
    if (collapsed) collapsedCount += 1;
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
        homeCollapsed: collapsed,
        homeHasChildren: !!children.length,
        homeNodeKey: nodeKey,
        homeParentKey: parentKey,
      },
      rowSpan,
    };
  }

  const roots = orderEditorChildren(
    nodes,
    sortMode == "custom" ? customOrder[editorRootKey] || [] : [],
  ).map((node) => measureNode(node, 0, editorRootKey));
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
        cells.push({ column, empty: true, rowSpan: 1, rowStart });
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
  for (const root of roots) {
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

function EditorHistoryNode({ node, onRemoveHistory }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const linksRef = useRef(null);
  const toggleLabel = `${expanded ? "collapse" : "expand"} editor history`;

  useEffect(() => {
    const links = linksRef.current;
    if (!links || typeof ResizeObserver == "undefined") return;

    function syncOverflow() {
      const next = links.scrollWidth > links.clientWidth + 1;
      setOverflowing((current) => (current == next ? current : next));
    }

    syncOverflow();
    const resizeObserver = new ResizeObserver(syncOverflow);
    resizeObserver.observe(links);

    return () => resizeObserver.disconnect();
  }, [expanded, node.items]);

  return (
    <div
      className={`homeNavHistory ${expanded ? "expanded" : ""}`}
      aria-label="editor file history"
    >
      <button
        type="button"
        className="homeNavHistoryLabel"
        aria-expanded={expanded}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => setExpanded((current) => !current)}
      >
        history:
      </button>
      <span ref={linksRef} className="homeNavHistoryLinks">
        {node.items.length ? (
          node.items.map((item) => (
            <InteractiveInfoCard
              activation="hover"
              floating
              className="homeNavHistoryItem"
              key={item.homeKey}
            >
              <Link
                href={item.href}
                className="homeNavHistoryLink"
                title={item.title}
              >
                {item.label}
              </Link>
              <span className="infoCard homeNavHistoryInfoCard">
                <span className="homeNavHistoryInfoRow">
                  <HistoryRemoveButton
                    label={item.label}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemoveHistory(item.historyValue);
                    }}
                  />
                  <span>remove from history</span>
                </span>
              </span>
            </InteractiveInfoCard>
          ))
        ) : (
          <span className="homeNavHistoryEmpty">empty</span>
        )}
      </span>
      {!expanded && overflowing && (
        <button
          type="button"
          className="homeNavHistoryMore"
          aria-label="expand editor history"
          title="expand history"
          onClick={() => setExpanded(true)}
        >
          ..
        </button>
      )}
    </div>
  );
}

function EditorFavoritesNode({ node, onMoveFavorite, onToggleFavorite }) {
  const [dragKey, setDragKey] = useState("");
  const [dropSpot, setDropSpot] = useState(null);

  return (
    <div className="homeNavFavorites" aria-label="editor home favorites">
      <span
        className="homeNavFavoritesLabel"
        title="editor home favorites"
        aria-hidden="true"
      >
        ★<span className="homeNavFavoritesSeparator">:</span>
      </span>
      <span className="homeNavFavoritesLinks">
        {node.items.length ? (
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
                  const placeAfter =
                    event.clientX > rect.left + rect.width / 2;
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
                  onMoveFavorite(
                    event.dataTransfer.getData("text/plain") || dragKey,
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
                <HoverInfoCard floating>
                  <Link href={item.href} className="homeNavQuickFavLink">
                    {item.label}
                  </Link>
                  <span className="infoCard">{item.title}</span>
                </HoverInfoCard>
                <button
                  type="button"
                  className="homeNavQuickUnfav"
                  title={`remove ${item.label} from editor home favorites`}
                  aria-label={`remove ${item.label} from editor home favorites`}
                  draggable="false"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleFavorite(item.favoriteKey);
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

function EditorNavigationNode({
  favoriteFileSet,
  node,
  onMoveFavorite,
  onRemoveHistory,
  onToggleFavorite,
  onToggleNode,
}) {
  if (node.type == "history") {
    return (
      <EditorHistoryNode node={node} onRemoveHistory={onRemoveHistory} />
    );
  }
  if (node.type == "homeFavorites") {
    return (
      <EditorFavoritesNode
        node={node}
        onMoveFavorite={onMoveFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    );
  }

  const hasChildren = !!node.children?.length || !!node.homeHasChildren;
  const showFavoriteButton = !!node.editorFile;
  const favoriteActive =
    showFavoriteButton && favoriteFileSet.has(node.editorFile);
  const toggleLabel = `${
    node.homeCollapsed ? "show" : "hide"
  } ${node.title || node.label} children`;

  return (
    <div
      className={[
        "homeNavNode",
        hasChildren ? "hasChildren" : "",
        node.homeCollapsed ? "collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {node.href && !node.disabled ? (
        <Link
          href={node.href}
          className="homeNavNodeLink"
          title={node.title || node.label}
        >
          {node.label}
        </Link>
      ) : (
        <span
          className="homeNavNodeLink disabled"
          title={node.title || node.label}
        >
          {node.label}
        </span>
      )}
      {(showFavoriteButton || hasChildren) && (
        <span className="homeNavNodeActions">
          {showFavoriteButton && (
            <FavoriteButton
              active={favoriteActive}
              className="homeNavFavBtn"
              label={node.title || node.label}
              scope="editor home"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleFavorite(node.editorFile);
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
              onClick={() => onToggleNode(node)}
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

function EditorMatrix({
  favoriteFileSet,
  matrix,
  onMoveFavorite,
  onMoveNode,
  onRemoveHistory,
  onToggleFavorite,
  onToggleNode,
  sortable,
}) {
  const [dragNode, setDragNode] = useState(null);
  const [dropSpot, setDropSpot] = useState(null);

  return (
    <div
      className={`homeNavMatrix ${sortable ? "customSort" : ""}`}
      style={{
        "--home-nav-column-count": matrix.columnCount,
        "--home-nav-row-count": matrix.rowCount,
      }}
    >
      {matrix.cells.map((cell) => {
        const node = cell.node;
        const canDrag = sortable && !cell.empty && !node.homePinned;
        const dragging = canDrag && dragNode?.homeNodeKey == node.homeNodeKey;
        const isDropSpot = canDrag && dropSpot?.nodeKey == node.homeNodeKey;
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
                : `${node.homeNodeKey}:${cell.column}:${cell.rowStart}`
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
                    event.dataTransfer.setData(
                      "text/plain",
                      node.homeNodeKey,
                    );
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
                      onMoveNode(
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
              <EditorNavigationNode
                favoriteFileSet={favoriteFileSet}
                node={node}
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

function EditorIndex({
  initialFavoriteFiles = [],
  initialFiles = [],
  initialHistory = [],
  initialOrder = {},
  initialSortMode = "default",
}) {
  const initialFilesText = JSON.stringify(initialFiles);
  const initialHistoryText = JSON.stringify(initialHistory);
  const [files, setFiles] = useState(() => JSON.parse(initialFilesText));
  const [historyFiles, setHistoryFiles] = useState(() =>
    JSON.parse(initialHistoryText),
  );
  const [favoriteFiles, setFavoriteFiles] = useState(() =>
    parseEditorFavs(
      getCurrentEditorCookie(
        editorHomeFavsCookie,
        initialFavoriteFiles,
        [],
      ),
    ),
  );
  const [sortMode, setSortMode] = useState(() =>
    parseEditorSortMode(
      getCurrentEditorCookie(
        editorHomeSortModeCookie,
        initialSortMode,
        "default",
      ),
    ),
  );
  const [customOrder, setCustomOrder] = useState(() =>
    parseEditorOrder(
      getCurrentEditorCookie(editorHomeOrderCookie, initialOrder, {}),
    ),
  );
  const [filesReady, setFilesReady] = useState(false);
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set());
  const [sortCardOpen, setSortCardOpen] = useState(false);
  const tree = useMemo(() => buildEditorNavTree(files), [files]);
  const validFileSet = useMemo(() => new Set(files), [files]);
  const favoriteFileSet = useMemo(
    () => new Set(favoriteFiles),
    [favoriteFiles],
  );
  const matrixNodes = useMemo(
    () => [
      {
        type: "history",
        homeKey: "editor:history",
        homePinned: true,
        homeSpanRemaining: true,
        children: [],
        items: historyFiles
          .filter((file) => validFileSet.has(file))
          .map((file, index) => ({
            homeKey: `editor:history:${file}:${index}`,
            historyValue: file,
            label: file,
            title: file,
            href: getEditorFileHref(file),
          })),
      },
      {
        type: "homeFavorites",
        homeKey: "editor:homeFavorites",
        homePinned: true,
        homeSpanRemaining: true,
        children: [],
        items: favoriteFiles
          .filter((file) => validFileSet.has(file))
          .map((file) => ({
            favoriteKey: file,
            label: file.split("/").at(-1),
            title: file,
            href: getEditorFileHref(file),
          })),
      },
      ...tree,
    ],
    [favoriteFiles, historyFiles, tree, validFileSet],
  );
  const matrix = useMemo(
    () =>
      buildTreeMatrix(
        matrixNodes,
        collapsedKeys,
        sortMode,
        customOrder,
      ),
    [collapsedKeys, customOrder, matrixNodes, sortMode],
  );
  const sectionCollapsed = collapsedKeys.has(editorSectionKey);

  useEffect(() => {
    const baseFiles = JSON.parse(initialFilesText);
    const serverHistory = JSON.parse(initialHistoryText);

    function refreshFiles() {
      setFiles(
        shouldUseLocalStorageEditor()
          ? listLocalEditorFiles(baseFiles)
          : baseFiles,
      );
      setFilesReady(true);
    }

    function refreshHistory() {
      setHistoryFiles(getEditorHistory(serverHistory));
    }

    refreshFiles();
    refreshHistory();
    window.addEventListener(localEditorStorageEvent, refreshFiles);
    window.addEventListener(editorHistoryEvent, refreshHistory);
    window.addEventListener("storage", refreshFiles);
    window.addEventListener("storage", refreshHistory);

    return () => {
      window.removeEventListener(localEditorStorageEvent, refreshFiles);
      window.removeEventListener(editorHistoryEvent, refreshHistory);
      window.removeEventListener("storage", refreshFiles);
      window.removeEventListener("storage", refreshHistory);
    };
  }, [initialFilesText, initialHistoryText]);

  useEffect(() => {
    if (!filesReady) return;

    const availableFiles = new Set(files);
    setFavoriteFiles((current) => {
      const clean = parseEditorFavs(current);
      const next = clean.filter((file) => availableFiles.has(file));
      return next.length == clean.length ? current : next;
    });

    const storedHistory = getEditorHistory();
    const nextHistory = storedHistory.filter((file) =>
      availableFiles.has(file),
    );
    if (nextHistory.length != storedHistory.length) {
      saveEditorHistory(nextHistory);
      setHistoryFiles(nextHistory);
    }
  }, [files, filesReady]);

  useEffect(() => {
    if (sortMode == "custom") {
      setCookie(editorHomeSortModeCookie, sortMode, {
        maxAge: editorStateMaxAge,
        path: "/",
      });
    } else {
      deleteCookie(editorHomeSortModeCookie, { path: "/" });
    }
  }, [sortMode]);

  useEffect(() => {
    if (!Object.keys(customOrder).length) {
      deleteCookie(editorHomeOrderCookie, { path: "/" });
      return;
    }

    setCookie(editorHomeOrderCookie, encodeEditorOrder(customOrder), {
      maxAge: editorStateMaxAge,
      path: "/",
    });
  }, [customOrder]);

  useEffect(() => {
    if (!favoriteFiles.length) {
      deleteCookie(editorHomeFavsCookie, { path: "/" });
      return;
    }

    setCookie(editorHomeFavsCookie, encodeEditorFavs(favoriteFiles), {
      maxAge: editorStateMaxAge,
      path: "/",
    });
  }, [favoriteFiles]);

  function toggleNode(node) {
    const key = node.homeKey || node.homeNodeKey;
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

  function toggleFavorite(file) {
    setFavoriteFiles((current) => {
      const clean = parseEditorFavs(current);
      return clean.includes(file)
        ? clean.filter((entry) => entry != file)
        : parseEditorFavs([...clean, file]);
    });
  }

  function moveFavorite(dragFile, targetFile, placeAfter) {
    if (!dragFile || !targetFile || dragFile == targetFile) return;

    setFavoriteFiles((current) => {
      const clean = parseEditorFavs(current);
      if (!clean.includes(dragFile) || !clean.includes(targetFile)) {
        return current;
      }

      const withoutDragged = clean.filter((file) => file != dragFile);
      const targetIndex = withoutDragged.indexOf(targetFile);
      if (targetIndex < 0) return current;
      const insertIndex = targetIndex + (placeAfter ? 1 : 0);

      return [
        ...withoutDragged.slice(0, insertIndex),
        dragFile,
        ...withoutDragged.slice(insertIndex),
      ];
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
    if (!siblingKeys.includes(draggedKey) || !siblingKeys.includes(targetKey)) {
      return;
    }

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

    setCustomOrder((current) => ({
      ...current,
      [dragNode.homeParentKey]: nextOrder,
    }));
  }

  function resetSort() {
    setCustomOrder({});
    setSortMode("default");
    setSortCardOpen(false);
  }

  return (
    <main className="homePage editorIndexPage">
      <Logo page="editor" />
      <nav className="homeNav" aria-label="Editor files">
        <section
          className={`homeNavSection ${
            sectionCollapsed ? "collapsed" : ""
          }`}
        >
          <header className="homeNavHeader">
            <div className="homeNavSectionTitle">
              <h2>
                <Link href="/editor">editor</Link>
              </h2>
              <button
                type="button"
                className="homeNavBranchToggle homeNavSectionToggle"
                aria-label={`${
                  sectionCollapsed ? "show" : "hide"
                } editor table`}
                aria-expanded={!sectionCollapsed}
                title={`${sectionCollapsed ? "show" : "hide"} editor table`}
                onClick={() => toggleNode({ homeKey: editorSectionKey })}
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
              <div className="homeNavSortMode" aria-label="editor file sorting">
                <InteractiveInfoCard
                  open={sortMode == "custom" && sortCardOpen}
                  onOpenChange={setSortCardOpen}
                  className="homeNavSortCustomInfo"
                >
                  <button
                    type="button"
                    className={sortMode == "custom" ? "active" : ""}
                    aria-pressed={sortMode == "custom"}
                    onClick={() => setSortMode("custom")}
                  >
                    custom
                  </button>
                  {sortMode == "custom" && (
                    <span className="infoCard homeNavSortResetCard">
                      <button
                        type="button"
                        className="homeNavResetSort"
                        onClick={resetSort}
                      >
                        reset to default
                      </button>
                    </span>
                  )}
                </InteractiveInfoCard>
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
            <EditorMatrix
              favoriteFileSet={favoriteFileSet}
              matrix={matrix}
              onMoveFavorite={moveFavorite}
              onMoveNode={moveNode}
              onRemoveHistory={(file) =>
                setHistoryFiles(removeEditorHistory(file))
              }
              onToggleFavorite={toggleFavorite}
              onToggleNode={toggleNode}
              sortable={sortMode == "custom"}
            />
          )}
        </section>
      </nav>
    </main>
  );
}

export default EditorIndex;
