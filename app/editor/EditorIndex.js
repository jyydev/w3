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
import {
  buildEditorNavTree,
  getEditorFileHref,
} from "@/components/editorNavigation";
import {
  buildHomeFavoritesMatrixGroup,
  buildHomeNavigationMatrix,
  buildHomeVisitHistoryMatrixNode,
  getHomeMatrixMove,
  getHomeMatrixNodeKey,
  getHomeQuickFavoritePlaceAfter,
  getHomeSourceNodeKey,
  HomeFavoritesColumn,
  HomeMatrixVisibilityToggle,
  HomeNavigationMatrix,
  HomeNavigationPathHover,
  HomeSectionSortLabel,
  HomeSectionSortToggle,
  sortHomeMatrixChildren,
  useHomeMatrixVisibility,
} from "@/components/HomeNavigationMatrix";
import {
  editorHomeFavsCookie,
  editorHomeOrderCookie,
  editorHomeSortModeCookie,
  editorStateMaxAge,
  encodeEditorFavs,
  encodeEditorOrder,
  parseEditorFavs,
  parseEditorOrder,
} from "./editorNavigationState";

const editorRootKey = "editor:root";
const editorSectionKey = "editor:section";
const editorVisibilityStorageKey = "w3_homeMatrixHidden:editor";

function getCurrentEditorCookie(cookieName, initialValue, emptyValue) {
  if (typeof window == "undefined") return initialValue;
  return getCookie(cookieName) ?? emptyValue;
}

function getEditorNodeKey(node = {}) {
  return String(node.homeKey || "");
}

function buildEditorFavoriteCatalog(nodes = [], catalog = new Map()) {
  for (const node of nodes) {
    if (node.editorFile) catalog.set(node.editorFile, node);
    buildEditorFavoriteCatalog(node.children || [], catalog);
  }

  return catalog;
}

function getEditorHistoryContext(file = "") {
  const folders = String(file || "").split("/").slice(0, -1);
  return ["editor", ...folders].join(" > ");
}

function EditorFavoritesNode({
  node,
  onMoveFavorite,
  onToggleFavorite,
  onToggleHidden,
}) {
  const [dragKey, setDragKey] = useState("");
  const [dropSpot, setDropSpot] = useState(null);
  const dragKeyRef = useRef("");

  return (
    <div className="homeNavFavorites" aria-label="editor home favorites">
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
                  item.homeHidden ? "homeHidden" : "",
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
                  dragKeyRef.current = item.favoriteKey;
                  setDragKey(item.favoriteKey);
                }}
                onDragOver={(event) => {
                  const activeDragKey = dragKeyRef.current || dragKey;
                  const placeAfter = getHomeQuickFavoritePlaceAfter(
                    node.items,
                    activeDragKey,
                    item.favoriteKey,
                  );
                  if (placeAfter === null) return;

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
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
                  const activeDragKey =
                    event.dataTransfer.getData("text/plain") ||
                    dragKeyRef.current ||
                    dragKey;
                  const placeAfter = getHomeQuickFavoritePlaceAfter(
                    node.items,
                    activeDragKey,
                    item.favoriteKey,
                  );
                  if (placeAfter !== null) {
                    onMoveFavorite(
                      activeDragKey,
                      item.favoriteKey,
                      placeAfter,
                    );
                  }
                  dragKeyRef.current = "";
                  setDragKey("");
                  setDropSpot(null);
                }}
                onDragEnd={() => {
                  dragKeyRef.current = "";
                  setDragKey("");
                  setDropSpot(null);
                }}
              >
                <HomeNavigationPathHover
                  context={item.homePathContext}
                  detail={item.homePathDetail}
                  hidden={item.homeHidden}
                  label={item.label}
                  onToggleHidden={onToggleHidden}
                  visibilityKey={item.homeVisibilityKey}
                >
                  <Link href={item.href} className="homeNavQuickFavLink">
                    {item.label}
                  </Link>
                </HomeNavigationPathHover>
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
  onToggleFavorite,
  onToggleHidden,
  onToggleNode,
}) {
  if (node.type == "homeFavorites") {
    return (
      <HomeFavoritesColumn
        label="editor home favorites"
        node={node}
        onToggleNode={onToggleNode}
      />
    );
  }
  if (node.type == "homeFavoriteLinks") {
    return (
      <EditorFavoritesNode
        node={node}
        onMoveFavorite={onMoveFavorite}
        onToggleFavorite={onToggleFavorite}
        onToggleHidden={onToggleHidden}
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
      <HomeNavigationPathHover
        context={node.homePathContext}
        detail={node.homePathDetail}
        hidden={node.homeHidden}
        label={node.title || node.label}
        onToggleHidden={onToggleHidden}
        visibilityKey={node.homeVisibilityKey}
      >
        {node.href && !node.disabled ? (
          <Link href={node.href} className="homeNavNodeLink">
            {node.label}
          </Link>
        ) : (
          <span className="homeNavNodeLink disabled">{node.label}</span>
        )}
      </HomeNavigationPathHover>
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

function EditorIndex({
  initialFavoriteFiles = [],
  initialFiles = [],
  initialHistory = [],
  initialOrder = {},
}) {
  const initialFilesText = JSON.stringify(initialFiles);
  const initialHistoryText = JSON.stringify(initialHistory);
  const matrixVisibility = useHomeMatrixVisibility(
    editorVisibilityStorageKey,
  );
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
  const [customOrder, setCustomOrder] = useState(() =>
    parseEditorOrder(
      getCurrentEditorCookie(editorHomeOrderCookie, initialOrder, {}),
    ),
  );
  const [filesReady, setFilesReady] = useState(false);
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set());
  const tree = useMemo(() => buildEditorNavTree(files), [files]);
  const validFileSet = useMemo(() => new Set(files), [files]);
  const favoriteCatalog = useMemo(
    () => buildEditorFavoriteCatalog(tree),
    [tree],
  );
  const favoriteFileSet = useMemo(
    () => new Set(favoriteFiles),
    [favoriteFiles],
  );
  const matrixNodes = useMemo(
    () => [
      buildHomeVisitHistoryMatrixNode({
        rootKey: "editor:history",
        items: historyFiles
          .filter((file) => validFileSet.has(file))
          .map((file, index) => ({
            favoriteKey: file,
            homeKey: `editor:history:${file}:${index}`,
            historyValue: file,
            historyContext: getEditorHistoryContext(file),
            detail: file,
            label: file.split("/").at(-1),
            title: file,
            href: getEditorFileHref(file),
          })),
      }),
      buildHomeFavoritesMatrixGroup({
        favoriteKeys: favoriteFiles,
        getFavoriteNode: (file) => favoriteCatalog.get(file),
        getFavoriteItem: (node, file) =>
          validFileSet.has(file)
            ? {
                favoriteKey: file,
                label: file.split("/").at(-1),
                title: file,
                href: getEditorFileHref(file),
              }
            : null,
        getNodeKey: getEditorNodeKey,
        rootKey: "editor:homeFavorites",
      }),
      ...tree,
    ],
    [favoriteCatalog, favoriteFiles, historyFiles, tree, validFileSet],
  );
  const matrix = useMemo(
    () =>
      buildHomeNavigationMatrix({
        nodes: matrixNodes,
        getNodeKey: (node) =>
          getHomeMatrixNodeKey(node, getEditorNodeKey),
        isCollapsed: (node) =>
          collapsedKeys.has(getHomeSourceNodeKey(node, getEditorNodeKey)),
        orderChildren: (children, parentKey, parentNode) => {
          if (parentNode?.type == "homeFavorites") return children;

          const sourceParentKey = parentNode
            ? getHomeSourceNodeKey(parentNode, getEditorNodeKey)
            : parentKey;
          return sortHomeMatrixChildren(
            children,
            customOrder[sourceParentKey] || [],
            (node) => getHomeSourceNodeKey(node, getEditorNodeKey),
          );
        },
        pathPrefix: ["editor"],
        rootParentKey: editorRootKey,
        visibility: {
          hiddenKeys: matrixVisibility.hiddenKeys,
          showHidden: matrixVisibility.showHidden,
        },
      }),
    [
      collapsedKeys,
      customOrder,
      matrixNodes,
      matrixVisibility.hiddenKeys,
      matrixVisibility.showHidden,
    ],
  );

  useEffect(() => {
    if (!filesReady) return;
    matrixVisibility.pruneHiddenKeys(matrix.visibilityKeys);
  }, [
    filesReady,
    matrix.visibilityKeys,
    matrixVisibility.pruneHiddenKeys,
  ]);

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
    deleteCookie(editorHomeSortModeCookie, { path: "/" });
  }, []);

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
    const key = getHomeSourceNodeKey(
      node,
      (entry) => entry.homeKey || entry.homeNodeKey,
    );
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

    setCustomOrder((current) =>
      getHomeMatrixMove(
        current,
        matrix,
        dragNode,
        targetNode,
        placeAfter,
      ),
    );
  }

  function resetSorting() {
    setCustomOrder({});
  }

  return (
    <main className="homePage editorIndexPage">
      <div className="flex mb-1 homeNavLogoRow">
        <span className="orange">W3</span>
        <span className="homeNavSectionTitle">
          <HomeMatrixVisibilityToggle
            label="editor"
            visibility={matrixVisibility}
          />
          <HomeSectionSortLabel
            label="editor"
            onResetSorting={resetSorting}
          >
            editor
          </HomeSectionSortLabel>
          <HomeSectionSortToggle
            collapsed={sectionCollapsed}
            label="editor"
            onExpandAll={expandAll}
            onToggle={() => toggleNode({ homeKey: editorSectionKey })}
            showExpandAll={sectionCollapsed || !!matrix.collapsedCount}
          />
        </span>
      </div>
      <nav className="homeNav" aria-label="Editor files">
        <section
          className={`homeNavSection ${
            sectionCollapsed ? "collapsed" : ""
          }`}
        >
          {!sectionCollapsed && (
            <HomeNavigationMatrix
              historyFavoriteKeySet={favoriteFileSet}
              matrix={matrix}
              onMoveHistory={(items) =>
                setHistoryFiles(
                  saveEditorHistory(
                    items
                      .map((item) => item?.historyValue)
                      .filter(Boolean),
                  ),
                )
              }
              onMoveNode={moveNode}
              onRemoveHistory={(_href, item) =>
                setHistoryFiles(removeEditorHistory(item?.historyValue))
              }
              onToggleHistoryFavorite={toggleFavorite}
              searchOptions={{
                homeHref: "/editor",
                homeTitle: "Editor home",
              }}
              renderNode={(node) => (
                <EditorNavigationNode
                  favoriteFileSet={favoriteFileSet}
                  node={node}
                  onMoveFavorite={moveFavorite}
                  onToggleFavorite={toggleFavorite}
                  onToggleHidden={matrixVisibility.toggleHidden}
                  onToggleNode={toggleNode}
                />
              )}
              sortable
            />
          )}
        </section>
      </nav>
    </main>
  );
}

export default EditorIndex;
