import { ethers } from "ethers";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { TronWeb } from "tronweb";
import coinM from "@/fn/coinM";
import getCoinM from "@/fn/getCoinM";
import {
  getUnsignedTronTransaction,
  refreshTronTransaction,
} from "@/fn/tronTx";
import { getTronStakeV2State } from "@/fn/tronStake";
import { tronEnergyStakeCoinE } from "@/data/coins/tron";
import { chainById, chainIds } from "@/data/basic";
import { onWhitelist, rpcs, whitelists } from "@/sets";
import {
  cleanErrorText,
  createJsonRpcProvider,
  createSolanaConnection,
  getRpcOrigin,
  logRpcFailure,
  toCleanError,
} from "@/app/_fn/shared";
import { getCoinUsdPrice } from "../w/walletData";
export {
  cleanErrorText,
  createJsonRpcProvider,
  createSolanaConnection,
  getRpcOrigin,
  logRpcFailure,
  toCleanError,
};
export const nativeEvmAddress = "0x0000000000000000000000000000000000000000";
export const erc20Abi = [
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to,uint256 amount) returns (bool)",
];
export const erc20Interface = new ethers.Interface(erc20Abi);
const trc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];
const rpcFailureCooldownMs = 60_000;
const failedRpcM = globalThis.__w3FailedRpcM || new Map();
globalThis.__w3FailedRpcM = failedRpcM;

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

export async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function cleanMarketSymbol(symbol = "", address = "") {
  const cleanAddress = String(address || "").replace(/^0x/i, "");
  const clean = String(symbol || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");

  return clean || `TOKEN_${cleanAddress.slice(0, 6).toUpperCase()}`;
}

export function sameEvmAddress(a = "", b = "") {
  return (
    ethers.isAddress(a) &&
    ethers.isAddress(b) &&
    ethers.getAddress(a) == ethers.getAddress(b)
  );
}

function getWhitelistAddressKey(address = "") {
  const value = String(address || "").trim();
  if (!value) return "";
  if (ethers.isAddress(value)) return `evm:${ethers.getAddress(value).toLowerCase()}`;
  if (TronWeb.isAddress(value)) {
    return `tron:${TronWeb.address.fromHex(TronWeb.address.toHex(value))}`;
  }

  try {
    return `solana:${new PublicKey(value).toBase58()}`;
  } catch {
    return `raw:${value.toLowerCase()}`;
  }
}

export function isWhitelistedAddress(address = "") {
  if (!onWhitelist) return true;

  const addressKey = getWhitelistAddressKey(address);
  if (!addressKey) return false;

  const whitelistKeys = new Set(
    (Array.isArray(whitelists) ? whitelists : [])
      .map(getWhitelistAddressKey)
      .filter(Boolean),
  );

  return whitelistKeys.has(addressKey);
}

export function assertWhitelistedRecipient({
  address = "",
  label = "recipient",
} = {}) {
  if (!onWhitelist) return;
  if (isWhitelistedAddress(address)) return;

  throw new Error(`${label} not whitelisted`);
}

export async function mapWithConcurrency(items = [], limit = 3, fn) {
  const results = [];

  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }

  return results;
}

export async function getTradeCoinPrice({
  chain = "",
  coin = "",
  coinE = null,
} = {}) {
  const price = await getCoinUsdPrice({ chain, coin, coinE });

  return {
    ok: true,
    chain,
    coin,
    price,
  };
}

function formatCoinBalance({
  raw = 0n,
  chain = "",
  coin = "",
  address = "",
  decimals = null,
}) {
  const coinDecimals = Number.isInteger(decimals)
    ? decimals
    : getCoinDecimals(chain, coin);
  const balance = ethers.formatUnits(raw, coinDecimals);

  return {
    ok: true,
    chain,
    coin,
    address,
    raw: raw.toString(),
    balance,
    decimals: coinDecimals,
  };
}

function getDynamicCoinE(coinE = null) {
  if (!coinE || typeof coinE != "object") return null;

  const decimals = Number(coinE.decimals);
  const entry = {};

  if (Number.isInteger(decimals)) entry.decimals = decimals;
  if (coinE.native) entry.native = true;
  if (coinE.address) entry.address = String(coinE.address);

  return entry.native || entry.address ? entry : null;
}

function findCoinEntry(coinM = {}, coin = "") {
  const cleanCoinText = String(coin || "").trim();
  if (coinM[cleanCoinText]) return coinM[cleanCoinText];

  const cleanCoin = cleanCoinText.toLowerCase();
  const match = Object.entries(coinM).find(
    ([key]) => String(key || "").trim().toLowerCase() == cleanCoin,
  );

  return match?.[1] || null;
}

function isValidTradeCoinAddress(chain = "", address = "") {
  return !!normalizeTradeCoinAddress(chain, address);
}

function normalizeTradeCoinAddress(chain = "", address = "") {
  const text = String(address || "").trim();
  if (!text) return "";
  if (chain == "Solana") {
    try {
      return new PublicKey(text).toBase58();
    } catch {
      return "";
    }
  }
  if (chain == "Tron") {
    try {
      return TronWeb.isAddress(text)
        ? TronWeb.address.fromHex(TronWeb.address.toHex(text))
        : "";
    } catch {
      return "";
    }
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(text)) return "";

  try {
    return ethers.getAddress(text.toLowerCase());
  } catch {
    return "";
  }
}

function mergeTradeCoinEntries(chain = "", baseEntry = null, entry = null) {
  const merged = {
    ...(baseEntry || {}),
    ...(entry || {}),
  };
  const baseAddress = baseEntry?.address;

  if (
    baseAddress &&
    isValidTradeCoinAddress(chain, baseAddress) &&
    !isValidTradeCoinAddress(chain, merged.address)
  ) {
    merged.address = baseAddress;
  }

  const normalizedAddress = normalizeTradeCoinAddress(chain, merged.address);
  if (normalizedAddress) merged.address = normalizedAddress;

  return Object.keys(merged).length ? merged : null;
}

function getStaticCoinE(chain = "", coin = "") {
  const baseChainCoinM = coinM?.[chain];
  const chainCoinM = baseChainCoinM ? getCoinM(chain) : {};
  const baseCoinE = findCoinEntry(baseChainCoinM, coin);
  const coinE = findCoinEntry(chainCoinM, coin);

  return mergeTradeCoinEntries(chain, baseCoinE, coinE);
}

export function getTradeCoinEntry(chain = "", coin = "", dynamicCoinE = null) {
  const coinE = resolveTradeCoinEntry(chain, coin, dynamicCoinE);
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);

  return coinE;
}

export function resolveTradeCoinEntry(
  chain = "",
  coin = "",
  dynamicCoinE = null,
) {
  const staticCoinE = getStaticCoinE(chain, coin);
  const dynamicCoinEntry = getDynamicCoinE(dynamicCoinE);

  return mergeTradeCoinEntries(chain, staticCoinE, dynamicCoinEntry);
}

export async function getTradeCoinBalance({
  chain = "",
  coin = "",
  address = "",
  coinE: dynamicCoinE = null,
} = {}) {
  const coinE = resolveTradeCoinEntry(chain, coin, dynamicCoinE);
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (!address) throw new Error("recipient address missing");

  let raw = 0n;

  if (chain == "Solana") {
    const connection = getSolanaConnection();
    const owner = getSolanaPublicKey(address, "Solana recipient address");

    if (coinE.native) {
      raw = BigInt(await connection.getBalance(owner, "confirmed"));
    } else {
      const mint = getSolanaPublicKey(coinE.address, "Solana token mint");
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
        mint,
      });
      raw = accounts.value.reduce((sum, entry) => {
        const amount =
          entry.account?.data?.parsed?.info?.tokenAmount?.amount ?? "0";
        return sum + BigInt(amount);
      }, 0n);
    }
  } else if (chain == "Tron") {
    const owner = getTronAddress(address, "Tron recipient address");

    raw = await runTronRpc({
      scope: "trade Tron balance",
      action: async (tronWeb) => {
        if (coinE.syntheticKind == tronEnergyStakeCoinE.syntheticKind) {
          const account = await tronWeb.trx.getAccount(owner);
          return getTronStakeV2State(account).energyStakeRaw;
        }
        if (coinE.native) {
          return BigInt(await tronWeb.trx.getBalance(owner));
        }

        const tokenAddress = getTronAddress(
          coinE.address,
          "TRC-20 token address",
        );
        tronWeb.setAddress(owner);
        const token = tronWeb.contract(trc20BalanceAbi, tokenAddress);
        const balance = await token.balanceOf(owner).call({ from: owner });
        return BigInt(balance?.toString?.() ?? balance ?? 0);
      },
    });
  } else {
    if (!ethers.isAddress(address)) throw new Error("EVM recipient address invalid");
    const rpc = getUsableChainRpc(chain);
    if (!rpc) throw new Error(`rpc missing: ${chain}`);

    const provider = createJsonRpcProvider(rpc, {
      chain,
      scope: "trade balance",
    });
    try {
      const owner = ethers.getAddress(address);
      if (coinE.native) {
        raw = await provider.getBalance(owner);
      } else {
        if (!coinE.address || !ethers.isAddress(coinE.address)) {
          throw new Error(`coin address missing: ${chain} ${coin}`);
        }
        const token = new ethers.Contract(coinE.address, erc20Abi, provider);
        raw = await token.balanceOf(owner).catch((e) => {
          logRpcFailure({
            scope: "trade balance",
            chain,
            rpc,
            error: e,
          });
          return 0n;
        });
      }
    } finally {
      provider.destroy?.();
    }
  }

  const balanceE = formatCoinBalance({
    raw,
    chain,
    coin,
    address,
    decimals: coinE.decimals,
  });
  const isTronEnergyStake =
    coinE.syntheticKind == tronEnergyStakeCoinE.syntheticKind;
  const price = await getCoinUsdPrice({
    chain,
    coin: isTronEnergyStake ? "TRX" : coin,
    coinE: isTronEnergyStake ? resolveTradeCoinEntry(chain, "TRX") : coinE,
  }).catch(() => 0);

  return {
    ...balanceE,
    price,
    usd: price ? Number(balanceE.balance) * price : 0,
  };
}

function decodeEnvPrivateKey(value = "") {
  const text = String(value || "").trim();
  if (text.length < 6) return text;

  const chars = [...text];
  [chars[3], chars[5]] = [chars[5], chars[3]];

  return chars.join("");
}

export function getPrivateKey(walletName = "") {
  const rawKey = String(process.env[`pk_raw_${walletName}`] || "").trim();
  const key = rawKey || decodeEnvPrivateKey(process.env[`pk_${walletName}`]);
  if (!key) return "";

  return key.startsWith("0x") ? key : `0x${key}`;
}

export function getSolanaPrivateKey(walletName = "") {
  return (
    String(process.env[`pk_sol_raw_${walletName}`] || "").trim() ||
    decodeEnvPrivateKey(process.env[`pk_sol_${walletName}`])
  );
}

export function getTronPrivateKey(walletName = "") {
  const key =
    String(process.env[`pk_tron_raw_${walletName}`] || "").trim() ||
    decodeEnvPrivateKey(process.env[`pk_tron_${walletName}`]);

  return String(key || "").trim().replace(/^0x/i, "");
}

function base58ToBytes(text = "") {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = [0];

  for (const char of String(text || "").trim()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("invalid base58");

    let carry = value;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let zeroes = 0;
  for (const char of String(text || "")) {
    if (char != "1") break;
    zeroes += 1;
  }

  return Uint8Array.from([
    ...Array(zeroes).fill(0),
    ...bytes.reverse(),
  ]);
}

function parseSolanaSecretKey(secret = "") {
  const text = String(secret || "").trim();
  if (!text) return null;

  const candidates = [];
  const add = (bytes) => {
    if (bytes?.length == 32 || bytes?.length == 64) candidates.push(bytes);
  };

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) add(Uint8Array.from(parsed));
  } catch {}

  if (/^\d+(,\s*\d+)+$/.test(text)) {
    add(Uint8Array.from(text.split(",").map((n) => Number(n.trim()))));
  }

  if (/^(0x)?[0-9a-fA-F]+$/.test(text) && text.replace(/^0x/i, "").length % 2 == 0) {
    add(Uint8Array.from(Buffer.from(text.replace(/^0x/i, ""), "hex")));
  }

  try {
    add(Uint8Array.from(Buffer.from(text, "base64")));
  } catch {}

  try {
    add(base58ToBytes(text));
  } catch {}

  const bytes = candidates[0];
  if (!bytes) throw new Error("Solana private key format invalid");

  return bytes.length == 32 ? Keypair.fromSeed(bytes) : Keypair.fromSecretKey(bytes);
}

export function getSolanaKeypair(walletName = "") {
  const secret = getSolanaPrivateKey(walletName);
  if (!secret) {
    throw new Error(
      `private key missing: pk_sol_raw_${walletName} or pk_sol_${walletName}`,
    );
  }

  return parseSolanaSecretKey(secret);
}

function getConfiguredChainRpcs(chain = "") {
  const chainRpc = rpcs?.[chain];
  const list = Array.isArray(chainRpc)
    ? chainRpc
    : Array.isArray(chainRpc?.rpc)
      ? chainRpc.rpc
      : Array.isArray(chainRpc?.rpcs)
        ? chainRpc.rpcs
        : [chainRpc?.rpc ?? chainRpc?.rpcs ?? chainRpc];

  return list.filter(
    (rpc) =>
      rpc &&
      !String(rpc).includes("undefined") &&
      !String(rpc).includes("YOUR_KEY") &&
      !String(rpc).match(/\/v2\/?$/),
  );
}

export function getChainRpc(chain = "") {
  return getConfiguredChainRpcs(chain)[0];
}

export function getUsableChainRpcs(chain = "") {
  const now = Date.now();

  return getConfiguredChainRpcs(chain).filter((rpc) => {
    const failedAt = failedRpcM.get(rpc) || 0;
    if (!failedAt || now - failedAt > rpcFailureCooldownMs) {
      if (failedAt) failedRpcM.delete(rpc);
      return true;
    }

    return false;
  });
}

export function getUsableChainRpc(chain = "") {
  return getUsableChainRpcs(chain)[0];
}

export function getSolanaPublicKey(address = "", label = "Solana address") {
  try {
    return new PublicKey(address);
  } catch {
    throw new Error(`${label} invalid`);
  }
}

export function getSolanaConnection() {
  const rpc = getUsableChainRpc("Solana");
  if (!rpc) throw new Error("Solana rpc not configured");

  const connection = createSolanaConnection(rpc, {
    chain: "Solana",
    scope: "trade Solana",
  });

  return new Proxy(connection, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value != "function") return value;

      return (...args) => {
        try {
          const result = value.apply(target, args);
          if (result?.then) {
            return result.catch((error) => {
              throw toCleanError(error, `Solana RPC failed: ${getRpcOrigin(rpc)}`);
            });
          }

          return result;
        } catch (error) {
          throw toCleanError(error, `Solana RPC failed: ${getRpcOrigin(rpc)}`);
        }
      };
    },
  });
}

function isTronGridRpc(rpc = "") {
  try {
    const hostname = new URL(rpc).hostname.toLowerCase();
    return hostname == "api.trongrid.io" || hostname.endsWith(".trongrid.io");
  } catch {
    return false;
  }
}

function getTronGridHeaders(rpc = "") {
  const apiKey = String(
    process.env.TRONGRID_API_KEY || process.env.rpc_key_trongrid || "",
  ).trim();

  return apiKey && (!rpc || isTronGridRpc(rpc))
    ? { "TRON-PRO-API-KEY": apiKey }
    : {};
}

export function getTronAddress(address = "", label = "Tron address") {
  const text = String(address || "").trim();
  if (!TronWeb.isAddress(text)) throw new Error(`${label} invalid`);

  return TronWeb.address.fromHex(TronWeb.address.toHex(text));
}

export function getTronWeb(privateKey = "", rpcOverride = "") {
  const rpc = rpcOverride || getUsableChainRpc("Tron");
  if (!rpc) throw new Error("Tron API not configured");

  return new TronWeb({
    fullHost: rpc,
    headers: getTronGridHeaders(rpc),
    ...(privateKey ? { privateKey } : {}),
  });
}

function isRetryableTronRpcError(error) {
  const status = Number(error?.response?.status || error?.status || 0);
  if ([401, 403, 408, 425, 429].includes(status) || status >= 500) return true;

  const code = String(error?.code || "").toUpperCase();
  if (
    [
      "ECONNABORTED",
      "ECONNREFUSED",
      "ECONNRESET",
      "ENETUNREACH",
      "ENOTFOUND",
      "ERR_NETWORK",
      "ETIMEDOUT",
    ].includes(code)
  ) {
    return true;
  }

  return /(?:403|408|429|5\d\d|network|socket|timeout|timed out|fetch failed|gateway)/i.test(
    String(error?.message || ""),
  );
}

export async function runTronRpc({
  action,
  privateKey = "",
  scope = "trade Tron",
} = {}) {
  if (typeof action != "function") throw new Error("Tron RPC action missing");

  const rpcList = getUsableChainRpcs("Tron");
  if (!rpcList.length) throw new Error("Tron API temporarily unavailable");

  let lastError;
  for (const rpc of rpcList) {
    try {
      return await action(getTronWeb(privateKey, rpc), rpc);
    } catch (error) {
      lastError = error;
      if (!isRetryableTronRpcError(error)) throw error;

      failedRpcM.set(rpc, Date.now());
      logRpcFailure({ scope, chain: "Tron", rpc, error });
    }
  }

  throw toCleanError(lastError, `${scope} failed`);
}

export function getCoinDecimals(chain = "", coin = "", dynamicCoinE = null) {
  const decimals = resolveTradeCoinEntry(chain, coin, dynamicCoinE)?.decimals;
  if (!Number.isInteger(decimals)) {
    throw new Error(`coin decimals missing: ${chain} ${coin}`);
  }

  return decimals;
}

export function getWallet(privateKey = "", provider = null) {
  return provider
    ? new ethers.Wallet(privateKey, provider)
    : new ethers.Wallet(privateKey);
}

export function assertWalletMatches(wallet, expectedAddress = "") {
  if (expectedAddress && !ethers.isAddress(expectedAddress)) {
    throw new Error("selected wallet address is not an EVM address");
  }
  if (
    expectedAddress &&
    ethers.getAddress(wallet.address) != ethers.getAddress(expectedAddress)
  ) {
    throw new Error(`private key does not match ${expectedAddress}`);
  }
}

export function assertSolanaWalletMatches(keypair, expectedAddress = "") {
  if (!expectedAddress) return;

  const expected = getSolanaPublicKey(
    expectedAddress,
    "Solana wallet address",
  ).toBase58();
  const actual = keypair.publicKey.toBase58();
  if (actual != expected) {
    throw new Error(`pk_sol private key does not match ${expectedAddress}`);
  }
}

export function assertTronWalletMatches(privateKey = "", expectedAddress = "") {
  if (!privateKey) throw new Error("Tron private key missing");

  const actual = TronWeb.address.fromPrivateKey(privateKey);
  if (!actual) throw new Error("Tron private key invalid");
  if (
    expectedAddress &&
    actual != getTronAddress(expectedAddress, "Tron wallet address")
  ) {
    throw new Error(`pk_tron private key does not match ${expectedAddress}`);
  }

  return actual;
}

function positiveBigInt(value) {
  if (value === undefined || value === null || value === "") return null;

  const n = BigInt(value);

  return n > 0n ? n : null;
}

function getTxOverrides(txData = {}) {
  const gasLimit = positiveBigInt(txData.gasLimit) || positiveBigInt(txData.gas);
  const maxFeePerGas = positiveBigInt(txData.maxFeePerGas);
  const maxPriorityFeePerGas = positiveBigInt(txData.maxPriorityFeePerGas);
  const gasPrice = positiveBigInt(txData.gasPrice);

  return {
    ...(gasLimit ? { gasLimit } : {}),
    ...(maxFeePerGas ? { maxFeePerGas } : {}),
    ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
    ...(gasPrice ? { gasPrice } : {}),
  };
}

export function getUnsignedTx({ chain = "", chainId, type = "tx", txData = {} }) {
  return {
    chain,
    chainId: Number(chainId || txData.chainId),
    type,
    to: txData.to,
    data: txData.data || "0x",
    value: String(txData.value || 0),
    ...(txData.gas ? { gas: String(txData.gas) } : {}),
    ...(txData.gasLimit ? { gasLimit: String(txData.gasLimit) } : {}),
    ...(txData.gasPrice ? { gasPrice: String(txData.gasPrice) } : {}),
    ...(txData.maxFeePerGas
      ? { maxFeePerGas: String(txData.maxFeePerGas) }
      : {}),
    ...(txData.maxPriorityFeePerGas
      ? { maxPriorityFeePerGas: String(txData.maxPriorityFeePerGas) }
      : {}),
  };
}

export function getApproveTx({ chain = "", chainId, token = "", spender = "", amount }) {
  return getUnsignedTx({
    chain,
    chainId,
    type: "approve",
    txData: {
      to: ethers.getAddress(token),
      data: erc20Interface.encodeFunctionData("approve", [
        ethers.getAddress(spender),
        amount,
      ]),
      value: "0",
    },
  });
}

export async function executeRawEvmTx({
  privateKey,
  expectedAddress,
  chainId,
  txData = {},
  type = "tx",
}) {
  const txChainId = Number(chainId || txData.chainId);
  const txChain = chainById[txChainId];
  const rpc = getChainRpc(txChain);

  if (!txChain || !rpc) {
    throw new Error(`rpc not configured for chainId ${txChainId}`);
  }

  const provider = createJsonRpcProvider(rpc, {
    chain: txChain,
    scope: "evm tx",
  });
  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, expectedAddress);

    const tx = {
      to: txData.to,
      data: txData.data || "0x",
      value: BigInt(txData.value || 0),
      chainId: txChainId,
      ...getTxOverrides(txData),
    };
    const sent = await wallet.sendTransaction(tx);
    const receipt = await sent.wait();

    return {
      chain: txChain,
      type,
      hash: sent.hash,
      blockNumber: receipt?.blockNumber ?? null,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeSolanaTx({ keypair, expectedAddress, tx }) {
  assertSolanaWalletMatches(keypair, expectedAddress);
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(tx.transaction, "base64"),
  );
  transaction.sign([keypair]);

  const sent = await sendSolanaRawTransaction({
    transaction: Buffer.from(transaction.serialize()).toString("base64"),
  });

  return {
    chain: "Solana",
    type: tx.type || "tx",
    hash: sent.hash,
    blockNumber: null,
  };
}

export async function executeTronTx({
  privateKey = "",
  expectedAddress = "",
  tx,
  waitForConfirmation = true,
}) {
  assertTronWalletMatches(privateKey, expectedAddress);
  if (!tx?.transaction) throw new Error("Tron transaction missing");

  const tronWeb = getTronWeb(privateKey);
  const transaction = tx.refreshBlockRef
    ? await refreshTronTransaction(tronWeb, tx.transaction)
    : tx.transaction;
  const signed = await tronWeb.trx.sign(
    getUnsignedTronTransaction(transaction),
    privateKey,
  );
  const sent = await sendTronRawTransaction({
    transaction: signed,
    waitForConfirmation,
  });

  return {
    chain: "Tron",
    type: tx.type || "tx",
    hash: sent.hash,
    blockNumber: sent.blockNumber ?? null,
    pending: !!sent.pending,
  };
}

export async function approveExactIfNeeded({
  chain,
  token,
  owner,
  spender,
  amount,
  approvalAmount,
}) {
  const allowance = BigInt(await token.allowance(owner, spender));
  const txs = [];

  if (allowance >= amount) return txs;
  if (approvalAmount == null) {
    throw new Error("approval needed; confirm approval qty first");
  }

  try {
    const approveTx = await token.approve(spender, approvalAmount);
    const receipt = await approveTx.wait();
    txs.push({
      chain,
      type: "approve",
      hash: approveTx.hash,
      blockNumber: receipt?.blockNumber ?? null,
    });
  } catch (e) {
    if (allowance <= 0n) throw e;

    const clearTx = await token.approve(spender, 0);
    const clearReceipt = await clearTx.wait();
    txs.push({
      chain,
      type: "approve0",
      hash: clearTx.hash,
      blockNumber: clearReceipt?.blockNumber ?? null,
    });
    const approveTx = await token.approve(spender, approvalAmount);
    const receipt = await approveTx.wait();
    txs.push({
      chain,
      type: "approve",
      hash: approveTx.hash,
      blockNumber: receipt?.blockNumber ?? null,
    });
  }

  return txs;
}

export function getApprovalAmount({
  chain,
  fromCoin,
  approvalAmount,
  amountIn,
  defaultAmount = null,
  decimals,
}) {
  if (!String(approvalAmount ?? "").trim()) return defaultAmount;

  const parsed = ethers.parseUnits(
    String(approvalAmount),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, fromCoin),
  );
  if (parsed < amountIn) {
    throw new Error("approval qty cannot be less than sell qty");
  }

  return parsed;
}

export function getEvmTokenAddress(chain = "", coin = "", label = "token") {
  const coinE = getStaticCoinE(chain, coin);
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (coinE.native) throw new Error(`${label} native token not supported here`);
  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`${label} address missing: ${chain} ${coin}`);
  }

  return ethers.getAddress(coinE.address);
}

export async function getSolanaInstructionTx({
  user = "",
  instructions = [],
  type = "tx",
} = {}) {
  if (!instructions.length) throw new Error("Solana transaction missing instructions");

  const connection = getSolanaConnection();
  const payerKey = getSolanaPublicKey(user, "Solana wallet address");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);

  return {
    chain: "Solana",
    chainId: chainIds.Solana,
    type,
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    format: "solana:v0",
  };
}

export async function sendSolanaRawTransaction({ transaction = "" } = {}) {
  if (!transaction) throw new Error("signed Solana transaction missing");

  const connection = getSolanaConnection();
  const signature = await connection.sendRawTransaction(
    Buffer.from(transaction, "base64"),
    { skipPreflight: false },
  );
  const confirmation = await pollSolanaSignature(connection, signature);

  if (confirmation.value.err) {
    throw new Error(
      `Solana transaction failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  return { ok: true, chain: "Solana", hash: signature };
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollSolanaSignature(connection, signature = "") {
  const deadline = Date.now() + 60_000;
  let lastStatus = null;

  while (Date.now() < deadline) {
    const res = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = res?.value?.[0];

    if (status) {
      lastStatus = status;
      if (status.err) return { value: status };
      if (
        status.confirmationStatus == "confirmed" ||
        status.confirmationStatus == "finalized"
      ) {
        return { value: status };
      }
    }

    await sleep(1200);
  }

  throw new Error(
    lastStatus
      ? `Solana transaction confirmation timeout: ${lastStatus.confirmationStatus || "unknown"}`
      : "Solana transaction confirmation timeout",
  );
}

export async function confirmSolanaTransaction({ signature = "" } = {}) {
  if (!signature) throw new Error("Solana signature missing");

  const connection = getSolanaConnection();
  const confirmation = await pollSolanaSignature(connection, signature);

  if (confirmation.value.err) {
    throw new Error(
      `Solana transaction failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  return { ok: true, chain: "Solana", hash: signature };
}

function decodeTronMessage(value = "") {
  const text = String(value || "");
  if (!/^[0-9a-f]+$/i.test(text)) return text;

  try {
    return Buffer.from(text, "hex").toString("utf8");
  } catch {
    return text;
  }
}

function getTronFailureReason(info = {}) {
  const contractResult = String(info?.contractResult?.[0] || "")
    .trim()
    .replace(/^0x/i, "");

  if (contractResult.startsWith("08c379a0")) {
    try {
      return String(
        ethers.AbiCoder.defaultAbiCoder().decode(
          ["string"],
          `0x${contractResult.slice(8)}`,
        )[0] || "",
      ).trim();
    } catch {}
  }

  const message = decodeTronMessage(info?.resMessage).trim();
  return message && message != "REVERT opcode executed" ? message : "";
}

async function pollTronTransaction(tronWeb, hash = "") {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const info = await tronWeb.trx.getTransactionInfo(hash);
      if (info?.id || info?.receipt) {
        const result = info?.receipt?.result;
        if (result && result != "SUCCESS") {
          const reason = getTronFailureReason(info);
          throw new Error(
            `Tron transaction failed: ${result}${reason ? `: ${reason}` : ""} (tx ${hash})`,
          );
        }

        return info;
      }
    } catch (e) {
      if (String(e?.message || "").startsWith("Tron transaction failed:")) {
        throw e;
      }
    }

    await sleep(1200);
  }

  throw new Error("Tron transaction confirmation timeout");
}

export async function confirmTronTransaction({ hash = "" } = {}) {
  const cleanHash = String(hash || "").trim();
  if (!cleanHash) throw new Error("Tron transaction hash missing");

  const info = await pollTronTransaction(getTronWeb(), cleanHash);

  return {
    ok: true,
    chain: "Tron",
    hash: cleanHash,
    blockNumber: info?.blockNumber ?? null,
    pending: false,
  };
}

export async function sendTronRawTransaction({
  transaction = null,
  waitForConfirmation = true,
} = {}) {
  if (!transaction || typeof transaction != "object") {
    throw new Error("signed Tron transaction missing");
  }

  const tronWeb = getTronWeb();
  const result = await tronWeb.trx.sendRawTransaction(transaction);
  const hash = result?.txid || transaction?.txID || "";
  if (!result?.result || !hash) {
    throw new Error(
      decodeTronMessage(result?.message) ||
        result?.code ||
        "Tron transaction broadcast failed",
    );
  }

  if (!waitForConfirmation) {
    return {
      ok: true,
      chain: "Tron",
      hash,
      blockNumber: null,
      pending: true,
    };
  }

  const info = await pollTronTransaction(tronWeb, hash);

  return {
    ok: true,
    chain: "Tron",
    hash,
    blockNumber: info?.blockNumber ?? null,
    pending: false,
  };
}

export async function refreshBrowserTronTransaction({
  transaction = null,
} = {}) {
  if (!transaction?.raw_data) throw new Error("Tron transaction missing");

  return refreshTronTransaction(getTronWeb(), transaction);
}
