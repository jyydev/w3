export const selectionOrderCap = 5;

function cleanValue(value = "") {
  return String(value ?? "").trim();
}

function uniqueValues(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values || []) {
    const clean = cleanValue(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }

  return result;
}

function decodePart(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePart(value = "") {
  return encodeURIComponent(cleanValue(value));
}

export function parseSelectionOrder(value = "") {
  return uniqueValues(
    cleanValue(value)
      .split("|")
      .map((entry) => decodePart(entry)),
  );
}

export function encodeSelectionOrder(values = []) {
  return uniqueValues(values).map(encodePart).join("|");
}

export function normalizeSelectionOrder(
  values = [],
  validValues = [],
  cap = selectionOrderCap,
) {
  const validSet = validValues?.length
    ? new Set(validValues.map((value) => cleanValue(value)).filter(Boolean))
    : null;

  return uniqueValues(values)
    .filter((value) => !validSet || validSet.has(value))
    .slice(0, cap);
}

export function rememberSelectionValue(
  values = [],
  value = "",
  validValues = [],
  cap = selectionOrderCap,
) {
  const clean = cleanValue(value);
  if (!clean) return normalizeSelectionOrder(values, validValues, cap);

  return normalizeSelectionOrder(
    [clean, ...uniqueValues(values).filter((entry) => entry != clean)],
    validValues,
    cap,
  );
}

export function removeSelectionValue(values = [], value = "") {
  const clean = cleanValue(value);
  if (!clean) return uniqueValues(values);

  return uniqueValues(values).filter((entry) => entry != clean);
}

export function sortBySelectionOrder(
  values = [],
  order = [],
  getValue = (entry) => entry,
) {
  const indexM = new Map(
    uniqueValues(order).map((value, index) => [value, index]),
  );

  return [...(values || [])].sort((a, b) => {
    const aValue = cleanValue(getValue(a));
    const bValue = cleanValue(getValue(b));
    const aIndex = indexM.has(aValue) ? indexM.get(aValue) : Infinity;
    const bIndex = indexM.has(bValue) ? indexM.get(bValue) : Infinity;
    if (aIndex != bIndex) return aIndex - bIndex;

    return 0;
  });
}

export function parseGroupedSelectionOrder(value = "") {
  const groups = [];
  const seenGroups = new Set();

  for (const rawGroup of cleanValue(value).split("|")) {
    if (!rawGroup) continue;
    const separatorIndex = rawGroup.indexOf(":");
    if (separatorIndex < 0) continue;
    const group = cleanValue(decodePart(rawGroup.slice(0, separatorIndex)));
    if (!group || seenGroups.has(group)) continue;
    const items = uniqueValues(
      rawGroup
        .slice(separatorIndex + 1)
        .split(",")
        .map((entry) => decodePart(entry)),
    );
    if (!items.length) continue;

    seenGroups.add(group);
    groups.push({ group, items });
  }

  return groups;
}

export function encodeGroupedSelectionOrder(groups = []) {
  return (groups || [])
    .map((entry) => {
      const group = cleanValue(entry?.group);
      const items = uniqueValues(entry?.items);
      if (!group || !items.length) return "";

      return `${encodePart(group)}:${items.map(encodePart).join(",")}`;
    })
    .filter(Boolean)
    .join("|");
}

export function getGroupedSelectionItems(groups = [], group = "") {
  const cleanGroup = cleanValue(group);
  return (
    (groups || []).find((entry) => cleanValue(entry?.group) == cleanGroup)
      ?.items || []
  );
}

export function rememberGroupedSelectionValue(
  groups = [],
  group = "",
  value = "",
  {
    validGroups = [],
    validValues = [],
    groupCap = selectionOrderCap,
    itemCap = selectionOrderCap,
  } = {},
) {
  const cleanGroup = cleanValue(group);
  const clean = cleanValue(value);
  const validGroupSet = validGroups?.length
    ? new Set(validGroups.map((entry) => cleanValue(entry)).filter(Boolean))
    : null;
  const validValueSet = validValues?.length
    ? new Set(validValues.map((entry) => cleanValue(entry)).filter(Boolean))
    : null;
  const next = [];
  const seenGroups = new Set();

  function pushGroup(groupName, items = []) {
    const nextGroup = cleanValue(groupName);
    if (!nextGroup || seenGroups.has(nextGroup)) return;
    if (validGroupSet && !validGroupSet.has(nextGroup)) return;
    const shouldFilterItems = validValueSet && nextGroup == cleanGroup;
    const nextItems = uniqueValues(items)
      .filter((item) => !shouldFilterItems || validValueSet.has(item))
      .slice(0, itemCap);
    if (!nextItems.length) return;

    seenGroups.add(nextGroup);
    next.push({ group: nextGroup, items: nextItems });
  }

  if (cleanGroup && clean) {
    const currentItems = getGroupedSelectionItems(groups, cleanGroup);
    pushGroup(cleanGroup, [
      clean,
      ...currentItems.filter((entry) => entry != clean),
    ]);
  }

  for (const entry of groups || []) {
    pushGroup(entry?.group, entry?.items);
  }

  return next.slice(0, groupCap);
}

export function removeGroupedSelectionValue(groups = [], group = "", value = "") {
  const cleanGroup = cleanValue(group);
  const clean = cleanValue(value);
  if (!cleanGroup || !clean) return groups || [];

  return (groups || [])
    .map((entry) => {
      const entryGroup = cleanValue(entry?.group);
      if (entryGroup != cleanGroup) return entry;

      return {
        group: entryGroup,
        items: uniqueValues(entry?.items).filter((item) => item != clean),
      };
    })
    .filter((entry) => cleanValue(entry?.group) && entry?.items?.length);
}

export function sortByGroupedSelectionOrder(
  values = [],
  groups = [],
  group = "",
  getValue = (entry) => entry,
) {
  return sortBySelectionOrder(
    values,
    getGroupedSelectionItems(groups, group),
    getValue,
  );
}
