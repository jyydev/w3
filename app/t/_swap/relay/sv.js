"use server";

import { ethers } from "ethers";
import {
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import coinM from "@/fn/coinM";
import {
  assertWhitelistedRecipient,
  erc20Abi,
  executeRawEvmTx,
  executeSolanaTx,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getPrivateKey,
  getSolanaConnection,
  getSolanaKeypair,
  getSolanaPublicKey,
  getUnsignedTx,
  nativeEvmAddress,
  relayChainById,
  relayChainIds,
} from "../../sharedServer";
import { getArrayPayload, getTimeoutSignal, parseJson } from "../shared";

const relayApiBase = "https://api.relay.link";const nativeSolanaAddress = "11111111111111111111111111111111";
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

function getRelayUserAddress(chain = "", address = "") {
  return chain == "Solana"
    ? getSolanaPublicKey(address, "Solana wallet address").toBase58()
    : ethers.getAddress(address);
}

function getRelayRecipientAddress(chain = "", address = "") {
  if (!address) return "";

  return chain == "Solana"
    ? getSolanaPublicKey(address, "Solana recipient address").toBase58()
    : ethers.getAddress(address);
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
    chainId: relayChainIds.Solana,
    type,
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    format: "solana:v0",
  };
}

function getRelayCurrency(chain = "", coin = "") {
  const coinE = coinM?.[chain]?.[coin];
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (chain == "Solana" && coinE.native) return nativeSolanaAddress;
  if (coinE.native) return nativeEvmAddress;
  if (!coinE.address) throw new Error(`coin address missing: ${chain} ${coin}`);

  return coinE.address;
}

function getRelayAmountIn({ chain = "", fromCoin = "", amount = "" } = {}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, fromCoin),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

function getRelayApprovalTarget({
  fromChain = "",
  fromCoin = "",
  items = [],
} = {}) {
  if (fromChain == "Solana") return null;

  const coinE = coinM?.[fromChain]?.[fromCoin];
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
  amountIn = 0n,
  items = [],
} = {}) {
  const target = getRelayApprovalTarget({ fromChain, fromCoin, items });
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

  const provider = new ethers.JsonRpcProvider(rpc);
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
  if (Number.isFinite(chainId) && relayChainById[chainId]) {
    return relayChainById[chainId];
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
  const added =
    !!(symbol && coinInfoM[symbol]) ||
    Object.values(coinInfoM).some(
      (coinE) =>
        token.address &&
        coinE?.address &&
        String(coinE.address).toLowerCase() ==
          String(token.address).toLowerCase(),
    );

  return {
    chain,
    chainId,
    address: token.address || "",
    symbol,
    name: token.name || "",
    decimals: Number(token.decimals),
    added,
  };
}

function normalizeRelayCurrency(token = {}) {
  const chainId = Number(token.chainId);
  const chain = relayChainById[chainId] || "";

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

export async function getRelaySupportedBridge() {
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

  return { chains, tokens };
}

export async function getRelayCurrencyDiscovery({
  chain = "",
  term = "",
} = {}) {
  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`Relay chain missing: ${chain}`);

  const cleanTerm = String(term || "").trim();
  const body = {
    chainIds: [chainId],
    verified: true,
    limit: 100,
    useExternalSearch: !!cleanTerm,
  };

  if (cleanTerm) {
    const isAddress =
      chain == "Solana" ? isSolanaAddress(cleanTerm) : ethers.isAddress(cleanTerm);
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

  return { chain, term: cleanTerm, tokens };
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

  if (item?.chainId == relayChainIds.Solana || sign.signatureKind == "ed25519") {
    if (!solanaKeypair) throw new Error("Solana private key missing");
    const signed = ed25519.sign(
      relaySignMessageBytes(sign),
      solanaKeypair.secretKey.slice(0, 32),
    );
    signature = bytesToBase58(signed);
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
  amount = "",
  recipient = "",
  approvalAmount = "",
} = {}) {
  if (fromChain != "Solana" && !ethers.isAddress(walletAddress)) {
    throw new Error("EVM wallet address required");
  }

  const privateKey = fromChain == "Solana" ? "" : getPrivateKey(walletName);
  const solanaKeypair =
    fromChain == "Solana" ? getSolanaKeypair(walletName) : null;
  if (fromChain != "Solana" && !privateKey) {
    throw new Error(`private key missing: pk_${walletName}`);
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
          throw new Error(`private key missing: pk_sol_${walletName}`);
        }
        txs.push(
          await executeSolanaTx({
            keypair: solanaKeypair,
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
  amount = "",
  recipient = "",
  approvalAmount = "",
  includeApprovals = true,
} = {}) {
  if (fromChain != "Solana" && !ethers.isAddress(walletAddress)) {
    throw new Error("EVM wallet address required");
  }

  const originChainId = relayChainIds[fromChain];
  const destinationChainId = relayChainIds[toChain];
  if (!originChainId) throw new Error(`Relay chain unsupported: ${fromChain}`);
  if (!destinationChainId) throw new Error(`Relay chain unsupported: ${toChain}`);
  const user = getRelayUserAddress(fromChain, walletAddress);
  const recipientAddress =
    getRelayRecipientAddress(toChain, recipient || walletAddress) || user;

  const parsedAmount = getRelayAmountIn({
    chain: fromChain,
    fromCoin,
    amount,
  });

  const quote = await relayFetch("/quote/v2", {
    method: "POST",
    body: JSON.stringify({
      user,
      originChainId,
      destinationChainId,
      originCurrency: getRelayCurrency(fromChain, fromCoin),
      destinationCurrency: getRelayCurrency(toChain, toCoin),
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
        const chain = relayChainById[chainId];
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
  amount = "",
  recipient = "",
} = {}) {
  const built = await buildRelaySwapSteps({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
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
