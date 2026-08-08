"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ckPrefix } from "@/sets";
import { isLocalEditorHost } from "@/app/_editorData/browserEditorStorage";
import NavbarHoverCard from "./NavbarHoverCard";
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
const serverCustomLinksApi = "/e/custom-nav/api";

function createLinkId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeCreatedAt(value) {
  const createdAt = Number(value);
  return Number.isFinite(createdAt) && createdAt > 0
    ? Math.trunc(createdAt)
    : 0;
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
    const label = String(item.label || item.title || href).trim();
    if (!href && !label) return [];

    let id = String(item.id || "");
    while (!id || ids.has(id)) id = createLinkId();
    ids.add(id);

    return [
      {
        id,
        value: id,
        href,
        label,
        title: String(item.title || label),
        createdAt: normalizeCreatedAt(item.createdAt),
        ...(href ? {} : { type: "folder" }),
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

function hasLinkId(links, linkId) {
  return links.some(
    (link) =>
      link.id == linkId || hasLinkId(link.children || [], linkId),
  );
}

function markServerLinks(value) {
  return cleanLinks(value).map((link) => ({
    ...link,
    customNavSource: "server",
    children: markServerLinks(link.children),
  }));
}

function notifyServerLinks(scope, links, available = true) {
  const notify = () =>
    window.dispatchEvent(
      new CustomEvent(customLinksChangeEvent, {
        detail: {
          serverScope: scope,
          serverLinks: links,
          serverAvailable: available,
        },
      }),
    );
  if (typeof queueMicrotask == "function") queueMicrotask(notify);
  else window.setTimeout(notify, 0);
}

async function requestServerLinks(url, options) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "custom navbar server request failed");
  }
  return result;
}

function promptForLink() {
  const linkValue = window.prompt("Link (leave empty for folder)");
  if (linkValue === null) return null;

  const linkInput = String(linkValue).trim();
  const href = normalizeHref(linkInput);
  const suggestedTitle = linkInput.replace(/^\/(?!\/)/, "") || href;
  const title = window.prompt(
    href ? "Link title" : "Folder title",
    suggestedTitle,
  );
  if (title === null) return null;

  const label = title.trim() || suggestedTitle;
  if (!label) return null;

  const id = createLinkId();

  return {
    id,
    value: id,
    href,
    label,
    title: label,
    createdAt: Date.now(),
    ...(href ? {} : { type: "folder" }),
    children: [],
  };
}

function mergeLinksInCreationOrder(localLinks, serverLinks) {
  return [...serverLinks, ...localLinks]
    .map((link, index) => ({ link, index }))
    .sort(
      (a, b) =>
        a.link.createdAt - b.link.createdAt || a.index - b.index,
    )
    .map(({ link }) => link);
}

function useNavbarCustomLinks(scope) {
  const storageKey = `${storagePrefix}${scope}`;
  const [localLinks, setLocalLinks] = useState([]);
  const [localReady, setLocalReady] = useState(false);
  const [serverLinks, setServerLinks] = useState([]);
  const [serverReady, setServerReady] = useState(false);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const serverMutationRef = useRef(false);
  const links = useMemo(
    () => mergeLinksInCreationOrder(localLinks, serverLinks),
    [localLinks, serverLinks],
  );

  useEffect(() => {
    setLocalReady(false);
    setLocalLinks(readLinks(storageKey));
    setLocalReady(true);

    function syncLinks(event) {
      if (event.key == storageKey) setLocalLinks(readLinks(storageKey));
    }

    function syncCurrentTabLinks(event) {
      if (event.detail?.storageKey == storageKey) {
        setLocalLinks(readLinks(storageKey));
      }
      if (event.detail?.serverScope == scope) {
        setServerLinks(markServerLinks(event.detail.serverLinks));
        setServerAvailable(event.detail.serverAvailable === true);
        setServerReady(true);
      }
    }

    window.addEventListener("storage", syncLinks);
    window.addEventListener(customLinksChangeEvent, syncCurrentTabLinks);
    return () => {
      window.removeEventListener("storage", syncLinks);
      window.removeEventListener(customLinksChangeEvent, syncCurrentTabLinks);
    };
  }, [scope, storageKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setServerLinks([]);
    setServerAvailable(false);
    setServerReady(false);

    if (!isLocalEditorHost(window.location.hostname)) {
      setServerReady(true);
      return () => controller.abort();
    }

    requestServerLinks(
      `${serverCustomLinksApi}?scope=${encodeURIComponent(scope)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!active) return;
        setServerLinks(markServerLinks(result.links));
        setServerAvailable(result.available === true);
      })
      .catch((error) => {
        if (!active || error?.name == "AbortError") return;
        setServerLinks([]);
        setServerAvailable(false);
      })
      .finally(() => {
        if (active) setServerReady(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [scope]);

  function addLink(parentId = "") {
    if (parentId && hasLinkId(serverLinks, parentId)) {
      addServerLink(parentId);
      return;
    }

    const link = promptForLink();
    if (!link) return;

    setLocalLinks((current) => {
      const next = parentId
        ? appendChild(current, parentId, link).links
        : [...current, link];
      saveLinks(storageKey, next);
      return next;
    });
  }

  function removeLink(linkId) {
    if (hasLinkId(serverLinks, linkId)) {
      removeServerLink(linkId);
      return;
    }

    setLocalLinks((current) => {
      const next = removeLinkById(current, linkId);
      if (!next.removed) return current;

      saveLinks(storageKey, next.links);
      return next.links;
    });
  }

  async function addServerLink(parentId = "") {
    if (!serverAvailable || serverMutationRef.current) return;
    const link = promptForLink();
    if (!link) return;

    serverMutationRef.current = true;
    setServerBusy(true);
    try {
      const result = await requestServerLinks(serverCustomLinksApi, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          parentId,
          href: link.href,
          label: link.label,
          createdAt: link.createdAt,
        }),
      });
      const next = markServerLinks(result.links);
      setServerLinks(next);
      setServerAvailable(result.available === true);
      notifyServerLinks(scope, next, result.available === true);
      toast.success(`added ${link.label} on server`);
    } catch (error) {
      toast.error(error?.message || "server custom link failed");
    } finally {
      serverMutationRef.current = false;
      setServerBusy(false);
    }
  }

  async function removeServerLink(linkId) {
    if (!serverAvailable || serverMutationRef.current) return;

    serverMutationRef.current = true;
    setServerBusy(true);
    try {
      const result = await requestServerLinks(
        `${serverCustomLinksApi}?scope=${encodeURIComponent(scope)}&linkId=${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      );
      const next = markServerLinks(result.links);
      setServerLinks(next);
      setServerAvailable(result.available === true);
      notifyServerLinks(scope, next, result.available === true);
      toast.success("removed server custom link");
    } catch (error) {
      toast.error(error?.message || "server custom link removal failed");
    } finally {
      serverMutationRef.current = false;
      setServerBusy(false);
    }
  }

  return {
    links,
    ready: localReady && serverReady,
    addLink,
    removeLink,
    addServerLink,
    serverAvailable,
    serverBusy,
  };
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

function NavbarAddControl({
  onAddLocal,
  onAddServer,
  serverAvailable,
  serverBusy,
}) {
  if (!serverAvailable) return <NavbarAddButton onClick={onAddLocal} />;

  return (
    <NavbarHoverCard
      className="navbarAddControl"
      openClassName="navbarAddCardOpen"
      panelClassName="navbarAddServerCard"
    >
      <NavbarAddButton onClick={onAddLocal} />
      <span className="navQuickFavCard navbarAddServerCard">
        <button
          type="button"
          className="navbarAddServerButton"
          aria-label="add navbar link on server"
          disabled={serverBusy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onAddServer();
          }}
        >
          add on server
        </button>
      </span>
    </NavbarHoverCard>
  );
}

export default function NavbarCustomLinks({
  scope,
  initialOrderM = {},
  children,
}) {
  const {
    links,
    addLink,
    removeLink,
    addServerLink,
    serverAvailable,
    serverBusy,
  } = useNavbarCustomLinks(scope);
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
              customNavSource={
                link.customNavSource == "server" ? "server" : ""
              }
              titleVisibilityKey={titleVisibilityKey}
            />
          );
        })}
      </SortableNavbarItems>
      <NavbarAddControl
        onAddLocal={() => addLink()}
        onAddServer={() => addServerLink()}
        serverAvailable={serverAvailable}
        serverBusy={serverBusy}
      />
    </NavbarVisibilityProvider>
  );
}
