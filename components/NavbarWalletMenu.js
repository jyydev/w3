"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCookie, setCookie } from "cookies-next";
import {
  favAddrCookie,
  favAddrsChangeEvent,
  getDefaultWalletName,
  isAddressOnlyWalletName,
  parseFavAddrs,
} from "@/app/w/favAddrs";
import FavoriteButton from "./FavoriteButton";
import HoverMenu from "./HoverMenu";
import NavbarHoverCard from "./NavbarHoverCard";
import {
  EmptyWalletDeleteButton,
  useWalletEntryDelete,
  WalletDeleteButton,
} from "./WalletDeleteButton";
import {
  NavbarSortableRow,
  useNavbarTreeSorting,
} from "./NavbarTreeSorting";
import {
  NavbarHideButton,
  getNavbarVisibilityKey,
  useNavbarVisibilityContext,
} from "./navbarVisibility";
import {
  listLocalWalletFileRecords,
  localEditorStorageEvent,
  readLocalNavFavs,
  saveLocalNavFavs,
  shouldUseLocalStorageEditor,
} from "@/app/_editorData/browserEditorStorage";

const cookieMaxAge = 365 * 24 * 60 * 60;

function getWalletType(type = "evm") {
  const value = String(type || "evm").toLowerCase();
  return ["solana", "tron"].includes(value) ? value : "evm";
}

function getWalletChainQuery(type = "evm") {
  const walletType = getWalletType(type);
  return walletType == "solana"
    ? "Solana"
    : walletType == "tron"
      ? "Tron"
      : "evm";
}

function getWalletRouteBase(routeBase = "/w") {
  return String(routeBase || "/w").replace(/\/+$/, "") || "/w";
}

export function getWalletNavUrl(routeBase, node = {}) {
  const base = getWalletRouteBase(routeBase);
  const walletType = getWalletType(node.walletType);
  const cleanPath = String(node.filePath || "").replace(/\/+$/, "");
  const pathname = cleanPath
    ? `${base}/${cleanPath
        .split("/")
        .filter(Boolean)
        .map((part) => encodeURIComponent(part))
        .join("/")}`
    : base;
  const params = new URLSearchParams();
  const typeRoot =
    !!node.walletType &&
    !cleanPath &&
    !node.walletName &&
    !node.walletAddress;

  if ((typeRoot || walletType != "evm") && cleanPath != "favs") {
    params.set("chain", getWalletChainQuery(walletType));
  } else if (cleanPath == "favs" && walletType != "evm") {
    params.set("chain", getWalletChainQuery(walletType));
  }
  if (node.walletName) params.set("w", node.walletName);
  if (node.walletAddress) params.set("addr", node.walletAddress);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function getFavoriteWalletNodes(favoriteWallets = [], walletType = "evm") {
  return parseFavAddrs(favoriteWallets)
    .filter((favorite) => favorite.type == walletType)
    .map((favorite, index) => {
      const address = String(favorite.address || "").trim();
      const label =
        String(favorite.name || "").trim() ||
        getDefaultWalletName(address) ||
        `fav_${index + 1}`;
      const addressOnly = isAddressOnlyWalletName(label);

      return {
        type: "wallet",
        label,
        walletType,
        walletAddress: addressOnly ? address : "",
        walletName: addressOnly ? "" : label,
        address,
        navbarWalletFavorite: true,
        children: [],
      };
    });
}

function addWalletSpecialNodes(tree = [], favoriteWallets = []) {
  return tree.map((node) => ({
    ...node,
    children: [
      {
        type: "special",
        label: "favs",
        walletType: getWalletType(node.walletType),
        filePath: "favs",
        navbarWalletFavs: true,
        navbarDefaultOrderAnchor: true,
        children: getFavoriteWalletNodes(
          favoriteWallets,
          getWalletType(node.walletType),
        ),
      },
      ...(node.children || []).filter(
        (child) =>
          !["favs", "all"].includes(
            String(child.filePath || "").replace(/\/+$/, ""),
          ),
      ),
      {
        type: "special",
        label: "all",
        walletType: getWalletType(node.walletType),
        filePath: "all",
        navbarWalletAll: true,
        children: [],
      },
    ],
  }));
}

function getFavEntry(routeBase, node) {
  const detail = [
    node.walletType,
    node.filePath,
    node.walletName && `w:${node.walletName}`,
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    href: getWalletNavUrl(routeBase, node),
    label: node.label,
    title: detail || node.label,
    node,
  };
}

function flattenFavs(tree = [], routeBase = "") {
  const favs = [];

  function addNode(node) {
    favs.push(getFavEntry(routeBase, node));
    for (const child of node.children || []) addNode(child);
  }

  for (const node of tree) addNode(node);

  return favs;
}

function getWalletTypeLabel(type = "") {
  return type == "solana" ? "Solana" : type == "tron" ? "Tron" : "EVM";
}

function mergeNode(target, source) {
  const childM = new Map(
    (target.children || []).map((child) => [
      `${child.walletType}:${child.filePath}:${child.walletName || ""}`,
      child,
    ]),
  );

  for (const child of source.children || []) {
    const key = `${child.walletType}:${child.filePath}:${child.walletName || ""}`;
    const existing = childM.get(key);
    if (existing) {
      if (existing.type != child.type) existing.type = "mixed";
      if (!existing.deletable && child.deletable) existing.deletable = child.deletable;
      if (child.address) existing.address = child.address;
      mergeNode(existing, child);
    }
    else {
      childM.set(key, child);
      target.children.push(child);
    }
  }

  target.children.sort(sortNavNodes);
}

function sortNavNodes(a, b) {
  const aGroup = a.type == "folder" || a.type == "mixed" ? 0 : a.type == "file" ? 1 : 2;
  const bGroup = b.type == "folder" || b.type == "mixed" ? 0 : b.type == "file" ? 1 : 2;
  return aGroup - bGroup || String(a.label).localeCompare(String(b.label));
}

function ensureChild(parent, child) {
  parent.children ??= [];
  let existing = parent.children.find(
    (node) =>
      node.label == child.label &&
      node.walletType == child.walletType &&
      node.filePath == child.filePath,
  );

  if (!existing) {
    existing = child;
    parent.children.push(existing);
    parent.children.sort(sortNavNodes);
  } else if (existing.type != child.type) {
    existing.type = "mixed";
  }
  if (!existing.deletable && child.deletable) existing.deletable = child.deletable;
  if (child.address) existing.address = child.address;

  return existing;
}

function addLocalWalletFile(typeNode, record) {
  const { walletType, source, entries = [], empty = false } = record;
  const parts = String(source || "").split("/").filter(Boolean);
  if (!parts.length) return;

  let parent = typeNode;
  let currentPath = "";
  for (let i = 0; i < parts.length; i++) {
    const label = parts[i];
    currentPath = [currentPath, label].filter(Boolean).join("/");
    const last = i == parts.length - 1;
    parent = ensureChild(parent, {
      type: last ? "file" : "folder",
      label,
      walletType,
      filePath: currentPath,
      deletable:
        last && empty
          ? {
              kind: "file",
              source: currentPath,
              file: record.file,
            }
          : null,
      children: [],
    });
  }

  const walletEntries = entries
    .filter((entry) => entry.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of walletEntries) {
    ensureChild(parent, {
      type: "wallet",
      label: entry.name,
      walletType,
      filePath: source,
      walletName: entry.name,
      address: entry.address,
      children: [],
    });
  }
}

export function getLocalWalletTree() {
  if (!shouldUseLocalStorageEditor()) return [];

  return ["evm", "solana", "tron"]
    .map((walletType) => {
      const records = listLocalWalletFileRecords(walletType);
      const typeNode = {
        type: "folder",
        label: getWalletTypeLabel(walletType),
        walletType,
        filePath: "",
        children: [],
      };

      for (const record of records) addLocalWalletFile(typeNode, record);

      return typeNode.children.length ? typeNode : null;
    })
    .filter(Boolean);
}

export function mergeTrees(baseTree = [], localTree = []) {
  const merged = JSON.parse(JSON.stringify(baseTree || []));
  for (const localNode of localTree) {
    const existing = merged.find((node) => node.walletType == localNode.walletType);
    if (existing) mergeNode(existing, localNode);
    else merged.push(localNode);
  }

  return merged.sort((a, b) => {
    const order = { evm: 0, solana: 1, tron: 2 };
    return (order[a.walletType] ?? 99) - (order[b.walletType] ?? 99);
  });
}

function addNavbarSortIds(tree = []) {
  return tree.map((node) => ({
    ...node,
    navbarSortId: [
      node.walletType || "wallet",
      node.filePath || "",
      node.walletName || "",
      node.walletAddress || node.address || "",
    ].join(":"),
    children: addNavbarSortIds(node.children || []),
  }));
}

function normalizeFavs(favs = [], validHrefM = new Map()) {
  const seen = new Set();

  return favs
    .map((fav) => validHrefM.get(fav?.href))
    .filter(Boolean)
    .filter((fav) => {
      if (seen.has(fav.href)) return false;
      seen.add(fav.href);

      return true;
    });
}

function getLowercaseChainHref(href = "") {
  const [pathname, query = ""] = String(href).split("?");
  if (!query) return "";

  const params = new URLSearchParams(query);
  const chain = params.get("chain");
  if (!chain) return "";

  params.set("chain", chain.toLowerCase());
  return `${pathname}?${params.toString()}`;
}

function getValidFavHrefM(favs = [], routeBase = "/w") {
  const validHrefM = new Map();
  const base = getWalletRouteBase(routeBase);

  for (const fav of favs) {
    validHrefM.set(fav.href, fav);

    const lowercaseHref = getLowercaseChainHref(fav.href);
    if (lowercaseHref) validHrefM.set(lowercaseHref, fav);

    if (
      fav.node?.walletType == "evm" &&
      !fav.node?.filePath &&
      !fav.node?.walletName &&
      !fav.node?.walletAddress
    ) {
      validHrefM.set(base, fav);
    }
  }

  return validHrefM;
}

function WalletNavNode({
  deletingEmptyWalletKey,
  deletingWalletKey,
  node,
  siblings,
  sorting,
  routeBase,
  favHrefM,
  onToggleFav,
  onDeleteWallet,
  onDeleteEmpty,
  visibility,
  visibilityScope,
}) {
  const visibilityKey = getNavbarVisibilityKey(visibilityScope, node);
  const hidden =
    !!visibility?.toggleHidden && visibility.hiddenKeys.has(visibilityKey);
  if (hidden && !visibility.showHidden) return null;

  const visibleChildren = node.children || [];
  const hasChildren = !!visibleChildren.length;
  const fav = getFavEntry(routeBase, node);
  const active = favHrefM.has(fav.href);
  const favButton = (
    <FavoriteButton
      active={active}
      className="navFavBtn"
      label={node.label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleFav(fav);
      }}
    />
  );
  const walletTrashButton = (
    <WalletDeleteButton
      className="navTrashBtn"
      deletingWalletKey={deletingWalletKey}
      node={node}
      onDelete={onDeleteWallet}
    />
  );
  const emptyTrashButton = (
    <EmptyWalletDeleteButton
      className="navTrashBtn"
      deletingEmptyWalletKey={deletingEmptyWalletKey}
      node={node}
      onDelete={onDeleteEmpty}
    />
  );
  const hideButton = visibility?.toggleHidden ? (
    <NavbarHideButton
      hidden={hidden}
      label={node.label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        visibility.toggleHidden(visibilityKey);
      }}
    />
  ) : null;

  if (!hasChildren) {
    return (
      <NavbarSortableRow
        entry={node}
        siblings={siblings}
        sorting={sorting}
      >
        <div
          className={`navMenuRow navLeafRow${hidden ? " navItemHidden" : ""}`}
        >
          <Link
            href={fav.href}
            title={fav.title}
            className={node.type == "wallet" ? "walletLeaf" : ""}
          >
            {node.label}
          </Link>
          {favButton}
          {hideButton}
          {walletTrashButton}
          {emptyTrashButton}
        </div>
      </NavbarSortableRow>
    );
  }

  return (
    <NavbarSortableRow
      entry={node}
      siblings={siblings}
      sorting={sorting}
    >
      <HoverMenu className="navSubmenu">
        <div className={`navMenuRow${hidden ? " navItemHidden" : ""}`}>
          <Link
            href={fav.href}
            title={fav.title}
            className="navigationMenuTrigger"
          >
            {node.label}
          </Link>
          {favButton}
          {hideButton}
          {walletTrashButton}
          {emptyTrashButton}
          <span className="navigationMenuTrigger navSubmenuCaret">{">"}</span>
        </div>
        <div className="navigationMenuPanel navSubmenuContent">
          {visibleChildren.map((child) => (
            <WalletNavNode
              key={child.navbarSortKey}
              node={child}
              siblings={visibleChildren}
              sorting={sorting}
              routeBase={routeBase}
              favHrefM={favHrefM}
              onToggleFav={onToggleFav}
              onDeleteWallet={onDeleteWallet}
              onDeleteEmpty={onDeleteEmpty}
              deletingEmptyWalletKey={deletingEmptyWalletKey}
              deletingWalletKey={deletingWalletKey}
              visibility={visibility}
              visibilityScope={visibilityScope}
            />
          ))}
        </div>
      </HoverMenu>
    </NavbarSortableRow>
  );
}

function encodeFavs(favs) {
  return JSON.stringify(
    favs.map(({ href, label, title }) => ({ href, label, title })),
  );
}

function NavbarWalletMenu({
  title,
  routeBase,
  tree = [],
  cookieName,
  initialFavoriteWallets = [],
  initialFavs = [],
  initialOrderM = {},
}) {
  const visibility = useNavbarVisibilityContext();
  const visibilityScope = `menu:${cookieName || routeBase || title || "wallets"}`;
  const {
    deleteEmptyWallet,
    deleteWallet,
    deletingEmptyWalletKey,
    deletingWalletKey,
  } = useWalletEntryDelete();
  const [localTree, setLocalTree] = useState([]);
  const initialFavoriteWalletsText = JSON.stringify(
    parseFavAddrs(initialFavoriteWallets),
  );
  const [favoriteWallets, setFavoriteWallets] = useState(() =>
    parseFavAddrs(initialFavoriteWallets),
  );
  const mergedTree = useMemo(
    () => mergeTrees(tree, localTree),
    [tree, localTree],
  );
  const navigationTree = useMemo(
    () => addWalletSpecialNodes(mergedTree, favoriteWallets),
    [favoriteWallets, mergedTree],
  );
  const sortableTree = useMemo(
    () => addNavbarSortIds(navigationTree),
    [navigationTree],
  );
  const { orderedEntries: orderedTree, sorting } = useNavbarTreeSorting({
    entries: sortableTree,
    scope: cookieName || routeBase,
    initialOrderM,
  });
  const validFavs = useMemo(
    () => flattenFavs(orderedTree, routeBase),
    [routeBase, orderedTree],
  );
  const validHrefM = useMemo(
    () => getValidFavHrefM(validFavs, routeBase),
    [routeBase, validFavs],
  );
  const [favs, setFavs] = useState(initialFavs);
  const [dragHref, setDragHref] = useState("");
  const [dropSpot, setDropSpot] = useState(null);
  const visibleFavs = normalizeFavs(favs, validHrefM);
  const favHrefM = new Map(visibleFavs.map((fav) => [fav.href, fav]));

  useEffect(() => {
    const localFavs = readLocalNavFavs(cookieName);
    setFavs(localFavs === null ? initialFavs : localFavs);
  }, [cookieName, initialFavs]);

  useEffect(() => {
    function refreshFavoriteWallets(event) {
      const eventFavorites = event?.detail?.favs;
      const cookieFavorites = getCookie(favAddrCookie);
      setFavoriteWallets(
        parseFavAddrs(
          Array.isArray(eventFavorites)
            ? eventFavorites
            : cookieFavorites ?? initialFavoriteWalletsText,
        ),
      );
    }

    refreshFavoriteWallets();
    window.addEventListener(favAddrsChangeEvent, refreshFavoriteWallets);
    window.addEventListener("focus", refreshFavoriteWallets);
    return () => {
      window.removeEventListener(favAddrsChangeEvent, refreshFavoriteWallets);
      window.removeEventListener("focus", refreshFavoriteWallets);
    };
  }, [initialFavoriteWalletsText]);

  useEffect(() => {
    function loadLocalTree() {
      setLocalTree(getLocalWalletTree());
    }

    loadLocalTree();
    window.addEventListener(localEditorStorageEvent, loadLocalTree);
    window.addEventListener("storage", loadLocalTree);
    return () => {
      window.removeEventListener(localEditorStorageEvent, loadLocalTree);
      window.removeEventListener("storage", loadLocalTree);
    };
  }, []);

  function saveFavs(nextFavs) {
    saveLocalNavFavs(cookieName, nextFavs);
    setCookie(cookieName, encodeFavs(nextFavs), {
      maxAge: cookieMaxAge,
      path: "/",
    });
  }

  function toggleFav(fav) {
    const clean = normalizeFavs(favs, validHrefM);
    const next = clean.some((entry) => entry.href == fav.href)
      ? clean.filter((entry) => entry.href != fav.href)
      : [...clean, fav];

    setFavs(next);
    saveFavs(next);
  }

  function moveFav(dragHref, targetHref, placeAfter) {
    if (!dragHref || !targetHref || dragHref == targetHref) return;

    const clean = normalizeFavs(favs, validHrefM);
    const dragged = clean.find((fav) => fav.href == dragHref);
    const targetIndex = clean.findIndex((fav) => fav.href == targetHref);
    if (!dragged || targetIndex < 0) return;

    const withoutDragged = clean.filter((fav) => fav.href != dragHref);
    const nextTargetIndex = withoutDragged.findIndex(
      (fav) => fav.href == targetHref,
    );
    if (nextTargetIndex < 0) return;

    const insertIndex = nextTargetIndex + (placeAfter ? 1 : 0);
    const next = [
      ...withoutDragged.slice(0, insertIndex),
      dragged,
      ...withoutDragged.slice(insertIndex),
    ];

    setFavs(next);
    saveFavs(next);
  }

  function updateDropSpot(href, placeAfter) {
    setDropSpot((prev) =>
      prev?.href == href && prev?.placeAfter == placeAfter
        ? prev
        : { href, placeAfter },
    );
  }

  function renderQuickFav(fav) {
    const visibilityKey = getNavbarVisibilityKey(visibilityScope, fav.node);
    const hidden =
      !!visibility?.toggleHidden && visibility.hiddenKeys.has(visibilityKey);
    if (hidden && !visibility.showHidden) return null;

    const visibleChildren = fav.node?.children || [];
    const hasChildren = !!visibleChildren.length;
    const isDropSpot = dropSpot?.href == fav.href;
    const dropClass = isDropSpot
      ? dropSpot.placeAfter
        ? " dropAfter"
        : " dropBefore"
      : "";

    return (
      <HoverMenu
        className={`navQuickFav${hasChildren ? " hasChildren" : ""}${
          hidden ? " navItemHidden" : ""
        }${
          dragHref == fav.href ? " dragging" : ""
        }${dropClass}`}
        disabled={!hasChildren}
        key={fav.href}
      >
        <NavbarHoverCard
          className="navQuickFavTrigger"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", fav.href);
            setDragHref(fav.href);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const rect = e.currentTarget.getBoundingClientRect();
            updateDropSpot(fav.href, e.clientX > rect.left + rect.width / 2);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setDropSpot((prev) =>
                prev?.href == fav.href ? null : prev,
              );
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const placeAfter = e.clientX > rect.left + rect.width / 2;
            moveFav(e.dataTransfer.getData("text/plain"), fav.href, placeAfter);
            setDragHref("");
            setDropSpot(null);
          }}
          onDragEnd={() => {
            setDragHref("");
            setDropSpot(null);
          }}
        >
          <Link
            href={fav.href}
            title={fav.title}
            className={`navQuickFavLink${
              hasChildren ? " navigationMenuTrigger" : ""
            }`}
          >
            {fav.label}
          </Link>
          {hasChildren && (
            <button
              type="button"
              className="navigationMenuTrigger navQuickFavToggle"
              aria-label={`${fav.label} options`}
              aria-haspopup="menu"
            >
              <span className="navQuickFavCaret"></span>
            </button>
          )}
          <span className="navQuickFavCard">
            <button
              type="button"
              className="navQuickUnfav"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFav(fav);
              }}
            >
              ★ unfav <span className="gray">{fav.href}</span>
            </button>
          </span>
        </NavbarHoverCard>
        {hasChildren && (
          <div className="navigationMenuPanel dropdown-content navMenuTree navQuickFavMenu">
            {visibleChildren.map((child) => (
              <WalletNavNode
                key={child.navbarSortKey}
                node={child}
                siblings={visibleChildren}
                sorting={sorting}
                routeBase={routeBase}
                favHrefM={favHrefM}
                onToggleFav={toggleFav}
                onDeleteWallet={deleteWallet}
                onDeleteEmpty={deleteEmptyWallet}
                deletingEmptyWalletKey={deletingEmptyWalletKey}
                deletingWalletKey={deletingWalletKey}
                visibility={visibility}
                visibilityScope={visibilityScope}
              />
            ))}
          </div>
        )}
      </HoverMenu>
    );
  }

  const quickFavs = visibleFavs.map(renderQuickFav).filter(Boolean);

  return (
    <div className="walletNavGroup">
      <HoverMenu className="dropdown title">
        <Link
          className="navigationMenuTrigger dropbtn navTitleLink"
          href={routeBase}
        >
          {title}
          <i className="custom-caret"></i>
        </Link>
        <div className="navigationMenuPanel dropdown-content navMenuTree">
          {orderedTree.length ? (
            orderedTree.map((node) => (
              <WalletNavNode
                key={node.navbarSortKey}
                node={node}
                siblings={orderedTree}
                sorting={sorting}
                routeBase={routeBase}
                favHrefM={favHrefM}
                onToggleFav={toggleFav}
                onDeleteWallet={deleteWallet}
                onDeleteEmpty={deleteEmptyWallet}
                deletingEmptyWalletKey={deletingEmptyWalletKey}
                deletingWalletKey={deletingWalletKey}
                visibility={visibility}
                visibilityScope={visibilityScope}
              />
            ))
          ) : (
            <Link href={routeBase}>all</Link>
          )}
        </div>
      </HoverMenu>
      {!!quickFavs.length && (
        <div className="navQuickFavs">{quickFavs}</div>
      )}
    </div>
  );
}

export default NavbarWalletMenu;
