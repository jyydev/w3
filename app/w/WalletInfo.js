"use client";

import { InteractiveInfoCard } from "@/components/Shared";

function WalletInfo() {
  return (
    <InteractiveInfoCard className="walletInfoIcon">
      <button
        type="button"
        className="infoIcon walletInfoButton"
        aria-label="wallet info"
        title="wallet info"
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
          Balance source: Alchemy Portfolio when enabled, with RPC fallback.
        </span>
        <span>
          Price source: Alchemy Portfolio when enabled, then DefiLlama,
          DexScreener, and RPC exchange-rate fallback.
        </span>
        <span className="infoCardTitle">Info cards</span>
        <span>Click chain icons or Trade text to open settings cards.</span>
        <span>Hover address, coin, and info icons to open detail cards.</span>
        <span>Cards close when the pointer leaves or you click outside.</span>
      </span>
    </InteractiveInfoCard>
  );
}

export default WalletInfo;
