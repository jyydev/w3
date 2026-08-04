"use client";

import { useEffect, useMemo, useState } from "react";
import { setCookie } from "cookies-next";
import {
  applyNavbarOrder,
  encodeNavbarOrder,
  getNavbarOrderCookie,
  moveNavbarEntry,
  navbarSortResetEvent,
  parseNavbarOrder,
  readLocalNavbarOrder,
  saveLocalNavbarOrder,
} from "./navbarSorting";

const cookieMaxAge = 365 * 24 * 60 * 60;

function useNavbarTreeSorting({
  entries,
  scope,
  initialOrderM = {},
}) {
  const cookieName = getNavbarOrderCookie(scope);
  const initialOrderText = JSON.stringify(initialOrderM);
  const [orderM, setOrderM] = useState(() =>
    parseNavbarOrder(initialOrderText),
  );
  const [dragNode, setDragNode] = useState(null);
  const [dropSpot, setDropSpot] = useState(null);
  const orderedEntries = useMemo(
    () => applyNavbarOrder(entries, orderM),
    [entries, orderM],
  );

  useEffect(() => {
    const localOrderM = readLocalNavbarOrder(cookieName);
    setOrderM(
      localOrderM === null
        ? parseNavbarOrder(initialOrderText)
        : localOrderM,
    );
  }, [cookieName, initialOrderText]);

  useEffect(() => {
    function resetSorting() {
      setOrderM({});
      setDragNode(null);
      setDropSpot(null);
    }

    window.addEventListener(navbarSortResetEvent, resetSorting);
    return () =>
      window.removeEventListener(navbarSortResetEvent, resetSorting);
  }, []);

  function saveOrder(nextOrderM) {
    setOrderM(nextOrderM);
    saveLocalNavbarOrder(cookieName, nextOrderM);
    setCookie(cookieName, encodeNavbarOrder(nextOrderM), {
      maxAge: cookieMaxAge,
      path: "/",
    });
  }

  function finishDrag() {
    setDragNode(null);
    setDropSpot(null);
  }

  return {
    orderedEntries,
    sorting: {
      dragNode,
      dropSpot,
      startDrag(entry) {
        setDragNode({
          parentPath: entry.navbarSortParentPath,
          key: entry.navbarSortKey,
        });
      },
      updateDropSpot(entry, placeAfter) {
        setDropSpot((previous) => {
          const next = {
            parentPath: entry.navbarSortParentPath,
            key: entry.navbarSortKey,
            placeAfter,
          };

          return previous?.parentPath == next.parentPath &&
            previous?.key == next.key &&
            previous?.placeAfter == next.placeAfter
            ? previous
            : next;
        });
      },
      clearDropSpot(entry) {
        setDropSpot((previous) =>
          previous?.parentPath == entry.navbarSortParentPath &&
          previous?.key == entry.navbarSortKey
            ? null
            : previous,
        );
      },
      dropOn(entry, siblingKeys, placeAfter) {
        const nextOrderM = moveNavbarEntry(
          orderM,
          entry.navbarSortParentPath,
          siblingKeys,
          dragNode?.key,
          entry.navbarSortKey,
          placeAfter,
        );
        if (nextOrderM !== orderM) saveOrder(nextOrderM);
        finishDrag();
      },
      finishDrag,
    },
  };
}

function NavbarSortableRow({
  entry,
  siblings = [],
  sorting,
  className = "",
  children,
}) {
  const siblingKeys = siblings.map((item) => item.navbarSortKey);
  const sortable = siblingKeys.length > 1;
  const dragging =
    sorting.dragNode?.parentPath == entry.navbarSortParentPath &&
    sorting.dragNode?.key == entry.navbarSortKey;
  const isDropSpot =
    sorting.dropSpot?.parentPath == entry.navbarSortParentPath &&
    sorting.dropSpot?.key == entry.navbarSortKey;
  const resolvedClassName = [
    className,
    "navSortableRow",
    sortable ? "sortable" : "",
    dragging ? "dragging" : "",
    isDropSpot
      ? sorting.dropSpot.placeAfter
        ? "dropAfter"
        : "dropBefore"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const sortProps = sortable
    ? {
        draggable: true,
        onDragStart(event) {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", entry.navbarSortKey);
          sorting.startDrag(entry);
        },
        onDragOver(event) {
          event.stopPropagation();
          if (
            !sorting.dragNode ||
            sorting.dragNode.parentPath != entry.navbarSortParentPath ||
            sorting.dragNode.key == entry.navbarSortKey
          ) {
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          sorting.updateDropSpot(
            entry,
            event.clientY > rect.top + rect.height / 2,
          );
        },
        onDragLeave(event) {
          event.stopPropagation();
          if (!event.currentTarget.contains(event.relatedTarget)) {
            sorting.clearDropSpot(entry);
          }
        },
        onDrop(event) {
          event.stopPropagation();
          if (
            !sorting.dragNode ||
            sorting.dragNode.parentPath != entry.navbarSortParentPath ||
            sorting.dragNode.key == entry.navbarSortKey
          ) {
            return;
          }

          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          sorting.dropOn(
            entry,
            siblingKeys,
            event.clientY > rect.top + rect.height / 2,
          );
        },
        onDragEnd(event) {
          event.stopPropagation();
          sorting.finishDrag();
        },
      }
    : {};

  return (
    <div className={resolvedClassName} {...sortProps}>
      {children}
    </div>
  );
}

export { NavbarSortableRow, useNavbarTreeSorting };
