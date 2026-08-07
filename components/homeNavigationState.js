export const homeCollapsedCookieM = {
  data: "w3_home_data_collapsed",
  wallet: "w3_home_wallet_collapsed",
  ref: "w3_home_ref_collapsed",
};
export const homeWalletModeCookie = "w3_home_wallet_mode";
export const homeWalletSortModeCookie = "w3_home_wallet_sort_mode";
export const homeWalletOrderCookie = "w3_home_wallet_order";
export const homeWalletFavsCookie = "w3_home_wallet_favs";
export const homeSectionOrderCookie = "w3_home_section_order";
export const homeNavigationCollapsedCookie =
  "w3_home_navigation_collapsed";
export const homeNavigationOrderCookie = "w3_home_navigation_order";
export const homeNavigationFavsCookie = "w3_home_navigation_favs";
export const homeNavigationHistoryCookie = "w3_home_navigation_history";
export const homeNavigationHistoryEvent =
  "w3-home-navigation-history-change";

export const homeNavigationHistoryCap = 10;
const homeNavigationHistoryCookieMaxLength = 3200;

export const homeNavigationCookieMaxAge = 60 * 60 * 24 * 365;
export const defaultHomeSectionOrder = ["data", "wallet", "ref"];

export function parseHomeCollapsedKeys(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(String).filter(Boolean))];
  }

  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed)
      ? [...new Set(parsed.map(String).filter(Boolean))]
      : [];
  } catch {
    return [];
  }
}

export function encodeHomeCollapsedKeys(values) {
  return JSON.stringify([...new Set(Array.from(values || []).filter(Boolean))]);
}

export function parseHomeSectionOrder(value = "") {
  try {
    const parsed = Array.isArray(value)
      ? value
      : JSON.parse(String(value || "[]"));
    const valid = new Set(defaultHomeSectionOrder);
    const selected = Array.isArray(parsed)
      ? [...new Set(parsed.map(String).filter((section) => valid.has(section)))]
      : [];

    return [
      ...selected,
      ...defaultHomeSectionOrder.filter((section) => !selected.includes(section)),
    ];
  } catch {
    return [...defaultHomeSectionOrder];
  }
}

export function encodeHomeSectionOrder(values = []) {
  return JSON.stringify(parseHomeSectionOrder(values));
}

export function parseHomeWalletMode(value = "") {
  if (value == "all" || value == "wallet") return value;
  return "trade";
}

export function parseHomeWalletSortMode(value = "") {
  return value == "custom" ? "custom" : "default";
}

export function parseHomeWalletOrder(value = "") {
  try {
    const parsed =
      value && typeof value == "object"
        ? value
        : JSON.parse(String(value || "{}"));
    if (!parsed || Array.isArray(parsed) || typeof parsed != "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .slice(0, 100)
        .map(([parentKey, childKeys]) => [
          String(parentKey),
          Array.isArray(childKeys)
            ? [...new Set(childKeys.map(String).filter(Boolean))].slice(0, 100)
            : [],
        ])
        .filter(([parentKey, childKeys]) => parentKey && childKeys.length),
    );
  } catch {
    return {};
  }
}

export function encodeHomeWalletOrder(orderM = {}) {
  return JSON.stringify(parseHomeWalletOrder(orderM));
}

export function parseHomeWalletFavKeys(value = "") {
  try {
    const parsed = Array.isArray(value)
      ? value
      : JSON.parse(String(value || "[]"));

    return Array.isArray(parsed)
      ? [...new Set(parsed.map(String).filter(Boolean))].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}

export function encodeHomeWalletFavKeys(values = []) {
  return JSON.stringify(parseHomeWalletFavKeys(values));
}

function parseHomeHistoryJson(value) {
  if (Array.isArray(value)) return value;

  const text = String(value || "");
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try {
      const parsed = JSON.parse(decodeURIComponent(text));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

function normalizeHomeHistoryHref(value = "") {
  const href = String(value || "").trim();
  const hasControlCharacter = Array.from(href).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code == 127;
  });
  if (!href || href.length > 2048 || hasControlCharacter) {
    return "";
  }
  if (/^\/(?:[?#]|$)/.test(href)) return "";
  if (/^\/(?!\/)/.test(href)) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return "";
}

function getHomeHistoryHrefLabel(href = "") {
  try {
    const pathname = /^https?:\/\//i.test(href)
      ? new URL(href).pathname
      : href.split(/[?#]/, 1)[0];
    return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) || href);
  } catch {
    return href;
  }
}

export function normalizeHomeNavigationHistoryEntry(value) {
  const entry = value && typeof value == "object" ? value : { href: value };
  const href = normalizeHomeHistoryHref(entry.href);
  if (!href) return null;

  const label = String(entry.label || getHomeHistoryHrefLabel(href) || href)
    .trim()
    .slice(0, 100);
  const title = String(entry.title || label || href).trim().slice(0, 240);
  const context = String(entry.context || entry.historyContext || "")
    .trim()
    .slice(0, 240);

  return {
    href,
    label: label || href,
    title: title || href,
    ...(context ? { context } : {}),
  };
}

export function parseHomeNavigationHistory(value = "") {
  const result = [];
  const seen = new Set();

  for (const valueEntry of parseHomeHistoryJson(value)) {
    const entry = normalizeHomeNavigationHistoryEntry(valueEntry);
    if (!entry || seen.has(entry.href)) continue;
    seen.add(entry.href);
    result.push(entry);
    if (result.length >= homeNavigationHistoryCap) break;
  }

  return result;
}

export function fitHomeNavigationHistory(value = []) {
  const result = [];

  for (const entry of parseHomeNavigationHistory(value)) {
    const next = [...result, entry];
    if (
      encodeURIComponent(JSON.stringify(next)).length <=
      homeNavigationHistoryCookieMaxLength
    ) {
      result.push(entry);
    }
  }

  return result;
}

export function encodeHomeNavigationHistory(value = []) {
  return JSON.stringify(fitHomeNavigationHistory(value));
}
