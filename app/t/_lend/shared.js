import { ethers } from "ethers";
import { Connection } from "@solana/web3.js";
import coinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import {
  cleanMarketSymbol,
  createJsonRpcProvider,
  logRpcFailure,
  sameEvmAddress,
  withTimeout,
} from "../sharedServer";

export {
  cleanMarketSymbol,
  createJsonRpcProvider,
  logRpcFailure,
  mapWithConcurrency,
  sameEvmAddress,
  withTimeout,
} from "../sharedServer";

const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

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

export async function getSolanaMultipleAccountsInfoFast(pubkeys = [], timeoutMs = 9000) {
  if (!pubkeys.length) return [];

  const rpcList = getUsableChainRpcs("Solana").slice(0, 4);
  if (!rpcList.length) throw new Error("Solana rpc not configured");

  try {
    return await Promise.any(
      rpcList.map((rpc) => {
        const connection = new Connection(rpc, "confirmed");
        return withTimeout(
          connection.getMultipleAccountsInfo(pubkeys, "confirmed"),
          timeoutMs,
          `Solana RPC timeout: ${rpc}`,
        );
      }),
    );
  } catch (e) {
    const errors = Array.isArray(e?.errors) ? e.errors : [e];
    const message =
      errors.find((err) => err?.message)?.message ||
      "Solana Jupiter markets timeout";
    throw new Error(message);
  }
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
  timeoutMs = 10000,
) {
  const localCoin = Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
    sameEvmAddress(coinE?.address, address),
  );
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
    withTimeout(
      token.symbol(),
      timeoutMs,
      "token symbol timeout",
    ).catch(() => ""),
    withTimeout(
      token.decimals(),
      timeoutMs,
      "token decimals timeout",
    ).catch(() => 18),
  ]);

  return {
    address: ethers.getAddress(address),
    name: String(name || "").trim(),
    symbol: cleanMarketSymbol(symbol, address),
    decimals: Number(decimals),
    fallback: !String(symbol || "").trim(),
  };
}
