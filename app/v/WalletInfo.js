"use client";

import { useState } from "react";

function WalletInfo() {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`infoHover clickInfo walletInfoIcon ${open ? "infoOpen" : ""}`}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="infoIcon walletInfoButton"
        aria-label="wallet info"
        title="wallet info"
        onClick={() => setOpen((prev) => !prev)}
      >
        i
      </button>
      <span className="infoCard">
        <span className="infoCardTitle">Wallet</span>
        <span>addr loads one custom wallet address.</span>
        <span>coin adds token metadata into data/editor/coins.</span>
        <span>chain switch remembers the last wallet per EVM/Solana.</span>
        <span>Click addr, asset, sum, or coin headers to sort rows.</span>
        <span>Chain switches expand one chain and hide the others.</span>
        <span>Settings can disable chains and skip their RPC calls.</span>
        <span>
          Price source: DefiLlama, DexScreener fallback, then RPC exchange-rate
          fallback for supported lending/yield tokens.
        </span>{" "}
      </span>
    </span>
  );
}

export default WalletInfo;
