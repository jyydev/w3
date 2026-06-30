"use server";

import { ethers } from "ethers";
import {
  assertWalletMatches,
  getPrivateKey,
  getWallet,
} from "../sharedServer";
import { fetchWithTimeout } from "./shared";

const hyperliquidApiBase =
  process.env.HYPERLIQUID_API_BASE ||
  process.env.hyperliquid_api_base ||
  "https://api.hyperliquid.xyz";
const hyperliquidFetchTimeoutMs = 12000;
const hyperliquidMainnetApiBase = "https://api.hyperliquid.xyz";
const hyperliquidSignatureChainId = 0x66eee;
const hyperliquidSignatureChainIdHex = "0x66eee";

function bytesToHex(bytes = []) {
  return ethers.hexlify(Uint8Array.from(bytes));
}

function textToBytes(text = "") {
  return [...Buffer.from(String(text), "utf8")];
}

function pushUInt(bytes, value, byteLength) {
  const n = BigInt(value);

  for (let i = byteLength - 1; i >= 0; i -= 1) {
    bytes.push(Number((n >> BigInt(i * 8)) & 0xffn));
  }
}

function encodeMsgpackUInt(value) {
  const n = BigInt(value);
  const bytes = [];
  if (n < 0n) throw new Error("negative msgpack integers not supported");
  if (n <= 0x7fn) return [Number(n)];
  if (n <= 0xffn) return [0xcc, Number(n)];
  if (n <= 0xffffn) {
    pushUInt(bytes, n, 2);
    return [0xcd, ...bytes];
  }
  if (n <= 0xffffffffn) {
    pushUInt(bytes, n, 4);
    return [0xce, ...bytes];
  }

  pushUInt(bytes, n, 8);
  return [0xcf, ...bytes];
}

function encodeMsgpackString(value = "") {
  const body = textToBytes(value);
  const len = body.length;
  if (len <= 31) return [0xa0 | len, ...body];
  if (len <= 0xff) return [0xd9, len, ...body];
  if (len <= 0xffff) return [0xda, len >> 8, len & 0xff, ...body];

  const bytes = [];
  pushUInt(bytes, len, 4);
  return [0xdb, ...bytes, ...body];
}

function encodeMsgpack(value) {
  if (value === null || value === undefined) return [0xc0];
  if (typeof value == "boolean") return [value ? 0xc3 : 0xc2];
  if (typeof value == "bigint") return encodeMsgpackUInt(value);
  if (typeof value == "number") {
    if (!Number.isInteger(value)) throw new Error("msgpack number must be int");
    return encodeMsgpackUInt(value);
  }
  if (typeof value == "string") return encodeMsgpackString(value);
  if (Array.isArray(value)) {
    const items = value.flatMap((entry) => encodeMsgpack(entry));
    const len = value.length;
    if (len <= 15) return [0x90 | len, ...items];
    if (len <= 0xffff) return [0xdc, len >> 8, len & 0xff, ...items];
    const bytes = [];
    pushUInt(bytes, len, 4);
    return [0xdd, ...bytes, ...items];
  }
  if (typeof value == "object") {
    const entries = Object.entries(value);
    const items = entries.flatMap(([key, val]) => [
      ...encodeMsgpackString(key),
      ...encodeMsgpack(val),
    ]);
    const len = entries.length;
    if (len <= 15) return [0x80 | len, ...items];
    if (len <= 0xffff) return [0xde, len >> 8, len & 0xff, ...items];
    const bytes = [];
    pushUInt(bytes, len, 4);
    return [0xdf, ...bytes, ...items];
  }

  throw new Error(`msgpack unsupported value: ${typeof value}`);
}

function getHyperliquidActionHash({
  action,
  nonce,
  vaultAddress = "",
  expiresAfter = null,
} = {}) {
  const bytes = [...encodeMsgpack(action)];
  pushUInt(bytes, BigInt(nonce), 8);
  if (vaultAddress) {
    bytes.push(1);
    bytes.push(...ethers.getBytes(ethers.getAddress(vaultAddress)));
  } else {
    bytes.push(0);
  }
  if (expiresAfter != null) {
    bytes.push(0);
    pushUInt(bytes, BigInt(expiresAfter), 8);
  }

  return ethers.keccak256(bytesToHex(bytes));
}

function isHyperliquidMainnet() {
  return hyperliquidApiBase.replace(/\/+$/, "") == hyperliquidMainnetApiBase;
}

function getHyperliquidL1TypedData({
  action,
  nonce,
  vaultAddress = "",
  expiresAfter = null,
} = {}) {
  const connectionId = getHyperliquidActionHash({
    action,
    nonce,
    vaultAddress,
    expiresAfter,
  });

  return {
    actionHash: connectionId,
    domain: {
      chainId: 1337,
      name: "Exchange",
      verifyingContract: "0x0000000000000000000000000000000000000000",
      version: "1",
    },
    types: {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    },
    value: {
      source: isHyperliquidMainnet() ? "a" : "b",
      connectionId,
    },
  };
}

function getHyperliquidUserSignedTypedData({
  primaryType = "",
  payloadTypes = [],
  signatureChainId = hyperliquidSignatureChainId,
  value = {},
} = {}) {
  return {
    domain: {
      chainId: Number(BigInt(signatureChainId)),
      name: "HyperliquidSignTransaction",
      verifyingContract: "0x0000000000000000000000000000000000000000",
      version: "1",
    },
    types: {
      [primaryType]: payloadTypes,
    },
    value: {
      hyperliquidChain: isHyperliquidMainnet() ? "Mainnet" : "Testnet",
      ...value,
    },
  };
}

function normalizeHyperliquidSignatureChainId(value = hyperliquidSignatureChainIdHex) {
  const chainId = BigInt(value || hyperliquidSignatureChainIdHex);

  return {
    chainId: Number(chainId),
    chainIdHex: ethers.toQuantity(chainId),
  };
}

function splitSignature(signature = "") {
  const sig = ethers.Signature.from(signature);

  return {
    r: sig.r,
    s: sig.s,
    v: sig.v,
  };
}

function parseHyperliquidUsdAmount(amount = "") {
  const text = String(amount || "0").trim();
  if (!text || Number(text) <= 0) throw new Error("amount must be greater than 0");
  const [intPart, decimalPart = ""] = text.split(".");
  const cleanText = decimalPart
    ? `${intPart}.${decimalPart.slice(0, 6)}`
    : intPart;
  const usd = ethers.parseUnits(cleanText, 6);
  if (usd <= 0n) throw new Error("amount must be greater than 0");

  return Number(usd);
}

function getHyperliquidVaultAction({
  action = "lend",
  lendAddress = "",
  amount = "",
} = {}) {
  if (!ethers.isAddress(lendAddress)) {
    throw new Error("Hyperliquid vault address invalid");
  }

  return {
    type: "vaultTransfer",
    vaultAddress: ethers.getAddress(lendAddress).toLowerCase(),
    isDeposit: action != "redeem",
    usd: parseHyperliquidUsdAmount(amount),
  };
}

async function postHyperliquidExchange({
  action,
  nonce,
  signature,
  vaultAddress = null,
  expiresAfter = null,
} = {}) {
  const res = await fetchWithTimeout(
    `${hyperliquidApiBase.replace(/\/+$/, "")}/exchange`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        action,
        nonce,
        signature,
        vaultAddress,
        expiresAfter,
      }),
    },
    hyperliquidFetchTimeoutMs,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status == "err" || data?.error) {
    throw new Error(data?.response || data?.error || `${res.status} ${res.statusText}`);
  }

  return data;
}

export async function getHyperliquidLendPreview({
  walletAddress = "",
  action = "lend",
  lendAddress = "",
  amount = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }
  const vaultAction = getHyperliquidVaultAction({
    action,
    lendAddress,
    amount,
  });

  return {
    ok: true,
    defi: "Hyperliquid",
    chain: "Hyperliquid",
    action,
    approvalNeeded: false,
    allowance: "0",
    amountIn: String(vaultAction.usd),
    market: vaultAction.vaultAddress,
  };
}

export async function buildHyperliquidLendTxs({
  walletAddress = "",
  action = "lend",
  lendAddress = "",
  amount = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }
  const vaultAction = getHyperliquidVaultAction({
    action,
    lendAddress,
    amount,
  });
  const nonce = Date.now();
  const sign = getHyperliquidL1TypedData({
    action: vaultAction,
    nonce,
  });
  const txType = action == "redeem" ? "withdraw" : "deposit";

  return {
    ok: true,
    defi: "Hyperliquid",
    chain: "Hyperliquid",
    action: txType,
    amountIn: String(vaultAction.usd),
    market: vaultAction.vaultAddress,
    txs: [
      {
        chain: "Hyperliquid",
        type: txType,
        hash: sign.actionHash,
        action: vaultAction,
        nonce,
        sign: {
          signatureKind: "eip712",
          chainId: sign.domain.chainId,
          domain: sign.domain,
          types: sign.types,
          value: sign.value,
        },
      },
    ],
  };
}

export async function submitHyperliquidLendSignature({
  walletAddress = "",
  signerAddress = "",
  tx = {},
  signature = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }
  if (!tx?.action || !tx?.nonce || !tx?.sign) {
    throw new Error("Hyperliquid signed action missing");
  }

  const signer = ethers.verifyTypedData(
    tx.sign.domain,
    tx.sign.types,
    tx.sign.value,
    signature,
  );
  const expectedSigner = signerAddress || walletAddress;
  if (ethers.getAddress(signer) != ethers.getAddress(expectedSigner)) {
    throw new Error(`connected wallet is ${signer}`);
  }

  const response = await postHyperliquidExchange({
    action: tx.action,
    nonce: tx.nonce,
    signature: splitSignature(signature),
    vaultAddress: null,
    expiresAfter: null,
  });

  return {
    chain: "Hyperliquid",
    type: tx.type || "tx",
    hash: tx.hash || tx.sign.value.connectionId,
    response,
  };
}

export async function buildHyperliquidAgentApproval({
  walletAddress = "",
  agentAddress = "",
  agentName = "",
  signatureChainId = hyperliquidSignatureChainIdHex,
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }
  if (!ethers.isAddress(agentAddress)) {
    throw new Error("Hyperliquid agent address required");
  }

  const cleanAgentAddress = ethers.getAddress(agentAddress);
  const signatureChain = normalizeHyperliquidSignatureChainId(signatureChainId);
  const nonce = Date.now();
  const action = {
    type: "approveAgent",
    agentAddress: cleanAgentAddress,
    agentName: String(agentName || ""),
    nonce,
    signatureChainId: signatureChain.chainIdHex,
    hyperliquidChain: isHyperliquidMainnet() ? "Mainnet" : "Testnet",
  };
  const sign = getHyperliquidUserSignedTypedData({
    primaryType: "HyperliquidTransaction:ApproveAgent",
    signatureChainId: signatureChain.chainId,
    payloadTypes: [
      { name: "hyperliquidChain", type: "string" },
      { name: "agentAddress", type: "address" },
      { name: "agentName", type: "string" },
      { name: "nonce", type: "uint64" },
    ],
    value: {
      agentAddress: cleanAgentAddress,
      agentName: action.agentName,
      nonce,
    },
  });

  return {
    ok: true,
    defi: "Hyperliquid",
    chain: "Hyperliquid",
    action: "approveAgent",
    agentAddress: cleanAgentAddress,
    approval: action,
    sign: {
      signatureKind: "eip712",
      domain: sign.domain,
      types: sign.types,
      value: sign.value,
      skipChainSwitch: true,
    },
  };
}

export async function submitHyperliquidAgentApproval({
  walletAddress = "",
  approval = {},
  sign = {},
  signature = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }
  if (approval?.type != "approveAgent") {
    throw new Error("Hyperliquid agent approval missing");
  }

  const signer = ethers.verifyTypedData(
    sign.domain,
    sign.types,
    sign.value,
    signature,
  );
  if (ethers.getAddress(signer) != ethers.getAddress(walletAddress)) {
    throw new Error(`connected wallet is ${signer}`);
  }

  const response = await postHyperliquidExchange({
    action: approval,
    nonce: approval.nonce,
    signature: splitSignature(signature),
    vaultAddress: null,
    expiresAfter: null,
  });

  return {
    ok: true,
    chain: "Hyperliquid",
    type: "approveAgent",
    agentAddress: approval.agentAddress,
    hash: ethers.TypedDataEncoder.hash(sign.domain, sign.types, sign.value),
    response,
  };
}

export async function executeHyperliquidLend({
  walletName = "",
  walletAddress = "",
  action = "lend",
  lendAddress = "",
  amount = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const wallet = getWallet(privateKey);
  assertWalletMatches(wallet, walletAddress);
  const built = await buildHyperliquidLendTxs({
    walletAddress,
    action,
    lendAddress,
    amount,
  });
  const tx = built.txs[0];
  const signature = await wallet.signTypedData(
    tx.sign.domain,
    tx.sign.types,
    tx.sign.value,
  );
  const response = await postHyperliquidExchange({
    action: tx.action,
    nonce: tx.nonce,
    signature: splitSignature(signature),
    vaultAddress: null,
    expiresAfter: null,
  });

  return {
    ...built,
    txs: [
      {
        chain: "Hyperliquid",
        type: tx.type,
        hash: tx.hash,
        response,
      },
    ],
  };
}
