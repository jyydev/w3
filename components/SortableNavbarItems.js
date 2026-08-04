"use client";

import { Children, useEffect, useMemo, useState } from "react";
import { setCookie } from "cookies-next";
import {
  applyNavbarOrder,
  encodeNavbarOrder,
  getNavbarOrderCookie,
  moveNavbarEntry,
  navbarSortResetEvent,
  parseNavbarOrder,
  readLocalNavbarOrder,
  rootNavbarSortPath,
  saveLocalNavbarOrder,
} from "./navbarSorting";

const cookieMaxAge = 365 * 24 * 60 * 60;

export default function SortableNavbarItems({
  scope,
  initialOrderM = {},
  children,
}) {
  const cookieName = getNavbarOrderCookie(scope);
  const initialOrderText = JSON.stringify(initialOrderM);
  const entries = useMemo(
    () =>
      Children.toArray(children).map((child, index) => ({
        key: String(child.key ?? index),
        child,
      })),
    [children],
  );
  const [orderM, setOrderM] = useState(() =>
    parseNavbarOrder(initialOrderText),
  );
  const [dragKey, setDragKey] = useState("");
  const [dropSpot, setDropSpot] = useState(null);
  const orderedItems = useMemo(
    () => applyNavbarOrder(entries, orderM),
    [entries, orderM],
  );
  const siblingKeys = orderedItems.map((item) => item.navbarSortKey);
  const sortable = orderedItems.length > 1;

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
      setDragKey("");
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

  function moveItem(sourceKey, targetKey, placeAfter) {
    const nextOrderM = moveNavbarEntry(
      orderM,
      rootNavbarSortPath,
      siblingKeys,
      sourceKey,
      targetKey,
      placeAfter,
    );
    if (nextOrderM !== orderM) saveOrder(nextOrderM);
  }

  return orderedItems.map((item) => {
    const key = item.navbarSortKey;
    const isDropSpot = dropSpot?.key == key;
    const dropClass = isDropSpot
      ? dropSpot.placeAfter
        ? " dropAfter"
        : " dropBefore"
      : "";

    return (
      <div
        key={key}
        className={`navSortableTop${dragKey == key ? " dragging" : ""}${dropClass}`}
        draggable={sortable || undefined}
        onDragStart={(event) => {
          if (
            event.target.closest(".navMenuTree") ||
            event.target.closest(".navQuickFav") ||
            event.target.closest(".navQuickFavCard")
          ) {
            return;
          }

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", key);
          setDragKey(key);
        }}
        onDragOver={(event) => {
          if (!dragKey || dragKey == key) return;
          if (event.target.closest(".navMenuTree")) return;

          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const rect = event.currentTarget.getBoundingClientRect();
          const placeAfter = event.clientX > rect.left + rect.width / 2;
          setDropSpot((previous) =>
            previous?.key == key && previous?.placeAfter == placeAfter
              ? previous
              : { key, placeAfter },
          );
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setDropSpot((previous) =>
              previous?.key == key ? null : previous,
            );
          }
        }}
        onDrop={(event) => {
          if (!dragKey || dragKey == key) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          moveItem(
            dragKey,
            key,
            event.clientX > rect.left + rect.width / 2,
          );
          setDragKey("");
          setDropSpot(null);
        }}
        onDragEnd={() => {
          setDragKey("");
          setDropSpot(null);
        }}
      >
        {item.child}
      </div>
    );
  });
}
