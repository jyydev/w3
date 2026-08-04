"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { setCookie } from "cookies-next";
import {
  readLocalNavFavs,
  saveLocalNavFavs,
} from "@/app/_editorData/browserEditorStorage";
import HoverMenu from "./HoverMenu";
import {
  NavbarSortableRow,
  useNavbarTreeSorting,
} from "./NavbarTreeSorting";

const cookieMaxAge = 365 * 24 * 60 * 60;

function getLinkEntry(item) {
  if (item && typeof item == "object" && !Array.isArray(item)) {
    const href = item.href ? String(item.href) : "";

    return {
      type: item.type || (!href && !item.children?.length ? "section" : ""),
      value: String(item.value || href || item.label || ""),
      href,
      label: String(item.label || href),
      title: String(item.title || href),
      disabled: !!item.disabled,
      children: (Array.isArray(item.children) ? item.children : []).map(
        getLinkEntry,
      ),
    };
  }

  const isPair = Array.isArray(item);
  const href = isPair ? item[0] : item;
  const label = isPair ? item[1] : item;

  if (!href) {
    return { type: "section", label };
  }

  const cleanHref = String(href).startsWith("[") ? "" : String(href);

  return {
    href: cleanHref,
    label: String(label || cleanHref),
    title: cleanHref,
    children: [],
  };
}

function flattenLinkEntries(entries = []) {
  return entries.flatMap((entry) => [
    entry,
    ...flattenLinkEntries(entry.children || []),
  ]);
}

function normalizeFavs(favs = [], validHrefM = new Map()) {
  const seen = new Set();

  return favs
    .map((fav) => validHrefM.get(fav?.href))
    .filter(Boolean)
    .filter((fav) => {
      if (seen.has(fav.href)) return false;
      seen.add(fav.href);

      return true;
    });
}

function encodeFavs(favs) {
  return JSON.stringify(
    favs.map(({ href, label, title }) => ({ href, label, title })),
  );
}

function FavButton({ active, onClick }) {
  return (
    <button
      type="button"
      className={`navFavBtn ${active ? "active" : ""}`}
      title={active ? "remove fav" : "add fav"}
      aria-label={active ? "remove favorite" : "add favorite"}
      onClick={onClick}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

function NavbarLinkNode({
  entry,
  siblings,
  sorting,
  favHrefM,
  onToggleFav,
  favoritesEnabled,
}) {
  if (entry.type == "section") {
    return (
      <NavbarSortableRow
        entry={entry}
        siblings={siblings}
        sorting={sorting}
      >
        <div className="section">{entry.label}</div>
      </NavbarSortableRow>
    );
  }

  const hasChildren = !!entry.children?.length;
  const canNavigate = !!entry.href && !entry.disabled;
  const fav = canNavigate
    ? {
        href: entry.href,
        label: entry.label,
        title: entry.title || entry.href,
      }
    : null;
  const content = canNavigate ? (
    <Link
      href={entry.href}
      title={entry.title}
      className={hasChildren ? "navigationMenuTrigger" : ""}
    >
      {entry.label}
    </Link>
  ) : (
    <span className={hasChildren ? "navigationMenuTrigger" : ""}>
      {entry.label}
    </span>
  );
  const favButton = favoritesEnabled && fav ? (
    <FavButton
      active={favHrefM.has(fav.href)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleFav(fav);
      }}
    />
  ) : null;

  if (!hasChildren) {
    return (
      <NavbarSortableRow
        entry={entry}
        siblings={siblings}
        sorting={sorting}
      >
        <div className="navMenuRow navLeafRow">
          {content}
          {favButton}
        </div>
      </NavbarSortableRow>
    );
  }

  return (
    <NavbarSortableRow
      entry={entry}
      siblings={siblings}
      sorting={sorting}
    >
      <HoverMenu className="navSubmenu">
        <div className="navMenuRow">
          {content}
          {favButton}
          <span className="navigationMenuTrigger navSubmenuCaret">{">"}</span>
        </div>
        <div className="navigationMenuPanel navSubmenuContent">
          {entry.children.map((child) => (
            <NavbarLinkNode
              key={child.navbarSortKey}
              entry={child}
              siblings={entry.children}
              sorting={sorting}
              favHrefM={favHrefM}
              onToggleFav={onToggleFav}
              favoritesEnabled={favoritesEnabled}
            />
          ))}
        </div>
      </HoverMenu>
    </NavbarSortableRow>
  );
}

function NavbarLinkMenu({
  title,
  titleHref = "",
  items = [],
  cookieName,
  initialFavs = [],
  orderScope = cookieName,
  initialOrderM = {},
}) {
  const entries = useMemo(() => items.map(getLinkEntry), [items]);
  const favoritesEnabled = !!cookieName;
  const { orderedEntries, sorting } = useNavbarTreeSorting({
    entries,
    scope: orderScope || title || "links",
    initialOrderM,
  });
  const validFavs = useMemo(
    () =>
      flattenLinkEntries(orderedEntries).filter(
        (entry) => entry.href && !entry.disabled,
      ),
    [orderedEntries],
  );
  const validHrefM = useMemo(
    () => new Map(validFavs.map((fav) => [fav.href, fav])),
    [validFavs],
  );
  const [favs, setFavs] = useState(initialFavs);
  const [dragHref, setDragHref] = useState("");
  const [dropSpot, setDropSpot] = useState(null);
  const visibleFavs = favoritesEnabled
    ? normalizeFavs(favs, validHrefM)
    : [];
  const favHrefM = new Map(visibleFavs.map((fav) => [fav.href, fav]));

  useEffect(() => {
    if (!favoritesEnabled) {
      setFavs([]);
      return;
    }

    const localFavs = readLocalNavFavs(cookieName);
    setFavs(localFavs === null ? initialFavs : localFavs);
  }, [cookieName, favoritesEnabled, initialFavs]);

  function saveFavs(nextFavs) {
    if (!favoritesEnabled) return;

    saveLocalNavFavs(cookieName, nextFavs);
    setCookie(cookieName, encodeFavs(nextFavs), {
      maxAge: cookieMaxAge,
      path: "/",
    });
  }

  function toggleFav(fav) {
    const clean = normalizeFavs(favs, validHrefM);
    const next = clean.some((entry) => entry.href == fav.href)
      ? clean.filter((entry) => entry.href != fav.href)
      : [...clean, fav];

    setFavs(next);
    saveFavs(next);
  }

  function moveFav(dragHref, targetHref, placeAfter) {
    if (!dragHref || !targetHref || dragHref == targetHref) return;

    const clean = normalizeFavs(favs, validHrefM);
    const dragged = clean.find((fav) => fav.href == dragHref);
    const targetIndex = clean.findIndex((fav) => fav.href == targetHref);
    if (!dragged || targetIndex < 0) return;

    const withoutDragged = clean.filter((fav) => fav.href != dragHref);
    const nextTargetIndex = withoutDragged.findIndex(
      (fav) => fav.href == targetHref,
    );
    if (nextTargetIndex < 0) return;

    const insertIndex = nextTargetIndex + (placeAfter ? 1 : 0);
    const next = [
      ...withoutDragged.slice(0, insertIndex),
      dragged,
      ...withoutDragged.slice(insertIndex),
    ];

    setFavs(next);
    saveFavs(next);
  }

  function updateDropSpot(href, placeAfter) {
    setDropSpot((prev) =>
      prev?.href == href && prev?.placeAfter == placeAfter
        ? prev
        : { href, placeAfter },
    );
  }

  function renderQuickFav(fav) {
    const hasChildren = !!fav.children?.length;
    const isDropSpot = dropSpot?.href == fav.href;
    const dropClass = isDropSpot
      ? dropSpot.placeAfter
        ? " dropAfter"
        : " dropBefore"
      : "";

    return (
      <HoverMenu
        className={`navQuickFav${hasChildren ? " hasChildren" : ""}${
          dragHref == fav.href ? " dragging" : ""
        }${dropClass}`}
        disabled={!hasChildren}
        key={fav.href}
      >
        <span
          className="navQuickFavTrigger"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", fav.href);
            setDragHref(fav.href);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const rect = e.currentTarget.getBoundingClientRect();
            updateDropSpot(fav.href, e.clientX > rect.left + rect.width / 2);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setDropSpot((prev) =>
                prev?.href == fav.href ? null : prev,
              );
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const placeAfter = e.clientX > rect.left + rect.width / 2;
            moveFav(e.dataTransfer.getData("text/plain"), fav.href, placeAfter);
            setDragHref("");
            setDropSpot(null);
          }}
          onDragEnd={() => {
            setDragHref("");
            setDropSpot(null);
          }}
        >
          <Link
            href={fav.href}
            title={fav.title}
            className={`navQuickFavLink${
              hasChildren ? " navigationMenuTrigger" : ""
            }`}
          >
            {fav.label}
          </Link>
          {hasChildren && (
            <button
              type="button"
              className="navigationMenuTrigger navQuickFavToggle"
              aria-label={`${fav.label} options`}
              aria-haspopup="menu"
            >
              <span className="navQuickFavCaret"></span>
            </button>
          )}
          <span className="navQuickFavCard">
            <button
              type="button"
              className="navQuickUnfav"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFav(fav);
              }}
            >
              ★ unfav <span className="gray">{fav.href}</span>
            </button>
          </span>
        </span>
        {hasChildren && (
          <div className="navigationMenuPanel dropdown-content navMenuTree navQuickFavMenu">
            {fav.children.map((child) => (
              <NavbarLinkNode
                key={child.navbarSortKey}
                entry={child}
                siblings={fav.children}
                sorting={sorting}
                favHrefM={favHrefM}
                onToggleFav={toggleFav}
                favoritesEnabled={favoritesEnabled}
              />
            ))}
          </div>
        )}
      </HoverMenu>
    );
  }

  return (
    <div className="walletNavGroup">
      <HoverMenu className={title ? "dropdown title" : "dropdown"}>
        {titleHref ? (
          <Link
            className="navigationMenuTrigger dropbtn navTitleLink"
            href={titleHref}
          >
            {title}
            <i className="custom-caret"></i>
          </Link>
        ) : (
          <button className="navigationMenuTrigger dropbtn">
            {title}
            <i className="custom-caret"></i>
          </button>
        )}
        <div className="navigationMenuPanel dropdown-content navMenuTree">
          {orderedEntries.map((entry) => (
            <NavbarLinkNode
              key={entry.navbarSortKey}
              entry={entry}
              siblings={orderedEntries}
              sorting={sorting}
              favHrefM={favHrefM}
              onToggleFav={toggleFav}
              favoritesEnabled={favoritesEnabled}
            />
          ))}
        </div>
      </HoverMenu>
      {!!visibleFavs.length && (
        <div className="navQuickFavs">{visibleFavs.map(renderQuickFav)}</div>
      )}
    </div>
  );
}

export default NavbarLinkMenu;
