"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberHomeNavigationHistory } from "./homeNavigationHistoryClient";

function getAnchorHistoryHref(anchor) {
  if (!anchor || anchor.hasAttribute("download")) return "";

  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.protocol != "http:" && url.protocol != "https:") return "";

    return url.origin == window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : url.href;
  } catch {
    return "";
  }
}

function getAnchorHistoryEntry(anchor) {
  const href = getAnchorHistoryHref(anchor);
  if (!href) return null;

  const searchLabel = anchor.querySelector(
    ".homeWalletSearchName",
  )?.textContent;
  const label = String(
    anchor.dataset.historyLabel ||
      searchLabel ||
      anchor.getAttribute("aria-label") ||
      anchor.textContent ||
      href,
  ).trim();
  const title = String(
    anchor.dataset.historyTitle ||
      anchor.getAttribute("title") ||
      label ||
      href,
  ).trim();
  const context = String(anchor.dataset.historyContext || "").trim();

  return { href, label, title, ...(context ? { context } : {}) };
}

function getRouteHistoryEntry(pathname = "/") {
  const href = `${window.location.pathname}${window.location.search}${
    window.location.hash
  }`;
  const parts = String(pathname || "/").split("/").filter(Boolean);
  let leaf = parts.at(-1) || "";
  try {
    leaf = decodeURIComponent(leaf);
  } catch {}

  const pageTitle = String(document.title || "").trim();
  const label = leaf || pageTitle || href;

  return { href, label, title: pageTitle || label || href };
}

export default function HomeNavigationHistoryTracker() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const searchText = searchParams.toString();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      rememberHomeNavigationHistory(getRouteHistoryEntry(pathname), {
        preserveExistingMetadata: true,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname, searchText]);

  useEffect(() => {
    function rememberAnchorVisit(event) {
      if (event.type == "click" && event.button != 0) return;
      if (event.type == "auxclick" && event.button != 1) return;

      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a[href]") : null;
      const entry = getAnchorHistoryEntry(anchor);
      if (entry) rememberHomeNavigationHistory(entry);
    }

    document.addEventListener("click", rememberAnchorVisit, true);
    document.addEventListener("auxclick", rememberAnchorVisit, true);
    return () => {
      document.removeEventListener("click", rememberAnchorVisit, true);
      document.removeEventListener("auxclick", rememberAnchorVisit, true);
    };
  }, []);

  return null;
}

export { getAnchorHistoryEntry };
