import { ckPrefix } from "@/sets";

export const disabledChainsCookie = `${ckPrefix ?? ""}disabledChains`;
export const disabledCoinsCookie = `${ckPrefix ?? ""}disabledCoins`;
export const disabledWalletsCookie = `${ckPrefix ?? ""}disabledWallets`;

export function parseDisabledChains(value = "", availableChains = []) {
  const available = new Set(availableChains);
  let txt = String(value || "");

  try {
    txt = decodeURIComponent(txt);
  } catch {}

  return txt
    .split(",")
    .map((chain) => chain.trim())
    .filter((chain) => chain && available.has(chain));
}

export function encodeDisabledCoinM(disabledCoinM = {}) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(disabledCoinM)
        .map(([chain, coins]) => [
          chain,
          Array.isArray(coins) ? coins.filter(Boolean) : [],
        ])
        .filter(([, coins]) => coins.length),
    ),
  );
}

export function parseDisabledCoinM(value = "", availableCoinM = {}) {
  let txt = String(value || "");

  try {
    txt = decodeURIComponent(txt);
  } catch {}

  let parsed = {};
  try {
    parsed = JSON.parse(txt || "{}") || {};
  } catch {
    parsed = {};
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .map(([chain, coins]) => {
        const available = new Set(availableCoinM[chain] || []);
        return [
          chain,
          (Array.isArray(coins) ? coins : [])
            .map((coin) => String(coin || "").trim())
            .filter((coin) => coin && available.has(coin)),
        ];
      })
      .filter(([, coins]) => coins.length),
  );
}

export function getWalletDisableKey(address = "") {
  return String(address || "").trim().toLowerCase();
}

export function encodeDisabledWallets(addresses = []) {
  return addresses.map(getWalletDisableKey).filter(Boolean).join(",");
}

export function parseDisabledWallets(value = "") {
  let txt = String(value || "");

  try {
    txt = decodeURIComponent(txt);
  } catch {}

  return [
    ...new Set(
      txt
        .split(",")
        .map(getWalletDisableKey)
        .filter(Boolean),
    ),
  ];
}
