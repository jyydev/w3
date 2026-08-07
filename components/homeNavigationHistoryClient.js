"use client";

import { deleteCookie, getCookie, setCookie } from "cookies-next";
import {
  encodeHomeNavigationHistory,
  fitHomeNavigationHistory,
  homeNavigationCookieMaxAge,
  homeNavigationHistoryCookie,
  homeNavigationHistoryEvent,
  normalizeHomeNavigationHistoryEntry,
  parseHomeNavigationHistory,
} from "./homeNavigationState";

function notifyHomeNavigationHistoryChange(history) {
  if (typeof window == "undefined") return;
  window.dispatchEvent(
    new CustomEvent(homeNavigationHistoryEvent, { detail: { history } }),
  );
}

export function getHomeNavigationHistory(initial = []) {
  if (typeof window == "undefined") {
    return parseHomeNavigationHistory(initial);
  }

  const stored = getCookie(homeNavigationHistoryCookie);
  return stored === undefined || stored === null
    ? parseHomeNavigationHistory(initial)
    : parseHomeNavigationHistory(stored);
}

export function saveHomeNavigationHistory(value = []) {
  const history = fitHomeNavigationHistory(value);

  if (history.length) {
    setCookie(
      homeNavigationHistoryCookie,
      encodeHomeNavigationHistory(history),
      { maxAge: homeNavigationCookieMaxAge, path: "/" },
    );
  } else {
    deleteCookie(homeNavigationHistoryCookie, { path: "/" });
  }

  notifyHomeNavigationHistoryChange(history);
  return history;
}

export function rememberHomeNavigationHistory(
  value,
  { preserveExistingMetadata = false } = {},
) {
  const entry = normalizeHomeNavigationHistoryEntry(value);
  if (!entry) return getHomeNavigationHistory();

  const current = getHomeNavigationHistory();
  const existing = current.find((item) => item.href == entry.href);
  const nextEntry =
    existing && preserveExistingMetadata ? existing : { ...existing, ...entry };

  return saveHomeNavigationHistory([
    nextEntry,
    ...current.filter((item) => item.href != entry.href),
  ]);
}

export function removeHomeNavigationHistory(href = "") {
  return saveHomeNavigationHistory(
    getHomeNavigationHistory().filter((entry) => entry.href != href),
  );
}
