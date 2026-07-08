"use client";

export const uniswapSupportedChains = [
  "Ethereum",
  "BSC",
  "Arbitrum",
  "Optimism",
  "Base",
  "zkSyncEra",
  "Avalanche",
];
const uniswapSupportedChainSet = new Set(uniswapSupportedChains);

export function isUniswapSupportedForChain(fromChain = "") {
  return uniswapSupportedChainSet.has(fromChain);
}

export default function UniswapClient({ children }) {
  return children;
}
