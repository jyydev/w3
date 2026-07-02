"use client";

export function isJupiterCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  return (
    (coinE.type == "lend" || coinE.type == "yield") &&
    (/^jl[A-Z0-9]/.test(coin) ||
      coin == "JUICED" ||
      text.includes("jupusd")) &&
    (text.includes("jupiter") || text.includes("jupusd") || coin == "JUICED")
  );
}

export function getJupiterUnderlyingCoin(chainE, lendCoin) {
  if (lendCoin == "JUICED") return "JupUSD";

  const stripped = String(lendCoin || "").replace(/^jl/, "");
  if (stripped) return stripped;

  return "";
}

export function isJupiterChainAvailable(chain = "") {
  return chain == "Solana";
}

export default function JupiterLendClient({ children }) {
  return children;
}
