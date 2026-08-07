"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { rememberHomeNavigationHistory } from "./homeNavigationHistoryClient";

function getExternalLinkProps(href) {
  return /^https?:\/\//i.test(String(href || ""))
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

function buildSearchEntries({
  getChildren = (node) => node?.children ?? [],
  getNodeKey = (node) => node?.homeKey || "",
  tree = [],
  homeHref = "/",
  homeLabel = "⌂ Home",
  homeTitle = "Home",
  includeHome = true,
  pathPrefix = [],
  skipNode,
} = {}) {
  const entries = [];
  if (includeHome && homeHref) {
    entries.push({
      key: `home:${homeHref}`,
      label: homeLabel,
      title: homeTitle,
      context: "navbar",
      href: homeHref,
      searchFields: ["home", homeLabel, homeTitle, homeHref],
    });
  }

  function addNode(node, parents = [], depth = 0, ancestors = new Set()) {
    if (
      !node ||
      depth > 48 ||
      ancestors.has(node) ||
      skipNode?.(node)
    ) {
      return;
    }

    const label = String(node.label || node.title || node.href || "").trim();
    const title = String(node.title || label || node.href || "").trim();
    const href = String(node.href || "").trim();
    const searchableAddress = String(
      node.address || node.walletAddress || "",
    ).trim();
    const searchablePath = String(
      node.editorFile ||
        node.editorFolder ||
        node.filePath ||
        node.fullPath ||
        "",
    ).trim();
    const context = parents.filter(Boolean).join(" > ") || "navbar";

    if (href && !node.disabled) {
      const nodeKey = String(getNodeKey(node) || "");
      entries.push({
        key: `navbar:${nodeKey || href}:${entries.length}`,
        favoriteKey: nodeKey,
        label: label || href,
        title: title || href,
        context,
        href,
        searchFields: [
          label,
          title,
          href,
          context,
          searchableAddress,
          searchablePath,
        ],
      });
    }

    const nextParents = label ? [...parents, label] : parents;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(node);
    for (const child of getChildren(node, depth) || []) {
      addNode(child, nextParents, depth + 1, nextAncestors);
    }
  }

  const initialParents = Array.from(pathPrefix || [])
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  for (const node of tree || []) addNode(node, initialParents);
  return entries;
}

function getSearchMatches(entries = [], query = "") {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];

  return entries
    .map((entry, index) => {
      const fields = (entry.searchFields || [
        entry.label,
        entry.walletName,
        entry.title,
        entry.href,
        entry.context,
        entry.address,
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

export default function HomeNavigationSearch({
  emptyLabel = "no navbar link matches",
  entries: providedEntries,
  getDirectEntry,
  tree = [],
  homeHref = "/",
  homeLabel = "⌂ Home",
  homeTitle = "Home",
  includeHome = true,
  placeholder = "navbar link or title",
  searchLabel = "search all navbar links and titles",
  submitLabel = "search navbar",
}) {
  const router = useRouter();
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const entries = useMemo(
    () => [
      ...buildSearchEntries({
        homeHref,
        homeLabel,
        homeTitle,
        includeHome,
        tree: [],
      }),
      ...(providedEntries === undefined
        ? buildSearchEntries({ tree, includeHome: false })
        : Array.from(providedEntries || [])),
    ],
    [
      homeHref,
      homeLabel,
      homeTitle,
      includeHome,
      providedEntries,
      tree,
    ],
  );
  const matches = useMemo(
    () => getSearchMatches(entries, query),
    [entries, query],
  );
  const directEntry = useMemo(
    () => getDirectEntry?.(query) || null,
    [getDirectEntry, query],
  );
  const results = matches.length
    ? matches
    : directEntry
      ? [directEntry]
      : [];
  const showResults = resultsOpen && !!query.trim();

  function submitSearch(event) {
    event.preventDefault();
    const result = results[0];
    const href = result?.href;
    if (!href) return;

    const label = String(
      result.label || result.walletName || result.title || href,
    );
    rememberHomeNavigationHistory({
      ...result,
      label,
      title: result.title || label || href,
    });

    if (/^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    if (/^(?:mailto:|tel:)/i.test(href)) {
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
          aria-controls={resultsId}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
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
        <span id={resultsId} className="homeWalletSearchResults">
          {results.length ? (
            results.map((entry, index) => {
              const label = String(
                entry.label ||
                  entry.walletName ||
                  entry.title ||
                  entry.href ||
                  "result",
              );
              const detail = entry.address || entry.href || "-";

              return (
                <Link
                  key={entry.key || `${entry.href}:${index}`}
                  href={entry.href}
                  className="homeWalletSearchResult"
                  data-history-label={label}
                  data-history-title={entry.title || label}
                  data-history-context={entry.context}
                  title={[entry.title || label, entry.context, detail]
                    .filter(Boolean)
                    .join(" | ")}
                  {...getExternalLinkProps(entry.href)}
                >
                  <span className="homeWalletSearchName">{label}</span>
                  <span className="homeWalletSearchContext">
                    {entry.context}
                  </span>
                  <span className="homeWalletSearchAddress">{detail}</span>
                </Link>
              );
            })
          ) : (
            <span className="homeWalletSearchEmpty">{emptyLabel}</span>
          )}
        </span>
      )}
    </form>
  );
}

export { buildSearchEntries, getSearchMatches };
