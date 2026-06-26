import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import coinM from "@/fn/coinM";

const customCoinDir = path.join(process.cwd(), "data", "editor", "coins");

function getCustomCoinM(chain) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(customCoinDir, `${chain}.json`), "utf8"),
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
