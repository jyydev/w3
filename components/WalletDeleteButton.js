"use client";

import { getCookie, setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  deleteLocalEditorFile,
  deleteLocalWalletEntry,
  shouldUseLocalStorageEditor,
} from "@/app/_editorData/browserEditorStorage";
import {
  encodeFavAddrs,
  favAddrCookie,
  getFavAddrKey,
  notifyFavAddrsChange,
  parseFavAddrs,
} from "@/app/w/favAddrs";
import {
  deleteEmptyWalletPath,
  deleteWalletEntry,
} from "@/app/w/walletActions";
import { TrashIcon } from "./Shared";

const cookieMaxAge = 365 * 24 * 60 * 60;

export function getWalletDeleteEntry(node = {}) {
  if (node.type != "wallet") return null;

  const walletType = String(node.walletType || "evm").toLowerCase();
  const source = String(node.filePath || node.source || "").trim();
  const name = String(node.walletName || node.name || node.label || "").trim();
  const address = String(node.address || node.walletAddress || "").trim();
  if (!source || !name || !address) return null;

  return { walletType, source, name, address };
}

export function getWalletDeleteKey(node = {}) {
  const entry = getWalletDeleteEntry(node);
  if (!entry) return "";

  return [entry.walletType, entry.source, entry.name, entry.address].join(":");
}

export function getEmptyWalletDeleteEntry(node = {}) {
  const target = node.deletable;
  const kind = target?.kind == "folder" ? "folder" : "file";
  const walletType = String(node.walletType || "evm").toLowerCase();
  const source = String(target?.source || "").trim();
  if (!target || !source) return null;

  return {
    walletType,
    source,
    kind,
    file: String(target.file || "").trim(),
  };
}

export function getEmptyWalletDeleteKey(node = {}) {
  const entry = getEmptyWalletDeleteEntry(node);
  if (!entry) return "";

  return [entry.walletType, entry.kind, entry.source].join(":");
}

function removeWalletFavorite(walletType, address) {
  const favs = parseFavAddrs(getCookie(favAddrCookie));
  const favoriteKey = getFavAddrKey(walletType, address);
  const nextFavs = favs.filter(
    (fav) => getFavAddrKey(fav.type, fav.address) != favoriteKey,
  );
  if (nextFavs.length == favs.length) return;

  setCookie(favAddrCookie, encodeFavAddrs(nextFavs), {
    maxAge: cookieMaxAge,
    path: "/",
  });
  notifyFavAddrsChange(nextFavs);
}

export function useWalletEntryDelete() {
  const router = useRouter();
  const [deletingWalletKey, setDeletingWalletKey] = useState("");
  const [deletingEmptyWalletKey, setDeletingEmptyWalletKey] = useState("");

  async function deleteWallet(event, node) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const entry = getWalletDeleteEntry(node);
    if (!entry) return;
    if (!window.confirm(`Delete ${entry.name} from ${entry.source}.json?`)) {
      return;
    }

    const key = getWalletDeleteKey(node);
    setDeletingWalletKey(key);

    try {
      const local = shouldUseLocalStorageEditor();
      const res = local
        ? deleteLocalWalletEntry(entry)
        : await deleteWalletEntry(entry);
      if (!res.ok) throw new Error(res.msg || "delete wallet failed");

      removeWalletFavorite(entry.walletType, entry.address);
      toast.success(`deleted${local ? " local" : ""} ${entry.name}`);
      if (!local) router.refresh();
    } catch (error) {
      toast.error(error?.message || "delete wallet failed");
    } finally {
      setDeletingWalletKey("");
    }
  }

  async function deleteEmptyWallet(event, node) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const entry = getEmptyWalletDeleteEntry(node);
    if (!entry) return;
    const label = `${entry.walletType}/${entry.source}${
      entry.kind == "file" ? ".json" : "/"
    }`;
    if (!window.confirm(`Delete empty ${entry.kind}?\n\n${label}`)) return;

    const key = getEmptyWalletDeleteKey(node);
    setDeletingEmptyWalletKey(key);

    try {
      const local = shouldUseLocalStorageEditor();
      let res;
      if (local) {
        if (entry.kind != "file") {
          throw new Error("localStorage has no empty folder record");
        }
        res = deleteLocalEditorFile(
          entry.file ||
            `wallets/${entry.walletType}/${entry.source}.json`,
        );
      } else {
        res = await deleteEmptyWalletPath(entry);
      }
      if (!res.ok) throw new Error(res.msg || "delete failed");

      toast.success(`deleted ${label}`);
      if (!local) router.refresh();
    } catch (error) {
      toast.error(error?.message || "delete failed");
    } finally {
      setDeletingEmptyWalletKey("");
    }
  }

  return {
    deleteEmptyWallet,
    deleteWallet,
    deletingEmptyWalletKey,
    deletingWalletKey,
  };
}

export function WalletDeleteButton({
  className = "",
  deletingWalletKey = "",
  node,
  onDelete,
}) {
  const entry = getWalletDeleteEntry(node);
  if (!entry || typeof onDelete != "function") return null;

  const key = getWalletDeleteKey(node);
  const label = `${entry.source}/${entry.name}`;

  return (
    <button
      type="button"
      className={className}
      title={`delete ${label}`}
      aria-label={`delete ${label}`}
      disabled={deletingWalletKey == key}
      onClick={(event) => onDelete(event, node)}
    >
      <TrashIcon />
    </button>
  );
}

export function EmptyWalletDeleteButton({
  className = "",
  deletingEmptyWalletKey = "",
  node,
  onDelete,
}) {
  const entry = getEmptyWalletDeleteEntry(node);
  if (!entry || typeof onDelete != "function") return null;

  const key = getEmptyWalletDeleteKey(node);
  const label = `${entry.walletType}/${entry.source}${
    entry.kind == "file" ? ".json" : "/"
  }`;

  return (
    <button
      type="button"
      className={className}
      title={`delete empty ${entry.kind} ${label}`}
      aria-label={`delete empty ${entry.kind} ${label}`}
      disabled={deletingEmptyWalletKey == key}
      onClick={(event) => onDelete(event, node)}
    >
      <TrashIcon />
    </button>
  );
}
