"use client";

import { aaveUmbrellaChains } from "@/app/_shared/aave/index";

export function isAaveStakingCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  return (
    coinE.type == "yield" &&
    /^stk/i.test(coin) &&
    (text.includes("umbrella") ||
      text.includes("stake wrapped aave") ||
      text.includes("aave"))
  );
}

export function isAaveStakingChainAvailable(chain = "", chainMarkets = []) {
  return aaveUmbrellaChains.includes(chain) || !!chainMarkets.length;
}

export default function AaveStakingClient({ children }) {
  return children;
}
