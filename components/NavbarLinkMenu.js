"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { deleteEmptyEditorFolder } from "@/app/editor/editorActions";
import {
  listLocalEditorFiles,
  localEditorStorageEvent,
  readLocalNavFavs,
  saveLocalNavFavs,
  shouldUseLocalStorageEditor,
} from "@/app/_editorData/browserEditorStorage";
import { TrashIcon } from "@/components/Shared";
import HoverMenu from "./HoverMenu";
import NavbarHoverCard from "./NavbarHoverCard";
import { buildEditorNavTree } from "./editorNavigation";
import {
  NavbarSortableRow,
  useNavbarTreeSorting,
} from "./NavbarTreeSorting";
import {
  NavbarHideButton,
  getNavbarVisibilityKey,
  useNavbarVisibilityContext,
} from "./navbarVisibility";

const cookieMaxAge = 365 * 24 * 60 * 60;
const emptyFavs = [];

function cleanFavs(favs = []) {
  return (Array.isArray(favs) ? favs : [])
    .filter((fav) => fav?.href && fav?.label)
    .map((fav) => ({
      href: String(fav.href),
      label: String(fav.label),
      title: String(fav.title || fav.href),
    }));
}

function getLinkEntry(item) {
  if (item && typeof item == "object" && !Array.isArray(item)) {
    const href = item.href ? String(item.href) : "";
    const deletable =
      item.deletable?.kind == "folder" && item.deletable?.source
        ? {
            kind: "folder",
            source: String(item.deletable.source),
          }
        : null;

    return {
      id: item.id ? String(item.id) : "",
      type: item.type || (!href && !item.children?.length ? "section" : ""),
      editorFolder: item.editorFolder
        ? String(item.editorFolder)
        : "",
      deletable,
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

function getEditorBaseFiles(items = []) {
  return [
    ...new Set(
      items.flatMap((item) =>
        Array.isArray(item?.editorFiles) ? item.editorFiles : [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function getEditorBaseEmptyFolders(items = []) {
  return [
    ...new Set(
      items.flatMap((item) =>
        Array.isArray(item?.editorEmptyFolders)
          ? item.editorEmptyFolders
          : [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function hasEditorEntry(items = []) {
  return items.some((item) => Array.isArray(item?.editorFiles));
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

function getExternalLinkProps(href, custom = false) {
  return custom && /^https?:\/\//i.test(String(href || ""))
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
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

function AddLinkButton({ onClick }) {
  return (
    <div className="navMenuAddRow">
      <button
        type="button"
        className="navMenuAddButton"
        title="add child link"
        aria-label="add child link"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }}
      >
        +
      </button>
    </div>
  );
}

function NavbarLinkNode({
  entry,
  siblings,
  sorting,
  favHrefM,
  onToggleFav,
  favoritesEnabled,
  onAddChild,
  onRemoveItem,
  onDeleteEmptyFolder,
  visibility,
  visibilityScope,
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

  const visibilityKey = getNavbarVisibilityKey(visibilityScope, entry);
  const hidden =
    !!visibility?.toggleHidden && visibility.hiddenKeys.has(visibilityKey);
  if (hidden && !visibility.showHidden) return null;

  const hasChildren = !!entry.children?.length;
  const canAddChildren = !!entry.id && typeof onAddChild == "function";
  const hasSubmenu = hasChildren || canAddChildren;
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
      className={hasSubmenu ? "navigationMenuTrigger" : ""}
      {...getExternalLinkProps(entry.href, !!entry.id)}
    >
      {entry.label}
    </Link>
  ) : (
    <span
      className={`navMenuLabel${
        hasSubmenu ? " navigationMenuTrigger" : ""
      }`}
    >
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
  const trashButton =
    entry.deletable?.kind == "folder" &&
    typeof onDeleteEmptyFolder == "function" ? (
      <button
        type="button"
        className="navTrashBtn"
        title="delete empty folder"
        aria-label={`delete empty folder ${entry.label}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDeleteEmptyFolder(entry);
        }}
      >
        <TrashIcon />
      </button>
    ) : entry.id && typeof onRemoveItem == "function" ? (
      <button
        type="button"
        className="navTrashBtn"
        title="remove link"
        aria-label={`remove ${entry.label}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!window.confirm(`Remove "${entry.label}"?`)) return;
          onRemoveItem(entry);
        }}
      >
        <TrashIcon />
      </button>
    ) : null;
  const hideButton = visibility?.toggleHidden ? (
    <NavbarHideButton
      hidden={hidden}
      label={entry.label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        visibility.toggleHidden(visibilityKey);
      }}
    />
  ) : null;

  if (!hasSubmenu) {
    return (
      <NavbarSortableRow
        entry={entry}
        siblings={siblings}
        sorting={sorting}
      >
        <div
          className={`navMenuRow navLeafRow${hidden ? " navItemHidden" : ""}`}
        >
          {content}
          {favButton}
          {hideButton}
          {trashButton}
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
        <div className={`navMenuRow${hidden ? " navItemHidden" : ""}`}>
          {content}
          {favButton}
          {hideButton}
          {trashButton}
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
              onAddChild={onAddChild}
              onRemoveItem={onRemoveItem}
              onDeleteEmptyFolder={onDeleteEmptyFolder}
              visibility={visibility}
              visibilityScope={visibilityScope}
            />
          ))}
          {canAddChildren && (
            <AddLinkButton onClick={() => onAddChild(entry.id)} />
          )}
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
  initialFavs = emptyFavs,
  orderScope = cookieName,
  initialOrderM = {},
  addChildParentId = "",
  onAddChild,
  onRemoveItem,
  onRemoveTitle,
  titleVisibilityKey = "",
}) {
  const router = useRouter();
  const visibility = useNavbarVisibilityContext();
  const editorBaseFilesText = JSON.stringify(getEditorBaseFiles(items));
  const editorBaseEmptyFoldersText = JSON.stringify(
    getEditorBaseEmptyFolders(items),
  );
  const editorEmptyFolders = useMemo(
    () => JSON.parse(editorBaseEmptyFoldersText),
    [editorBaseEmptyFoldersText],
  );
  const editorEnabled = hasEditorEntry(items);
  const [editorFiles, setEditorFiles] = useState(() =>
    JSON.parse(editorBaseFilesText),
  );
  const resolvedItems = useMemo(
    () =>
      items.map((item) =>
        Array.isArray(item?.editorFiles)
          ? {
              ...item,
              children: buildEditorNavTree(
                editorFiles,
                editorEmptyFolders,
              ),
            }
          : item,
      ),
    [editorEmptyFolders, editorFiles, items],
  );
  const entries = useMemo(
    () => resolvedItems.map(getLinkEntry),
    [resolvedItems],
  );
  const favoritesEnabled = !!cookieName;
  const visibilityScope = `menu:${cookieName || orderScope || titleHref || title || "links"}`;
  const initialFavsText = JSON.stringify(cleanFavs(initialFavs));
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
  const [favs, setFavs] = useState(() => cleanFavs(initialFavs));
  const [dragHref, setDragHref] = useState("");
  const [dropSpot, setDropSpot] = useState(null);
  const visibleFavs = favoritesEnabled
    ? normalizeFavs(favs, validHrefM)
    : [];
  const favHrefM = new Map(visibleFavs.map((fav) => [fav.href, fav]));

  useEffect(() => {
    if (!editorEnabled) return;

    const baseFiles = JSON.parse(editorBaseFilesText);

    function refreshEditorFiles() {
      setEditorFiles(
        shouldUseLocalStorageEditor()
          ? listLocalEditorFiles(baseFiles)
          : baseFiles,
      );
    }

    refreshEditorFiles();
    window.addEventListener(localEditorStorageEvent, refreshEditorFiles);
    window.addEventListener("storage", refreshEditorFiles);

    return () => {
      window.removeEventListener(localEditorStorageEvent, refreshEditorFiles);
      window.removeEventListener("storage", refreshEditorFiles);
    };
  }, [editorBaseFilesText, editorEnabled]);

  useEffect(() => {
    if (!favoritesEnabled) {
      setFavs([]);
      return;
    }

    const localFavs = readLocalNavFavs(cookieName);
    setFavs(
      localFavs === null ? cleanFavs(JSON.parse(initialFavsText)) : localFavs,
    );
  }, [cookieName, favoritesEnabled, initialFavsText]);

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

  function removeItem(entry) {
    const removedHrefs = new Set(
      flattenLinkEntries([entry]).map((item) => item.href).filter(Boolean),
    );
    const clean = normalizeFavs(favs, validHrefM);
    const nextFavs = clean.filter((fav) => !removedHrefs.has(fav.href));

    if (nextFavs.length != clean.length) {
      setFavs(nextFavs);
      saveFavs(nextFavs);
    }
    onRemoveItem?.(entry.id);
  }

  async function deleteEditorFolder(entry) {
    const target = entry.deletable;
    if (target?.kind != "folder") return;

    const label = `${target.source}/`;
    if (!window.confirm(`Delete empty folder?\n\n${label}`)) return;

    try {
      if (shouldUseLocalStorageEditor()) {
        throw new Error("localStorage has no empty folder record");
      }

      const res = await deleteEmptyEditorFolder({
        folder: target.source,
      });
      if (!res.ok) throw new Error(res.msg || "delete failed");

      toast.success(`deleted ${label}`);
      router.refresh();
    } catch (error) {
      toast.error(error?.message || "delete failed");
    }
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
    const visibilityKey = getNavbarVisibilityKey(visibilityScope, fav);
    const hidden =
      !!visibility?.toggleHidden && visibility.hiddenKeys.has(visibilityKey);
    if (hidden && !visibility.showHidden) return null;

    const canAddChildren = !!fav.id && typeof onAddChild == "function";
    const hasChildren = !!fav.children?.length || canAddChildren;
    const isDropSpot = dropSpot?.href == fav.href;
    const dropClass = isDropSpot
      ? dropSpot.placeAfter
        ? " dropAfter"
        : " dropBefore"
      : "";

    return (
      <HoverMenu
        className={`navQuickFav${hasChildren ? " hasChildren" : ""}${
          hidden ? " navItemHidden" : ""
        }${
          dragHref == fav.href ? " dragging" : ""
        }${dropClass}`}
        disabled={!hasChildren}
        key={fav.href}
      >
        <NavbarHoverCard
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
            {...getExternalLinkProps(fav.href, !!fav.id)}
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
        </NavbarHoverCard>
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
                onAddChild={onAddChild}
                onRemoveItem={removeItem}
                onDeleteEmptyFolder={deleteEditorFolder}
                visibility={visibility}
                visibilityScope={visibilityScope}
              />
            ))}
            {canAddChildren && (
              <AddLinkButton onClick={() => onAddChild(fav.id)} />
            )}
          </div>
        )}
      </HoverMenu>
    );
  }

  const quickFavs = visibleFavs.map(renderQuickFav).filter(Boolean);
  const titleRemovable = typeof onRemoveTitle == "function";
  const titleHidden =
    !!titleVisibilityKey &&
    !!visibility?.toggleHidden &&
    visibility.hiddenKeys.has(titleVisibilityKey);

  const titleMenu = (
    <HoverMenu
      className={`${title ? "dropdown title" : "dropdown"}${
        titleRemovable ? " navCustomTitleMenu" : ""
      }`}
    >
      {titleHref ? (
        <Link
          className="navigationMenuTrigger dropbtn navTitleLink"
          href={titleHref}
          {...getExternalLinkProps(titleHref, titleRemovable)}
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
            onAddChild={onAddChild}
            onRemoveItem={removeItem}
            onDeleteEmptyFolder={deleteEditorFolder}
            visibility={visibility}
            visibilityScope={visibilityScope}
          />
        ))}
        {!!addChildParentId && typeof onAddChild == "function" && (
          <AddLinkButton onClick={() => onAddChild(addChildParentId)} />
        )}
      </div>
    </HoverMenu>
  );

  return (
    <div
      className={`walletNavGroup${titleRemovable ? " navCustomTitleGroup" : ""}`}
    >
      {titleRemovable && (
        <NavbarHoverCard
          className="navCustomTitleHover"
          openClassName="navCustomTitleCardOpen"
          panelClassName="navCustomTitleCard"
        >
          {titleMenu}
          <span className="navQuickFavCard navCustomTitleCard">
            <button
              type="button"
              className="navCustomTitleRemove"
              title="remove custom link"
              aria-label={`remove ${title}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!window.confirm(`Remove "${title}"?`)) return;
                onRemoveTitle();
              }}
            >
              <TrashIcon />
              <span className="gray">{titleHref}</span>
            </button>
            {!!titleVisibilityKey && visibility?.toggleHidden && (
              <NavbarHideButton
                hidden={titleHidden}
                label={title}
                className="navCustomTitleHideButton"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  visibility.toggleHidden(titleVisibilityKey);
                }}
              />
            )}
          </span>
        </NavbarHoverCard>
      )}
      {!titleRemovable && titleMenu}
      {!!quickFavs.length && (
        <div className="navQuickFavs">{quickFavs}</div>
      )}
    </div>
  );
}

export default NavbarLinkMenu;
