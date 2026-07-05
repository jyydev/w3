"use client";

import { useEffect, useState } from "react";
import { setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ckPrefix } from "@/sets";
import { TableSortHeader } from "@/components/Shared";
import {
  clearLocalEditorData,
  localEditorStorageEvent,
  readLocalLineFileValues,
  setLocalLineFileValue,
  useLocalStorageEditor,
} from "../_editorData/browserEditorStorage";
import { clearClientRuntimeCache } from "../clientRuntimeCache";
import { clearServerRuntimeCache } from "./cacheActions";
import { clearEditorData } from "./editorClearActions";
import { toggleOffChain } from "./chainActions";
import {
  alchemyMinUsdCookie,
  disabledChainsCookie,
  showGasAutoCookie,
  sortingModeCookie,
  usdPriceQueryCookie,
  useAlchemyCookie,
} from "./walletSettingData";

const cookieMaxAge = 365 * 24 * 60 * 60;
const baseCookieClearTargets = [
  ["ALL", "ALL"],
  ["sorting", "sorting"],
];
const editorDataClearTargets = [
  ["ALL", "ALL"],
  ["coins", "coins"],
  ["cookie", "cookie"],
  ["defi", "defi"],
  ["wallets", "wallets"],
];
const runtimeCacheClearTargets = [
  ["ALL", "ALL"],
  ["client", "client"],
  ["server", "server"],
];

function encodeDisabledChains(chains) {
  return chains.join(",");
}

function getSettingSortText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function sortSettingRows(rows = [], sortKey = "", directionM = {}) {
  if (!sortKey) return rows;

  const direction = directionM[sortKey] || "asc";
  const multiplier = direction == "desc" ? -1 : 1;

  return [...rows].sort((a, b) => {
    const aValue = a?.[sortKey];
    const bValue = b?.[sortKey];
    const aNumber = Number(aValue);
    const bNumber = Number(bValue);
    const useNumber = Number.isFinite(aNumber) && Number.isFinite(bNumber);
    const sorted = useNumber
      ? aNumber - bNumber
      : getSettingSortText(aValue).localeCompare(getSettingSortText(bValue));

    return sorted * multiplier || (a.index ?? 0) - (b.index ?? 0);
  });
}

function WalletSettings({
  chains = [],
  chainSourceM = {},
  alchemyChainM = {},
  disabledChains = [],
  offChains = [],
  defaultUseAlchemy = false,
  useAlchemy = false,
  defaultAlchemyMinUsd = 0.01,
  alchemyMinUsd = 0.01,
  defaultShowGasAuto = false,
  showGasAuto = false,
  defaultUsdPriceQuery = false,
  usdPriceQuery = false,
  defaultSortingMode = "cookie",
  sortingMode = "cookie",
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("chains");
  const [useAlchemyState, setUseAlchemyState] = useState(!!useAlchemy);
  const [showGasAutoState, setShowGasAutoState] = useState(!!showGasAuto);
  const [usdPriceQueryState, setUsdPriceQueryState] = useState(!!usdPriceQuery);
  const [sortingModeState, setSortingModeState] = useState(
    sortingMode == "default" ? "default" : "cookie",
  );
  const [alchemyMinUsdDraft, setAlchemyMinUsdDraft] = useState(
    String(alchemyMinUsd),
  );
  const [cookieClearTarget, setCookieClearTarget] = useState("ALL");
  const [editorDataClearTarget, setEditorDataClearTarget] = useState("ALL");
  const [runtimeCacheClearTarget, setRuntimeCacheClearTarget] = useState("ALL");
  const [chainTableSort, setChainTableSort] = useState("");
  const [etcTableSort, setEtcTableSort] = useState("");
  const [clearingEditorData, setClearingEditorData] = useState(false);
  const [clearingRuntimeCache, setClearingRuntimeCache] = useState(false);
  const cookieTargets = ckPrefix
    ? [...baseCookieClearTargets, ["app", "app"]]
    : baseCookieClearTargets;
  const [disabledM, setDisabledM] = useState(() =>
    Object.fromEntries(disabledChains.map((chain) => [chain, true])),
  );
  const [offM, setOffM] = useState(() =>
    Object.fromEntries(offChains.map((chain) => [chain, true])),
  );
  const [useLocalEditorStore, setUseLocalEditorStore] = useState(false);
  const chainRows = sortSettingRows(
    chains.map((chain, index) => ({
      index,
      chain,
      source: getChainSource(chain),
      on: disabledM[chain] ? 0 : 1,
      server: offM[chain] ? 0 : 1,
    })),
    chainTableSort,
    {
      on: "desc",
      server: "desc",
    },
  );
  const etcRows = sortSettingRows(
    [
      {
        key: "useAlchemy",
        setting: "use Alchemy",
        on: useAlchemyState ? "on" : "off",
        default: defaultUseAlchemy ? "on" : "off",
        settingCell: "use Alchemy",
        onCell: (
          <input
            type="checkbox"
            checked={useAlchemyState}
            onChange={toggleUseAlchemy}
          />
        ),
        defaultCell: defaultUseAlchemy ? "on" : "off",
      },
      {
        key: "alchemyMinUsd",
        setting: "Alchemy min $",
        on: alchemyMinUsdDraft,
        default: defaultAlchemyMinUsd,
        settingCell: "Alchemy min $",
        onCell: (
          <input
            className="walletSettingsNumberInput"
            type="number"
            min="0"
            step="0.01"
            value={alchemyMinUsdDraft}
            onChange={(e) => setAlchemyMinUsdDraft(e.target.value)}
            onBlur={saveAlchemyMinUsd}
            onKeyDown={(e) => {
              if (e.key == "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
        ),
        defaultCell: defaultAlchemyMinUsd,
      },
      {
        key: "gasAuto",
        setting: "gas auto label",
        on: showGasAutoState ? "on" : "off",
        default: defaultShowGasAuto ? "on" : "off",
        settingCell: "gas auto label",
        onCell: (
          <input
            type="checkbox"
            checked={showGasAutoState}
            onChange={toggleShowGasAuto}
          />
        ),
        defaultCell: defaultShowGasAuto ? "on" : "off",
      },
      {
        key: "usdPriceQuery",
        setting: "USD price query",
        on: usdPriceQueryState ? "on" : "off",
        default: defaultUsdPriceQuery ? "on" : "off",
        settingCell: "USD price query",
        onCell: (
          <input
            type="checkbox"
            checked={usdPriceQueryState}
            onChange={toggleUsdPriceQuery}
          />
        ),
        defaultCell: defaultUsdPriceQuery ? "on" : "off",
      },
      {
        key: "clearCookies",
        setting: "clear cookies",
        on: cookieClearTarget,
        default: "browser",
        settingCell: (
          <span className="walletSettingName">
            clear cookies
            <span className="infoHover hoverOnlyInfo walletSettingInfo">
              <span className="infoIcon">i</span>
              <span className="infoCard">
                <span>Clears browser cookies only.</span>
                <span>ALL clears every visible cookie for this site.</span>
                <span>app clears cookies with the app prefix.</span>
                <span>sorting clears Wallet and Trade order cookies.</span>
              </span>
            </span>
          </span>
        ),
        onCell: (
          <span className="walletSettingsActionRow">
            <select
              value={cookieClearTarget}
              onChange={(e) => setCookieClearTarget(e.target.value)}
            >
              {cookieTargets.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="button" onClick={clearBrowserCookies}>
              clear
            </button>
          </span>
        ),
        defaultCell: "browser",
      },
      {
        key: "clearData",
        setting: "clear data",
        on: editorDataClearTarget,
        default: useLocalEditorStore ? "local" : "server",
        settingCell: (
          <span className="walletSettingName">
            clear data
            <span className="infoHover hoverOnlyInfo walletSettingInfo">
              <span className="infoIcon">i</span>
              <span className="infoCard">
                <span>Clears data/editor style files.</span>
                <span>On Vercel this means localStorage editor files.</span>
                <span>On local dev this means server project files.</span>
              </span>
            </span>
          </span>
        ),
        onCell: (
          <span className="walletSettingsActionRow">
            <select
              value={editorDataClearTarget}
              onChange={(e) => setEditorDataClearTarget(e.target.value)}
            >
              {editorDataClearTargets.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={clearingEditorData}
              onClick={clearEditorStorage}
            >
              clear
            </button>
          </span>
        ),
        defaultCell: useLocalEditorStore ? "local" : "server",
      },
      {
        key: "clearCache",
        setting: "clear cache",
        on: runtimeCacheClearTarget,
        default: "memory",
        settingCell: (
          <span className="walletSettingName">
            clear cache
            <span className="infoHover hoverOnlyInfo walletSettingInfo">
              <span className="infoIcon">i</span>
              <span className="infoCard">
                <span>Clears runtime memory cache only.</span>
                <span>client clears cache in this browser tab.</span>
                <span>server clears warm server module cache.</span>
                <span>On Vercel, other warm instances may keep their cache until TTL expires.</span>
              </span>
            </span>
          </span>
        ),
        onCell: (
          <span className="walletSettingsActionRow">
            <select
              value={runtimeCacheClearTarget}
              onChange={(e) => setRuntimeCacheClearTarget(e.target.value)}
            >
              {runtimeCacheClearTargets.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={clearingRuntimeCache}
              onClick={clearRuntimeCache}
            >
              clear
            </button>
          </span>
        ),
        defaultCell: "memory",
      },
      {
        key: "sorting",
        setting: "sorting",
        on: sortingModeState,
        default: defaultSortingMode,
        settingCell: (
          <span className="walletSettingName">
            sorting
            <span className="infoHover hoverOnlyInfo walletSettingInfo">
              <span className="infoIcon">i</span>
              <span className="infoCard">
                <span>Stores the preferred sorting mode.</span>
                <span>default is app order; cookie is saved order.</span>
              </span>
            </span>
          </span>
        ),
        onCell: (
          <select
            value={sortingModeState}
            onChange={(e) => updateSortingMode(e.target.value)}
          >
            <option value="default">default</option>
            <option value="cookie">cookie</option>
          </select>
        ),
        defaultCell: defaultSortingMode,
      },
    ].map((row, index) => ({ ...row, index })),
    etcTableSort,
  );

  useEffect(() => {
    setDisabledM(
      Object.fromEntries(disabledChains.map((chain) => [chain, true])),
    );
  }, [disabledChains]);

  useEffect(() => {
    if (useLocalEditorStore) {
      const localOffChains = readLocalLineFileValues("cookie/offChains.txt", chains);
      setOffM(
        Object.fromEntries(
          [...new Set([...offChains, ...localOffChains])].map((chain) => [
            chain,
            true,
          ]),
        ),
      );
      return;
    }

    setOffM(Object.fromEntries(offChains.map((chain) => [chain, true])));
  }, [offChains, chains, useLocalEditorStore]);

  useEffect(() => {
    setUseAlchemyState(!!useAlchemy);
  }, [useAlchemy]);

  useEffect(() => {
    setShowGasAutoState(!!showGasAuto);
  }, [showGasAuto]);

  useEffect(() => {
    setUsdPriceQueryState(!!usdPriceQuery);
  }, [usdPriceQuery]);

  useEffect(() => {
    setSortingModeState(sortingMode == "default" ? "default" : "cookie");
  }, [sortingMode]);

  useEffect(() => {
    setAlchemyMinUsdDraft(String(alchemyMinUsd));
  }, [alchemyMinUsd]);

  useEffect(() => {
    setUseLocalEditorStore(useLocalStorageEditor());
  }, []);

  useEffect(() => {
    if (!useLocalEditorStore) return;

    function loadLocalOffChains() {
      const localOffChains = readLocalLineFileValues("cookie/offChains.txt", chains);
      setOffM(
        Object.fromEntries(
          [...new Set([...offChains, ...localOffChains])].map((chain) => [
            chain,
            true,
          ]),
        ),
      );
    }

    loadLocalOffChains();
    window.addEventListener(localEditorStorageEvent, loadLocalOffChains);
    window.addEventListener("storage", loadLocalOffChains);
    return () => {
      window.removeEventListener(localEditorStorageEvent, loadLocalOffChains);
      window.removeEventListener("storage", loadLocalOffChains);
    };
  }, [useLocalEditorStore, chains, offChains]);

  function toggleChain(chain) {
    const next = { ...disabledM, [chain]: !disabledM[chain] };
    const disabled = chains.filter((chain) => next[chain]);

    setDisabledM(next);
    setCookie(disabledChainsCookie, encodeDisabledChains(disabled), {
      maxAge: cookieMaxAge,
      path: "/",
    });
    router.refresh();
  }

  function getChainSource(chain) {
    const loadedSource = chainSourceM?.[chain];
    if (loadedSource == "api") return "api";
    if (useAlchemyState != !!useAlchemy) {
      return useAlchemyState && alchemyChainM?.[chain] ? "alchemy" : "rpc";
    }

    return loadedSource || (useAlchemyState && alchemyChainM?.[chain] ? "alchemy" : "rpc");
  }

  async function toggleServerChain(chain) {
    const off = !offM[chain];
    const next = { ...offM, [chain]: off };

    setOffM(next);
    try {
      if (useLocalEditorStore) {
        const res = setLocalLineFileValue("cookie/offChains.txt", chain, off);
        if (!res.ok) throw new Error(res.msg || "local chain update failed");
        toast.success(`saved ${chain} locally`);
        return;
      }

      const res = await toggleOffChain({ chain, off });
      if (!res.ok) throw new Error("server chain update failed");
      router.refresh();
    } catch (e) {
      setOffM(offM);
      toast.error(e.message);
    }
  }

  function toggleUseAlchemy() {
    const next = !useAlchemyState;

    setUseAlchemyState(next);
    setCookie(useAlchemyCookie, next ? "1" : "0", {
      maxAge: cookieMaxAge,
      path: "/",
    });
    router.refresh();
  }

  function toggleShowGasAuto() {
    const next = !showGasAutoState;

    setShowGasAutoState(next);
    setCookie(showGasAutoCookie, next ? "1" : "0", {
      maxAge: cookieMaxAge,
      path: "/",
    });
    router.refresh();
  }

  function toggleUsdPriceQuery() {
    const next = !usdPriceQueryState;

    setUsdPriceQueryState(next);
    setCookie(usdPriceQueryCookie, next ? "1" : "0", {
      maxAge: cookieMaxAge,
      path: "/",
    });
    router.refresh();
  }

  function saveAlchemyMinUsd() {
    const value = Math.max(0, Number(alchemyMinUsdDraft || 0));
    const text = Number.isFinite(value) ? String(value) : "0.01";

    setAlchemyMinUsdDraft(text);
    setCookie(alchemyMinUsdCookie, text, {
      maxAge: cookieMaxAge,
      path: "/",
    });
    router.refresh();
  }

  function updateSortingMode(value = "") {
    const next = value == "default" ? "default" : "cookie";
    setSortingModeState(next);
    setCookie(sortingModeCookie, next, {
      maxAge: cookieMaxAge,
      path: "/",
    });
    router.refresh();
  }

  function getBrowserCookieNames(target = "ALL") {
    const names = document.cookie
      .split(";")
      .map((cookie) => cookie.split("=")[0]?.trim())
      .filter(Boolean);

    if (target == "ALL") return names;
    if (target == "sorting") {
      return names.filter((name) => isSortingCookieName(name));
    }
    if (target == "app" && ckPrefix) {
      return names.filter((name) => name.startsWith(ckPrefix));
    }

    return [];
  }

  function isSortingCookieName(name = "") {
    const cleanName = String(name || "").trim();
    const prefixes = [...new Set([ckPrefix || "", "w3_"].filter(Boolean))];
    const walletSortCookies = ["assetSort", "rowSort", "chainSort"];

    if (
      prefixes.some((prefix) =>
        walletSortCookies.some((suffix) => cleanName == `${prefix}${suffix}`),
      )
    ) {
      return true;
    }

    return prefixes.some(
      (prefix) =>
        cleanName.startsWith(`${prefix}trade_`) &&
        cleanName.endsWith("_order"),
    );
  }

  function deleteBrowserCookie(name = "") {
    const cleanName = String(name || "").trim();
    if (!cleanName) return;

    const paths = ["/", window.location.pathname || "/"];
    for (const path of [...new Set(paths)]) {
      document.cookie = `${encodeURIComponent(cleanName)}=; Max-Age=0; path=${path}`;
      document.cookie = `${cleanName}=; Max-Age=0; path=${path}`;
    }
  }

  function clearBrowserCookies() {
    const names = getBrowserCookieNames(cookieClearTarget);
    if (!names.length) {
      toast("no cookies to clear");
      return;
    }

    const label =
      cookieClearTarget == "ALL"
        ? "ALL browser cookies"
        : cookieClearTarget == "sorting"
          ? "sorting cookies"
          : "app cookies";
    if (!window.confirm(`Clear ${label}?\n\nThis cannot be undone.`)) return;

    for (const name of names) deleteBrowserCookie(name);
    toast.success(`cleared ${names.length} cookie${names.length == 1 ? "" : "s"}`);
    router.refresh();
  }

  async function clearEditorStorage() {
    const target = editorDataClearTarget || "ALL";
    const label =
      target == "ALL"
        ? "ALL data/editor files and folders"
        : `data/editor/${target}`;
    const mode = useLocalEditorStore ? "localStorage" : "server";
    if (!window.confirm(`Clear ${label} from ${mode}?\n\nThis cannot be undone.`)) {
      return;
    }

    setClearingEditorData(true);
    try {
      if (useLocalEditorStore) {
        const res = clearLocalEditorData(target);
        if (!res.ok) throw new Error(res.msg || "clear localStorage failed");
        toast.success(`cleared ${res.removed} local ${target}`);
        router.refresh();
        return;
      }

      const res = await clearEditorData({ target });
      if (!res.ok) throw new Error(res.msg || "clear server data failed");

      toast.success(`cleared ${res.removed} server ${target}`);
      router.refresh();
    } catch (e) {
      toast.error(e.message || "clear failed");
    } finally {
      setClearingEditorData(false);
    }
  }

  async function clearRuntimeCache() {
    const target = runtimeCacheClearTarget || "ALL";
    const label =
      target == "ALL"
        ? "ALL runtime cache"
        : `${target} runtime cache`;
    if (!window.confirm(`Clear ${label}?\n\nThis only clears currently reachable runtime memory cache.`)) {
      return;
    }

    setClearingRuntimeCache(true);
    try {
      if (target == "ALL" || target == "client") {
        clearClientRuntimeCache();
      }
      if (target == "ALL" || target == "server") {
        const res = await clearServerRuntimeCache();
        if (!res.ok) throw new Error(res.msg || "clear server cache failed");
      }

      toast.success(`cleared ${target} runtime cache`);
      router.refresh();
    } catch (e) {
      toast.error(e.message || "clear cache failed");
    } finally {
      setClearingRuntimeCache(false);
    }
  }

  return (
    <span
      className={`infoHover clickInfo walletSettingsIcon ${
        open ? "infoOpen" : ""
      }`}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="settingsIcon"
        title="wallet settings"
        aria-label="wallet settings"
        onClick={() => setOpen((prev) => !prev)}
      >
        ⚙
      </button>
      <span className="infoCard walletSettingsCard">
        <span className="walletSettingsTabs">
          <button
            type="button"
            className={`walletSettingsTab ${
              tab == "chains" ? "walletSettingsTabActive" : ""
            }`}
            onClick={() => setTab("chains")}
          >
            Chains
          </button>
          <button
            type="button"
            className={`walletSettingsTab ${
              tab == "etc" ? "walletSettingsTabActive" : ""
            }`}
            onClick={() => setTab("etc")}
          >
            Etc
          </button>
        </span>
        {tab == "chains" ? (
          <>
            <span className="gray">
              on is browser cookie. server uses offChains.txt locally, localStorage remotely.
            </span>
            <table className="coinSettingsTable walletChainSettingsTable">
              <thead>
                <tr>
                  <th>
                    <TableSortHeader
                      activeSort={chainTableSort}
                      setSort={setChainTableSort}
                      sortKey="chain"
                    >
                      chain
                    </TableSortHeader>
                  </th>
                  <th>
                    <TableSortHeader
                      activeSort={chainTableSort}
                      setSort={setChainTableSort}
                      sortKey="source"
                    >
                      source
                    </TableSortHeader>
                  </th>
                  <th>
                    <TableSortHeader
                      activeSort={chainTableSort}
                      setSort={setChainTableSort}
                      sortKey="on"
                    >
                      on
                    </TableSortHeader>
                  </th>
                  <th>
                    <TableSortHeader
                      activeSort={chainTableSort}
                      setSort={setChainTableSort}
                      sortKey="server"
                    >
                      server
                    </TableSortHeader>
                  </th>
                </tr>
              </thead>
              <tbody>
                {chainRows.map(({ chain, source }) => (
                  <tr key={chain}>
                    <td>{chain}</td>
                    <td>{source}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!disabledM[chain]}
                        onChange={() => toggleChain(chain)}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!offM[chain]}
                        onChange={() => toggleServerChain(chain)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <span className="gray">browser cookie overrides sets.js.</span>
            <table className="coinSettingsTable walletChainSettingsTable">
              <thead>
                <tr>
                  <th>
                    <TableSortHeader
                      activeSort={etcTableSort}
                      setSort={setEtcTableSort}
                      sortKey="setting"
                    >
                      setting
                    </TableSortHeader>
                  </th>
                  <th>
                    <TableSortHeader
                      activeSort={etcTableSort}
                      setSort={setEtcTableSort}
                      sortKey="on"
                    >
                      on
                    </TableSortHeader>
                  </th>
                  <th>
                    <TableSortHeader
                      activeSort={etcTableSort}
                      setSort={setEtcTableSort}
                      sortKey="default"
                    >
                      default
                    </TableSortHeader>
                  </th>
                </tr>
              </thead>
              <tbody>
                {etcRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.settingCell}</td>
                    <td>{row.onCell}</td>
                    <td>{row.defaultCell}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </span>
    </span>
  );
}

export default WalletSettings;
