"use client";

import Link from "next/link";
import { deleteCookie } from "cookies-next";
import {
  navbarOrderCookiePrefix,
  navbarOrderStoragePrefix,
  navbarSortResetEvent,
} from "./navbarSorting";
import NavbarHoverCard from "./NavbarHoverCard";
import useResetConfirmation from "./useResetConfirmation";

function getCookieName(rawCookie = "") {
  const separator = rawCookie.indexOf("=");
  const name = separator < 0 ? rawCookie : rawCookie.slice(0, separator);

  try {
    return decodeURIComponent(name.trim());
  } catch {
    return name.trim();
  }
}

function resetNavbarSorting() {
  document.cookie.split(";").forEach((rawCookie) => {
    const cookieName = getCookieName(rawCookie);
    if (cookieName.startsWith(navbarOrderCookiePrefix)) {
      deleteCookie(cookieName, { path: "/" });
    }
  });
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(navbarOrderStoragePrefix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {}
  window.dispatchEvent(new Event(navbarSortResetEvent));
}

export default function NavbarHomeLink() {
  const [resetConfirmed, showResetConfirmation] = useResetConfirmation();

  return (
    <NavbarHoverCard className="navbarHomeLink navQuickFavTrigger">
      <Link href="/">⌂ Home</Link>
      <span className="navQuickFavCard">
        <button
          type="button"
          className="navQuickUnfav navResetSortingButton"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            resetNavbarSorting();
            showResetConfirmation();
          }}
        >
          reset sorting
          <span
            className={`navResetConfirmation${resetConfirmed ? " visible" : ""}`}
            aria-hidden="true"
          >
            ✓
          </span>
        </button>
      </span>
    </NavbarHoverCard>
  );
}
