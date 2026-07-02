"use client";

export const sparkSupportedChains = new Set([
  "Ethereum",
  "Arbitrum",
  "Avalanche",
  "Base",
  "Optimism",
]);

export function isSparkCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  return (
    coinE.type == "yield" &&
    (text.includes("spark") ||
      text.includes("savings") ||
      text.includes("susds") ||
      /^sp[A-Z]/.test(coin))
  );
}

export function isSparkChainAvailable(chain = "", chainMarkets = []) {
  return !!chainMarkets.length || sparkSupportedChains.has(chain);
}

export default function SparkClient({ children }) {
  return children;
}
