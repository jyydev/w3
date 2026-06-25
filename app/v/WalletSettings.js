"use client";

import { useEffect, useState } from "react";
import { setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { toggleOffChain } from "./chainActions";
import { disabledChainsCookie } from "./walletSettingData";

const cookieMaxAge = 365 * 24 * 60 * 60;

function encodeDisabledChains(chains) {
  return chains.join(",");
}

function WalletSettings({ chains = [], disabledChains = [], offChains = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [disabledM, setDisabledM] = useState(() =>
    Object.fromEntries(disabledChains.map((chain) => [chain, true])),
  );
  const [offM, setOffM] = useState(() =>
    Object.fromEntries(offChains.map((chain) => [chain, true])),
  );

  useEffect(() => {
    setDisabledM(
      Object.fromEntries(disabledChains.map((chain) => [chain, true])),
    );
  }, [disabledChains]);

  useEffect(() => {
    setOffM(Object.fromEntries(offChains.map((chain) => [chain, true])));
  }, [offChains]);

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
      const res = await toggleOffChain({ chain, off });
      if (!res.ok) throw new Error("server chain update failed");
      router.refresh();
    } catch (e) {
      setOffM(offM);
      toast.error(e.message);
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
        <span className="infoCardTitle">Chains</span>
        <span className="gray">on is browser cookie. server writes offChains.txt.</span>
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
      </span>
    </span>
  );
}

export default WalletSettings;
