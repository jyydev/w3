"use client";

import { deleteCookie, getCookie, setCookie } from "cookies-next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listLocalEditorFiles,
  localEditorStorageEvent,
  shouldUseLocalStorageEditor,
} from "@/app/_editorData/browserEditorStorage";
import { ckPrefix } from "@/sets";
import {
  getDefaultWalletName,
  isAddressOnlyWalletName,
} from "@/app/w/favAddrs";
import FavoriteButton from "./FavoriteButton";
import Logo from "./Logo";
import { InteractiveInfoCard } from "./Shared";
import {
  encodeHomeCollapsedKeys,
  encodeHomeSectionOrder,
  encodeHomeWalletFavKeys,
  encodeHomeWalletOrder,
  defaultHomeSectionOrder,
  homeCollapsedCookieM,
  homeNavigationCollapsedCookie,
  homeNavigationCookieMaxAge,
  homeNavigationFavsCookie,
  homeNavigationHistoryEvent,
  homeNavigationOrderCookie,
  homeSectionOrderCookie,
  homeWalletFavsCookie,
  homeWalletModeCookie,
  homeWalletOrderCookie,
  homeWalletSortModeCookie,
  parseHomeCollapsedKeys,
  parseHomeNavigationHistory,
  parseHomeSectionOrder,
  parseHomeWalletFavKeys,
  parseHomeWalletMode,
  parseHomeWalletOrder,
} from "./homeNavigationState";
import {
  getLocalWalletTree,
  getWalletNavUrl,
  mergeTrees,
} from "./NavbarWalletMenu";
import {
  buildHomeFavoritesMatrixGroup,
  buildHomeNavigationMatrix,
  buildHomeVisitHistoryMatrixNode,
  getHomeMatrixMove,
  getHomeMatrixNodeKey,
  getHomeSourceNodeKey,
  HomeFavoritesColumn,
  HomeNavigationMatrix,
  HomeNavigationPathHover,
  HomeSectionSortToggle,
  sortHomeMatrixChildren,
} from "./HomeNavigationMatrix";
import {
  getHomeNavigationHistory,
  rememberHomeNavigationHistory,
  removeHomeNavigationHistory,
} from "./homeNavigationHistoryClient";
import { buildEditorNavTree } from "./editorNavigation";
import { useNavbarCustomLinks } from "./NavbarCustomLinks";
import { buildSiteNavigationMenus } from "./siteNavigation";

function getCurrentHomeCookie(cookieName, initialValue, emptyValue = "") {
  if (typeof window == "undefined") return initialValue;
  return getCookie(cookieName) ?? emptyValue;
}

function getNodeIdentity(node) {
  if (node.homeKey) return String(node.homeKey);

  return [
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
    () =>
      new Set(
        parseHomeCollapsedKeys(
          getCurrentHomeCookie(cookieName, initialCollapsedKeys, []),
        ),
      ),
  );

  useEffect(() => {
    if (!cookieName) return;

    if (!collapsedKeys.size) {
      deleteCookie(cookieName, { path: "/" });
      return;
    }

    setCookie(cookieName, encodeHomeCollapsedKeys(collapsedKeys), {
      maxAge: homeNavigationCookieMaxAge,
      path: "/",
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

function useWalletSort(initialOrderM = {}) {
  const [customOrderM, setCustomOrderM] = useState(() =>
    parseHomeWalletOrder(
      getCurrentHomeCookie(homeWalletOrderCookie, initialOrderM),
    ),
  );

  useEffect(() => {
    deleteCookie(homeWalletSortModeCookie, { path: "/" });
  }, []);

  useEffect(() => {
    if (!Object.keys(customOrderM).length) {
      deleteCookie(homeWalletOrderCookie, { path: "/" });
      return;
    }

    setCookie(homeWalletOrderCookie, encodeHomeWalletOrder(customOrderM), {
      maxAge: homeNavigationCookieMaxAge,
      path: "/",
    });
  }, [customOrderM]);

  function resetSorting() {
    setCustomOrderM({});
  }

  return {
    customOrderM,
    resetSorting,
    setCustomOrderM,
  };
}

function useWalletFavorites(initialFavoriteKeys = []) {
  const [favoriteKeys, setFavoriteKeys] = useState(() =>
    parseHomeWalletFavKeys(
      getCurrentHomeCookie(homeWalletFavsCookie, initialFavoriteKeys),
    ),
  );

  useEffect(() => {
    if (!favoriteKeys.length) {
      deleteCookie(homeWalletFavsCookie, { path: "/" });
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

function HomeWalletFavoritesNode({
  ariaLabel = "home favorites",
  node,
  onMoveFavorite,
  onToggleFavorite,
}) {
  const [dragKey, setDragKey] = useState("");
  const [dropSpot, setDropSpot] = useState(null);

  return (
    <div className="homeNavFavorites" aria-label={ariaLabel}>
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
                <HomeNavigationPathHover
                  context={item.homePathContext}
                  detail={item.homePathDetail}
                >
                  <Link
                    href={item.href}
                    className="homeNavQuickFavLink"
                    {...getExternalLinkProps(item.href)}
                  >
                    {item.label}
                  </Link>
                </HomeNavigationPathHover>
                <button
                  type="button"
                  className="homeNavQuickUnfav"
                  title={`remove ${item.label} from ${ariaLabel}`}
                  aria-label={`remove ${item.label} from ${ariaLabel}`}
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
  if (node.type == "homeFavorites") {
    return (
      <HomeFavoritesColumn
        label="home favorites"
        node={node}
        onToggleNode={onToggleNode}
      />
    );
  }
  if (node.type == "homeFavoriteLinks") {
    return (
      <HomeWalletFavoritesNode
        ariaLabel="home favorites"
        node={node}
        onMoveFavorite={onMoveFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    );
  }

  const href = getHref(node);
  const hasChildren = !!node.children?.length || !!node.homeHasChildren;
  const favoriteKey = getHomeSourceNodeKey(node, getNodeSortKey);
  const showFavoriteButton =
    !!onToggleFavorite && !!href && !node.disabled && !node.homePinned;
  const favoriteActive = showFavoriteButton && favoriteKeySet?.has(favoriteKey);
  const className = [
    "homeNavNode",
    node.type == "wallet" ? "walletLeaf" : "",
    hasChildren ? "hasChildren" : "",
    node.homeCollapsed ? "collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const label = (
    <HomeNavigationPathHover
      context={node.homePathContext}
      detail={node.homePathDetail}
    >
      {href && !node.disabled ? (
        <Link
          href={href}
          className="homeNavNodeLink"
          {...getExternalLinkProps(href)}
        >
          {node.label}
        </Link>
      ) : (
        <span className="homeNavNodeLink disabled">{node.label}</span>
      )}
    </HomeNavigationPathHover>
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
      buildHomeNavigationMatrix({
        nodes: tree,
        getNodeKey: getNodeSortKey,
        isCollapsed: (node) => collapsedKeys.has(getNodeIdentity(node)),
      }),
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
        <HomeNavigationMatrix
          matrix={matrix}
          renderNode={(node) => (
            <NavigationNode
              node={node}
              getHref={(entry) => entry.href || ""}
              onToggleNode={toggleNode}
            />
          )}
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

function getWalletFavoriteItem(node, favoriteKey, routeBase) {
  if (!node) return null;

  const detail = [
    node.walletType,
    node.filePath,
    node.walletName && `w: ${node.walletName}`,
    node.walletAddress && `addr: ${node.walletAddress}`,
  ]
    .filter(Boolean)
    .join(" / ");
  const isFile = ["file", "mixed"].includes(node.type) && node.filePath;
  const fileName = isFile
    ? `${node.filePath.split("/").at(-1)}.json`
    : node.label;
  const fullPath = isFile
    ? `data/editor/wallets/${node.walletType}/${node.filePath}.json`
    : detail || node.label;

  return {
    favoriteKey,
    label: fileName,
    title: fullPath,
    href: node.href || getWalletNavUrl(routeBase, node),
  };
}

function getWalletTypeSearchLabel(walletType = "evm") {
  if (walletType == "solana") return "Solana";
  if (walletType == "tron") return "Tron";
  return "EVM";
}

function getWalletSearchEntries(walletTree = [], routeBase = "/w") {
  const entries = [];
  const seen = new Set();

  function addNode(node) {
    if (node?.type == "wallet") {
      const walletName = String(node.walletName || node.label || "").trim();
      const address = String(node.address || "").trim();
      const walletType = node.walletType || "evm";
      const filePath = String(node.filePath || "").trim();
      const key = `${walletType}:${filePath}:${walletName}:${address}`;

      if (walletName && !seen.has(key)) {
        seen.add(key);
        entries.push({
          key,
          walletName,
          address,
          context: [
            getWalletTypeSearchLabel(walletType),
            ...filePath.split("/").filter(Boolean),
          ]
            .filter(Boolean)
            .join(" > "),
          href: getWalletNavUrl(routeBase, node),
        });
      }
    }

    for (const child of node?.children || []) addNode(child);
  }

  for (const node of walletTree || []) addNode(node);
  return entries;
}

function getWalletSearchMatches(entries = [], query = "") {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];

  return entries
    .map((entry, index) => {
      const name = entry.walletName.toLowerCase();
      const address = entry.address.toLowerCase();
      let rank = Infinity;

      if (name == term || address == term) rank = 0;
      else if (name.startsWith(term)) rank = 1;
      else if (address.startsWith(term)) rank = 2;
      else if (name.includes(term)) rank = 3;
      else if (address.includes(term)) rank = 4;

      return { ...entry, index, rank };
    })
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
}

function getNavbarSearchEntries(navigationTree = []) {
  const entries = [
    {
      key: "navbar:home",
      walletName: "⌂ Home",
      context: "navbar",
      address: "/",
      href: "/",
      title: "Home",
      searchFields: ["home", "⌂ Home", "/"],
    },
  ];

  function addNode(node, parents = [], depth = 0) {
    if (!node || depth > 48) return;

    const label = String(node.label || node.title || node.href || "").trim();
    const title = String(node.title || label || node.href || "").trim();
    const href = String(node.href || "").trim();
    const walletAddress = String(
      node.address || node.walletAddress || "",
    ).trim();
    const context = parents.filter(Boolean).join(" > ") || "navbar";

    if (href && !node.disabled) {
      entries.push({
        key: `navbar:${node.homeKey || href}:${entries.length}`,
        walletName: label || href,
        context,
        address: href,
        href,
        title: title || href,
        searchFields: [label, title, href, context, walletAddress],
      });
    }

    const nextParents = label ? [...parents, label] : parents;
    for (const child of node.children || []) {
      addNode(child, nextParents, depth + 1);
    }
  }

  for (const node of navigationTree || []) addNode(node);
  return entries;
}

function getNavbarSearchMatches(entries = [], query = "") {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];

  return entries
    .map((entry, index) => {
      const fields = (entry.searchFields || [
        entry.walletName,
        entry.title,
        entry.address,
        entry.context,
      ]).map((value) => String(value || "").toLowerCase());
      const exactIndex = fields.findIndex((value) => value == term);
      const prefixIndex = fields.findIndex((value) => value.startsWith(term));
      const includeIndex = fields.findIndex((value) => value.includes(term));
      const rank =
        exactIndex >= 0
          ? exactIndex
          : prefixIndex >= 0
            ? 10 + prefixIndex
            : includeIndex >= 0
              ? 20 + includeIndex
              : Infinity;

      return { ...entry, index, rank };
    })
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
}

function getDirectWalletSearchEntry(query = "", routeBase = "/w") {
  const address = String(query || "").trim();
  let walletType = "";

  if (/^0x[0-9a-f]{40}$/i.test(address)) walletType = "evm";
  else if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) walletType = "tron";
  else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    walletType = "solana";
  }
  if (!walletType) return null;

  return {
    key: `direct:${walletType}:${address}`,
    walletName: "address",
    address,
    context: getWalletTypeSearchLabel(walletType),
    href: getWalletNavUrl(routeBase, { walletType, walletAddress: address }),
  };
}

function WalletSearch({
  walletTree = [],
  routeBase = "/w",
  navigationTree = [],
  searchMode = "wallet",
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const walletEntries = useMemo(
    () => getWalletSearchEntries(walletTree, routeBase),
    [routeBase, walletTree],
  );
  const navbarEntries = useMemo(
    () => getNavbarSearchEntries(navigationTree),
    [navigationTree],
  );
  const allMode = searchMode == "all";
  const entries = allMode ? navbarEntries : walletEntries;
  const matches = useMemo(
    () =>
      allMode
        ? getNavbarSearchMatches(entries, query)
        : getWalletSearchMatches(entries, query),
    [allMode, entries, query],
  );
  const directEntry = useMemo(
    () => (allMode ? null : getDirectWalletSearchEntry(query, routeBase)),
    [allMode, query, routeBase],
  );
  const results = matches.length ? matches : directEntry ? [directEntry] : [];
  const showResults = resultsOpen && !!query.trim();
  const searchLabel = allMode
    ? "search all navbar links and titles"
    : "search added wallets by name or address";
  const submitLabel = allMode ? "search navbar" : "search wallets";

  function submitSearch(event) {
    event.preventDefault();
    const result = results[0];
    const href = result?.href;
    if (!href) return;

    rememberHomeNavigationHistory({
      href,
      label: result.walletName || result.label || href,
      title: result.title || result.walletName || result.label || href,
      context: result.context,
    });

    if (allMode && /^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    if (allMode && /^(?:mailto:|tel:)/i.test(href)) {
      window.location.href = href;
      return;
    }

    router.push(href);
  }

  return (
    <form
      className="homeWalletSearch"
      role="search"
      onSubmit={submitSearch}
      onFocus={() => setResultsOpen(true)}
      onBlur={(event) => {
        const form = event.currentTarget;
        if (event.relatedTarget && form.contains(event.relatedTarget)) return;

        requestAnimationFrame(() => {
          if (!form.contains(document.activeElement)) setResultsOpen(false);
        });
      }}
    >
      <div className="homeWalletSearchControl">
        <input
          type="search"
          value={query}
          aria-label={searchLabel}
          aria-expanded={showResults}
          aria-controls="home-wallet-search-results"
          autoComplete="off"
          spellCheck={false}
          placeholder={allMode ? "navbar link or title" : "wallet name or address"}
          onChange={(event) => {
            setQuery(event.target.value);
            setResultsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key == "Escape") setResultsOpen(false);
          }}
        />
        <button
          type="submit"
          className="homeWalletSearchButton"
          aria-label={submitLabel}
          title={submitLabel}
          disabled={!results.length}
        >
          <span className="homeWalletSearchIcon" aria-hidden="true"></span>
        </button>
      </div>
      {showResults && (
        <span
          id="home-wallet-search-results"
          className="homeWalletSearchResults"
        >
          {results.length ? (
            results.map((entry) => (
              <Link
                key={entry.key}
                href={entry.href}
                className="homeWalletSearchResult"
                data-history-label={entry.walletName}
                data-history-title={entry.title || entry.walletName}
                data-history-context={entry.context}
                title={[entry.title, entry.context, entry.address]
                  .filter(Boolean)
                  .join(" | ")}
                {...getExternalLinkProps(entry.href)}
              >
                <span className="homeWalletSearchName">
                  {entry.walletName}
                </span>
                <span className="homeWalletSearchContext">
                  {entry.context}
                </span>
                <span className="homeWalletSearchAddress">
                  {entry.address || "-"}
                </span>
              </Link>
            ))
          ) : (
            <span className="homeWalletSearchEmpty">
              {allMode ? "no navbar link matches" : "no added wallet matches"}
            </span>
          )}
        </span>
      )}
    </form>
  );
}

function WalletSection({
  walletTree = [],
  favAddrs = [],
  initialCollapsedKeys = [],
  initialMode = "trade",
  initialOrderM = {},
  initialFavoriteKeys = [],
  sectionDrag = {},
}) {
  const [mode, setMode] = useState(() =>
    parseHomeWalletMode(
      getCurrentHomeCookie(homeWalletModeCookie, initialMode),
    ),
  );
  const { collapsedKeys, expandAll, toggleNode } = useBranchToggle(
    homeCollapsedCookieM.wallet,
    initialCollapsedKeys,
  );
  const sectionCollapseNode = getSectionCollapseNode("wallet");
  const sectionCollapsed = collapsedKeys.has(
    getNodeIdentity(sectionCollapseNode),
  );
  const { customOrderM, resetSorting, setCustomOrderM } =
    useWalletSort(initialOrderM);
  const { favoriteKeys, moveFavorite, toggleFavorite } =
    useWalletFavorites(initialFavoriteKeys);

  useEffect(() => {
    setCookie(homeWalletModeCookie, mode, {
      maxAge: homeNavigationCookieMaxAge,
      path: "/",
    });
  }, [mode]);

  const routeBase = mode == "trade" ? "/t" : "/w";
  const favoriteCatalog = useMemo(
    () => buildWalletFavoriteCatalog(walletTree, routeBase, favAddrs),
    [favAddrs, routeBase, walletTree],
  );
  const favoriteKeySet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);
  const matrix = useMemo(
    () => {
      const walletRootKeySet = new Set(walletTree.map(getNodeSortKey));
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
        nodes: [favoritesGroup, ...walletTree],
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
      });
    },
    [
      collapsedKeys,
      customOrderM,
      favAddrs,
      favoriteCatalog,
      favoriteKeys,
      routeBase,
      walletTree,
    ],
  );

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
      getHomeMatrixMove(
        current,
        matrix,
        dragNode,
        targetNode,
        placeAfter,
      ),
    );
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
          <HomeSectionSortToggle
            collapsed={sectionCollapsed}
            label="wallet/trade"
            onResetSorting={resetSorting}
            onToggle={() => toggleNode(sectionCollapseNode)}
          />
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
        <>
          <WalletSearch walletTree={walletTree} routeBase={routeBase} />
          <HomeNavigationMatrix
            matrix={matrix}
            sortable
            onMoveNode={moveNode}
            renderNode={(node) => (
              <NavigationNode
                node={node}
                favoriteKeySet={favoriteKeySet}
                getHref={(entry) =>
                  entry.href || getWalletNavUrl(routeBase, entry)
                }
                onMoveFavorite={moveFavorite}
                onToggleNode={toggleNode}
                onToggleFavorite={toggleFavorite}
              />
            )}
          />
        </>
      )}
    </section>
  );
}

function LegacyHome({
  walletTree = [],
  dataTree = [],
  refTree = [],
  initialCollapsedM = {},
  initialSectionOrder = defaultHomeSectionOrder,
  favAddrs = [],
  initialWalletMode = "trade",
  initialWalletOrderM = {},
  initialWalletFavKeys = [],
}) {
  const [localTree, setLocalTree] = useState([]);
  const [sectionOrder, setSectionOrder] = useState(() =>
    parseHomeSectionOrder(
      getCurrentHomeCookie(homeSectionOrderCookie, initialSectionOrder),
    ),
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
      deleteCookie(homeSectionOrderCookie, { path: "/" });
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
    const header = event.currentTarget.querySelector(":scope > .homeNavHeader");
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
          current?.section == section && current?.placeAfter == placeAfter
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
          initialCollapsedKeys={initialCollapsedM.wallet}
          initialMode={initialWalletMode}
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

const homeNavigationRootKey = "home:navigation:root";
const homeNavigationSectionKey = "home:navigation:section";
const homeNavigationFavoritesKey = "home:navigation:favorites";
const homeNavigationHistoryKey = "home:navigation:history";
const navbarTopCustomScope = `${ckPrefix ?? ""}navbarTop`;

function normalizeHomeLinkEntry(item) {
  if (item && typeof item == "object" && !Array.isArray(item)) {
    const children = (Array.isArray(item.children) ? item.children : []).map(
      normalizeHomeLinkEntry,
    );
    const href = item.href ? String(item.href) : "";

    return {
      ...item,
      id: item.id ? String(item.id) : "",
      key: item.key ? String(item.key) : "",
      value: String(item.value || href || item.label || ""),
      href,
      label: String(item.label || item.title || href),
      title: String(item.title || href || item.label || ""),
      type: item.type || (!href && !children.length ? "section" : ""),
      disabled: !!item.disabled,
      children,
    };
  }

  const pair = Array.isArray(item);
  const rawHref = pair ? item[0] : item;
  const rawLabel = pair ? item[1] : item;
  const href =
    rawHref && !String(rawHref).startsWith("[") ? String(rawHref) : "";

  return {
    id: "",
    key: "",
    value: href || String(rawLabel || ""),
    href,
    label: String(rawLabel || href),
    title: href,
    type: href ? "" : "section",
    disabled: false,
    children: [],
  };
}

function getHomeNodeToken(entry, index) {
  if (entry.id) return `id:${entry.id}`;
  if (entry.key) return `key:${entry.key}`;
  if (entry.value) return `value:${entry.value}`;
  if (entry.href) return `href:${entry.href}`;
  return `${entry.type || "item"}:${entry.label || index}`;
}

function decorateHomeNodes(items = [], parentKey, customBranch = false) {
  const duplicateM = new Map();

  return items.map((item, index) => {
    const entry = normalizeHomeLinkEntry(item);
    const baseToken = getHomeNodeToken(entry, index);
    const duplicateIndex = duplicateM.get(baseToken) ?? 0;
    duplicateM.set(baseToken, duplicateIndex + 1);
    const token = duplicateIndex
      ? `${baseToken}#${duplicateIndex + 1}`
      : baseToken;
    const homeKey = `${parentKey}/${encodeURIComponent(token)}`;
    const homeCustomLink = customBranch || entry.type == "custom";

    return {
      ...entry,
      homeKey,
      homeCustomLink,
      children: decorateHomeNodes(
        entry.children,
        homeKey,
        homeCustomLink,
      ),
    };
  });
}

function addWalletHomeHrefs(nodes = [], routeBase = "/w") {
  return nodes.map((node) => {
    const href = node.href || getWalletNavUrl(routeBase, node);

    return {
      ...node,
      href,
      title:
        node.title ||
        [node.walletType, node.filePath, node.walletName]
          .filter(Boolean)
          .join(" / ") ||
        href,
      disabled: false,
      children: addWalletHomeHrefs(node.children || [], routeBase),
    };
  });
}

function getSiteMenuHomeEntry(menu) {
  const children =
    menu.type == "walletTree"
      ? addWalletHomeHrefs(menu.items, menu.routeBase)
      : menu.items;

  return {
    key: menu.key,
    value: menu.key,
    label: menu.label,
    title: menu.href || menu.label,
    href: menu.href,
    type: menu.type,
    children,
  };
}

function getExternalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ""))
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

function buildHomeFavoriteCatalog(nodes = [], catalog = new Map()) {
  for (const node of nodes) {
    if (node.href && !node.disabled) catalog.set(node.homeKey, node);
    buildHomeFavoriteCatalog(node.children || [], catalog);
  }

  return catalog;
}

export default function Home({
  walletTree = [],
  dataTree = [],
  refTree = [],
  editorFiles = [],
  editorEmptyFolders = [],
  initialCollapsedKeys = [],
  initialOrderM = {},
  initialFavoriteKeys = [],
  initialHistory = [],
  initialWalletMode = "trade",
}) {
  const initialHistoryText = JSON.stringify(
    parseHomeNavigationHistory(initialHistory),
  );
  const { links: customLinks, ready: customLinksReady } =
    useNavbarCustomLinks(navbarTopCustomScope);
  const [historyEntries, setHistoryEntries] = useState(() =>
    JSON.parse(initialHistoryText),
  );
  const [localWalletTree, setLocalWalletTree] = useState([]);
  const [resolvedEditorFiles, setResolvedEditorFiles] = useState(editorFiles);
  const [dynamicTreesReady, setDynamicTreesReady] = useState(false);
  const [searchMode, setSearchMode] = useState(() =>
    parseHomeWalletMode(
      getCurrentHomeCookie(homeWalletModeCookie, initialWalletMode),
    ),
  );
  const [collapsedKeys, setCollapsedKeys] = useState(
    () =>
      new Set(
        parseHomeCollapsedKeys(
          getCurrentHomeCookie(
            homeNavigationCollapsedCookie,
            initialCollapsedKeys,
            [],
          ),
        ),
      ),
  );
  const [customOrderM, setCustomOrderM] = useState(() =>
    parseHomeWalletOrder(
      getCurrentHomeCookie(
        homeNavigationOrderCookie,
        initialOrderM,
        {},
      ),
    ),
  );
  const [favoriteKeys, setFavoriteKeys] = useState(() =>
    parseHomeWalletFavKeys(
      getCurrentHomeCookie(
        homeNavigationFavsCookie,
        initialFavoriteKeys,
        [],
      ),
    ),
  );

  useEffect(() => {
    function refreshLocalTrees() {
      setLocalWalletTree(getLocalWalletTree());
      setResolvedEditorFiles(
        shouldUseLocalStorageEditor()
          ? listLocalEditorFiles(editorFiles)
          : editorFiles,
      );
      setDynamicTreesReady(true);
    }

    refreshLocalTrees();
    window.addEventListener(localEditorStorageEvent, refreshLocalTrees);
    window.addEventListener("storage", refreshLocalTrees);

    return () => {
      window.removeEventListener(localEditorStorageEvent, refreshLocalTrees);
      window.removeEventListener("storage", refreshLocalTrees);
    };
  }, [editorFiles]);

  useEffect(() => {
    setCookie(homeWalletModeCookie, searchMode, {
      maxAge: homeNavigationCookieMaxAge,
      path: "/",
    });
  }, [searchMode]);

  useEffect(() => {
    if (!collapsedKeys.size) {
      deleteCookie(homeNavigationCollapsedCookie, { path: "/" });
      return;
    }

    setCookie(
      homeNavigationCollapsedCookie,
      encodeHomeCollapsedKeys(collapsedKeys),
      { maxAge: homeNavigationCookieMaxAge, path: "/" },
    );
  }, [collapsedKeys]);

  useEffect(() => {
    if (!Object.keys(customOrderM).length) {
      deleteCookie(homeNavigationOrderCookie, { path: "/" });
      return;
    }

    setCookie(
      homeNavigationOrderCookie,
      encodeHomeWalletOrder(customOrderM),
      { maxAge: homeNavigationCookieMaxAge, path: "/" },
    );
  }, [customOrderM]);

  useEffect(() => {
    if (!favoriteKeys.length) {
      deleteCookie(homeNavigationFavsCookie, { path: "/" });
      return;
    }

    setCookie(
      homeNavigationFavsCookie,
      encodeHomeWalletFavKeys(favoriteKeys),
      { maxAge: homeNavigationCookieMaxAge, path: "/" },
    );
  }, [favoriteKeys]);

  const mergedWalletTree = useMemo(
    () => mergeTrees(walletTree, localWalletTree),
    [localWalletTree, walletTree],
  );
  const editorTree = useMemo(
    () => buildEditorNavTree(resolvedEditorFiles, editorEmptyFolders),
    [editorEmptyFolders, resolvedEditorFiles],
  );
  const menus = useMemo(
    () =>
      buildSiteNavigationMenus({
        walletTree: mergedWalletTree,
        dataTree,
        refTree,
        editorTree,
        editorFiles: resolvedEditorFiles,
        editorEmptyFolders,
      }),
    [
      dataTree,
      editorEmptyFolders,
      editorTree,
      mergedWalletTree,
      refTree,
      resolvedEditorFiles,
    ],
  );
  const tree = useMemo(
    () =>
      decorateHomeNodes(
        [
          ...menus.map(getSiteMenuHomeEntry),
          ...customLinks.map((link) => ({ ...link, type: "custom" })),
        ],
        homeNavigationRootKey,
      ),
    [customLinks, menus],
  );
  const favoriteCatalog = useMemo(
    () => buildHomeFavoriteCatalog(tree),
    [tree],
  );
  const historySearchEntryByHref = useMemo(() => {
    const result = new Map();

    for (const entry of getNavbarSearchEntries(tree)) {
      if (entry.href && !result.has(entry.href)) {
        result.set(entry.href, entry);
      }
    }

    return result;
  }, [tree]);
  const favoriteKeySet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);
  const matrixNodes = useMemo(
    () => [
      buildHomeVisitHistoryMatrixNode({
        rootKey: homeNavigationHistoryKey,
        items: historyEntries.map((entry, index) => {
          const searchEntry =
            historySearchEntryByHref.get(entry.href) ||
            historySearchEntryByHref.get(entry.href.split(/[?#]/, 1)[0]);

          return {
            ...entry,
            historyContext:
              searchEntry?.context || entry.context || "navbar",
            homeKey: `${homeNavigationHistoryKey}:${entry.href}:${index}`,
          };
        }),
      }),
      buildHomeFavoritesMatrixGroup({
        favoriteKeys,
        getFavoriteNode: (favoriteKey) => favoriteCatalog.get(favoriteKey),
        getFavoriteItem: (node, favoriteKey) => ({
          favoriteKey,
          href: node.href,
          label: node.label,
          title: node.title || node.href,
        }),
        getNodeKey: getNodeSortKey,
        rootKey: homeNavigationFavoritesKey,
      }),
      ...tree,
    ],
    [
      favoriteCatalog,
      favoriteKeys,
      historyEntries,
      historySearchEntryByHref,
      tree,
    ],
  );
  const matrix = useMemo(
    () =>
      buildHomeNavigationMatrix({
        nodes: matrixNodes,
        getNodeKey: (node) => getHomeMatrixNodeKey(node, getNodeSortKey),
        isCollapsed: (node) =>
          collapsedKeys.has(getHomeSourceNodeKey(node, getNodeSortKey)),
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
        rootParentKey: homeNavigationRootKey,
      }),
    [collapsedKeys, customOrderM, matrixNodes],
  );
  const sectionCollapsed = collapsedKeys.has(homeNavigationSectionKey);
  const searchRouteBase = searchMode == "trade" ? "/t" : "/w";

  useEffect(() => {
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
  }, [initialHistoryText]);

  useEffect(() => {
    if (!customLinksReady || !dynamicTreesReady) return;

    setFavoriteKeys((current) => {
      const clean = parseHomeWalletFavKeys(current);
      const next = clean.filter((favoriteKey) =>
        favoriteCatalog.has(favoriteKey),
      );
      return next.length == clean.length &&
        next.every((favoriteKey, index) => favoriteKey == clean[index])
        ? current
        : next;
    });
  }, [customLinksReady, dynamicTreesReady, favoriteCatalog]);

  function toggleNode(node) {
    const key = getHomeSourceNodeKey(node, getNodeSortKey);
    if (!key) return;

    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleFavorite(nodeOrKey) {
    const favoriteKey =
      typeof nodeOrKey == "string"
        ? nodeOrKey
        : getHomeSourceNodeKey(nodeOrKey, getNodeSortKey);
    if (!favoriteKey) return;

    setFavoriteKeys((current) => {
      const clean = parseHomeWalletFavKeys(current);
      return clean.includes(favoriteKey)
        ? clean.filter((key) => key != favoriteKey)
        : parseHomeWalletFavKeys([...clean, favoriteKey]);
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
      getHomeMatrixMove(
        current,
        matrix,
        dragNode,
        targetNode,
        placeAfter,
      ),
    );
  }

  return (
    <>
      <div className="flex mb-1">
        <span className="orange">W3</span>
        <span className="homeNavSectionTitle">
          <span>home</span>
          <HomeSectionSortToggle
            collapsed={sectionCollapsed}
            label="navigation"
            onResetSorting={() => setCustomOrderM({})}
            onToggle={() => toggleNode({ homeKey: homeNavigationSectionKey })}
          />
        </span>
        {(sectionCollapsed || !!matrix.collapsedCount) && (
          <button
            type="button"
            className="homeNavExpandAll"
            onClick={() => setCollapsedKeys(new Set())}
          >
            expand all
          </button>
        )}
      </div>
      <nav className="homeNav" aria-label="Site navigation links">
        <section
          className={`homeNavSection ${sectionCollapsed ? "collapsed" : ""}`}
        >
          {!sectionCollapsed && (
            <>
              <div className="homeWalletSearchRow">
                <WalletSearch
                  walletTree={mergedWalletTree}
                  routeBase={searchRouteBase}
                  navigationTree={tree}
                  searchMode={searchMode}
                />
                <div
                  className="homeNavMode"
                  aria-label="all, wallet, or trade search"
                >
                  <button
                    type="button"
                    className={searchMode == "all" ? "active" : ""}
                    aria-pressed={searchMode == "all"}
                    onClick={() => setSearchMode("all")}
                  >
                    all
                  </button>
                  <button
                    type="button"
                    className={searchMode == "wallet" ? "active" : ""}
                    aria-pressed={searchMode == "wallet"}
                    onClick={() => setSearchMode("wallet")}
                  >
                    wallet
                  </button>
                  <button
                    type="button"
                    className={searchMode == "trade" ? "active" : ""}
                    aria-pressed={searchMode == "trade"}
                    onClick={() => setSearchMode("trade")}
                  >
                    trade
                  </button>
                </div>
              </div>
              <HomeNavigationMatrix
                matrix={matrix}
                sortable
                onMoveNode={moveNode}
                onRemoveHistory={removeHomeNavigationHistory}
                renderNode={(node) => (
                  <NavigationNode
                    node={node}
                    favoriteKeySet={favoriteKeySet}
                    getHref={(entry) => entry.href || ""}
                    onMoveFavorite={moveFavorite}
                    onToggleFavorite={toggleFavorite}
                    onToggleNode={toggleNode}
                  />
                )}
              />
            </>
          )}
        </section>
      </nav>
    </>
  );
}
