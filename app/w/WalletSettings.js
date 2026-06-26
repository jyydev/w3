"use client";

import { useEffect, useState } from "react";
import { setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  setLocalLineFileValue,
  useLocalStorageEditor,
} from "../browserEditorStorage";
import { toggleOffChain } from "./chainActions";
import {
  alchemyMinUsdCookie,
  disabledChainsCookie,
  useAlchemyCookie,
} from "./walletSettingData";

const cookieMaxAge = 365 * 24 * 60 * 60;

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
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("chains");
  const [useAlchemyState, setUseAlchemyState] = useState(!!useAlchemy);
  const [alchemyMinUsdDraft, setAlchemyMinUsdDraft] = useState(
    String(alchemyMinUsd),
  );
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
    setOffM(Object.fromEntries(offChains.map((chain) => [chain, true])));
  }, [offChains]);

  useEffect(() => {
    setUseAlchemyState(!!useAlchemy);
  }, [useAlchemy]);

  useEffect(() => {
    setAlchemyMinUsdDraft(String(alchemyMinUsd));
  }, [alchemyMinUsd]);

  useEffect(() => {
    setUseLocalEditorStore(useLocalStorageEditor());
  }, []);

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
              </tbody>
            </table>
          </>
        )}
      </span>
    </span>
  );
}

export default WalletSettings;
