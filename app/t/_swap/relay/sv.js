"use server";

import { ethers } from "ethers";
import {
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import coinM from "@/fn/coinM";
import { chainById, chainIds } from "@/data/basic";
import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";
import {
  assertWhitelistedRecipient,
  createJsonRpcProvider,
  erc20Abi,
  executeRawEvmTx,
  executeSolanaTx,
  executeTronTx,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getPrivateKey,
  getSolanaConnection,
  getSolanaKeypair,
  getSolanaPublicKey,
  getTradeCoinEntry,
  getTronAddress,
  getTronPrivateKey,
  getTronWeb,
  getUnsignedTx,
  nativeEvmAddress,
} from "../../sharedServer";
import { getArrayPayload, getTimeoutSignal, parseJson } from "../shared";

const relayApiBase = "https://api.relay.link";
const relayDiscoveryCacheM = {};
const nativeSolanaAddress = "11111111111111111111111111111111";
const nativeTronAddress = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const relayChainNameM = {
  "arbitrum one": "Arbitrum",
  arbitrum: "Arbitrum",
  avalanche: "Avalanche",
  "avalanche c-chain": "Avalanche",
  base: "Base",
  bnb: "BSC",
  "bnb smart chain": "BSC",
  bsc: "BSC",
  celo: "Celo",
  ethereum: "Ethereum",
  gnosis: "Gnosis",
  kaia: "Kaia",
  linea: "Linea",
  mantle: "Mantle",
  metis: "Metis",
  optimism: "Optimism",
  "op mainnet": "Optimism",
  polygon: "Polygon",
  scroll: "Scroll",
  solana: "Solana",
  sonic: "Sonic",
  tron: "Tron",
  wemix: "WEMIX",
  zksync: "zkSyncEra",
  "zksync era": "zkSyncEra",
};

function isSolanaAddress(address = "") {
  try {
    getSolanaPublicKey(address, "Solana address");
    return true;
  } catch {
    return false;
  }
}

function isTronAddress(address = "") {
  try {
    getTronAddress(address);
    return true;
  } catch {
    return false;
  }
}

function getRelayUserAddress(chain = "", address = "") {
  if (chain == "Solana") {
    return getSolanaPublicKey(address, "Solana wallet address").toBase58();
  }
  if (chain == "Tron") return getTronAddress(address, "Tron wallet address");

  return ethers.getAddress(address);
}

function getRelayRecipientAddress(chain = "", address = "") {
  if (!address) return "";

  if (chain == "Solana") {
    return getSolanaPublicKey(address, "Solana recipient address").toBase58();
  }
  if (chain == "Tron") {
    return getTronAddress(address, "Tron recipient address");
  }

  return ethers.getAddress(address);
}

function decodeSolanaInstructionData(data = "") {
  const text = String(data || "");
  const hex = text.startsWith("0x") ? text.slice(2) : text;
  if (/^[0-9a-fA-F]*$/.test(hex) && hex.length % 2 == 0) {
    return Buffer.from(hex, "hex");
  }

  return Buffer.from(text, "base64");
}

async function getSolanaLookupTables(connection, addresses = []) {
  const tables = await Promise.all(
    addresses.filter(Boolean).map((address) =>
      connection
        .getAddressLookupTable(getSolanaPublicKey(address, "lookup table"))
        .then((res) => res.value),
    ),
  );

  return tables.filter(Boolean);
}

async function getSolanaUnsignedTx({ txData = {}, user = "", type = "swap" }) {
  const instructions = Array.isArray(txData.instructions)
    ? txData.instructions
    : [];
  if (!instructions.length) throw new Error("Solana transaction missing instructions");

  const connection = getSolanaConnection();
  const payerKey = getSolanaPublicKey(user, "Solana wallet address");
  const lookupTables = await getSolanaLookupTables(
    connection,
    txData.addressLookupTableAddresses || [],
  );
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions: instructions.map(
      (ix) =>
        new TransactionInstruction({
          programId: getSolanaPublicKey(ix.programId, "Solana program id"),
          keys: (ix.keys || []).map((key) => ({
            pubkey: getSolanaPublicKey(key.pubkey, "Solana instruction key"),
            isSigner: !!key.isSigner,
            isWritable: !!key.isWritable,
          })),
          data: decodeSolanaInstructionData(ix.data),
        }),
    ),
  }).compileToV0Message(lookupTables);
  const tx = new VersionedTransaction(message);

  return {
    chain: "Solana",
    chainId: chainIds.Solana,
    type,
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    format: "solana:v0",
  };
}

function decodeTronTriggerMessage(value = "") {
  const text = String(value || "");
  if (!/^[0-9a-f]+$/i.test(text)) return text;

  try {
    return Buffer.from(text, "hex").toString("utf8");
  } catch {
    return text;
  }
}

async function getTronUnsignedTx({ txData = {}, user = "", type = "swap" }) {
  if (txData.type != "TriggerSmartContract") {
    throw new Error(`Relay Tron transaction unsupported: ${txData.type || "unknown"}`);
  }

  const parameter = txData.parameter || {};
  const owner = getTronAddress(parameter.owner_address, "Relay Tron owner");
  if (owner != getTronAddress(user, "Tron wallet address")) {
    throw new Error("Relay Tron transaction owner mismatch");
  }

  const tronWeb = getTronWeb();
  const result = await tronWeb.fullNode.request(
    "wallet/triggersmartcontract",
    {
      owner_address: parameter.owner_address,
      contract_address: parameter.contract_address,
      data: String(parameter.data || "").replace(/^0x/i, ""),
      call_value: parameter.call_value ?? 0,
      visible: false,
      fee_limit: 30_000_000,
    },
    "post",
  );
  if (!result?.transaction) {
    throw new Error(
      `Relay Tron trigger failed: ${
        decodeTronTriggerMessage(result?.result?.message) || "unknown error"
      }`,
    );
  }

  return {
    chain: "Tron",
    chainId: chainIds.Tron,
    type,
    transaction: result.transaction,
    format: "tron:transaction",
  };
}

function getRelayCurrency(chain = "", coin = "", dynamicCoinE = null) {
  const coinE = getTradeCoinEntry(chain, coin, dynamicCoinE);
  if (chain == "Solana" && coinE.native) return nativeSolanaAddress;
  if (chain == "Tron" && coinE.native) return nativeTronAddress;
  if (coinE.native) return nativeEvmAddress;
  if (!coinE.address) throw new Error(`coin address missing: ${chain} ${coin}`);

  return coinE.address;
}

function getRelayAmountIn({
  chain = "",
  fromCoin = "",
  amount = "",
  fromCoinE = null,
} = {}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, fromCoin, fromCoinE),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

function getRelayApprovalTarget({
  fromChain = "",
  fromCoin = "",
  fromCoinE = null,
  items = [],
} = {}) {
  if (fromChain == "Solana" || fromChain == "Tron") return null;

  const coinE = getTradeCoinEntry(fromChain, fromCoin, fromCoinE);
  if (!coinE || coinE.native) return null;
  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`coin address missing: ${fromChain} ${fromCoin}`);
  }

  const swapItem = items.find(
    (item) =>
      item.kind == "transaction" &&
      item.tx?.chain == fromChain &&
      item.tx?.to &&
      item.tx?.type != "approve",
  );
  if (!swapItem) return null;

  return {
    token: ethers.getAddress(coinE.address),
    spender: ethers.getAddress(swapItem.tx.to),
  };
}

async function getRelayAllowanceInfo({
  walletAddress = "",
  fromChain = "",
  fromCoin = "",
  fromCoinE = null,
  amountIn = 0n,
  items = [],
} = {}) {
  const target = getRelayApprovalTarget({
    fromChain,
    fromCoin,
    fromCoinE,
    items,
  });
  if (!target) {
    return {
      needed: false,
      token: "",
      spender: "",
      allowance: 0n,
      amountIn,
    };
  }

  const rpc = getChainRpc(fromChain);
  if (!rpc) throw new Error(`rpc not configured: ${fromChain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain: fromChain,
    scope: "Relay",
  });
  try {
    const owner = ethers.getAddress(walletAddress);
    const token = new ethers.Contract(target.token, erc20Abi, provider);
    const allowance = BigInt(await token.allowance(owner, target.spender));

    return {
      needed: allowance < amountIn,
      token: target.token,
      spender: target.spender,
      allowance,
      amountIn,
    };
  } finally {
    provider.destroy?.();
  }
}

function getRelayHeaders() {
  const apiKey = process.env.RELAY_API_KEY || process.env.relay_api_key;

  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
  };
}

async function relayFetch(endpoint, options = {}) {
  const {
    timeoutMs = 0,
    timeoutMessage = "Relay request timeout",
    ...fetchOptions
  } = options;
  const timeout = getTimeoutSignal(timeoutMs);
  try {
    const res = await fetch(`${relayApiBase}${endpoint}`, {
      ...fetchOptions,
      headers: {
        ...getRelayHeaders(),
        ...(fetchOptions.headers || {}),
      },
      ...(timeout.signal ? { signal: timeout.signal } : {}),
    });
    const text = await res.text();
    const data = parseJson(text);

    if (!res.ok) {
      const message =
        data?.message ||
        data?.error ||
        data?.description ||
        `Relay request failed: ${res.status}`;
      throw new Error(message);
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") throw new Error(timeoutMessage);
    throw e;
  } finally {
    timeout.clear?.();
  }
}

function getRelayLocalChain(entry = {}) {
  const chainId = Number(entry.id ?? entry.chainId ?? entry.chainID);
  if (Number.isFinite(chainId) && chainById[chainId]) {
    return chainById[chainId];
  }

  const names = [
    entry.displayName,
    entry.name,
    entry.chainName,
    entry.currency?.symbol,
  ];
  for (const nameE of names) {
    const name = String(nameE || "").trim().toLowerCase();
    if (relayChainNameM[name]) return relayChainNameM[name];
  }

  return "";
}

function normalizeRelayToken(token = {}, chain = "", chainId = "") {
  const symbol = String(token.symbol || "").trim();
  const coinInfoM = coinM?.[chain] || {};
  const tokenAddress = String(token.address || "");
  const added =
    !!(symbol && coinInfoM[symbol]) ||
    Object.values(coinInfoM).some(
      (coinE) =>
        tokenAddress &&
        coinE?.address &&
        (chain == "Solana" || chain == "Tron"
          ? String(coinE.address) == tokenAddress
          : String(coinE.address).toLowerCase() == tokenAddress.toLowerCase()),
    );

  return {
    chain,
    chainId,
    address: tokenAddress,
    symbol,
    name: token.name || "",
    decimals: Number(token.decimals),
    added,
  };
}

function normalizeRelayCurrency(token = {}) {
  const chainId = Number(token.chainId);
  const chain = chainById[chainId] || "";

  return normalizeRelayToken(token, chain, chainId);
}

function normalizeRelayChain(entry = {}) {
  const chainId = Number(entry.id ?? entry.chainId ?? entry.chainID);
  const chain = getRelayLocalChain(entry);
  const name = String(
    entry.displayName || entry.name || entry.chainName || chain || chainId || "",
  ).trim();

  return {
    chain,
    chainId: Number.isFinite(chainId) ? chainId : "",
    name,
    added: !!(chain && coinM?.[chain]),
    disabled: !!entry.disabled,
    depositEnabled: entry.depositEnabled !== false,
    explorerUrl: entry.explorerUrl || "",
    logoUrl: entry.logoUrl || entry.iconUrl || "",
    publicRpcUrl: entry.httpRpcUrl || "",
  };
}

function getRelayDiscoveryCache(key = "") {
  const cached = getDiscoveryCacheMapEntry(relayDiscoveryCacheM, key);
  if (!cached) return null;

  return {
    ...(cached.data || {}),
    cache: makeDiscoveryCacheMeta({
      source: "cache",
      at: cached.at,
      ttlMs: discoveryCacheMs,
    }),
  };
}

function setRelayDiscoveryCache(key = "", data = {}) {
  const at = Date.now();
  setDiscoveryCacheMapEntry(relayDiscoveryCacheM, key, { at, data });

  return {
    ...data,
    cache: makeDiscoveryCacheMeta({ source: "api", at, ttlMs: discoveryCacheMs }),
  };
}

export async function clearRelayRuntimeCache() {
  clearDiscoveryCacheMap(relayDiscoveryCacheM);

  return { ok: true };
}

export async function getRelaySupportedBridge({ refresh = false } = {}) {
  const cacheKey = "support";
  if (!refresh) {
    const cached = getRelayDiscoveryCache(cacheKey);
    if (cached) return cached;
  }

  const data = await relayFetch("/chains", {
    timeoutMs: 10000,
    timeoutMessage: "Relay discovery timeout",
  });
  const rows = getArrayPayload(data, ["chains", "data", "result"]);
  const chains = rows
    .map(normalizeRelayChain)
    .filter((entry) => (entry.chainId || entry.name) && !entry.disabled);
  const tokens = rows.flatMap((entry) => {
    const normalizedChain = normalizeRelayChain(entry);
    const chain = normalizedChain.chain;
    const chainId = normalizedChain.chainId;
    const tokenRows = [
      entry.currency,
      ...(Array.isArray(entry.featuredTokens) ? entry.featuredTokens : []),
      ...(Array.isArray(entry.erc20Currencies) ? entry.erc20Currencies : []),
      ...(Array.isArray(entry.solverCurrencies) ? entry.solverCurrencies : []),
    ].filter(Boolean);

    return tokenRows.map((token) => normalizeRelayToken(token, chain, chainId));
  });

  return setRelayDiscoveryCache(cacheKey, { chains, tokens });
}

export async function getRelayCurrencyDiscovery({
  chain = "",
  term = "",
  refresh = false,
} = {}) {
  const chainId = chainIds[chain];
  if (!chainId) throw new Error(`Relay chain missing: ${chain}`);

  const cleanTerm = String(term || "").trim();
  const cacheKey = `currency:${chain}:${cleanTerm.toLowerCase()}`;
  const useServerCache = !cleanTerm;
  if (useServerCache && !refresh) {
    const cached = getRelayDiscoveryCache(cacheKey);
    if (cached) return cached;
  }

  const body = {
    chainIds: [chainId],
    verified: true,
    limit: 100,
    useExternalSearch: !!cleanTerm,
  };

  if (cleanTerm) {
    const isAddress =
      chain == "Solana"
        ? isSolanaAddress(cleanTerm)
        : chain == "Tron"
          ? isTronAddress(cleanTerm)
          : ethers.isAddress(cleanTerm);
    body[isAddress ? "address" : "term"] = cleanTerm;
  } else {
    body.defaultList = true;
  }

  const data = await relayFetch("/currencies/v2", {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 10000,
    timeoutMessage: "Relay token discovery timeout",
  });
  const rows = getArrayPayload(data, ["currencies", "data", "result"]);
  const tokens = rows
    .map(normalizeRelayCurrency)
    .filter((entry) => entry.chain == chain && (entry.symbol || entry.address));

  if (!useServerCache) return { chain, term: cleanTerm, tokens };

  return setRelayDiscoveryCache(cacheKey, { chain, term: cleanTerm, tokens });
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

function relaySignMessageBytes(sign = {}) {
  const message =
    sign.message ??
    sign.data ??
    sign.value ??
    sign.signableMessage ??
    "";
  if (message instanceof Uint8Array) return message;
  if (Array.isArray(message)) return Uint8Array.from(message);
  if (Array.isArray(message?.data)) return Uint8Array.from(message.data);
  if (typeof message != "string") {
    return ethers.toUtf8Bytes(JSON.stringify(message || ""));
  }

  const text = message.trim();
  if (ethers.isHexString(text)) return ethers.getBytes(text);
  if (
    /^[A-Za-z0-9+/]+={0,2}$/.test(text) &&
    text.length % 4 == 0 &&
    text.length > 16
  ) {
    try {
      return Uint8Array.from(Buffer.from(text, "base64"));
    } catch {
      // Fall through to UTF-8.
    }
  }

  return ethers.toUtf8Bytes(message);
}

function bytesToBase58(bytes = []) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = [0];
  const bytesE = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);

  for (const byte of bytesE) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let zeroes = 0;
  while (zeroes < bytesE.length && bytesE[zeroes] == 0) zeroes += 1;

  return (
    "1".repeat(zeroes) +
    digits
      .reverse()
      .map((digit) => alphabet[digit])
      .join("")
  );
}

async function executeRelaySignatureStep({ privateKey = "", solanaKeypair = null, item }) {
  const sign = item?.sign || {};
  let signature;

  if (item?.chainId == chainIds.Solana || sign.signatureKind == "ed25519") {
    if (!solanaKeypair) throw new Error("Solana private key missing");
    const signed = ed25519.sign(
      relaySignMessageBytes(sign),
      solanaKeypair.secretKey.slice(0, 32),
    );
    signature = bytesToBase58(signed);
  } else if (item?.chainId == chainIds.Tron) {
    throw new Error("Relay Tron message signing is not supported");
  } else if (sign.signatureKind == "eip191") {
    const wallet = new ethers.Wallet(privateKey);
    const message = sign.message || "";
    signature = await wallet.signMessage(
      ethers.isHexString(message) ? ethers.getBytes(message) : message,
    );
  } else if (sign.signatureKind == "eip712") {
    const wallet = new ethers.Wallet(privateKey);
    const types = { ...(sign.types || {}) };
    delete types.EIP712Domain;
    signature = await wallet.signTypedData(sign.domain, types, sign.value);
  } else {
    throw new Error(`Relay signature unsupported: ${sign.signatureKind}`);
  }

  await postRelaySignature(item.post, signature);

  return { signatureKind: sign.signatureKind };
}

export async function executeRelaySwap({
  walletName = "",
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  fromCoinE = null,
  toCoinE = null,
  amount = "",
  recipient = "",
  approvalAmount = "",
} = {}) {
  if (
    fromChain != "Solana" &&
    fromChain != "Tron" &&
    !ethers.isAddress(walletAddress)
  ) {
    throw new Error("EVM wallet address required");
  }
  if (fromChain == "Tron") getTronAddress(walletAddress, "Tron wallet address");

  const privateKey =
    fromChain == "Solana" || fromChain == "Tron"
      ? ""
      : getPrivateKey(walletName);
  const solanaKeypair =
    fromChain == "Solana" ? getSolanaKeypair(walletName) : null;
  const tronPrivateKey =
    fromChain == "Tron" ? getTronPrivateKey(walletName) : "";
  if (fromChain != "Solana" && fromChain != "Tron" && !privateKey) {
    throw new Error(`private key missing: pk_raw_${walletName} or pk_${walletName}`);
  }
  if (fromChain == "Tron" && !tronPrivateKey) {
    throw new Error(
      `private key missing: pk_tron_raw_${walletName} or pk_tron_${walletName}`,
    );
  }
  try {
    assertWhitelistedRecipient({ address: recipient || walletAddress });
  } catch (e) {
    return {
      ok: false,
      dex: "Relay",
      error: e?.message || "recipient not whitelisted",
      txs: [],
      signatures: [],
    };
  }

  const built = await buildRelaySwapSteps({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    fromCoinE,
    toCoinE,
    amount,
    recipient,
    approvalAmount,
  });
  const txs = [];
  const signatures = [];

  for (const item of built.items || []) {
    if (item.kind == "transaction") {
      if (item.tx.chain == "Solana" || item.tx.format?.startsWith("solana:")) {
        if (!solanaKeypair) {
          throw new Error(`private key missing: pk_sol_raw_${walletName} or pk_sol_${walletName}`);
        }
        txs.push(
          await executeSolanaTx({
            keypair: solanaKeypair,
            expectedAddress: walletAddress,
            tx: item.tx,
          }),
        );
      } else if (
        item.tx.chain == "Tron" ||
        item.tx.format?.startsWith("tron:")
      ) {
        txs.push(
          await executeTronTx({
            privateKey: tronPrivateKey,
            expectedAddress: walletAddress,
            tx: item.tx,
          }),
        );
      } else {
        txs.push(
          await executeRawEvmTx({
            privateKey,
            expectedAddress: walletAddress,
            chainId: item.tx.chainId,
            txData: item.tx,
            type: item.tx.type || "tx",
          }),
        );
      }
    } else if (item.kind == "signature") {
      signatures.push(
        await executeRelaySignatureStep({
          privateKey,
          solanaKeypair,
          item,
        }),
      );
    } else {
      throw new Error(`Relay step unsupported: ${item.kind}`);
    }
  }
  if (!txs.length && !signatures.length) {
    throw new Error("Relay quote had no incomplete step items");
  }

  return {
    ok: true,
    dex: "Relay",
    requestIds: built.requestIds,
    txs,
    signatures,
    details: built.details,
  };
}

export async function buildRelaySwapSteps({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  fromCoinE = null,
  toCoinE = null,
  amount = "",
  recipient = "",
  approvalAmount = "",
  includeApprovals = true,
} = {}) {
  if (
    fromChain != "Solana" &&
    fromChain != "Tron" &&
    !ethers.isAddress(walletAddress)
  ) {
    throw new Error("EVM wallet address required");
  }
  if (fromChain == "Tron") getTronAddress(walletAddress, "Tron wallet address");

  const originChainId = chainIds[fromChain];
  const destinationChainId = chainIds[toChain];
  if (!originChainId) throw new Error(`Relay chain unsupported: ${fromChain}`);
  if (!destinationChainId) throw new Error(`Relay chain unsupported: ${toChain}`);
  const user = getRelayUserAddress(fromChain, walletAddress);
  const recipientAddress =
    getRelayRecipientAddress(toChain, recipient || walletAddress) || user;

  const parsedAmount = getRelayAmountIn({
    chain: fromChain,
    fromCoin,
    fromCoinE,
    amount,
  });

  const quote = await relayFetch("/quote/v2", {
    method: "POST",
    body: JSON.stringify({
      user,
      originChainId,
      destinationChainId,
      originCurrency: getRelayCurrency(fromChain, fromCoin, fromCoinE),
      destinationCurrency: getRelayCurrency(toChain, toCoin, toCoinE),
      amount: parsedAmount.toString(),
      tradeType: "EXACT_INPUT",
      recipient: recipientAddress,
      refundTo: user,
      usePermit: false,
      ...(fromChain == "Solana" ? { maxRouteLength: 4 } : {}),
    }),
  });
  const items = [];
  const requestIds = [];

  for (const step of quote.steps || []) {
    if (step.requestId) requestIds.push(step.requestId);
    for (const item of step.items || []) {
      if (item.status && item.status != "incomplete") continue;

      if (step.kind == "transaction") {
        const txData = item.data || {};
        const chainId = Number(txData.chainId || originChainId);
        const chain = chainById[chainId];
        if (!chain) throw new Error(`Relay chainId unsupported: ${chainId}`);

        items.push({
          kind: "transaction",
          requestId: step.requestId || "",
          tx:
            chain == "Solana" || Array.isArray(txData.instructions)
              ? await getSolanaUnsignedTx({
                  txData,
                  user,
                  type: step.id || "swap",
                })
              : chain == "Tron" || txData.type == "TriggerSmartContract"
                ? await getTronUnsignedTx({
                    txData,
                    user,
                    type: step.id || "swap",
                  })
              : getUnsignedTx({
                  chain,
                  chainId,
                  type: step.id || "swap",
                  txData,
                }),
        });
      } else if (step.kind == "signature") {
        const sign = item?.data?.sign;
        const post = item?.data?.post;
        if (!sign || !post) throw new Error("Relay signature data missing");

        items.push({
          kind: "signature",
          requestId: step.requestId || "",
          chainId: originChainId,
          sign,
          post,
        });
      } else {
        throw new Error(`Relay step unsupported: ${step.kind}`);
      }
    }
  }
  if (!items.length) throw new Error("Relay quote had no incomplete step items");

  const approval = await getRelayAllowanceInfo({
    walletAddress,
    fromChain,
    fromCoin,
    fromCoinE,
    amountIn: parsedAmount,
    items,
  });
  if (includeApprovals && approval.needed) {
    const approveAmount = getApprovalAmount({
      chain: fromChain,
      fromCoin,
      approvalAmount,
      amountIn: parsedAmount,
      defaultAmount: parsedAmount,
      decimals: fromCoinE?.decimals,
    });
    const approvalItems = [];

    if (approval.allowance > 0n) {
      approvalItems.push(
        getApproveTx({
          chain: fromChain,
          chainId: originChainId,
          token: approval.token,
          spender: approval.spender,
          amount: 0n,
        }),
      );
    }
    approvalItems.push(
      getApproveTx({
        chain: fromChain,
        chainId: originChainId,
        token: approval.token,
        spender: approval.spender,
        amount: approveAmount,
      }),
    );
    items.unshift(
      ...approvalItems.map((tx) => ({
        kind: "transaction",
        requestId: "",
        tx,
      })),
    );
  }

  return {
    ok: true,
    dex: "Relay",
    requestIds: [...new Set(requestIds)],
    items,
    approval: {
      needed: approval.needed,
      token: approval.token,
      spender: approval.spender,
      allowance: approval.allowance.toString(),
      amountIn: parsedAmount.toString(),
    },
    details: {
      rate: quote.details?.rate,
      timeEstimate: quote.details?.timeEstimate,
      amountIn: quote.details?.currencyIn?.amountFormatted,
      amountOut: quote.details?.currencyOut?.amountFormatted,
      amountOutUsd: quote.details?.currencyOut?.amountUsd,
    },
  };
}

export async function getRelaySwapPreview({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  fromCoinE = null,
  toCoinE = null,
  amount = "",
  recipient = "",
} = {}) {
  const built = await buildRelaySwapSteps({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    fromCoinE,
    toCoinE,
    amount,
    recipient,
    includeApprovals: false,
  });

  return {
    ok: true,
    fromChain,
    toChain,
    approvalNeeded: built.approval.needed,
    allowance: built.approval.allowance,
    approvalExpected: built.approval.amountIn,
    spender: built.approval.spender,
    amountIn: built.approval.amountIn,
    details: built.details,
  };
}
