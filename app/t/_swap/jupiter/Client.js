"use client";

export function isJupiterSwapSupportedForChain(fromChain = "") {
  return fromChain == "Solana";
}

export default function JupiterSwapClient({ children }) {
  return children;
}
