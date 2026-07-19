"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { projectFileWriteBlockedResult } from "../_editorData/projectFileWrites";

const walletRootDir = path.join(process.cwd(), "data", "editor", "wallets");
const walletTypes = new Set(["evm", "solana", "tron"]);
const walletFileExt = ".json";

function getWalletType(walletType = "evm") {
  const type = String(walletType || "evm").toLowerCase();
  return walletTypes.has(type) ? type : "evm";
}

function resolveWalletFile({ walletType, source }) {
  const walletDir = path.join(walletRootDir, getWalletType(walletType));
  const cleanSource = String(source || "")
    .trim()
    .replace(/\.(txt|json)$/i, "")
    .replace(/\/+$/, "");

  if (!cleanSource || cleanSource.includes("\0") || path.isAbsolute(cleanSource)) {
    throw new Error("invalid wallet file");
  }

  const filePath = path.resolve(walletDir, `${cleanSource}${walletFileExt}`);
  const relative = path.relative(walletDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("invalid wallet file");
  }

  return filePath;
}

function resolveWalletPath({ walletType, source, ext = "" }) {
  const walletDir = path.join(walletRootDir, getWalletType(walletType));
  const cleanSource = String(source || "")
    .trim()
    .replace(/\.(txt|json)$/i, "")
    .replace(/\/+$/, "");

  if (!cleanSource || cleanSource.includes("\0") || path.isAbsolute(cleanSource)) {
    throw new Error("invalid wallet path");
  }

  const filePath = path.resolve(walletDir, `${cleanSource}${ext}`);
  const relative = path.relative(walletDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("invalid wallet path");
  }

  return filePath;
}

function normalizeWalletEntries(input = []) {
  return (Array.isArray(input) ? input : [])
    .map((entry) => ({
      wallet: String(entry?.wallet ?? entry?.name ?? "").trim(),
      address: String(entry?.address ?? "").trim(),
      ref: String(entry?.ref ?? "").trim(),
    }))
    .filter((entry) => entry.wallet && entry.address);
}

async function readWalletFileEntries(filePath) {
  const txt = await fs.readFile(filePath, "utf8");
  return normalizeWalletEntries(JSON.parse(txt || "[]"));
}

async function writeWalletFileEntries(filePath, entries) {
  await fs.writeFile(filePath, `${JSON.stringify(normalizeWalletEntries(entries), null, 2)}\n`);
}

function cleanWalletName(name = "") {
  const walletName = String(name || "").trim();
  if (!walletName || /[:=\s]/.test(walletName)) {
    throw new Error("invalid wallet name");
  }

  return walletName;
}

function sameAddress(walletType, a = "", b = "") {
  const addressA = String(a || "").trim();
  const addressB = String(b || "").trim();
  return getWalletType(walletType) == "evm"
    ? addressA.toLowerCase() == addressB.toLowerCase()
    : addressA == addressB;
}

export async function deleteWalletEntry({
  walletType = "evm",
  source = "",
  name = "",
  address = "",
} = {}) {
  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const walletName = String(name || "").trim();
  const walletAddress = String(address || "").trim();
  if (!walletName || !walletAddress) {
    return { ok: false, msg: "missing wallet" };
  }

  const filePath = resolveWalletFile({ walletType, source });
  const entries = await readWalletFileEntries(filePath);
  let removed = false;

  const nextEntries = entries.filter((entry) => {
    if (removed) return true;
    if (
      entry.wallet == walletName &&
      sameAddress(walletType, entry.address, walletAddress)
    ) {
      removed = true;
      return false;
    }

    return true;
  });

  if (!removed) return { ok: false, msg: "wallet not found" };

  await writeWalletFileEntries(filePath, nextEntries);
  revalidatePath("/w");
  revalidatePath("/t");

  return { ok: true, file: source, name: walletName };
}

export async function deleteEmptyWalletPath({
  walletType = "evm",
  source = "",
  kind = "file",
} = {}) {
  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const deleteKind = kind == "folder" ? "folder" : "file";

  if (deleteKind == "folder") {
    const folderPath = resolveWalletPath({ walletType, source });
    const stat = await fs.stat(folderPath).catch((e) => {
      if (e.code != "ENOENT") throw e;
      return null;
    });
    if (!stat?.isDirectory()) return { ok: false, msg: "folder not found" };

    const entries = await fs.readdir(folderPath);
    if (entries.length) return { ok: false, msg: "folder is not empty" };

    await fs.rmdir(folderPath);
  } else {
    const filePath = resolveWalletPath({ walletType, source, ext: walletFileExt });
    const stat = await fs.stat(filePath).catch((e) => {
      if (e.code != "ENOENT") throw e;
      return null;
    });
    if (!stat?.isFile()) return { ok: false, msg: "file not found" };

    const entries = await readWalletFileEntries(filePath).catch(() => null);
    if (!Array.isArray(entries) || entries.length) {
      return { ok: false, msg: "file is not empty" };
    }

    await fs.unlink(filePath);
  }

  revalidatePath("/w");
  revalidatePath("/t");

  return { ok: true, source, kind: deleteKind };
}

export async function addWalletEntry({
  walletType = "evm",
  source = "",
  name = "",
  address = "",
} = {}) {
  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const type = getWalletType(walletType);
  const walletName = cleanWalletName(name);
  const walletAddress = String(address || "").trim();
  if (!walletAddress) return { ok: false, msg: "missing address" };

  const filePath = resolveWalletFile({ walletType: type, source });
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let entries = [];
  try {
    entries = await readWalletFileEntries(filePath);
  } catch (e) {
    if (e.code != "ENOENT") throw e;
  }

  for (const entry of entries) {
    if (entry.wallet == walletName) {
      return { ok: true, exists: true, reason: "name", name: walletName };
    }
    if (sameAddress(type, entry.address, walletAddress)) {
      return { ok: true, exists: true, reason: "address", name: entry.wallet };
    }
  }

  entries.push({ wallet: walletName, address: walletAddress, ref: "" });
  await writeWalletFileEntries(filePath, entries);
  revalidatePath("/w");
  revalidatePath("/t");

  return { ok: true, file: source, name: walletName };
}

export async function updateWalletEntryRef({
  walletType = "evm",
  source = "",
  name = "",
  address = "",
  ref = "",
} = {}) {
  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const walletName = String(name || "").trim();
  const walletAddress = String(address || "").trim();
  if (!walletName || !walletAddress) {
    return { ok: false, msg: "missing wallet" };
  }

  const filePath = resolveWalletFile({ walletType, source });
  const entries = await readWalletFileEntries(filePath);
  const nextRef = String(ref ?? "").trim();
  let updated = false;

  const nextEntries = entries.map((entry) => {
    if (
      !updated &&
      entry.wallet == walletName &&
      sameAddress(walletType, entry.address, walletAddress)
    ) {
      updated = true;
      return { ...entry, ref: nextRef };
    }

    return entry;
  });

  if (!updated) return { ok: false, msg: "wallet not found" };

  await writeWalletFileEntries(filePath, nextEntries);
  revalidatePath("/w");
  revalidatePath("/t");

  return { ok: true, file: source, name: walletName, ref: nextRef };
}
