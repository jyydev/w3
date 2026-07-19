"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { TrashIcon } from "@/components/Shared";
import { deleteEmptyWalletPath } from "@/app/w/walletActions";
import HoverMenu from "./HoverMenu";
import {
  deleteLocalEditorFile,
  listLocalWalletFileRecords,
  localEditorStorageEvent,
  readLocalNavFavs,
  saveLocalNavFavs,
  shouldUseLocalStorageEditor,
} from "@/app/_editorData/browserEditorStorage";

const cookieMaxAge = 365 * 24 * 60 * 60;

export function getWalletNavUrl(routeBase, node) {
  const base = String(routeBase || "/w").replace(/\/+$/, "") || "/w";
  const cleanPath = String(node.filePath || "").replace(/\/+$/, "");
  const pathname = cleanPath
    ? `${base}/${cleanPath
        .split("/")
        .filter(Boolean)
        .map((part) => encodeURIComponent(part))
        .join("/")}`
    : base;
  const params = new URLSearchParams();

  if (node.walletType && node.walletType != "evm") {
    params.set("chain", node.walletType);
  }
  if (node.walletName) params.set("w", node.walletName);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
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

  const walletNames = entries
    .map((entry) => entry.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  for (const walletName of walletNames) {
    ensureChild(parent, {
      type: "wallet",
      label: walletName,
      walletType,
      filePath: source,
      walletName,
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

function FavButton({ active, onClick }) {
  return (
    <button
      type="button"
      className={`navFavBtn ${active ? "active" : ""}`}
      title={active ? "remove fav" : "add fav"}
      aria-label={active ? "remove favorite" : "add favorite"}
      onClick={onClick}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

function WalletNavNode({
  node,
  routeBase,
  favHrefM,
  onToggleFav,
  onDeleteEmpty,
}) {
  const visibleChildren = node.children || [];
  const hasChildren = !!visibleChildren.length;
  const fav = getFavEntry(routeBase, node);
  const active = favHrefM.has(fav.href);
  const favButton = (
    <FavButton
      active={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleFav(fav);
      }}
    />
  );
  const trashButton = node.deletable ? (
    <button
      type="button"
      className="navTrashBtn"
      title={`delete empty ${node.deletable.kind}`}
      aria-label={`delete empty ${node.deletable.kind}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDeleteEmpty(node);
      }}
    >
      <TrashIcon />
    </button>
  ) : null;

  if (!hasChildren) {
    return (
      <div className="navMenuRow navLeafRow">
        <Link
          href={fav.href}
          title={fav.title}
          className={node.type == "wallet" ? "walletLeaf" : ""}
        >
          {node.label}
        </Link>
        {favButton}
        {trashButton}
      </div>
    );
  }

  return (
    <HoverMenu className="navSubmenu">
      <div className="navMenuRow">
        <Link
          href={fav.href}
          title={fav.title}
          className="navigationMenuTrigger"
        >
          {node.label}
        </Link>
        {favButton}
        {trashButton}
        <span className="navigationMenuTrigger navSubmenuCaret">{">"}</span>
      </div>
      <div className="navigationMenuPanel navSubmenuContent">
        {visibleChildren.map((child) => (
          <WalletNavNode
            key={`${child.walletType}:${child.type}:${child.filePath}:${
              child.walletName ?? ""
            }`}
            node={child}
            routeBase={routeBase}
            favHrefM={favHrefM}
            onToggleFav={onToggleFav}
            onDeleteEmpty={onDeleteEmpty}
          />
        ))}
      </div>
    </HoverMenu>
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
  initialFavs = [],
}) {
  const router = useRouter();
  const [localTree, setLocalTree] = useState([]);
  const mergedTree = useMemo(
    () => mergeTrees(tree, localTree),
    [tree, localTree],
  );
  const validFavs = useMemo(
    () => flattenFavs(mergedTree, routeBase),
    [routeBase, mergedTree],
  );
  const validHrefM = useMemo(
    () => new Map(validFavs.map((fav) => [fav.href, fav])),
    [validFavs],
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

  async function deleteEmptyNode(node) {
    const target = node.deletable;
    if (!target) return;

    const label = `${node.walletType}/${target.source}${
      target.kind == "file" ? ".json" : "/"
    }`;
    if (!window.confirm(`Delete empty ${target.kind}?\n\n${label}`)) return;

    try {
      if (shouldUseLocalStorageEditor()) {
        if (target.kind != "file") {
          throw new Error("localStorage has no empty folder record");
        }

        const res = deleteLocalEditorFile(
          target.file || `wallets/${node.walletType}/${target.source}.json`,
        );
        if (!res.ok) throw new Error(res.msg || "delete failed");

        toast.success(`deleted ${label}`);
        setLocalTree(getLocalWalletTree());
        return;
      }

      const res = await deleteEmptyWalletPath({
        walletType: node.walletType,
        source: target.source,
        kind: target.kind,
      });
      if (!res.ok) throw new Error(res.msg || "delete failed");

      toast.success(`deleted ${label}`);
      router.refresh();
    } catch (e) {
      toast.error(e?.message || "delete failed");
    }
  }

  function renderQuickFav(fav) {
    const isDropSpot = dropSpot?.href == fav.href;
    const dropClass = isDropSpot
      ? dropSpot.placeAfter
        ? " dropAfter"
        : " dropBefore"
      : "";

    return (
      <span
        className={`navQuickFav${dragHref == fav.href ? " dragging" : ""}${dropClass}`}
        draggable
        key={fav.href}
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
            setDropSpot((prev) => (prev?.href == fav.href ? null : prev));
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
        <Link href={fav.href}>{fav.label}</Link>
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
      </span>
    );
  }

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
          {mergedTree.length ? (
            mergedTree.map((node) => (
              <WalletNavNode
                key={`${routeBase}:${node.walletType}`}
                node={node}
                routeBase={routeBase}
                favHrefM={favHrefM}
                onToggleFav={toggleFav}
                onDeleteEmpty={deleteEmptyNode}
              />
            ))
          ) : (
            <Link href={routeBase}>all</Link>
          )}
        </div>
      </HoverMenu>
      {!!visibleFavs.length && (
        <div className="navQuickFavs">{visibleFavs.map(renderQuickFav)}</div>
      )}
    </div>
  );
}

export default NavbarWalletMenu;
