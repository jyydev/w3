"use client";

import { useEffect, useState } from "react";
import { setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ckPrefix } from "@/sets";
import {
  clearLocalEditorData,
  localEditorStorageEvent,
  readLocalLineFileValues,
  setLocalLineFileValue,
  useLocalStorageEditor,
} from "../browserEditorStorage";
import { clearEditorData } from "./editorClearActions";
import { toggleOffChain } from "./chainActions";
import {
  alchemyMinUsdCookie,
  disabledChainsCookie,
  showGasAutoCookie,
  useAlchemyCookie,
} from "./walletSettingData";

const cookieMaxAge = 365 * 24 * 60 * 60;
const baseCookieClearTargets = [["ALL", "ALL"]];
const editorDataClearTargets = [
  ["ALL", "ALL"],
  ["coins", "coins"],
  ["cookie", "cookie"],
  ["defi", "defi"],
  ["wallets", "wallets"],
];

function encodeDisabledChains(chains) {
  return chains.join(",");
}

function WalletSettings({
  chains = [],
  disabledChains = [],
  offChains = [],
  defaultUseAlchemy = false,
  useAlchemy = false,
  defaultAlchemyMinUsd = 0.01,
  alchemyMinUsd = 0.01,
  defaultShowGasAuto = false,
  showGasAuto = false,
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("chains");
  const [useAlchemyState, setUseAlchemyState] = useState(!!useAlchemy);
  const [showGasAutoState, setShowGasAutoState] = useState(!!showGasAuto);
  const [alchemyMinUsdDraft, setAlchemyMinUsdDraft] = useState(
    String(alchemyMinUsd),
  );
  const [cookieClearTarget, setCookieClearTarget] = useState("ALL");
  const [editorDataClearTarget, setEditorDataClearTarget] = useState("ALL");
  const [clearingEditorData, setClearingEditorData] = useState(false);
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

  function getBrowserCookieNames(target = "ALL") {
    const names = document.cookie
      .split(";")
      .map((cookie) => cookie.split("=")[0]?.trim())
      .filter(Boolean);

    if (target == "ALL") return names;
    if (target == "app" && ckPrefix) {
      return names.filter((name) => name.startsWith(ckPrefix));
    }

    return [];
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

    const label = cookieClearTarget == "ALL" ? "ALL browser cookies" : "app cookies";
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
                  <th>chain</th>
                  <th>on</th>
                  <th>server</th>
                </tr>
              </thead>
              <tbody>
                {chains.map((chain) => (
                  <tr key={chain}>
                    <td>{chain}</td>
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
                  <th>setting</th>
                  <th>on</th>
                  <th>default</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>use Alchemy</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={useAlchemyState}
                      onChange={toggleUseAlchemy}
                    />
                  </td>
                  <td>{defaultUseAlchemy ? "on" : "off"}</td>
                </tr>
                <tr>
                  <td>Alchemy min $</td>
                  <td>
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
                  </td>
                  <td>{defaultAlchemyMinUsd}</td>
                </tr>
                <tr>
                  <td>gas auto label</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={showGasAutoState}
                      onChange={toggleShowGasAuto}
                    />
                  </td>
                  <td>{defaultShowGasAuto ? "on" : "off"}</td>
                </tr>
                <tr>
                  <td>
                    <span className="walletSettingName">
                      clear cookies
                      <span className="infoHover hoverOnlyInfo walletSettingInfo">
                        <span className="infoIcon">i</span>
                        <span className="infoCard">
                          <span>Clears browser cookies only.</span>
                          <span>ALL clears every visible cookie for this site.</span>
                          <span>app clears cookies with the app prefix.</span>
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>
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
                  </td>
                  <td>browser</td>
                </tr>
                <tr>
                  <td>
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
                  </td>
                  <td>
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
                  </td>
                  <td>{useLocalEditorStore ? "local" : "server"}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </span>
    </span>
  );
}

export default WalletSettings;
