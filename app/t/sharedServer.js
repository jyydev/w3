import { ethers } from "ethers";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import coinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import { getCoinUsdPrice } from "../w/walletData";

const relayApiBase = "https://api.relay.link";
export const nativeEvmAddress = "0x0000000000000000000000000000000000000000";

export const relayChainIds = {
  Ethereum: 1,
  Optimism: 10,
  BNB: 56,
  BSC: 56,
  Gnosis: 100,
  Polygon: 137,
  Sonic: 146,
  XLayer: 196,
  Fantom: 250,
  ZkSync: 324,
  zkSyncEra: 324,
  Metis: 1088,
  WEMIX: 1111,
  Soneium: 1868,
  Mantle: 5000,
  Base: 8453,
  Celo: 42220,
  Arbitrum: 42161,
  Avalanche: 43114,
  Linea: 59144,
  Scroll: 534352,
  Kaia: 8217,
  Harmony: 1666600000,
  Solana: 792703809,
};
export const relayChainById = Object.fromEntries(
  Object.entries(relayChainIds).map(([chain, id]) => [id, chain]),
);
export const erc20Abi = [
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to,uint256 amount) returns (bool)",
];
export const erc20Interface = new ethers.Interface(erc20Abi);

export async function getTradeCoinPrice({ chain = "", coin = "" } = {}) {
  const price = await getCoinUsdPrice({ chain, coin });

  return {
    ok: true,
    chain,
    coin,
    price,
  };
}

function formatCoinBalance({ raw = 0n, chain = "", coin = "", address = "" }) {
  const decimals = getCoinDecimals(chain, coin);
  const balance = ethers.formatUnits(raw, decimals);

  return {
    ok: true,
    chain,
    coin,
    address,
    raw: raw.toString(),
    balance,
    decimals,
  };
}

export async function getTradeCoinBalance({
  chain = "",
  coin = "",
  address = "",
} = {}) {
  const coinE = coinM?.[chain]?.[coin];
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
  } else {
    if (!ethers.isAddress(address)) throw new Error("EVM recipient address invalid");
    const rpc = getUsableChainRpc(chain);
    if (!rpc) throw new Error(`rpc missing: ${chain}`);

    const provider = new ethers.JsonRpcProvider(rpc);
    try {
      const owner = ethers.getAddress(address);
      if (coinE.native) {
        raw = await provider.getBalance(owner);
      } else {
        if (!coinE.address || !ethers.isAddress(coinE.address)) {
          throw new Error(`coin address missing: ${chain} ${coin}`);
        }
        const token = new ethers.Contract(coinE.address, erc20Abi, provider);
        raw = await token.balanceOf(owner);
      }
    } finally {
      provider.destroy?.();
    }
  }

  const balanceE = formatCoinBalance({ raw, chain, coin, address });
  const price = await getCoinUsdPrice({ chain, coin }).catch(() => 0);

  return {
    ...balanceE,
    price,
    usd: price ? Number(balanceE.balance) * price : 0,
  };
}

export function getPrivateKey(walletName = "") {
  const key = process.env[`pk_${walletName}`];
  if (!key) return "";

  return key.startsWith("0x") ? key : `0x${key}`;
}

export function getSolanaPrivateKey(walletName = "") {
  return String(process.env[`pk_sol_${walletName}`] || "").trim();
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
  if (!secret) throw new Error(`private key missing: pk_sol_${walletName}`);

  return parseSolanaSecretKey(secret);
}

export function getChainRpc(chain = "") {
  const chainRpc = rpcs?.[chain];
  const list = Array.isArray(chainRpc)
    ? chainRpc
    : Array.isArray(chainRpc?.rpc)
      ? chainRpc.rpc
      : Array.isArray(chainRpc?.rpcs)
        ? chainRpc.rpcs
        : [chainRpc?.rpc ?? chainRpc?.rpcs ?? chainRpc];

  return list.find(Boolean);
}

export function getUsableChainRpc(chain = "") {
  const chainRpc = rpcs?.[chain];
  const list = Array.isArray(chainRpc)
    ? chainRpc
    : Array.isArray(chainRpc?.rpc)
      ? chainRpc.rpc
      : Array.isArray(chainRpc?.rpcs)
        ? chainRpc.rpcs
        : [chainRpc?.rpc ?? chainRpc?.rpcs ?? chainRpc];

  return list.find(
    (rpc) =>
      rpc &&
      !String(rpc).includes("undefined") &&
      !String(rpc).includes("YOUR_KEY"),
  );
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

  return new Connection(rpc, "confirmed");
}

export function getCoinDecimals(chain = "", coin = "") {
  const decimals = coinM?.[chain]?.[coin]?.decimals;
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

function getRelayHeaders() {
  const apiKey = process.env.RELAY_API_KEY || process.env.relay_api_key;

  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
  };
}

function parseJson(text = "") {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}

async function postRelaySignature(post = {}, signature = "") {
  const endpoint = post.endpoint || "";
  if (!endpoint) throw new Error("Relay signature post endpoint missing");

  const url = new URL(`${relayApiBase}${endpoint}`);
  url.searchParams.set("signature", signature);
  const res = await fetch(url, {
    method: post.method || "POST",
    headers: getRelayHeaders(),
    body: JSON.stringify(post.body || {}),
  });
  const text = await res.text();
  const data = parseJson(text);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Relay signature post failed");
  }

  return data;
}

export async function submitRelaySignature({ post = {}, signature = "" } = {}) {
  if (!signature) throw new Error("Relay signature missing");

  return postRelaySignature(post, signature);
}

export async function executeRawEvmTx({
  privateKey,
  expectedAddress,
  chainId,
  txData = {},
  type = "tx",
}) {
  const txChainId = Number(chainId || txData.chainId);
  const txChain = relayChainById[txChainId];
  const rpc = getChainRpc(txChain);

  if (!txChain || !rpc) {
    throw new Error(`rpc not configured for chainId ${txChainId}`);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
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
}) {
  if (!String(approvalAmount ?? "").trim()) return defaultAmount;

  const parsed = ethers.parseUnits(
    String(approvalAmount),
    getCoinDecimals(chain, fromCoin),
  );
  if (parsed < amountIn) {
    throw new Error("approval qty cannot be less than sell qty");
  }

  return parsed;
}

export function getEvmTokenAddress(chain = "", coin = "", label = "token") {
  const coinE = coinM?.[chain]?.[coin];
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
    chainId: relayChainIds.Solana,
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

  return { ok: true, chain: "Solana", hash: signature };
}
