"use client";

export function isUniswapSupportedForChain(fromChain = "") {
  return !!fromChain && fromChain != "Solana";
}

export default function UniswapClient({ children }) {
  return children;
}
