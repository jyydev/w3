"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getMint,
} from "@solana/spl-token";
import { ethers } from "ethers";
import baseCoinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import { projectFileWriteBlockedResult } from "../projectFileWrites";

const customCoinDir = path.join(process.cwd(), "data", "editor", "coins");
const metadataProgramId = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const solanaTokenProgramIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
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
    const provider = new ethers.JsonRpcProvider(rpc);
    try {
      const result = await fn(provider);
      provider.destroy?.();
      return result;
    } catch (e) {
      lastError = e;
      provider.destroy?.();
    }
  }

  throw new Error(
    lastError?.shortMessage ?? lastError?.message ?? `missing rpc: ${chain}`,
  );
}

async function withSolanaConnection(chain, fn) {
  let lastError;

  for (const rpc of getRpcs(chain)) {
    try {
      return await fn(new Connection(rpc, "confirmed"));
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(
    lastError?.message ?? lastError?.shortMessage ?? `missing rpc: ${chain}`,
  );
}

async function readCustomCoins(chain) {
  try {
    return JSON.parse(await fs.readFile(getCustomCoinFile(chain), "utf8"));
  } catch (e) {
    if (e.code == "ENOENT") return {};
    throw e;
  }
}

function getCustomCoinFile(chain) {
  return path.join(customCoinDir, `${chain}.json`);
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

function sameAddress(a, b) {
  if (!a || !b) return false;

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
  if (underlying || aaveUnderlying || exchangeRate !== null) return "lending";

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
    return "lending";
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
    return "stablecoin";
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

  throw new Error(lastError?.message ?? "invalid Solana token mint");
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
  const validAddress =
    selectedChain == "Solana" ? !!solanaMint : ethers.isAddress(address);
  if (!validAddress) {
    return { error: "invalid token contract address" };
  }

  const tokenAddress =
    selectedChain == "Solana"
      ? solanaMint.toBase58()
      : ethers.getAddress(address);

  return { selectedChain, tokenAddress };
}

async function getTokenMeta(selectedChain, tokenAddress) {
  return selectedChain == "Solana"
    ? await withSolanaConnection(selectedChain, (connection) =>
        getSolanaMetadata(connection, tokenAddress),
      )
    : await withProvider(selectedChain, async (provider) => {
        const token = new ethers.Contract(
          tokenAddress,
          erc20MetaAbi,
          provider,
        );
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

export async function previewCustomCoin({ chain, address } = {}) {
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
} = {}) {
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
    customCoins[requestedCoin] = {
      address: tokenAddress,
      decimals: meta.decimals,
      name: cleanText(name, meta.name || requestedCoin),
      type: finalType,
    };

    await fs.mkdir(customCoinDir, { recursive: true });
    await fs.writeFile(
      getCustomCoinFile(selectedChain),
      `${JSON.stringify(customCoins, null, 2)}\n`,
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
