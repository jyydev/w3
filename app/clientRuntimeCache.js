"use client";

import { clearSwapClientRuntimeCache } from "./t/_swap/Client";
import { clearHyperliquidClientRuntimeCache } from "./t/_yield/hyperliquid/Client";
import { clearTradeClientRuntimeCache } from "./t/clientShared";
import { clearWalletBalanceClientCache } from "./w/walletBalanceClientCache";

export function clearClientRuntimeCache() {
  clearWalletBalanceClientCache();
  clearSwapClientRuntimeCache();
  clearHyperliquidClientRuntimeCache();
  clearTradeClientRuntimeCache();

  return { ok: true };
}
