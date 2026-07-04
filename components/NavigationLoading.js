"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import cgb from "@/app/context";

function getRouteKey(url) {
  return `${url.pathname}${url.search}`;
}

function getCurrentRouteKey() {
  return `${window.location.pathname}${window.location.search}`;
}

function getLinkUrl(target) {
  const link = target?.closest?.("a[href]");
  if (!link) return null;
  if (link.target && link.target != "_self") return null;
  if (link.hasAttribute("download")) return null;

  const url = new URL(link.href, window.location.href);
  if (url.origin != window.location.origin) return null;

  return url;
}

function NavigationLoadingInner() {
  const { setNavigationLoading } = cgb();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [loading, setLoading] = useState(false);
  const pendingRouteRef = useRef("");
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  function clearTimers() {
    clearTimeout(showTimerRef.current);
    clearTimeout(hideTimerRef.current);
  }

  function startLoading(routeKey = "") {
    clearTimers();
    pendingRouteRef.current = routeKey;
    showTimerRef.current = setTimeout(() => setLoading(true), 120);
    hideTimerRef.current = setTimeout(() => {
      pendingRouteRef.current = "";
      setLoading(false);
    }, 15000);
  }

  useEffect(() => {
    function onClick(e) {
      if (e.defaultPrevented || e.button != 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const url = getLinkUrl(e.target);
      if (!url) return;

      const nextRoute = getRouteKey(url);
      if (nextRoute == getCurrentRouteKey()) return;

      startLoading(nextRoute);
    }

    function onPopState() {
      startLoading("");
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      clearTimers();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    setNavigationLoading?.(loading);
  }, [loading, setNavigationLoading]);

  useEffect(() => {
    const currentRoute = `${pathname}${search ? `?${search}` : ""}`;
    if (!pendingRouteRef.current || pendingRouteRef.current == currentRoute) {
      clearTimers();
      pendingRouteRef.current = "";
      setLoading(false);
    }
  }, [pathname, search]);

  return null;
}

export default function NavigationLoading() {
  return (
    <Suspense fallback={null}>
      <NavigationLoadingInner />
    </Suspense>
  );
}
