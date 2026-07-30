import { parseSelectionOrder } from "@/fn/selectionOrder";
import { ckPrefix } from "@/sets";

const walletHistoryCookiePrefix = `${ckPrefix ?? ""}walletHistory_`;
const walletHistoryStoragePrefix = `${ckPrefix ?? ""}walletHistoryStorage_`;

export const walletHistoryCap = 10;
export const connectedWalletValue = "__connected__";
export const walletNotFoundValue = "__not_found__";
export const favWalletHistoryValue = "__favs__";
const walletPathNamePrefix = "__walletPathName__:";

function decodeWalletHistoryPart(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function createWalletPathNameHistoryValue(
  filePath = "",
  walletName = "",
) {
  const path = String(filePath || "").replace(/\/+$/, "");
  const name = String(walletName || "").trim();
  if (!path || !name) return "";

  return `${walletPathNamePrefix}${encodeURIComponent(path)}:${encodeURIComponent(name)}`;
}

export function getWalletHistoryCookie(type = "evm") {
  return `${walletHistoryCookiePrefix}${type}`;
}

export function readWalletHistoryStorage(type = "evm") {
  if (typeof window == "undefined") return "";

  try {
    return (
      window.localStorage.getItem(`${walletHistoryStoragePrefix}${type}`) || ""
    );
  } catch {
    return "";
  }
}

export function writeWalletHistoryStorage(type = "evm", value = "") {
  if (typeof window == "undefined") return;

  try {
    const key = `${walletHistoryStoragePrefix}${type}`;
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {}
}

export function parseWalletHistoryCookie(value = "") {
  return parseSelectionOrder(value).slice(0, walletHistoryCap);
}

export function parseWalletHistoryValue(value = "") {
  const text = String(value || "");

  if (text == favWalletHistoryValue) return { type: "favs", value: "" };
  if (text == "all") return { type: "all", value: text };
  if (text == connectedWalletValue) {
    return { type: "connected", value: text };
  }
  if (text == walletNotFoundValue) {
    return { type: "notFound", value: "" };
  }
  if (text.startsWith(`${walletNotFoundValue}:`)) {
    return {
      type: "notFound",
      value: text.slice(walletNotFoundValue.length + 1).replace(/\/+$/, ""),
    };
  }
  if (text.startsWith("__walletName__:")) {
    return {
      type: "walletName",
      value: text.slice("__walletName__:".length),
    };
  }
  if (text.startsWith(walletPathNamePrefix)) {
    const payload = text.slice(walletPathNamePrefix.length);
    const separatorIndex = payload.indexOf(":");
    const filePath = decodeWalletHistoryPart(
      separatorIndex < 0 ? "" : payload.slice(0, separatorIndex),
    ).replace(/\/+$/, "");
    const walletName = decodeWalletHistoryPart(
      separatorIndex < 0 ? "" : payload.slice(separatorIndex + 1),
    );

    return {
      type: "walletPathName",
      value: filePath,
      filePath,
      walletName,
    };
  }
  if (text.startsWith("__address__:")) {
    return {
      type: "address",
      value: text.slice("__address__:".length),
    };
  }

  return { type: "file", value: text.replace(/\/+$/, "") };
}
