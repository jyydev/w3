"use client";

import { useEffect, useState } from "react";
import { ckPrefix } from "@/sets";
import NavbarLinkMenu from "./NavbarLinkMenu";
import SortableNavbarItems from "./SortableNavbarItems";
import {
  NavbarVisibilityProvider,
  NavbarVisibilityToggle,
  useNavbarVisibility,
} from "./navbarVisibility";

const storagePrefix = `${ckPrefix ?? ""}navCustomLinks:`;
const favoriteCookiePrefix = `${ckPrefix ?? ""}navCustomFav_`;
const customLinksChangeEvent = `${ckPrefix ?? ""}navbarCustomLinksChange`;

function createLinkId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeHref(value) {
  const href = String(value || "").trim();
  if (!href) return "";
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^[/?#]/.test(href)) return href;

  return `/${href.replace(/^\.\//, "")}`;
}

function cleanLinks(value, depth = 0, ids = new Set()) {
  if (!Array.isArray(value) || depth > 24) return [];

  return value.flatMap((item) => {
    if (!item || typeof item != "object") return [];

    const href = normalizeHref(item.href);
    if (!href) return [];

    let id = String(item.id || "");
    while (!id || ids.has(id)) id = createLinkId();
    ids.add(id);

    const label = String(item.label || item.title || href).trim() || href;

    return [
      {
        id,
        value: id,
        href,
        label,
        title: String(item.title || label),
        children: cleanLinks(item.children, depth + 1, ids),
      },
    ];
  });
}

function readLinks(storageKey) {
  try {
    const value = window.localStorage.getItem(storageKey);
    return value === null ? [] : cleanLinks(JSON.parse(value));
  } catch {
    return [];
  }
}

function saveLinks(storageKey, links) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(links));
    const notify = () =>
      window.dispatchEvent(
        new CustomEvent(customLinksChangeEvent, {
          detail: { storageKey },
        }),
      );
    if (typeof queueMicrotask == "function") queueMicrotask(notify);
    else window.setTimeout(notify, 0);
  } catch {}
}

function appendChild(links, parentId, child) {
  let added = false;
  const next = links.map((link) => {
    if (link.id == parentId) {
      added = true;
      return { ...link, children: [...link.children, child] };
    }

    const children = appendChild(link.children, parentId, child);
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

function promptForLink() {
  const linkInput = String(window.prompt("Link") ?? "").trim();
  const href = normalizeHref(linkInput);
  if (!href) return null;

  const suggestedTitle = linkInput.replace(/^\/(?!\/)/, "") || href;
  const title = window.prompt("Link title", suggestedTitle);
  if (title === null) return null;

  const label = title.trim() || suggestedTitle;
  const id = createLinkId();

  return {
    id,
    value: id,
    href,
    label,
    title: label,
    children: [],
  };
}

function useNavbarCustomLinks(scope) {
  const storageKey = `${storagePrefix}${scope}`;
  const [links, setLinks] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    setLinks(readLinks(storageKey));
    setReady(true);

    function syncLinks(event) {
      if (event.key == storageKey) setLinks(readLinks(storageKey));
    }

    function syncCurrentTabLinks(event) {
      if (event.detail?.storageKey == storageKey) {
        setLinks(readLinks(storageKey));
      }
    }

    window.addEventListener("storage", syncLinks);
    window.addEventListener(customLinksChangeEvent, syncCurrentTabLinks);
    return () => {
      window.removeEventListener("storage", syncLinks);
      window.removeEventListener(customLinksChangeEvent, syncCurrentTabLinks);
    };
  }, [storageKey]);

  function addLink(parentId = "") {
    const link = promptForLink();
    if (!link) return;

    setLinks((current) => {
      const next = parentId
        ? appendChild(current, parentId, link).links
        : [...current, link];
      saveLinks(storageKey, next);
      return next;
    });
  }

  function removeLink(linkId) {
    setLinks((current) => {
      const next = removeLinkById(current, linkId);
      if (!next.removed) return current;

      saveLinks(storageKey, next.links);
      return next.links;
    });
  }

  return { links, ready, addLink, removeLink };
}

export { useNavbarCustomLinks };

function NavbarAddButton({ onClick }) {
  return (
    <button
      type="button"
      className="navbarAddButton"
      title="add navbar link"
      aria-label="add navbar link"
      onClick={onClick}
    >
      <span aria-hidden="true">+</span>
    </button>
  );
}

export default function NavbarCustomLinks({
  scope,
  initialOrderM = {},
  children,
}) {
  const { links, addLink, removeLink } = useNavbarCustomLinks(scope);
  const visibility = useNavbarVisibility(scope);

  return (
    <NavbarVisibilityProvider visibility={visibility}>
      <NavbarVisibilityToggle visibility={visibility} />
      <SortableNavbarItems
        scope={scope}
        initialOrderM={initialOrderM}
        firstItemFixed
        visibility={visibility}
      >
        {children}
        {links.map((link) => {
          const titleVisibilityKey = `top:custom:${link.id}`;

          return (
            <NavbarLinkMenu
              key={`custom:${link.id}`}
              title={link.label}
              titleHref={link.href}
              items={link.children}
              cookieName={`${favoriteCookiePrefix}${link.id}`}
              addChildParentId={link.id}
              onAddChild={addLink}
              onRemoveItem={removeLink}
              onRemoveTitle={() => removeLink(link.id)}
              titleVisibilityKey={titleVisibilityKey}
            />
          );
        })}
      </SortableNavbarItems>
      <NavbarAddButton onClick={() => addLink()} />
    </NavbarVisibilityProvider>
  );
}
