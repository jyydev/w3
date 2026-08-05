"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { ckPrefix } from "@/sets";

const storagePrefix = `${ckPrefix ?? ""}navHidden:`;
const emptyHiddenKeys = new Set();
const NavbarVisibilityContext = createContext(null);

function readHiddenKeys(storageKey) {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return new Set(
      (Array.isArray(value) ? value : []).map(String).filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

function saveHiddenKeys(storageKey, hiddenKeys) {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify([...hiddenKeys]),
    );
  } catch {}
}

function getNavbarVisibilityKey(scope, entry) {
  return [
    scope,
    entry.navbarSortParentPath || "root",
    entry.navbarSortKey ||
      entry.navbarSortId ||
      entry.value ||
      entry.href ||
      entry.label,
  ].join(":");
}

function VisibilityIcon({ crossed = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {crossed && (
        <path
          d="M4 4l16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function useNavbarVisibility(scope) {
  const storageKey = `${storagePrefix}${scope}`;
  const [hiddenKeys, setHiddenKeys] = useState(emptyHiddenKeys);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    setHiddenKeys(readHiddenKeys(storageKey));
    setShowHidden(false);

    function syncHiddenKeys(event) {
      if (event.key == storageKey) {
        setHiddenKeys(readHiddenKeys(storageKey));
      }
    }

    window.addEventListener("storage", syncHiddenKeys);
    return () => window.removeEventListener("storage", syncHiddenKeys);
  }, [storageKey]);

  function toggleHidden(key) {
    if (!key) return;

    setHiddenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveHiddenKeys(storageKey, next);
      return next;
    });
  }

  function resetHidden() {
    const next = new Set();
    setHiddenKeys(next);
    setShowHidden(false);
    saveHiddenKeys(storageKey, next);
  }

  return {
    hiddenKeys,
    hiddenCount: hiddenKeys.size,
    showHidden,
    setShowHidden,
    toggleHidden,
    resetHidden,
  };
}

function NavbarVisibilityProvider({ visibility, children }) {
  return (
    <NavbarVisibilityContext.Provider value={visibility}>
      {children}
    </NavbarVisibilityContext.Provider>
  );
}

function useNavbarVisibilityContext() {
  return useContext(NavbarVisibilityContext);
}

function NavbarHideButton({ hidden = false, label, onClick, className = "" }) {
  const action = hidden ? "show" : "hide";

  return (
    <button
      type="button"
      className={`navHideBtn${hidden ? " active" : ""}${
        className ? ` ${className}` : ""
      }`}
      title={`${action} ${label}`}
      aria-label={`${action} ${label}`}
      onClick={onClick}
    >
      <VisibilityIcon crossed={!hidden} />
    </button>
  );
}

function NavbarVisibilityToggle({ visibility }) {
  const {
    hiddenCount,
    showHidden,
    setShowHidden,
    resetHidden,
  } = visibility;

  return (
    <span className="navHiddenToggle">
      <button
        type="button"
        className={`navHiddenToggleButton${showHidden ? " active" : ""}`}
        title={showHidden ? "hide hidden links" : "show hidden links"}
        aria-label={showHidden ? "hide hidden links" : "show hidden links"}
        aria-pressed={showHidden}
        onClick={() => setShowHidden((current) => !current)}
      >
        <VisibilityIcon crossed={showHidden} />
      </button>
      <span className="navQuickFavCard navHiddenResetCard">
        <button
          type="button"
          className="navHiddenResetButton"
          disabled={!hiddenCount}
          onClick={resetHidden}
        >
          reset hiding
        </button>
      </span>
    </span>
  );
}

export {
  NavbarHideButton,
  NavbarVisibilityProvider,
  NavbarVisibilityToggle,
  getNavbarVisibilityKey,
  useNavbarVisibility,
  useNavbarVisibilityContext,
};
