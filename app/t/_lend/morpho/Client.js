"use client";

export const morphoConfiguredChainSet = new Set([
  "Ethereum",
  "Optimism",
  "Unichain",
  "Polygon",
  "Monad",
  "WorldChain",
  "Stable",
  "HyperEVM",
  "Tempo",
  "Robinhood",
  "Base",
  "Arbitrum",
  "Katana",
]);

export function isMorphoCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  return (
    coinE.type == "lend" &&
    (text.includes("morpho") || text.includes("metamorpho"))
  );
}

export function isMorphoChainAvailable(chain = "", chainMarkets = []) {
  return morphoConfiguredChainSet.has(chain) || !!chainMarkets.length;
}

export default function MorphoClient({ children }) {
  return children;
}
