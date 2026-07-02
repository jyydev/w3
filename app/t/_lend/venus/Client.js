"use client";

export function isVenusCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  return (
    coinE.type == "lend" &&
    (/^v[A-Z]/.test(coin) ||
      (text.includes("venus") && !/^f[A-Z]/.test(coin)))
  );
}

export function isVenusChainAvailable(_chain = "", chainMarkets = []) {
  return !!chainMarkets.length;
}

export default function VenusClient({ children }) {
  return children;
}
