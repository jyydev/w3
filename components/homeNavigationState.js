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
  return value == "wallet" ? "wallet" : "trade";
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
