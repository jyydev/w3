export const dataTableCollapsedCookie = "w3_data_table_collapsed";
export const dataTableCollapsedCookieMaxAge = 60 * 60 * 24 * 365;

const dataTableCollapseKeys = new Set([
  "/d/aave/stake",
  "/d/aave/lend",
  "/d/spark",
  "/d/venus/flux",
  "/d/venus/lend",
]);

export function parseDataTableCollapsed(value = "") {
  try {
    const parsed = Array.isArray(value)
      ? value
      : JSON.parse(String(value || "[]"));

    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed
              .map(String)
              .filter((key) => dataTableCollapseKeys.has(key)),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

export function encodeDataTableCollapsed(values = []) {
  return JSON.stringify(parseDataTableCollapsed(Array.from(values || [])));
}
