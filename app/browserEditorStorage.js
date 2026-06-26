"use client";

import { ckPrefix } from "@/sets";

const storageKey = `${ckPrefix ?? ""}editorFiles`;

export function isLocalEditorHost(hostname = "") {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;
  if (host == "localhost" || host == "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".ts.net")) return true;

  const parts = host.split(".").map((part) => Number(part));
  if (parts.length != 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a == 10 ||
    a == 127 ||
    a == 100 ||
    (a == 172 && b >= 16 && b <= 31) ||
    (a == 192 && b == 168)
  );
}

export function useLocalStorageEditor(hostname) {
  if (typeof window == "undefined") return false;
  return !isLocalEditorHost(hostname ?? window.location.hostname);
}

function canUseLocalStorage() {
  try {
    return typeof window != "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function readLocalEditorFiles() {
  if (!canUseLocalStorage()) return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    return parsed && typeof parsed == "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function writeLocalEditorFiles(files = {}) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(files));
}

export function listLocalEditorFiles(baseFiles = []) {
  return [
    ...new Set([
      ...(Array.isArray(baseFiles) ? baseFiles : []),
      ...Object.keys(readLocalEditorFiles()),
    ]),
  ].sort((a, b) => a.localeCompare(b));
}

export function readLocalEditorFile(file, fallback = "") {
  const files = readLocalEditorFiles();
  return Object.prototype.hasOwnProperty.call(files, file)
    ? String(files[file] ?? "")
    : fallback;
}

export function hasLocalEditorFile(file) {
  return Object.prototype.hasOwnProperty.call(readLocalEditorFiles(), file);
}

export function saveLocalEditorFile(file, content = "") {
  const cleanFile = String(file || "").trim().replace(/^\/+/, "");
  if (!cleanFile) throw new Error("missing local file");

  const files = readLocalEditorFiles();
  files[cleanFile] = String(content ?? "");
  writeLocalEditorFiles(files);

  return {
    files: listLocalEditorFiles(),
    file: cleanFile,
    content: files[cleanFile],
  };
}

function parseWalletLines(txt = "") {
  return String(txt || "")
    .split(/\r?\n/)
    .map((line) => {
      const [, name, address] = line.match(/^\s*([^:=\s]+)\s*[:=]\s*(\S+)/) || [];
      return { name, address };
    })
    .filter((entry) => entry.name && entry.address);
}

function sameAddress(walletType, a = "", b = "") {
  return walletType == "solana"
    ? String(a || "").trim() == String(b || "").trim()
    : String(a || "").trim().toLowerCase() ==
        String(b || "").trim().toLowerCase();
}

export function addLocalWalletEntry({
  walletType = "evm",
  source = "",
  name = "",
  address = "",
} = {}) {
  const type = walletType == "solana" ? "solana" : "evm";
  const cleanSource = String(source || "").trim().replace(/\.txt$/i, "");
  const cleanName = String(name || "").trim();
  const cleanAddress = String(address || "").trim();
  if (!cleanSource || !cleanName || !cleanAddress) {
    return { ok: 0, msg: "missing wallet data" };
  }

  const file = `wallet/${type}/${cleanSource}.txt`;
  const txt = readLocalEditorFile(file, "");
  const entries = parseWalletLines(txt);
  const existingByName = entries.find((entry) => entry.name == cleanName);
  if (existingByName) {
    return { ok: 1, exists: 1, reason: "name", name: cleanName, file };
  }

  const existingByAddress = entries.find((entry) =>
    sameAddress(type, entry.address, cleanAddress),
  );
  if (existingByAddress) {
    return {
      ok: 1,
      exists: 1,
      reason: "address",
      name: existingByAddress.name,
      file,
    };
  }

  const newline = txt.includes("\r\n") ? "\r\n" : "\n";
  const prefix = txt && !/\r?\n$/.test(txt) ? newline : "";
  saveLocalEditorFile(file, `${txt}${prefix}${cleanName}: ${cleanAddress}${newline}`);

  return { ok: 1, file, name: cleanName };
}

function getLocalWalletPrefix(walletType = "evm") {
  return `wallet/${walletType == "solana" ? "solana" : "evm"}/`;
}

function getLocalWalletSource(file, walletType = "evm") {
  return String(file || "")
    .replace(getLocalWalletPrefix(walletType), "")
    .replace(/\.txt$/i, "");
}

export function listLocalWalletSources(walletType = "evm") {
  const prefix = getLocalWalletPrefix(walletType);
  const files = Object.keys(readLocalEditorFiles()).filter(
    (file) => file.startsWith(prefix) && file.endsWith(".txt"),
  );
  const folders = files
    .map((file) => getLocalWalletSource(file, walletType).split("/").slice(0, -1).join("/"))
    .filter(Boolean)
    .map((dir) => `${dir}/`);

  return [
    ...new Set([
      ...folders,
      ...files.map((file) => getLocalWalletSource(file, walletType)),
    ]),
  ].sort((a, b) => a.localeCompare(b));
}

export function hasLocalWalletSource(walletType = "evm", source = "") {
  const cleanSource = String(source || "").trim().replace(/\/+$/, "");
  if (!cleanSource) return false;

  return listLocalWalletSources(walletType).some(
    (file) => file.replace(/\/+$/, "") == cleanSource,
  );
}

export function readLocalWalletEntries(walletType = "evm", source = "") {
  const type = walletType == "solana" ? "solana" : "evm";
  const prefix = getLocalWalletPrefix(type);
  const cleanSource = String(source || "").trim().replace(/\/+$/, "");
  const files = readLocalEditorFiles();
  const matchingFiles = Object.keys(files)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".txt"))
    .filter((file) => {
      const walletSource = getLocalWalletSource(file, type);
      return (
        !cleanSource ||
        walletSource == cleanSource ||
        walletSource.startsWith(`${cleanSource}/`)
      );
    })
    .sort((a, b) => a.localeCompare(b));
  const usedNames = new Set();

  return matchingFiles.flatMap((file) => {
    const walletSource = getLocalWalletSource(file, type);
    return parseWalletLines(files[file]).map((entry) => {
      let name = entry.name;
      const baseName = name;
      let i = 2;
      while (usedNames.has(name)) {
        name = `${baseName}_${i}`;
        i += 1;
      }
      usedNames.add(name);

      return {
        ...entry,
        name,
        source: walletSource,
        label: walletSource ? `${walletSource}/${entry.name}` : entry.name,
      };
    });
  });
}

export function addLocalCustomCoin({ chain = "", coin = "", entry = {} } = {}) {
  const cleanChain = String(chain || "").trim();
  const cleanCoin = String(coin || "").trim();
  if (!cleanChain || !cleanCoin) return { ok: 0, msg: "missing coin data" };

  const file = `coins/${cleanChain}.json`;
  let coins = {};
  try {
    coins = JSON.parse(readLocalEditorFile(file, "{}") || "{}") || {};
  } catch {
    return { ok: 0, msg: `${file} has invalid JSON` };
  }

  if (coins[cleanCoin]) {
    return { ok: 1, exists: 1, chain: cleanChain, coin: cleanCoin, file };
  }

  coins[cleanCoin] = entry;
  saveLocalEditorFile(file, `${JSON.stringify(coins, null, 2)}\n`);
  return { ok: 1, chain: cleanChain, coin: cleanCoin, entry, file };
}

export function setLocalLineFileValue(file, value, enabled) {
  const cleanFile = String(file || "").trim().replace(/^\/+/, "");
  const cleanValue = String(value || "").trim();
  if (!cleanFile || !cleanValue) return { ok: 0, msg: "missing value" };

  const values = new Set(
    readLocalEditorFile(cleanFile, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !line.startsWith("//")),
  );

  if (enabled) values.add(cleanValue);
  else values.delete(cleanValue);

  saveLocalEditorFile(cleanFile, [...values].sort().join("\n") + "\n");
  return { ok: 1, file: cleanFile, value: cleanValue, enabled };
}
