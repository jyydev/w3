import { ckPrefix } from "@/sets";

export const disabledChainsCookie = `${ckPrefix ?? ""}disabledChains`;
export const disabledCoinsCookie = `${ckPrefix ?? ""}disabledCoins`;
export const disabledWalletsCookie = `${ckPrefix ?? ""}disabledWallets`;
export const useAlchemyCookie = `${ckPrefix ?? ""}useAlchemy`;
export const alchemyMinUsdCookie = `${ckPrefix ?? ""}alchemyMinUsd`;

export function parseOptionalBool(value) {
  if (value === undefined || value === null || value === "") return null;

  let txt = String(value || "").trim().toLowerCase();

  try {
    txt = decodeURIComponent(txt).trim().toLowerCase();
  } catch {}

  if (["1", "true", "yes", "on"].includes(txt)) return true;
  if (["0", "false", "no", "off"].includes(txt)) return false;

  return null;
}

export function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;

  let txt = String(value || "").trim();

  try {
    txt = decodeURIComponent(txt).trim();
  } catch {}

  const n = Number(txt);
  return Number.isFinite(n) ? n : null;
}

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
      .filter(([chain]) =>
        Object.prototype.hasOwnProperty.call(availableCoinM, chain),
      )
      .map(([chain, coins]) => [
        chain,
        (Array.isArray(coins) ? coins : [])
          .map((coin) => String(coin || "").trim())
          .filter(Boolean),
      ])
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
