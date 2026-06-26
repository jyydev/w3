"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";

const cookieDir = path.join(process.cwd(), "data", "editor", "cookie");
const offChainsFile = path.join(cookieDir, "offChains.txt");
const offCoinsDir = path.join(cookieDir, "offCoins");
const offAddrFile = path.join(cookieDir, "offAddr.txt");

function cleanChain(chain = "") {
  const value = String(chain || "").trim();
  if (!value || value.includes("\0") || /[\r\n]/.test(value)) {
    throw new Error("invalid chain");
  }

  return value;
}

function cleanLineValue(value = "") {
  const clean = String(value || "").trim();
  if (!clean || clean.includes("\0") || /[\r\n]/.test(clean)) {
    throw new Error("invalid value");
  }

  return clean;
}

function parseLines(txt = "", availableValues = []) {
  const available = new Set(availableValues);
  return [
    ...new Set(
      txt
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
        .filter((value) => !available.size || available.has(value)),
    ),
  ];
}

async function readOffChainsRaw() {
  try {
    return await fs.readFile(offChainsFile, "utf8");
  } catch (e) {
    if (e.code == "ENOENT") return "";
    throw e;
  }
}

export async function readOffChains(availableChains = []) {
  return parseLines(await readOffChainsRaw(), availableChains);
}

export async function toggleOffChain({ chain = "", off = false } = {}) {
  const clean = cleanChain(chain);
  const offSet = new Set(parseLines(await readOffChainsRaw()));

  if (off) {
    offSet.add(clean);
  } else {
    offSet.delete(clean);
  }

  await fs.mkdir(cookieDir, { recursive: true });
  await fs.writeFile(offChainsFile, [...offSet].sort().join("\n") + "\n");
  revalidatePath("/w");
  revalidatePath("/t");

  return { ok: true, chain: clean, off };
}

function getOffCoinFile(chain) {
  return path.join(offCoinsDir, `${cleanChain(chain)}.txt`);
}

async function readOffCoinRaw(chain) {
  try {
    return await fs.readFile(getOffCoinFile(chain), "utf8");
  } catch (e) {
    if (e.code == "ENOENT") return "";
    throw e;
  }
}

export async function readOffCoinM(availableCoinM = {}) {
  const entries = await Promise.all(
    Object.keys(availableCoinM).map(async (chain) => [
      chain,
      parseLines(await readOffCoinRaw(chain)),
    ]),
  );

  return Object.fromEntries(entries.filter(([, coins]) => coins.length));
}

export async function toggleOffCoin({
  chain = "",
  coin = "",
  off = false,
} = {}) {
  const clean = cleanLineValue(coin);
  const offSet = new Set(parseLines(await readOffCoinRaw(chain)));

  if (off) {
    offSet.add(clean);
  } else {
    offSet.delete(clean);
  }

  await fs.mkdir(offCoinsDir, { recursive: true });
  await fs.writeFile(getOffCoinFile(chain), [...offSet].sort().join("\n") + "\n");
  revalidatePath("/w");
  revalidatePath("/t");

  return { ok: true, chain: cleanChain(chain), coin: clean, off };
}

async function readOffAddrRaw() {
  try {
    return await fs.readFile(offAddrFile, "utf8");
  } catch (e) {
    if (e.code == "ENOENT") return "";
    throw e;
  }
}

export async function readOffAddrs() {
  return parseLines(await readOffAddrRaw());
}

export async function toggleOffAddr({ name = "", off = false } = {}) {
  const clean = cleanLineValue(name);
  const cleanKey = clean.toLowerCase();
  const offList = parseLines(await readOffAddrRaw()).filter(
    (entry) => entry.toLowerCase() != cleanKey,
  );

  if (off) {
    offList.push(clean);
  }

  await fs.mkdir(cookieDir, { recursive: true });
  await fs.writeFile(offAddrFile, offList.sort().join("\n") + "\n");
  revalidatePath("/w");
  revalidatePath("/t");

  return { ok: true, name: clean, off };
}
