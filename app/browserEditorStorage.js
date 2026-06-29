"use client";

import { ckPrefix } from "@/sets";

const storageKey = `${ckPrefix ?? ""}editorFiles`;
const navFavStoragePrefix = `${ckPrefix ?? ""}navFavs:`;
export const localEditorStorageEvent = `${ckPrefix ?? ""}editorStorageChange`;
const allowedEditorExts = new Set([".json", ".txt", ".js"]);

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

function notifyLocalEditorStorageChange() {
  if (typeof window == "undefined") return;
  window.dispatchEvent(new CustomEvent(localEditorStorageEvent));
}

function cleanLocalEditorFile(file = "") {
  const cleanFile = String(file || "").trim().replace(/^\/+/, "");
  if (
    !cleanFile ||
    cleanFile.includes("\0") ||
    cleanFile.split("/").some((part) => !part || part == "." || part == "..")
  ) {
    throw new Error("invalid local file");
  }

  const ext = cleanFile.match(/\.[^./]+$/)?.[0]?.toLowerCase() || "";
  if (!allowedEditorExts.has(ext)) {
    throw new Error("Use .json, .txt, or .js files only");
  }

  return cleanFile;
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
  notifyLocalEditorStorageChange();
}

function cleanNavFavs(favs = []) {
  return (Array.isArray(favs) ? favs : [])
    .filter((fav) => fav?.href && fav?.label)
    .map((fav) => ({
      href: String(fav.href),
      label: String(fav.label),
      title: fav.title ? String(fav.title) : String(fav.label),
    }));
}

function getLocalNavFavsKey(name = "") {
  return `${navFavStoragePrefix}${String(name || "nav")}`;
}

export function readLocalNavFavs(name = "") {
  if (!canUseLocalStorage()) return null;

  const raw = window.localStorage.getItem(getLocalNavFavsKey(name));
  if (raw === null) return null;

  try {
    return cleanNavFavs(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveLocalNavFavs(name = "", favs = []) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(
    getLocalNavFavsKey(name),
    JSON.stringify(cleanNavFavs(favs)),
  );
}

export function listLocalEditorFiles(baseFiles = []) {
  return [
    ...new Set([
      ...(Array.isArray(baseFiles) ? baseFiles : []),
      ...Object.keys(readLocalEditorFiles()).filter((file) => {
        try {
          cleanLocalEditorFile(file);
          return true;
        } catch {
          return false;
        }
      }),
    ]),
  ].sort((a, b) => a.localeCompare(b));
}

export function readLocalEditorFile(file, fallback = "") {
  const files = readLocalEditorFiles();
  let cleanFile = "";
  try {
    cleanFile = cleanLocalEditorFile(file);
  } catch {
    return fallback;
  }

  return Object.prototype.hasOwnProperty.call(files, cleanFile)
    ? String(files[cleanFile] ?? "")
    : fallback;
}

export function hasLocalEditorFile(file) {
  try {
    return Object.prototype.hasOwnProperty.call(
      readLocalEditorFiles(),
      cleanLocalEditorFile(file),
    );
  } catch {
    return false;
  }
}

export function saveLocalEditorFile(file, content = "") {
  const cleanFile = cleanLocalEditorFile(file);

  const files = readLocalEditorFiles();
  files[cleanFile] = String(content ?? "");
  writeLocalEditorFiles(files);

  return {
    files: listLocalEditorFiles(),
    file: cleanFile,
    content: files[cleanFile],
  };
}

export function deleteLocalEditorFile(file) {
  const cleanFile = cleanLocalEditorFile(file);
  const files = readLocalEditorFiles();
  if (!Object.prototype.hasOwnProperty.call(files, cleanFile)) {
    return { ok: 0, msg: "local file not found" };
  }

  delete files[cleanFile];
  writeLocalEditorFiles(files);
  return { ok: 1, files: listLocalEditorFiles(), file: cleanFile };
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

function parseLineValues(txt = "", availableValues = []) {
  const available = new Set(availableValues);
  return [
    ...new Set(
      String(txt || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
        .filter((value) => !available.size || available.has(value)),
    ),
  ];
}

export function readLocalLineFileValues(file, availableValues = []) {
  return parseLineValues(readLocalEditorFile(file, ""), availableValues);
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

export function deleteLocalWalletEntry({
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
  if (!hasLocalEditorFile(file)) return { ok: 0, msg: "wallet file not found" };

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

    const entry = parseWalletLines(line)[0];
    if (
      entry?.name == cleanName &&
      sameAddress(type, entry.address, cleanAddress)
    ) {
      removed = true;
      return false;
    }

    return true;
  });

  if (!removed) return { ok: 0, msg: "wallet not found" };

  saveLocalEditorFile(
    file,
    `${nextLines.join(newline)}${trailingNewline && nextLines.length ? newline : ""}`,
  );

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

function isReservedWalletSource(source = "") {
  return String(source || "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((part) => part.replace(/\.txt$/i, "").toLowerCase() == "watch");
}

export function listLocalWalletFileRecords(walletType = "evm") {
  const type = walletType == "solana" ? "solana" : "evm";
  const prefix = getLocalWalletPrefix(type);
  const files = readLocalEditorFiles();

  return Object.keys(files)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".txt"))
    .map((file) => {
      const source = getLocalWalletSource(file, type);
      const content = String(files[file] ?? "");

      return {
        file,
        source,
        walletType: type,
        content,
        entries: parseWalletLines(content),
        empty: !content.trim(),
        reserved: isReservedWalletSource(source),
      };
    })
    .sort((a, b) => a.source.localeCompare(b.source));
}

export function listLocalWalletSources(walletType = "evm") {
  const records = listLocalWalletFileRecords(walletType);
  const folders = records
    .map((record) => record.source.split("/").slice(0, -1).join("/"))
    .filter(Boolean)
    .map((dir) => `${dir}/`);

  return [
    ...new Set([
      ...folders,
      ...records.map((record) => record.source),
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

export function readLocalWalletEntries(
  walletType = "evm",
  source = "",
  { includeReserved = false } = {},
) {
  const type = walletType == "solana" ? "solana" : "evm";
  const cleanSource = String(source || "").trim().replace(/\/+$/, "");
  const matchingRecords = listLocalWalletFileRecords(type)
    .filter((record) => {
      if (!cleanSource && record.reserved && !includeReserved) return false;
      return (
        !cleanSource ||
        record.source == cleanSource ||
        record.source.startsWith(`${cleanSource}/`)
      );
    })
    .sort((a, b) => a.source.localeCompare(b.source));
  const usedNames = new Set();

  return matchingRecords.flatMap((record) => {
    return record.entries.map((entry) => {
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
        source: record.source,
        label: record.source ? `${record.source}/${entry.name}` : entry.name,
      };
    });
  });
}

export function getLocalCustomCoinM(chain = "") {
  const cleanChain = String(chain || "").trim();
  if (!cleanChain) return {};
  if (cleanChain == "Hyperliquid") {
    return getLocalHyperliquidVaultM();
  }

  try {
    const parsed = JSON.parse(readLocalEditorFile(`coins/${cleanChain}.json`, "{}") || "{}");
    return parsed && typeof parsed == "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function cleanLocalHyperliquidVaultCoin(value = "", address = "") {
  const clean = String(value || "")
    .trim()
    .replace(/\(([^)]{1,20})\)\s*$/, "$1")
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");
  const cleanAddress = String(address || "").replace(/^0x/i, "");
  const fallback = cleanAddress
    ? `HL_${cleanAddress.slice(0, 3)}..${cleanAddress.slice(-3)}`
    : "";

  return clean || fallback || "HL_VAULT";
}

function normalizeLocalHyperliquidVaultM(input = []) {
  const rows = Array.isArray(input)
    ? input
    : input && typeof input == "object"
      ? Object.entries(input).map(([coin, entry]) => ({ coin, ...(entry || {}) }))
      : [];
  const used = new Set();
  const vaultM = {};

  for (const entry of rows) {
    const address = String(entry?.address || entry?.vaultAddress || "").trim();
    if (!address) continue;
    const name = String(entry.name || "").trim();
    const paren = name.match(/\(([^)]{1,20})\)\s*$/)?.[1] || "";
    const baseCoin = cleanLocalHyperliquidVaultCoin(
      entry.coin || entry.symbol || paren || name,
      address,
    );
    let coin = baseCoin;
    let i = 2;
    while (used.has(coin)) {
      coin = `${baseCoin}_${i}`;
      i += 1;
    }
    used.add(coin);

    vaultM[coin] = {
      address,
      decimals: Number.isInteger(entry.decimals) ? entry.decimals : 6,
      name: name || coin,
      type: "vault",
      source: "editor",
    };
  }

  return vaultM;
}

function getLocalHyperliquidVaultList() {
  try {
    const parsed = JSON.parse(
      readLocalEditorFile("defi/hyperliquid.json", "[]") || "[]",
    );
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed == "object") {
      return Object.entries(parsed).map(([coin, entry]) => ({
        coin,
        ...(entry || {}),
      }));
    }
  } catch {}

  return [];
}

function getWritableLocalHyperliquidVaults(vaults = []) {
  return vaults
    .map((entry) => {
      const address = String(entry?.address || entry?.vaultAddress || "").trim();
      const name = String(entry?.name || "").trim();
      return address ? { address, name } : null;
    })
    .filter(Boolean);
}

function getLocalHyperliquidVaultM() {
  return normalizeLocalHyperliquidVaultM(getLocalHyperliquidVaultList());
}

export function getAllLocalCustomCoinM(chains = []) {
  return Object.fromEntries(
    (Array.isArray(chains) ? chains : [])
      .map((chain) => [chain, getLocalCustomCoinM(chain)])
      .filter(([, coins]) => Object.keys(coins).length),
  );
}

export function addLocalCustomCoin({ chain = "", coin = "", entry = {} } = {}) {
  const cleanChain = String(chain || "").trim();
  const cleanCoin = String(coin || "").trim();
  if (!cleanChain || !cleanCoin) return { ok: 0, msg: "missing coin data" };
  if (cleanChain == "Hyperliquid") {
    const file = "defi/hyperliquid.json";
    const vaults = getLocalHyperliquidVaultList();
    const address = String(entry.address || "").trim();
    const exists = vaults.find(
      (vault) =>
        String(vault.address || vault.vaultAddress || "").toLowerCase() ==
        address.toLowerCase(),
    );
    if (exists) {
      return { ok: 1, exists: 1, chain: cleanChain, coin: cleanCoin, file };
    }

    vaults.push({
      address,
      name: entry.name || cleanCoin,
    });
    saveLocalEditorFile(
      file,
      `${JSON.stringify(getWritableLocalHyperliquidVaults(vaults), null, 2)}\n`,
    );
    return { ok: 1, chain: cleanChain, coin: cleanCoin, entry, file };
  }

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

export function deleteLocalCustomCoin({ chain = "", coin = "" } = {}) {
  const cleanChain = String(chain || "").trim();
  const cleanCoin = String(coin || "").trim();
  if (!cleanChain || !cleanCoin) return { ok: 0, msg: "missing coin data" };
  if (cleanChain == "Hyperliquid") {
    const file = "defi/hyperliquid.json";
    const vaults = getLocalHyperliquidVaultList();
    const next = vaults.filter((vault) => {
      const name = String(vault.name || "").trim();
      const paren = name.match(/\(([^)]{1,20})\)\s*$/)?.[1] || "";
      const vaultCoin = cleanLocalHyperliquidVaultCoin(
        vault.coin || vault.symbol || paren || name,
        vault.address || vault.vaultAddress,
      );
      return vaultCoin != cleanCoin;
    });
    if (next.length == vaults.length) {
      return { ok: 0, msg: "custom vault not found" };
    }

    saveLocalEditorFile(
      file,
      `${JSON.stringify(getWritableLocalHyperliquidVaults(next), null, 2)}\n`,
    );
    return { ok: 1, chain: cleanChain, coin: cleanCoin, file };
  }

  const file = `coins/${cleanChain}.json`;
  let coins = {};
  try {
    coins = JSON.parse(readLocalEditorFile(file, "{}") || "{}") || {};
  } catch {
    return { ok: 0, msg: `${file} has invalid JSON` };
  }

  if (!Object.prototype.hasOwnProperty.call(coins, cleanCoin)) {
    return { ok: 0, msg: "custom coin not found" };
  }

  delete coins[cleanCoin];
  saveLocalEditorFile(file, `${JSON.stringify(coins, null, 2)}\n`);
  return { ok: 1, chain: cleanChain, coin: cleanCoin, file };
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
