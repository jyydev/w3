"use client";

export function isVenusFluxCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  return (
    !!coinE?.address &&
    /^f[A-Z0-9]/.test(coin) &&
    (text.includes("venus") ||
      text.includes("fluid") ||
      text.includes("flux"))
  );
}

export function isVenusFluxChainAvailable(_chain = "", chainMarkets = []) {
  return !!chainMarkets.length;
}

export default function VenusFluxClient({ children }) {
  return children;
}
