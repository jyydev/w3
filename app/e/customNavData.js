import "server-only";

import { createHash, randomUUID } from "crypto";
import { ckPrefix } from "@/sets";
import { readEditorDataFile, saveEditorDataFile } from "./editorData";

const customNavFile = "system/customNav.json";
const maxDepth = 24;
const maxEntries = 500;
const allowedScopes = new Set([`${ckPrefix ?? ""}navbarTop`]);
let mutationQueue = Promise.resolve();

function normalizeHref(value) {
  const href = String(value || "").trim();
  if (!href) return "";
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^[/?#]/.test(href)) return href;

  return `/${href.replace(/^\.\//, "")}`;
}

function normalizeCreatedAt(value) {
  const createdAt = Number(value);
  return Number.isFinite(createdAt) && createdAt > 0
    ? Math.trunc(createdAt)
    : 0;
}

function getScope(scope) {
  const value = String(scope || "");
  if (!allowedScopes.has(value)) throw new Error("invalid custom navbar scope");
  return value;
}

function getFallbackId(scope, path, item) {
  const source = JSON.stringify([
    scope,
    path,
    item?.id || "",
    item?.href || "",
    item?.label || item?.title || "",
  ]);
  return `server:file:${createHash("sha256").update(source).digest("hex").slice(0, 20)}`;
}

function cleanLinks(value, scope, depth = 0, path = "", ids = new Set()) {
  if (!Array.isArray(value) || depth > maxDepth) return [];

  return value.flatMap((item, index) => {
    if (!item || typeof item != "object" || Array.isArray(item)) return [];

    const href = normalizeHref(item.href);
    const label = String(item.label || item.title || href).trim().slice(0, 120);
    if (!href && !label) return [];

    const itemPath = path ? `${path}.${index}` : String(index);
    const storedId = String(item.id || "").trim();
    let id = storedId.startsWith("server:")
      ? storedId
      : getFallbackId(scope, itemPath, item);
    if (ids.has(id)) id = getFallbackId(scope, `${itemPath}:duplicate`, item);
    ids.add(id);

    return [
      {
        id,
        value: id,
        href: href.slice(0, 2048),
        label,
        title: String(item.title || label).trim().slice(0, 240) || label,
        createdAt: normalizeCreatedAt(item.createdAt),
        ...(href ? {} : { type: "folder" }),
        children: cleanLinks(
          item.children,
          scope,
          depth + 1,
          itemPath,
          ids,
        ),
      },
    ];
  });
}

function serializeLinks(links = []) {
  return links.map(({ id, href, label, title, createdAt, type, children }) => ({
    id,
    href,
    label,
    title,
    createdAt: normalizeCreatedAt(createdAt),
    ...(!href || type == "folder" ? { type: "folder" } : {}),
    children: serializeLinks(children),
  }));
}

function countLinks(links = []) {
  return links.reduce(
    (count, link) => count + 1 + countLinks(link.children),
    0,
  );
}

function appendChild(links, parentId, child, depth = 0) {
  let added = false;
  const next = links.map((link) => {
    if (link.id == parentId) {
      if (depth >= maxDepth) throw new Error("custom navbar nesting is too deep");
      added = true;
      return { ...link, children: [...link.children, child] };
    }

    const children = appendChild(link.children, parentId, child, depth + 1);
    if (!children.added) return link;

    added = true;
    return { ...link, children: children.links };
  });

  return { links: added ? next : links, added };
}

function removeLinkById(links, linkId) {
  let removed = false;
  const next = [];

  for (const link of links) {
    if (link.id == linkId) {
      removed = true;
      continue;
    }

    const children = removeLinkById(link.children, linkId);
    if (children.removed) removed = true;
    next.push(
      children.removed ? { ...link, children: children.links } : link,
    );
  }

  return { links: removed ? next : links, removed };
}

async function readDocument() {
  let content = "";

  try {
    ({ content } = await readEditorDataFile(customNavFile));
  } catch (error) {
    if (error?.code == "ENOENT") return { version: 1, scopes: {} };
    throw error;
  }

  const parsed = JSON.parse(String(content || "{}"));
  if (!parsed || typeof parsed != "object" || Array.isArray(parsed)) {
    throw new Error("customNav.json must contain an object");
  }
  if (
    parsed.scopes !== undefined &&
    (!parsed.scopes ||
      typeof parsed.scopes != "object" ||
      Array.isArray(parsed.scopes))
  ) {
    throw new Error("customNav.json scopes must be an object");
  }

  return {
    ...parsed,
    version: 1,
    scopes: parsed.scopes || {},
  };
}

async function writeScope(document, scope, links) {
  const scopes = { ...document.scopes };
  if (links.length) scopes[scope] = serializeLinks(links);
  else delete scopes[scope];

  const nextDocument = {
    ...document,
    version: 1,
    scopes,
  };
  await saveEditorDataFile(
    customNavFile,
    `${JSON.stringify(nextDocument, null, 2)}\n`,
  );
  return links;
}

function queueMutation(operation) {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.catch(() => {});
  return result;
}

export async function readCustomNavLinks(scope) {
  const cleanScope = getScope(scope);
  const document = await readDocument();
  return cleanLinks(document.scopes[cleanScope], cleanScope);
}

export function addCustomNavLink({
  scope,
  parentId = "",
  href = "",
  label = "",
  createdAt = 0,
}) {
  return queueMutation(async () => {
    const cleanScope = getScope(scope);
    const document = await readDocument();
    const links = cleanLinks(document.scopes[cleanScope], cleanScope);
    if (countLinks(links) >= maxEntries) {
      throw new Error("custom navbar link limit reached");
    }

    const cleanHref = normalizeHref(href).slice(0, 2048);
    const cleanLabel = String(label || cleanHref).trim().slice(0, 120);
    if (!cleanLabel) throw new Error("custom navbar title is required");

    const id = `server:${randomUUID()}`;
    const child = {
      id,
      value: id,
      href: cleanHref,
      label: cleanLabel,
      title: cleanLabel,
      createdAt: normalizeCreatedAt(createdAt),
      ...(cleanHref ? {} : { type: "folder" }),
      children: [],
    };
    const parent = String(parentId || "");
    const next = parent ? appendChild(links, parent, child) : null;
    if (parent && !next.added) throw new Error("custom navbar parent not found");

    return writeScope(document, cleanScope, parent ? next.links : [...links, child]);
  });
}

export function deleteCustomNavLink({ scope, linkId = "" }) {
  return queueMutation(async () => {
    const cleanScope = getScope(scope);
    const cleanId = String(linkId || "");
    if (!cleanId.startsWith("server:")) {
      throw new Error("invalid server custom navbar link");
    }

    const document = await readDocument();
    const links = cleanLinks(document.scopes[cleanScope], cleanScope);
    const next = removeLinkById(links, cleanId);
    if (!next.removed) throw new Error("custom navbar link not found");

    return writeScope(document, cleanScope, next.links);
  });
}
