"use client";

import {
  tronEnergyStakeCoin,
  tronEnergyStakeCoinE,
} from "@/data/coins/tron";

export function isTronStakingCoin(coin = "", coinE = {}) {
  return (
    coin == tronEnergyStakeCoin ||
    coinE.syntheticKind == tronEnergyStakeCoinE.syntheticKind
  );
}

export function isTronStakingChainAvailable(
  chain = "",
  chainMarkets = [],
) {
  return chain == "Tron" && !!chainMarkets.length;
}

export default function TronStakingClient({ children }) {
  return children;
}
