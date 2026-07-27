"use client";

import { deleteCookie, getCookie, setCookie } from "cookies-next";
import { useEffect, useRef, useState } from "react";
import {
  dataTableCollapsedCookie,
  dataTableCollapsedCookieMaxAge,
  encodeDataTableCollapsed,
  parseDataTableCollapsed,
} from "./tableCollapseState";

export default function useDataTableCollapse({
  collapseKey = "",
  initialCollapsed = false,
} = {}) {
  const enabled = !!collapseKey;
  const [collapsed, setCollapsed] = useState(
    () => enabled && !!initialCollapsed,
  );
  const mounted = useRef(false);

  useEffect(() => {
    if (!enabled || !mounted.current) {
      mounted.current = true;
      return;
    }

    const collapsedKeys = new Set(
      parseDataTableCollapsed(getCookie(dataTableCollapsedCookie)),
    );
    if (collapsed) collapsedKeys.add(collapseKey);
    else collapsedKeys.delete(collapseKey);

    if (collapsedKeys.size) {
      setCookie(
        dataTableCollapsedCookie,
        encodeDataTableCollapsed(collapsedKeys),
        {
          maxAge: dataTableCollapsedCookieMaxAge,
          path: "/",
        },
      );
    } else {
      deleteCookie(dataTableCollapsedCookie, { path: "/" });
    }
  }, [collapseKey, collapsed, enabled]);

  function toggleCollapsed() {
    if (enabled) setCollapsed((current) => !current);
  }

  return { collapsed, toggleCollapsed };
}
