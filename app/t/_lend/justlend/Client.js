"use client";

export function getJustLendUnderlyingCoin(lendCoin = "") {
  const coin = String(lendCoin || "");
  return /^j[A-Z0-9]/.test(coin) ? coin.slice(1) : "";
}

export function isJustLendCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  const ref = String(coinE.ref || "").toLowerCase();

  return (
    coinE.type == "lend" &&
    (ref.includes("justlend") || text.includes("justlend"))
  );
}

export function isJustLendChainAvailable(chain = "") {
  return chain == "Tron";
}

export default function JustLendClient({ children }) {
  return children;
}
