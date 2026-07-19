"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getMint,
} from "@solana/spl-token";
import { ethers } from "ethers";
import { TronWeb } from "tronweb";
import baseHyperliquidVaults from "@/data/defi/hyperliquid";
import baseCoinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import { projectFileWriteBlockedResult } from "../_editorData/projectFileWrites";
import {
  createJsonRpcProvider,
  createSolanaConnection,
  logRpcFailure,
  toCleanError,
} from "../_fn/shared";

const customCoinDir = path.join(process.cwd(), "data", "editor", "coins");
const customDefiDir = path.join(process.cwd(), "data", "editor", "defi");
const hyperliquidApiBase =
  process.env.HYPERLIQUID_API_BASE ||
  process.env.hyperliquid_api_base ||
  "https://api.hyperliquid.xyz";
const hyperliquidFetchTimeoutMs = 5000;
const metadataProgramId = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const solanaTokenProgramIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const trc20MetaAbi = ["name", "symbol", "decimals"].map((name) => ({
  type: "function",
  name,
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: name == "decimals" ? "uint8" : "string" }],
}));
const tokenTypeAbi = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function underlying() view returns (address)",
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
];
const stableSymbols = new Set([
  "BSC-USD",
  "BUSD",
  "DAI",
  "FDUSD",
  "FRAX",
  "LUSD",
  "USDC",
  "USDC.E",
  "USDE",
  "USDF",
  "USDS",
  "USDT",
  "USDT.E",
  "USD1",
]);
const governanceSymbols = new Set([
  "AAVE",
  "ARB",
  "CAKE",
  "COMP",
  "CRV",
  "FXS",
  "GMX",
  "LDO",
  "MKR",
  "PENDLE",
  "UNI",
]);
const wrappedSymbolPatterns = [
  /^W[A-Z0-9]+$/,
  /^BTCB$/,
  /^BTC\.B$/,
  /^WBTC(?:\.E)?$/,
  /^WETH(?:\.E)?$/,
];

function getRpcs(chain) {
  const chainRpc = rpcs?.[chain];
  const rpcList = Array.isArray(chainRpc) ? chainRpc : [chainRpc];
  return rpcList
    .map((rpc) => (typeof rpc == "string" ? rpc : rpc?.rpc))
    .filter(Boolean);
}

async function withProvider(chain, fn) {
  let lastError;

  for (const rpc of getRpcs(chain)) {
    const provider = createJsonRpcProvider(rpc, {
      chain,
      scope: "coin settings",
    });
    try {
      const result = await fn(provider);
      provider.destroy?.();
      return result;
    } catch (e) {
      lastError = e;
      provider.destroy?.();
    }
  }

  throw toCleanError(lastError, `missing rpc: ${chain}`);
}

async function withSolanaConnection(chain, fn) {
  let lastError;

  for (const rpc of getRpcs(chain)) {
    try {
      return await fn(
        createSolanaConnection(rpc, {
          chain,
          scope: "coin settings",
        }),
      );
    } catch (e) {
      lastError = e;
      logRpcFailure({
        scope: "coin settings",
        chain,
        rpc,
        error: e,
      });
    }
  }

  throw toCleanError(lastError, `missing rpc: ${chain}`);
}

function getTronGridHeaders() {
  const apiKey = String(process.env.rpc_key_trongrid || "").trim();

  return apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
}

async function withTronWeb(chain, fn) {
  let lastError;

  for (const rpc of getRpcs(chain)) {
    try {
      return await fn(
        new TronWeb({
          fullHost: rpc,
          headers: getTronGridHeaders(),
        }),
      );
    } catch (e) {
      lastError = e;
      logRpcFailure({
        scope: "coin settings",
        chain,
        rpc,
        error: e,
      });
    }
  }

  throw toCleanError(lastError, `missing rpc: ${chain}`);
}

async function readCustomCoins(chain) {
  try {
    return normalizeCustomCoinM(
      JSON.parse(await fs.readFile(getCustomCoinFile(chain), "utf8")),
    );
  } catch (e) {
    if (e.code == "ENOENT") return {};
    throw e;
  }
}

function normalizeCustomCoinM(input = []) {
  return Object.fromEntries(
    (Array.isArray(input) ? input : [])
      .filter((entry) => entry && typeof entry == "object" && entry.coin)
      .map(({ coin, ...entry }) => [String(coin).trim(), entry])
      .filter(([coin]) => coin),
  );
}

function getWritableCustomCoinList(coins = {}) {
  const coinMap =
    coins && typeof coins == "object" && !Array.isArray(coins)
      ? coins
      : normalizeCustomCoinM(coins);

  return Object.entries(coinMap).map(([coin, entry]) => ({
    coin,
    ...(entry || {}),
  }));
}

function getCustomCoinFile(chain) {
  return path.join(customCoinDir, `${chain}.json`);
}

function getCustomHyperliquidFile() {
  return path.join(customDefiDir, "hyperliquid.json");
}

function cleanSymbol(symbol, address) {
  const cleanAddress = String(address || "").replace(/^0x/i, "");
  const clean = String(symbol || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");

  return clean || `TOKEN_${cleanAddress.slice(0, 6).toUpperCase()}`;
}

function cleanText(value = "", fallback = "") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function cleanType(value = "", fallback = "token") {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "") || fallback
  );
}

function cleanVaultCoin(value = "", address = "") {
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

function sameAddress(a, b) {
  if (!a || !b) return false;

  const aTron = getTronAddress(a);
  const bTron = getTronAddress(b);
  if (aTron && bTron) return aTron == bTron;

  const aSol = getSolanaPublicKey(a);
  const bSol = getSolanaPublicKey(b);
  if (aSol && bSol) return aSol.equals(bSol);

  return a.toLowerCase() == b.toLowerCase();
}

function getSolanaPublicKey(address) {
  try {
    return new PublicKey(String(address || "").trim());
  } catch {
    return null;
  }
}

function isSolanaAddress(address) {
  return !!getSolanaPublicKey(address);
}

function getTronAddress(address) {
  const text = String(address || "").trim();
  if (!TronWeb.isAddress(text)) return "";

  try {
    return TronWeb.address.fromHex(TronWeb.address.toHex(text));
  } catch {
    return "";
  }
}

async function tryCall(contract, fn, args = []) {
  try {
    return await contract[fn](...args);
  } catch {
    return null;
  }
}

async function hasValidAddressCall(contract, fn) {
  const value = await tryCall(contract, fn);
  return typeof value == "string" && ethers.isAddress(value);
}

async function detectContractType(provider, address) {
  const token = new ethers.Contract(address, tokenTypeAbi, provider);
  const [token0, token1] = await Promise.all([
    hasValidAddressCall(token, "token0"),
    hasValidAddressCall(token, "token1"),
  ]);
  if (token0 && token1) return "lp";

  const asset = await hasValidAddressCall(token, "asset");
  if (asset) {
    const [totalAssets, convertToAssets] = await Promise.all([
      tryCall(token, "totalAssets"),
      tryCall(token, "convertToAssets", [1n]),
    ]);
    if (totalAssets !== null || convertToAssets !== null) return "yield";
  }

  const [underlying, aaveUnderlying, exchangeRate] = await Promise.all([
    hasValidAddressCall(token, "underlying"),
    hasValidAddressCall(token, "UNDERLYING_ASSET_ADDRESS"),
    tryCall(token, "exchangeRateStored"),
  ]);
  if (underlying || aaveUnderlying || exchangeRate !== null) return "lend";

  return "";
}

function includesAny(value, words) {
  const lower = String(value || "").toLowerCase();
  return words.some((word) => lower.includes(word));
}

function isStableSymbol(symbol) {
  const upper = String(symbol || "").toUpperCase();
  if (stableSymbols.has(upper)) return true;
  return /^(?:[A-Z]+)?USD[A-Z0-9.]*$/.test(upper);
}

function isWrappedSymbol(symbol) {
  const upper = String(symbol || "").toUpperCase();
  return wrappedSymbolPatterns.some((pattern) => pattern.test(upper));
}

async function detectCoinType({ provider, address, name, symbol }) {
  const contractType = await detectContractType(provider, address);
  if (contractType) return contractType;

  return detectTextType({ name, symbol });
}

function detectTextType({ name, symbol }) {
  const text = `${name} ${symbol}`;
  if (
    includesAny(text, [
      "aave",
      "compound",
      "fluid",
      "venus",
      "lending",
      "ctoken",
      "atoken",
    ])
  ) {
    return "lend";
  }
  if (
    includesAny(text, [
      "vault",
      "savings",
      "yield",
      "staked",
      "staking",
      "receipt",
      "wrapped staked",
    ])
  ) {
    return "yield";
  }
  if (isStableSymbol(symbol) || includesAny(name, ["stablecoin", "stable coin"])) {
    return "stable";
  }
  if (isWrappedSymbol(symbol) || includesAny(name, ["wrapped", "binance-peg"])) {
    return "wrapped";
  }
  if (governanceSymbols.has(String(symbol || "").toUpperCase())) {
    return "governance";
  }
  if (includesAny(text, ["aster", "perp", "trading"])) return "trading";

  return "token";
}

function readBorshString(data, offset) {
  const len = data.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + len;
  return {
    value: data
      .subarray(start, end)
      .toString("utf8")
      .replace(/\0/g, "")
      .trim(),
    offset: end,
  };
}

function parseSolanaMetadata(data) {
  let offset = 1 + 32 + 32;
  const name = readBorshString(data, offset);
  const symbol = readBorshString(data, name.offset);

  return {
    name: name.value,
    symbol: symbol.value,
  };
}

async function getSolanaMint(connection, mint) {
  let lastError;

  for (const programId of solanaTokenProgramIds) {
    try {
      return await getMint(connection, mint, "confirmed", programId);
    } catch (e) {
      lastError = e;
    }
  }

  throw toCleanError(lastError, "invalid Solana token mint");
}

async function getSolanaMetadata(connection, mintAddress) {
  const mint = getSolanaPublicKey(mintAddress);
  if (!mint) throw new Error("invalid Solana token mint");

  const mintInfo = await getSolanaMint(connection, mint);

  let name = "";
  let symbol = "";
  try {
    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        metadataProgramId.toBuffer(),
        mint.toBuffer(),
      ],
      metadataProgramId,
    );
    const metadataInfo = await connection.getAccountInfo(
      metadataAddress,
      "confirmed",
    );
    if (metadataInfo?.data) {
      ({ name, symbol } = parseSolanaMetadata(metadataInfo.data));
    }
  } catch {
    name = "";
    symbol = "";
  }

  const fallback = `TOKEN_${mint.toBase58().slice(0, 6)}`;
  symbol ||= fallback;
  name ||= symbol;

  return {
    decimals: mintInfo.decimals,
    name,
    symbol,
    type: detectTextType({ name, symbol }),
  };
}

function findCoinByAddress(coinMap, address) {
  return Object.entries(coinMap).find(([, coinE]) =>
    sameAddress(coinE?.address, address),
  );
}

function getVaultCoinFromEntry(entry = {}, address = "") {
  const name = String(entry.name || "").trim();
  const paren = name.match(/\(([^)]{1,20})\)\s*$/)?.[1] || "";
  return cleanVaultCoin(entry.coin || entry.symbol || paren || name, address);
}

function normalizeHyperliquidVaultList(input = []) {
  if (Array.isArray(input)) return input.filter(Boolean);

  return [];
}

function getWritableHyperliquidVaults(vaults = []) {
  return normalizeHyperliquidVaultList(vaults)
    .map((entry) => {
      const address = String(entry?.address || entry?.vaultAddress || "").trim();
      const name = String(entry?.name || "").trim();
      return address ? { address, name } : null;
    })
    .filter(Boolean);
}

async function readCustomHyperliquidVaults() {
  try {
    return normalizeHyperliquidVaultList(
      JSON.parse(await fs.readFile(getCustomHyperliquidFile(), "utf8")),
    );
  } catch (e) {
    if (e.code == "ENOENT") return [];
    throw e;
  }
}

function getHyperliquidVaultM(vaults = []) {
  const vaultM = {};

  for (const entry of normalizeHyperliquidVaultList(vaults)) {
    const address = String(entry?.address || entry?.vaultAddress || "").trim();
    if (!ethers.isAddress(address)) continue;

    const cleanAddress = ethers.getAddress(address);
    const coin = getVaultCoinFromEntry(entry, cleanAddress);
    vaultM[coin] = {
      address: cleanAddress,
      decimals: 6,
      name: String(entry.name || coin).trim() || coin,
      type: "vault",
    };
  }

  return vaultM;
}

function findVaultByAddress(vaultM, address) {
  return Object.entries(vaultM).find(([, entry]) =>
    sameAddress(entry?.address, address),
  );
}

function validateHyperliquidVaultAddress(address = "") {
  if (!ethers.isAddress(address)) return { error: "invalid vault address" };
  return { selectedChain: "Hyperliquid", tokenAddress: ethers.getAddress(address) };
}

async function hyperliquidInfo(body = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), hyperliquidFetchTimeoutMs);
  try {
    const res = await fetch(`${hyperliquidApiBase.replace(/\/+$/, "")}/info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      throw new Error(data?.error || `${res.status} ${res.statusText}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function getHyperliquidVaultMeta(address) {
  const data = await hyperliquidInfo({
    type: "vaultDetails",
    vaultAddress: address,
  });
  const name = cleanText(data?.name, `Hyperliquid vault ${address}`);

  return {
    name,
    symbol: getVaultCoinFromEntry({ name }, address),
    decimals: 6,
    type: "vault",
  };
}

async function previewHyperliquidVault({ address } = {}) {
  const validated = validateHyperliquidVaultAddress(address);
  if (validated.error) return { ok: 0, msg: validated.error };

  const { selectedChain, tokenAddress } = validated;

  try {
    const customVaults = await readCustomHyperliquidVaults();
    const vaultM = {
      ...getHyperliquidVaultM(baseHyperliquidVaults),
      ...getHyperliquidVaultM(customVaults),
    };
    const existingVault = findVaultByAddress(vaultM, tokenAddress);
    if (existingVault) {
      const [coin, entry] = existingVault;
      return {
        ok: 1,
        exists: 1,
        chain: selectedChain,
        coin,
        entry,
        msg: `${selectedChain} ${coin} already exists`,
      };
    }

    const meta = await getHyperliquidVaultMeta(tokenAddress);
    const coin = getCoinKey({
      chain: selectedChain,
      symbol: meta.symbol,
      address: tokenAddress,
      customCoins: {
        ...getHyperliquidVaultM(baseHyperliquidVaults),
        ...getHyperliquidVaultM(customVaults),
      },
    });

    return {
      ok: 1,
      chain: selectedChain,
      coin,
      entry: {
        address: tokenAddress,
        decimals: meta.decimals,
        name: meta.name || coin,
        type: "vault",
      },
    };
  } catch (e) {
    return {
      ok: 0,
      msg:
        e?.shortMessage ?? e?.reason ?? e?.message ?? "preview custom vault error",
    };
  }
}

function getCoinKey({ chain, symbol, address, customCoins }) {
  const coinMap = { ...(baseCoinM[chain] ?? {}), ...customCoins };
  const baseKey = cleanSymbol(symbol, address);
  const existing = coinMap[baseKey];
  if (!existing || sameAddress(existing.address, address)) return baseKey;

  const suffix = String(address || "")
    .replace(/^0x/i, "")
    .slice(0, 4)
    .toUpperCase();
  const suffixedKey = `${baseKey}_${suffix}`;
  if (
    !coinMap[suffixedKey] ||
    sameAddress(coinMap[suffixedKey].address, address)
  ) {
    return suffixedKey;
  }

  for (let i = 2; i < 100; i++) {
    const key = `${suffixedKey}_${i}`;
    if (!coinMap[key] || sameAddress(coinMap[key].address, address)) return key;
  }

  throw new Error(`too many duplicate symbols: ${baseKey}`);
}

function validateCoinAddress({ chain, address } = {}) {
  const selectedChain = String(chain || "").trim();
  if (!baseCoinM[selectedChain]) {
    return { error: `unsupported custom coin chain: ${selectedChain}` };
  }
  const solanaMint =
    selectedChain == "Solana" ? getSolanaPublicKey(address) : null;
  const tronAddress =
    selectedChain == "Tron" ? getTronAddress(address) : "";
  const validAddress =
    selectedChain == "Solana"
      ? !!solanaMint
      : selectedChain == "Tron"
        ? !!tronAddress
        : ethers.isAddress(address);
  if (!validAddress) {
    return { error: "invalid token contract address" };
  }

  const tokenAddress =
    selectedChain == "Solana"
      ? solanaMint.toBase58()
      : selectedChain == "Tron"
        ? tronAddress
        : ethers.getAddress(address);

  return { selectedChain, tokenAddress };
}

async function getTokenMeta(selectedChain, tokenAddress) {
  if (selectedChain == "Solana") {
    return withSolanaConnection(selectedChain, (connection) =>
      getSolanaMetadata(connection, tokenAddress),
    );
  }

  if (selectedChain == "Tron") {
    return withTronWeb(selectedChain, async (tronWeb) => {
      tronWeb.setAddress(tokenAddress);
      const token = tronWeb.contract(trc20MetaAbi, tokenAddress);
      const [name, symbol, decimals] = await Promise.all([
        token.name().call(),
        token.symbol().call(),
        token.decimals().call(),
      ]);
      const cleanName = cleanText(name);
      const cleanSymbol = cleanText(symbol);

      return {
        name: cleanName,
        symbol: cleanSymbol,
        decimals: Number(decimals?.toString?.() ?? decimals),
        type: detectTextType({
          name: cleanName,
          symbol: cleanSymbol,
        }),
      };
    });
  }

  return withProvider(selectedChain, async (provider) => {
    const token = new ethers.Contract(tokenAddress, erc20MetaAbi, provider);
    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
    ]);

    return {
      name,
      symbol,
      decimals: Number(decimals),
      type: await detectCoinType({
        provider,
        address: tokenAddress,
        name,
        symbol,
      }),
    };
  });
}

async function addHyperliquidVault({
  address,
  coin = "",
  name = "",
} = {}) {
  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const validated = validateHyperliquidVaultAddress(address);
  if (validated.error) return { ok: 0, msg: validated.error };

  const { selectedChain, tokenAddress } = validated;

  try {
    const customVaults = await readCustomHyperliquidVaults();
    const customVaultM = getHyperliquidVaultM(customVaults);
    const vaultM = {
      ...getHyperliquidVaultM(baseHyperliquidVaults),
      ...customVaultM,
    };
    const existingVault = findVaultByAddress(vaultM, tokenAddress);
    if (existingVault) {
      const [existingCoin, entry] = existingVault;
      return {
        ok: 1,
        exists: 1,
        chain: selectedChain,
        coin: existingCoin,
        entry,
        msg: `${selectedChain} ${existingCoin} already exists`,
      };
    }

    const meta = await getHyperliquidVaultMeta(tokenAddress);
    const requestedCoin = getCoinKey({
      chain: selectedChain,
      symbol: coin || meta.symbol,
      address: tokenAddress,
      customCoins: vaultM,
    });
    const existing = vaultM[requestedCoin];
    if (existing && !sameAddress(existing.address, tokenAddress)) {
      return {
        ok: 0,
        msg: `${selectedChain} ${requestedCoin} already exists with another address`,
      };
    }

    customVaults.push({
      address: tokenAddress,
      name: cleanText(name, meta.name || requestedCoin),
    });

    await fs.mkdir(customDefiDir, { recursive: true });
    await fs.writeFile(
      getCustomHyperliquidFile(),
      `${JSON.stringify(getWritableHyperliquidVaults(customVaults), null, 2)}\n`,
    );

    revalidatePath("/w");
    revalidatePath("/t");

    return {
      ok: 1,
      chain: selectedChain,
      coin: requestedCoin,
      entry: {
        address: tokenAddress,
        decimals: 6,
        name: cleanText(name, meta.name || requestedCoin),
        type: "vault",
      },
      file: "data/editor/defi/hyperliquid.json",
    };
  } catch (e) {
    return {
      ok: 0,
      msg: e?.shortMessage ?? e?.reason ?? e?.message ?? "add custom vault error",
    };
  }
}

async function deleteHyperliquidVault({ coin } = {}) {
  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const selectedCoin = String(coin || "").trim();
  if (!selectedCoin) return { ok: 0, msg: "missing vault" };

  try {
    const customVaults = await readCustomHyperliquidVaults();
    const nextVaults = customVaults.filter((entry) => {
      const address = String(entry?.address || entry?.vaultAddress || "").trim();
      const vaultCoin = getVaultCoinFromEntry(entry, address);
      return vaultCoin != selectedCoin;
    });
    if (nextVaults.length == customVaults.length) {
      return {
        ok: 0,
        msg: `Hyperliquid ${selectedCoin} is not an editor vault`,
      };
    }

    await fs.mkdir(customDefiDir, { recursive: true });
    await fs.writeFile(
      getCustomHyperliquidFile(),
      `${JSON.stringify(getWritableHyperliquidVaults(nextVaults), null, 2)}\n`,
    );

    revalidatePath("/w");
    revalidatePath("/t");

    return {
      ok: 1,
      chain: "Hyperliquid",
      coin: selectedCoin,
      file: "data/editor/defi/hyperliquid.json",
    };
  } catch (e) {
    return {
      ok: 0,
      msg: e?.shortMessage ?? e?.reason ?? e?.message ?? "delete custom vault error",
    };
  }
}

export async function previewCustomCoin({ chain, address } = {}) {
  if (String(chain || "").trim() == "Hyperliquid") {
    return previewHyperliquidVault({ address });
  }

  const validated = validateCoinAddress({ chain, address });
  if (validated.error) return { ok: 0, msg: validated.error };

  const { selectedChain, tokenAddress } = validated;

  try {
    const customCoins = await readCustomCoins(selectedChain);
    const existingCoin = findCoinByAddress(
      {
        ...(baseCoinM[selectedChain] ?? {}),
        ...customCoins,
      },
      tokenAddress,
    );
    if (existingCoin) {
      const [coin, coinE] = existingCoin;
      return {
        ok: 1,
        exists: 1,
        chain: selectedChain,
        coin,
        entry: coinE,
        msg: `${selectedChain} ${coin} already exists`,
      };
    }

    const meta = await getTokenMeta(selectedChain, tokenAddress);
    const coin = getCoinKey({
      chain: selectedChain,
      symbol: meta.symbol,
      address: tokenAddress,
      customCoins,
    });

    return {
      ok: 1,
      chain: selectedChain,
      coin,
      entry: {
        address: tokenAddress,
        decimals: meta.decimals,
        name: meta.name || coin,
        type: meta.type,
      },
    };
  } catch (e) {
    return {
      ok: 0,
      msg:
        e?.shortMessage ?? e?.reason ?? e?.message ?? "preview custom coin error",
    };
  }
}

export async function addCustomCoin({
  chain,
  address,
  coin = "",
  name = "",
  type = "",
  ref = "",
} = {}) {
  if (String(chain || "").trim() == "Hyperliquid") {
    return addHyperliquidVault({ address, coin, name });
  }

  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const validated = validateCoinAddress({ chain, address });
  if (validated.error) return { ok: 0, msg: validated.error };

  const { selectedChain, tokenAddress } = validated;

  try {
    const customCoins = await readCustomCoins(selectedChain);
    const existingCoin = findCoinByAddress(
      {
        ...(baseCoinM[selectedChain] ?? {}),
        ...customCoins,
      },
      tokenAddress,
    );
    if (existingCoin) {
      const [existingCoinName, coinE] = existingCoin;
      return {
        ok: 1,
        exists: 1,
        chain: selectedChain,
        coin: existingCoinName,
        entry: coinE,
        msg: `${selectedChain} ${existingCoinName} already exists`,
      };
    }

    const meta = await getTokenMeta(selectedChain, tokenAddress);
    const requestedCoin = cleanSymbol(coin || meta.symbol, tokenAddress);
    const existing = {
      ...(baseCoinM[selectedChain] ?? {}),
      ...customCoins,
    }[requestedCoin];
    if (existing && !sameAddress(existing.address, tokenAddress)) {
      return {
        ok: 0,
        msg: `${selectedChain} ${requestedCoin} already exists with another address`,
      };
    }

    const finalType = cleanType(type, meta.type || "token");
    const cleanRef = cleanText(ref, "");
    customCoins[requestedCoin] = {
      address: tokenAddress,
      decimals: meta.decimals,
      name: cleanText(name, meta.name || requestedCoin),
      type: finalType,
    };
    if (cleanRef) customCoins[requestedCoin].ref = cleanRef;

    await fs.mkdir(customCoinDir, { recursive: true });
    await fs.writeFile(
      getCustomCoinFile(selectedChain),
      `${JSON.stringify(getWritableCustomCoinList(customCoins), null, 2)}\n`,
    );

    revalidatePath("/w");
    revalidatePath("/t");

    return {
      ok: 1,
      chain: selectedChain,
      coin: requestedCoin,
      entry: customCoins[requestedCoin],
      file: `data/editor/coins/${selectedChain}.json`,
    };
  } catch (e) {
    return {
      ok: 0,
      msg: e?.shortMessage ?? e?.reason ?? e?.message ?? "add custom coin error",
    };
  }
}

export async function deleteCustomCoin({ chain, coin } = {}) {
  if (String(chain || "").trim() == "Hyperliquid") {
    return deleteHyperliquidVault({ coin });
  }

  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const selectedChain = String(chain || "").trim();
  const selectedCoin = String(coin || "").trim();
  if (!baseCoinM[selectedChain]) {
    return { ok: 0, msg: `unsupported custom coin chain: ${selectedChain}` };
  }
  if (!selectedCoin) return { ok: 0, msg: "missing coin" };

  try {
    const customCoins = await readCustomCoins(selectedChain);
    if (!Object.prototype.hasOwnProperty.call(customCoins, selectedCoin)) {
      return {
        ok: 0,
        msg: `${selectedChain} ${selectedCoin} is not an editor coin`,
      };
    }

    delete customCoins[selectedCoin];
    await fs.mkdir(customCoinDir, { recursive: true });
    await fs.writeFile(
      getCustomCoinFile(selectedChain),
      `${JSON.stringify(getWritableCustomCoinList(customCoins), null, 2)}\n`,
    );

    revalidatePath("/w");
    revalidatePath("/t");

    return {
      ok: 1,
      chain: selectedChain,
      coin: selectedCoin,
      file: `data/editor/coins/${selectedChain}.json`,
    };
  } catch (e) {
    return {
      ok: 0,
      msg:
        e?.shortMessage ??
        e?.reason ??
        e?.message ??
        "delete custom coin error",
    };
  }
}
