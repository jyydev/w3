import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import coinM from "@/fn/coinM";

const customCoinDir = path.join(process.cwd(), "data", "editor", "coins");

function coinListToM(coins = []) {
  return Object.fromEntries(
    (Array.isArray(coins) ? coins : [])
      .filter((entry) => entry && typeof entry == "object" && entry.coin)
      .map(({ coin, ...entry }) => [String(coin).trim(), entry])
      .filter(([coin]) => coin),
  );
}

function getCustomCoinM(chain) {
  try {
    return coinListToM(
      JSON.parse(
        fs.readFileSync(path.join(customCoinDir, `${chain}.json`), "utf8"),
      ),
    );
  } catch (e) {
    if (e.code == "ENOENT") return {};
    throw e;
  }
}

function mergeCoinM(...coinMs) {
  const merged = {};

  for (const coinM of coinMs) {
    for (const [coin, entry] of Object.entries(coinM || {})) {
      merged[coin] = {
        ...(merged[coin] || {}),
        ...(entry || {}),
      };
    }
  }

  return merged;
}

export default function getCoinM(chain = "BSC") {
  const m = mergeCoinM(coinM[chain] ?? coinM.BSC, getCustomCoinM(chain));
  for (let [k, v] of Object.entries(process.env)) {
    let r = k.match(/^w3_(.+)$/);
    if (r && ethers.isAddress(v)) {
      const coin = r[1].toUpperCase();
      m[coin] = { ...(m[coin] || {}), address: v, decimals: 18 };
    }
  }
  try {
    return mergeCoinM(m, JSON.parse(process.env.w3Coins || "{}") || {});
  } catch {
    return m;
  }
}
