import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import {
  cleanErrorText,
  createJsonRpcProvider,
  toCleanError,
} from "@/app/_fn/shared";

const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

export {
  cleanErrorText,
  createJsonRpcProvider,
};

export function sameEvmAddress(first = "", second = "") {
  return (
    ethers.isAddress(first) &&
    ethers.isAddress(second) &&
    ethers.getAddress(first) == ethers.getAddress(second)
  );
}

export function withTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ])
    .catch((error) => {
      throw toCleanError(error, message);
    })
    .finally(() => clearTimeout(timer));
}

export async function mapWithConcurrency(items = [], limit = 3, fn) {
  const results = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }

  return results;
}

export function cleanMarketSymbol(symbol = "", address = "") {
  const cleanAddress = String(address || "").replace(/^0x/i, "");
  const clean = String(symbol || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");

  return clean || `TOKEN_${cleanAddress.slice(0, 6).toUpperCase()}`;
}

export function getUsableChainRpcs(chain = "") {
  const chainRpcs = rpcs?.[chain] || [];
  const globalRpc = rpcs?.rpc || "";
  const seen = new Set();

  return [
    ...(Array.isArray(chainRpcs) ? chainRpcs : [chainRpcs]),
    globalRpc,
  ]
    .filter(Boolean)
    .filter((rpc) => {
      if (seen.has(rpc)) return false;
      seen.add(rpc);
      return true;
    });
}

export function getUsableChainRpc(chain = "") {
  return getUsableChainRpcs(chain)[0] || "";
}

export function getCoinByAddress(chain = "", address = "") {
  if (!ethers.isAddress(address)) return null;

  return (
    Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
      sameEvmAddress(coinE?.address, address),
    ) || null
  );
}

export async function getTokenMeta(
  provider,
  address = "",
  chain = "",
  fallbackCoin = "",
  timeoutMs = 10000,
) {
  const localCoin = getCoinByAddress(chain, address);
  if (localCoin) {
    const [symbol, coinE] = localCoin;

    return {
      address: ethers.getAddress(address),
      name: coinE.name || symbol,
      symbol,
      decimals: coinE.decimals ?? 18,
      fallback: false,
    };
  }

  const token = new ethers.Contract(address, erc20MetaAbi, provider);
  const [name, symbol, decimals] = await Promise.all([
    withTimeout(token.name(), timeoutMs, "token name timeout").catch(() => ""),
    withTimeout(token.symbol(), timeoutMs, "token symbol timeout").catch(
      () => fallbackCoin,
    ),
    withTimeout(token.decimals(), timeoutMs, "token decimals timeout").catch(
      () => 18,
    ),
  ]);

  return {
    address: ethers.getAddress(address),
    name: String(name || "").trim() || fallbackCoin,
    symbol: cleanMarketSymbol(symbol || fallbackCoin, address),
    decimals: Number(decimals),
    fallback: !String(symbol || "").trim(),
  };
}
