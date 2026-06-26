"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { projectFileWriteBlockedResult } from "../projectFileWrites";

const walletRootDir = path.join(process.cwd(), "data", "editor", "wallet");
const walletTypes = new Set(["evm", "solana"]);

function getWalletType(walletType = "evm") {
  const type = String(walletType || "evm").toLowerCase();
  return walletTypes.has(type) ? type : "evm";
}

function resolveWalletFile({ walletType, source }) {
  const walletDir = path.join(walletRootDir, getWalletType(walletType));
  const cleanSource = String(source || "")
    .trim()
    .replace(/\.txt$/i, "")
    .replace(/\/+$/, "");

  if (!cleanSource || cleanSource.includes("\0") || path.isAbsolute(cleanSource)) {
    throw new Error("invalid wallet file");
  }

  const filePath = path.resolve(walletDir, `${cleanSource}.txt`);
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
    .replace(/\.txt$/i, "")
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

function parseWalletLine(line = "") {
  const [, name, address] = line.match(/^\s*([^:=\s]+)\s*[:=]\s*(\S+)/) || [];
  return { name, address };
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
  return getWalletType(walletType) == "solana"
    ? addressA == addressB
    : addressA.toLowerCase() == addressB.toLowerCase();
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
  const txt = await fs.readFile(filePath, "utf8");
  const newline = txt.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /\r?\n$/.test(txt);
  const lines = txt.replace(/\r?\n$/, "").split(/\r?\n/);
  let removed = false;

  const nextLines = lines.filter((line) => {
    if (removed) return true;

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      return true;
    }

    const entry = parseWalletLine(line);
    if (
      entry.name == walletName &&
      sameAddress(walletType, entry.address, walletAddress)
    ) {
      removed = true;
      return false;
    }

    return true;
  });

  if (!removed) return { ok: false, msg: "wallet not found" };

  await fs.writeFile(
    filePath,
    `${nextLines.join(newline)}${trailingNewline ? newline : ""}`,
  );
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
    const filePath = resolveWalletPath({ walletType, source, ext: ".txt" });
    const stat = await fs.stat(filePath).catch((e) => {
      if (e.code != "ENOENT") throw e;
      return null;
    });
    if (!stat?.isFile()) return { ok: false, msg: "file not found" };

    const txt = await fs.readFile(filePath, "utf8");
    if (txt.trim()) return { ok: false, msg: "file is not empty" };

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

  let txt = "";
  try {
    txt = await fs.readFile(filePath, "utf8");
  } catch (e) {
    if (e.code != "ENOENT") throw e;
  }

  const lines = txt.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    const entry = parseWalletLine(line);
    if (entry.name == walletName) {
      return { ok: true, exists: true, reason: "name", name: walletName };
    }
    if (sameAddress(type, entry.address, walletAddress)) {
      return { ok: true, exists: true, reason: "address", name: entry.name };
    }
  }

  const newline = txt.includes("\r\n") ? "\r\n" : "\n";
  const prefix = txt && !/\r?\n$/.test(txt) ? newline : "";
  await fs.writeFile(filePath, `${txt}${prefix}${walletName}: ${walletAddress}${newline}`);
  revalidatePath("/w");
  revalidatePath("/t");

  return { ok: true, file: source, name: walletName };
}
