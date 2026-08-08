import {
  normalizeEditorFilePath,
  normalizeEditorFolderPath,
} from "@/components/editorNavigation";

export const editorHomeSortModeCookie = "w3_editor_home_sort_mode";
export const editorHomeOrderCookie = "w3_editor_home_order";
export const editorHomeFavsCookie = "w3_editor_home_favs";
export const editorHistoryCookie = "w3_editor_history";
export const editorHistoryEvent = "w3_editor_history_change";

export const editorStateMaxAge = 60 * 60 * 24 * 365;
export const editorHistoryCap = 10;
const editorFolderFavoritePrefix = "editor-folder://";

function parseJson(value, fallback) {
  if (value && typeof value == "object") return value;

  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function normalizeEditorPaths(values = [], cap = 100) {
  const result = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    let file = "";
    try {
      file = normalizeEditorFilePath(String(value || ""));
    } catch {
      continue;
    }
    if (seen.has(file)) continue;
    seen.add(file);
    result.push(file);
    if (result.length >= cap) break;
  }

  return result;
}

export function getEditorFolderFavoriteKey(folder) {
  return `${editorFolderFavoritePrefix}${encodeURIComponent(
    normalizeEditorFolderPath(folder),
  )}`;
}

function normalizeEditorFavoriteKeys(values = [], cap = 100) {
  const result = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const candidate = String(value || "").trim();
    let favoriteKey = "";

    try {
      favoriteKey = candidate.startsWith(editorFolderFavoritePrefix)
        ? getEditorFolderFavoriteKey(
            decodeURIComponent(
              candidate.slice(editorFolderFavoritePrefix.length),
            ),
          )
        : normalizeEditorFilePath(candidate);
    } catch {
      continue;
    }

    if (seen.has(favoriteKey)) continue;
    seen.add(favoriteKey);
    result.push(favoriteKey);
    if (result.length >= cap) break;
  }

  return result;
}

export function parseEditorOrder(value = "") {
  const parsed = parseJson(value, {});
  if (!parsed || Array.isArray(parsed) || typeof parsed != "object") return {};

  return Object.fromEntries(
    Object.entries(parsed)
      .slice(0, 100)
      .map(([parentKey, childKeys]) => [
        String(parentKey || "").trim(),
        [
          ...new Set(
            (Array.isArray(childKeys) ? childKeys : [])
              .map((key) => String(key || "").trim())
              .filter(Boolean),
          ),
        ].slice(0, 100),
      ])
      .filter(([parentKey, childKeys]) => parentKey && childKeys.length),
  );
}

export function encodeEditorOrder(order = {}) {
  return JSON.stringify(parseEditorOrder(order));
}

export function parseEditorFavs(value = "") {
  return normalizeEditorFavoriteKeys(parseJson(value, []));
}

export function encodeEditorFavs(values = []) {
  return JSON.stringify(parseEditorFavs(values));
}

export function parseEditorHistory(value = "") {
  let parsed = parseJson(value, null);

  // Accept the older selection-order format as well as the JSON cookie format.
  if (!Array.isArray(parsed)) {
    parsed = String(value || "")
      .split("|")
      .filter(Boolean)
      .map((entry) => {
        try {
          return decodeURIComponent(entry);
        } catch {
          return entry;
        }
      });
  }

  return normalizeEditorPaths(parsed, editorHistoryCap);
}

export function encodeEditorHistory(values = []) {
  return JSON.stringify(parseEditorHistory(values));
}
