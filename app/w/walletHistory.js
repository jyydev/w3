import { parseSelectionOrder } from "@/fn/selectionOrder";
import { ckPrefix } from "@/sets";

const walletHistoryCookiePrefix = `${ckPrefix ?? ""}walletHistory_`;

export const walletHistoryCap = 10;
export const connectedWalletValue = "__connected__";
export const walletNotFoundValue = "__not_found__";
export const favWalletHistoryValue = "__favs__";

export function getWalletHistoryCookie(type = "evm") {
  return `${walletHistoryCookiePrefix}${type}`;
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
  if (text.startsWith("__address__:")) {
    return {
      type: "address",
      value: text.slice("__address__:".length),
    };
  }

  return { type: "file", value: text.replace(/\/+$/, "") };
}
