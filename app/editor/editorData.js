import fs from "fs/promises";
import path from "path";
import coinM from "../../fn/coinM.js";
import {
  assertProjectFileWrites,
  projectFileWritesDisabled,
} from "../_editorData/projectFileWrites";

const editorDataDir = path.join(process.cwd(), "data", "editor");
const globalCoinDir = path.join(process.cwd(), "data", "coins");
const allowedExts = new Set([".json", ".txt", ".js"]);
const coinFileM = {
  Arbitrum: "arbitrum",
  Avalanche: "avalanche",
  Base: "base",
  BSC: "bsc",
  Ethereum: "ethereum",
  Kaia: "kaia",
  Optimism: "optimism",
  Solana: "solana",
  WEMIX: "wemix",
  zkSyncEra: "zkSyncEra",
};

async function ensureEditorDataDir() {
  await fs.mkdir(editorDataDir, { recursive: true });
}

function resolveEditorDataFile(file) {
  if (!file || typeof file != "string") throw new Error("Missing file name");
  if (file.includes("\0")) throw new Error("Invalid file name");
  if (path.isAbsolute(file)) throw new Error("Use a relative file name");

  const fullPath = path.resolve(editorDataDir, file);
  const relative = path.relative(editorDataDir, fullPath);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("File must stay inside data/editor");
  }

  const ext = path.extname(relative).toLowerCase();
  if (!allowedExts.has(ext)) {
    throw new Error("Use .json, .txt, or .js files only");
  }

  return {
    fullPath,
    relative: relative.split(path.sep).join("/"),
    ext,
  };
}

async function walkEditorData(dir = editorDataDir, base = "") {
  let entries = [];

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code == "ENOENT") return [];
    throw e;
  }

  const files = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkEditorData(full, rel)));
      continue;
    }

    if (entry.isFile() && allowedExts.has(path.extname(entry.name).toLowerCase())) {
      files.push(rel);
    }
  }

  return files;
}

export async function listEditorDataFiles() {
  if (!projectFileWritesDisabled()) await ensureEditorDataDir();
  return (await walkEditorData()).sort((a, b) => a.localeCompare(b));
}

export async function readEditorDataFile(file) {
  const files = await listEditorDataFiles();
  if (!file) return { files, file: "", content: "" };

  const { fullPath, relative } = resolveEditorDataFile(file);
  const content = await fs.readFile(fullPath, "utf8");
  return { files, file: relative, content };
}

export async function saveEditorDataFile(file, content) {
  assertProjectFileWrites();

  const { fullPath, relative, ext } = resolveEditorDataFile(file);
  const emptyJsonContent = /^coins?\/[^/]+\.json$/i.test(relative) ? "[]" : "{}";
  const saveContent =
    ext == ".json" && !String(content ?? "").trim()
      ? emptyJsonContent
      : (content ?? "");

  if (ext == ".json") JSON.parse(saveContent);

  await ensureEditorDataDir();
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, saveContent, "utf8");

  return {
    files: await listEditorDataFiles(),
    file: relative,
    content: saveContent,
  };
}

function getEditorCoinChain(file) {
  const normalized = String(file || "").replaceAll("\\", "/");
  const match = normalized.match(/^coins?\/([^/]+)\.json$/i);
  if (!match) throw new Error("Store globally only supports data/editor/coins/CHAIN.json");
  return match[1];
}

function formatObjectKey(key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

function formatValue(value, level = 1) {
  const indent = "  ".repeat(level);
  const nextIndent = "  ".repeat(level + 1);

  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value
      .map((item) => `${nextIndent}${formatValue(item, level + 1)}`)
      .join(",\n")}\n${indent}]`;
  }

  if (value && typeof value == "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return `{\n${entries
      .map(([k, v]) => `${nextIndent}${formatObjectKey(k)}: ${formatValue(v, level + 1)}`)
      .join(",\n")}\n${indent}}`;
  }

  return JSON.stringify(value);
}

function formatCoinEntry(symbol, coin) {
  return `  ${formatValue({ coin: symbol, ...coin })},\n`;
}

function normalizeAddress(address) {
  return typeof address == "string" ? address.toLowerCase() : "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value == "object" && !Array.isArray(value);
}

function normalizeCoinM(input = []) {
  return Object.fromEntries(
    (Array.isArray(input) ? input : [])
      .filter((entry) => entry && typeof entry == "object" && entry.coin)
      .map(({ coin, ...entry }) => [String(coin).trim(), entry])
      .filter(([coin]) => coin),
  );
}

function getWritableCoinList(coins = {}) {
  const coinMap =
    coins && typeof coins == "object" && !Array.isArray(coins)
      ? coins
      : normalizeCoinM(coins);

  return Object.entries(coinMap).map(([coin, entry]) => ({
    coin,
    ...(entry || {}),
  }));
}

async function appendGlobalCoins(chain, coins) {
  assertProjectFileWrites();

  const stagedCoinM =
    coins && typeof coins == "object" && !Array.isArray(coins)
      ? coins
      : normalizeCoinM(coins);
  const validEmpty = !Array.isArray(coins) || !coins.length;
  if (Array.isArray(coins) && !Object.keys(stagedCoinM).length && !validEmpty) {
    throw new Error("Coin JSON must be an array of coin objects");
  }

  const fileBase = coinFileM[chain];
  if (!fileBase) throw new Error(`Unknown coin chain: ${chain}`);

  const targetFile = path.join(globalCoinDir, `${fileBase}.js`);
  const targetRelative = `data/coins/${fileBase}.js`;
  const source = await fs.readFile(targetFile, "utf8");
  const existingCoins = coinM[chain] || {};
  const existingKeys = new Set(Object.keys(existingCoins));
  const existingAddresses = new Set(
    Object.values(existingCoins).map((coin) => normalizeAddress(coin?.address)).filter(Boolean),
  );

  for (const match of source.matchAll(/\n  \{\s*coin\s*:\s*(?:"([^"]+)"|'([^']+)')/g)) {
    existingKeys.add(match[1] || match[2] || match[3]);
  }
  for (const match of source.matchAll(/(?:address|["']address["'])\s*:\s*["']([^"']+)["']/g)) {
    existingAddresses.add(normalizeAddress(match[1]));
  }

  const added = [];
  const skipped = [];

  for (const [symbol, coin] of Object.entries(stagedCoinM)) {
    if (!isPlainObject(coin)) throw new Error(`${symbol} must be a coin object`);
    const address = normalizeAddress(coin?.address);
    if (existingKeys.has(symbol) || (address && existingAddresses.has(address))) {
      skipped.push(symbol);
      continue;
    }
    added.push([symbol, coin]);
    existingKeys.add(symbol);
    if (address) existingAddresses.add(address);
  }

  if (!added.length) return { targetFile: targetRelative, added: [], skipped };

  const exportMatch = source.match(/\nexport\s+default\s+[A-Za-z_$][\w$]*\s*;\s*$/);
  if (!exportMatch) throw new Error(`Cannot find export default in ${targetRelative}`);

  const objectEnd = source.lastIndexOf("\n];", exportMatch.index);
  if (objectEnd < 0) throw new Error(`Cannot find coin array end in ${targetRelative}`);

  const insert = added.map(([symbol, coin]) => formatCoinEntry(symbol, coin)).join("");
  await fs.writeFile(targetFile, `${source.slice(0, objectEnd)}\n${insert}${source.slice(objectEnd)}`);

  return { targetFile: targetRelative, added: added.map(([symbol]) => symbol), skipped };
}

export async function storeEditorCoinsGlobally(file, content) {
  const saved = await saveEditorDataFile(file, content);
  const chain = getEditorCoinChain(saved.file);
  const coins = normalizeCoinM(JSON.parse(saved.content || "[]"));
  const stored = await appendGlobalCoins(chain, coins);
  let result = saved;

  if (stored.added.length) {
    for (const symbol of stored.added) delete coins[symbol];
    result = await saveEditorDataFile(saved.file, `${JSON.stringify(getWritableCoinList(coins), null, 2)}\n`);
  }

  return {
    ...result,
    chain,
    ...stored,
  };
}
