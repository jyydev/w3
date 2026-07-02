import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import coinM from "@/fn/coinM";

const customCoinDir = path.join(process.cwd(), "data", "editor", "coins");

function coinListToM(coins = {}) {
  if (Array.isArray(coins)) {
    return Object.fromEntries(
      coins
        .filter((entry) => entry && typeof entry == "object" && entry.coin)
        .map(({ coin, ...entry }) => [String(coin).trim(), entry])
        .filter(([coin]) => coin),
    );
  }
  return coins && typeof coins == "object" ? coins : {};
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

export default function getCoinM(chain = "BSC") {
  let m = { ...(coinM[chain] ?? coinM.BSC), ...getCustomCoinM(chain) };
  for (let [k, v] of Object.entries(process.env)) {
    let r = k.match(/^w3_(.+)$/);
    if (r && ethers.isAddress(v)) m[r[1].toUpperCase()] = { address: v, decimals: 18 };
  }
  try {
    return { ...m, ...(JSON.parse(process.env.w3Coins || "{}") || {}) };
  } catch {
    return m;
  }
}
