"use client";

import { clearSwapClientRuntimeCache } from "./t/_swap/Client";
import { clearHyperliquidClientRuntimeCache } from "./t/_yield/hyperliquid/Client";
import { clearTradeClientRuntimeCache } from "./t/clientShared";

export function clearClientRuntimeCache() {
  clearSwapClientRuntimeCache();
  clearHyperliquidClientRuntimeCache();
  clearTradeClientRuntimeCache();

  return { ok: true };
}
