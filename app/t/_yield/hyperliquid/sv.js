"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import {
  assertWalletMatches,
  erc20Interface,
  executeRawEvmTx,
  getPrivateKey,
  getUnsignedTx,
  getWallet,
  relayChainIds,
} from "../../sharedServer";
import { fetchWithTimeout } from "../shared";

const hyperliquidApiBase =
  process.env.HYPERLIQUID_API_BASE ||
  process.env.hyperliquid_api_base ||
  "https://api.hyperliquid.xyz";
const hyperliquidFetchTimeoutMs = 12000;
const hyperliquidMainnetApiBase = "https://api.hyperliquid.xyz";
const hyperliquidUnitApiBase = "https://api.hyperunit.xyz";
const hyperliquidSignatureChainId = 0x66eee;
const hyperliquidSignatureChainIdHex = "0x66eee";
const hyperliquidBridgeM = {
  Arbitrum: {
    coin: "USDC",
    bridge: "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7",
    minAmount: 5,
  },
};
const hyperliquidUnitRouteAssetM = {
  usdc: [
    { label: "Arbitrum (CCTP)", value: "arbitrum_cctp" },
    { label: "Arbitrum", value: "arbitrum" },
    { label: "Arbitrum (Swap USDT for USDC)", value: "lifi" },
    { label: "HyperEVM", value: "evm" },
  ],
  usdh: [{ label: "Arbitrum", value: "arbitrum_across" }],
  usdt: [{ label: "Arbitrum (Swap USDT for USDC)", value: "lifi" }],
  btc: [{ label: "Bitcoin", value: "bitcoin" }],
  eth: [{ label: "Ethereum", value: "ethereum" }],
  sol: [{ label: "Solana", value: "solana" }],
  "2z": [{ label: "Solana", value: "solana" }],
  avax: [{ label: "Avalanche", value: "avalanche" }],
  bonk: [{ label: "Solana", value: "solana" }],
  fart: [{ label: "Solana", value: "solana" }],
  mon: [{ label: "Monad", value: "monad" }],
  pump: [{ label: "Solana", value: "solana" }],
  spxs: [{ label: "Solana", value: "solana" }],
  virtual: [{ label: "Base", value: "base" }],
  xpl: [{ label: "Plasma", value: "plasma" }],
  zec: [{ label: "Zcash", value: "zcash" }],
};
const hyperliquidUnitCoinM = {
  "2z": "2Z",
  avax: "AVAX",
  bonk: "BONK",
  btc: "BTC",
  eth: "ETH",
  fart: "FART",
  mon: "MON",
  pump: "PUMP",
  sol: "SOL",
  spxs: "SPXS",
  usdc: "USDC",
  usdh: "USDH",
  usdt: "USDT",
  virtual: "VIRTUAL",
  xpl: "XPL",
  zec: "ZEC",
};
const hyperliquidUnitRouteChainM = {
  arbitrum: "Arbitrum",
  arbitrum_across: "Arbitrum",
  arbitrum_cctp: "Arbitrum",
  avalanche: "Avalanche",
  base: "Base",
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  evm: "HyperEVM",
  lifi: "Arbitrum",
  monad: "Monad",
  plasma: "Plasma",
  solana: "Solana",
  zcash: "Zcash",
};
const hyperliquidUnitWithdrawHiddenRoutes = new Set([
  "arbitrum_across",
  "base_across",
  "lifi",
]);
const hyperliquidStaticRouteFeeM = {
  deposit: {
    "arbitrum:usdc": { fee: "0.2" },
    "arbitrum_cctp:usdc": { fee: "0.2" },
  },
  withdraw: {
    "arbitrum:usdc": { fee: "1", eta: "5m" },
    "arbitrum_cctp:usdc": { fee: "1", eta: "5m" },
  },
};

function getHyperliquidUnitFeeGroup(route = "", asset = "") {
  if (route == "base" && asset != "eth") return "base-erc20";
  if (route == "ethereum" && asset != "eth") return "ethereum-erc20";
  if (
    route == "solana" &&
    !["sol"].includes(String(asset || "").toLowerCase())
  ) {
    return "spl";
  }

  return route;
}

function getHyperliquidUnitFeeValue(
  fees = {},
  route = "",
  asset = "",
  action = "deposit",
) {
  const group = getHyperliquidUnitFeeGroup(route, asset);
  const entry = fees?.[group] || {};
  const actionKey = action == "withdraw" ? "withdrawal" : "deposit";
  const camelActionKey = action == "withdraw" ? "withdrawal" : "deposit";
  const feeKeys = [
    `${group}-${actionKey}-fee-in-units`,
    `${group}-${actionKey}FeeInUnits`,
    `${actionKey}-fee-in-units`,
  ];
  const etaKeys = [
    `${group}-${actionKey}-eta`,
    `${group}-${camelActionKey}Eta`,
    `${actionKey}-eta`,
  ];

  const staticFeeE =
    hyperliquidStaticRouteFeeM?.[action]?.[
      `${String(route || "").toLowerCase()}:${String(asset || "").toLowerCase()}`
    ] || {};

  return {
    fee:
      feeKeys
        .map((key) => entry?.[key])
        .find((value) => value !== undefined && value !== null) ||
      staticFeeE.fee ||
      "",
    eta:
      etaKeys
        .map((key) => entry?.[key])
        .find((value) => value !== undefined && value !== null) ||
      staticFeeE.eta ||
      "",
  };
}

function getHyperliquidUnitActionSupported(chain = "", coin = "") {
  const bridgeE = hyperliquidBridgeM[chain];
  return !!bridgeE && bridgeE.coin == coin;
}

function buildHyperliquidUnitDiscovery({ action = "deposit", fees = {} } = {}) {
  const chainM = new Map();
  const tokenM = new Map();

  for (const [asset, routes] of Object.entries(hyperliquidUnitRouteAssetM)) {
    const coin = hyperliquidUnitCoinM[asset] || asset.toUpperCase();
    for (const route of routes) {
      if (
        action == "withdraw" &&
        hyperliquidUnitWithdrawHiddenRoutes.has(route.value)
      ) {
        continue;
      }
      const chain = hyperliquidUnitRouteChainM[route.value] || route.label;
      const localCoinE = coinM?.[chain]?.[coin];
      const actionSupported = getHyperliquidUnitActionSupported(chain, coin);
      const feeE = getHyperliquidUnitFeeValue(fees, route.value, asset, action);
      const chainKey = chain;
      const tokenKey = `${chain}:${coin}`;

      if (!chainM.has(chainKey)) {
        chainM.set(chainKey, {
          chain,
          label: chain,
          routes: [],
          coins: [],
          added: !!coinM?.[chain],
        });
      }
      const chainE = chainM.get(chainKey);
      chainE.routes.push({
        label: route.label,
        route: route.value,
      });

      if (!tokenM.has(tokenKey)) {
        tokenM.set(tokenKey, {
          chain,
          coin,
          name: localCoinE?.name || coin,
          asset,
          routes: [],
          added: !!localCoinE,
          actionSupported,
          fee: feeE.fee,
          eta: feeE.eta,
        });
      }
      const tokenE = tokenM.get(tokenKey);
      tokenE.routes.push({
        label: route.label,
        route: route.value,
      });
      tokenE.actionSupported = tokenE.actionSupported || actionSupported;
      tokenE.added = tokenE.added || !!localCoinE;
      tokenE.fee = tokenE.fee || feeE.fee;
      tokenE.eta = tokenE.eta || feeE.eta;

      let chainCoinE = chainE.coins.find((entry) => entry.coin == coin);
      if (!chainCoinE) {
        chainCoinE = {
          chain,
          coin,
          name: localCoinE?.name || coin,
          asset,
          routes: [],
          added: !!localCoinE,
          actionSupported,
          fee: feeE.fee,
          eta: feeE.eta,
        };
        chainE.coins.push(chainCoinE);
      }
      chainCoinE.routes.push({
        label: route.label,
        route: route.value,
      });
      chainCoinE.added = chainCoinE.added || !!localCoinE;
      chainCoinE.actionSupported =
        chainCoinE.actionSupported || actionSupported;
      chainCoinE.fee = chainCoinE.fee || feeE.fee;
      chainCoinE.eta = chainCoinE.eta || feeE.eta;
    }
  }

  return {
    chains: [...chainM.values()]
      .map((entry) => ({
        ...entry,
        coins: entry.coins.sort((a, b) => a.coin.localeCompare(b.coin)),
      }))
      .sort((a, b) => a.chain.localeCompare(b.chain)),
    tokens: [...tokenM.values()].sort(
      (a, b) => a.chain.localeCompare(b.chain) || a.coin.localeCompare(b.coin),
    ),
  };
}

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

function normalizeHyperliquidSignatureChainId(
  value = hyperliquidSignatureChainIdHex,
) {
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
  if (!text || Number(text) <= 0)
    throw new Error("amount must be greater than 0");
  const [intPart, decimalPart = ""] = text.split(".");
  const cleanText = decimalPart
    ? `${intPart}.${decimalPart.slice(0, 6)}`
    : intPart;
  const usd = ethers.parseUnits(cleanText, 6);
  if (usd <= 0n) throw new Error("amount must be greater than 0");

  return Number(usd);
}

function normalizeUsdAmount(amount = "") {
  const text = String(amount || "0").trim();
  if (!/^\d*(\.\d*)?$/.test(text) || !text.replace(".", "")) {
    throw new Error("amount invalid");
  }
  if (!text || Number(text) <= 0)
    throw new Error("amount must be greater than 0");
  const [intPart = "0", decimalPart = ""] = text.split(".");
  const cleanInt = String(BigInt(intPart || "0"));
  const cleanDecimal = decimalPart.slice(0, 6).replace(/0+$/, "");
  const cleanText = cleanDecimal ? `${cleanInt}.${cleanDecimal}` : cleanInt;
  const amountIn = ethers.parseUnits(cleanText, 6);
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return {
    amountIn,
    amountText: cleanText,
  };
}

function getHyperliquidBridgeConfig({ chain = "", coin = "" } = {}) {
  const bridgeE = hyperliquidBridgeM[chain];
  if (!bridgeE)
    throw new Error(`Hyperliquid spot bridge unsupported: ${chain}`);
  if (coin != bridgeE.coin) {
    throw new Error(
      `Hyperliquid spot bridge supports ${chain} ${bridgeE.coin}`,
    );
  }

  const coinE = coinM?.[chain]?.[coin];
  if (!coinE?.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`coin address missing: ${chain} ${coin}`);
  }

  return {
    ...bridgeE,
    token: ethers.getAddress(coinE.address),
    decimals: Number.isInteger(coinE.decimals) ? coinE.decimals : 6,
  };
}

function getHyperliquidWithdrawAction({
  walletAddress = "",
  amount = "",
  signatureChainId = hyperliquidSignatureChainIdHex,
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }

  const { amountText } = normalizeUsdAmount(amount);
  const signatureChain = normalizeHyperliquidSignatureChainId(signatureChainId);
  const destination = ethers.getAddress(walletAddress).toLowerCase();
  const nonce = Date.now();
  const action = {
    type: "withdraw3",
    hyperliquidChain: isHyperliquidMainnet() ? "Mainnet" : "Testnet",
    signatureChainId: signatureChain.chainIdHex,
    amount: amountText,
    time: nonce,
    destination,
  };
  const sign = getHyperliquidUserSignedTypedData({
    primaryType: "HyperliquidTransaction:Withdraw",
    signatureChainId: signatureChain.chainId,
    payloadTypes: [
      { name: "hyperliquidChain", type: "string" },
      { name: "destination", type: "string" },
      { name: "amount", type: "string" },
      { name: "time", type: "uint64" },
    ],
    value: {
      destination,
      amount: amountText,
      time: nonce,
    },
  });

  return {
    action,
    amountText,
    nonce,
    sign,
  };
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
    throw new Error(
      data?.response || data?.error || `${res.status} ${res.statusText}`,
    );
  }

  return data;
}

export async function getHyperliquidSpotBridgeDiscovery() {
  let fees = {};
  let feeError = "";

  try {
    const res = await fetchWithTimeout(
      `${hyperliquidUnitApiBase.replace(/\/+$/, "")}/estimate-fees`,
      { cache: "no-store" },
      hyperliquidFetchTimeoutMs,
    );
    fees = await res.json().catch(() => ({}));
    if (!res.ok) {
      feeError = `${res.status} ${res.statusText}`;
      fees = {};
    }
  } catch (e) {
    feeError = e?.message || "Hyperliquid route fees unavailable";
  }

  return {
    ok: true,
    deposit: buildHyperliquidUnitDiscovery({ action: "deposit", fees }),
    withdraw: buildHyperliquidUnitDiscovery({ action: "withdraw", fees }),
    feesLoaded: !feeError,
    feeError,
  };
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

export async function buildHyperliquidSpotDepositTxs({
  walletAddress = "",
  chain = "",
  coin = "",
  amount = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }

  const bridgeE = getHyperliquidBridgeConfig({ chain, coin });
  const { amountIn, amountText } = normalizeUsdAmount(amount);
  if (Number(amountText) < bridgeE.minAmount) {
    throw new Error(
      `Hyperliquid deposits must be at least $${bridgeE.minAmount}`,
    );
  }

  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  return {
    ok: true,
    defi: "Hyperliquid",
    chain,
    coin,
    action: "deposit",
    amountIn: amountIn.toString(),
    amount: amountText,
    bridge: bridgeE.bridge,
    txs: [
      getUnsignedTx({
        chain,
        chainId,
        type: "deposit",
        txData: {
          to: bridgeE.token,
          data: erc20Interface.encodeFunctionData("transfer", [
            ethers.getAddress(bridgeE.bridge),
            amountIn,
          ]),
          value: "0",
        },
      }),
    ],
  };
}

export async function executeHyperliquidSpotDeposit({
  walletName = "",
  walletAddress = "",
  chain = "",
  coin = "",
  amount = "",
} = {}) {
  const built = await buildHyperliquidSpotDepositTxs({
    walletAddress,
    chain,
    coin,
    amount,
  });
  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const sent = await executeRawEvmTx({
    privateKey,
    expectedAddress: walletAddress,
    chainId: built.txs[0].chainId,
    txData: built.txs[0],
    type: "deposit",
  });

  return {
    ...built,
    txs: [sent],
  };
}

export async function buildHyperliquidSpotWithdrawTxs({
  walletAddress = "",
  chain = "",
  coin = "",
  amount = "",
  signatureChainId = hyperliquidSignatureChainIdHex,
} = {}) {
  getHyperliquidBridgeConfig({ chain, coin });
  const withdraw = getHyperliquidWithdrawAction({
    walletAddress,
    amount,
    signatureChainId,
  });

  return {
    ok: true,
    defi: "Hyperliquid",
    chain: "Hyperliquid",
    coin: "USDC",
    destinationChain: chain,
    destinationCoin: coin,
    action: "withdraw",
    amount: withdraw.amountText,
    txs: [
      {
        chain: "Hyperliquid",
        type: "withdraw",
        hash: ethers.TypedDataEncoder.hash(
          withdraw.sign.domain,
          withdraw.sign.types,
          withdraw.sign.value,
        ),
        action: withdraw.action,
        nonce: withdraw.nonce,
        sign: {
          signatureKind: "eip712",
          chainId: withdraw.sign.domain.chainId,
          domain: withdraw.sign.domain,
          types: withdraw.sign.types,
          value: withdraw.sign.value,
          skipChainSwitch: true,
        },
      },
    ],
  };
}

export async function submitHyperliquidSpotWithdrawSignature({
  walletAddress = "",
  tx = {},
  signature = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Hyperliquid wallet address required");
  }
  if (!tx?.action || !tx?.nonce || !tx?.sign) {
    throw new Error("Hyperliquid withdraw action missing");
  }

  const signer = ethers.verifyTypedData(
    tx.sign.domain,
    tx.sign.types,
    tx.sign.value,
    signature,
  );
  if (ethers.getAddress(signer) != ethers.getAddress(walletAddress)) {
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
    type: tx.type || "withdraw",
    hash: tx.hash,
    response,
  };
}

export async function executeHyperliquidSpotWithdraw({
  walletName = "",
  walletAddress = "",
  chain = "",
  coin = "",
  amount = "",
} = {}) {
  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const wallet = getWallet(privateKey);
  assertWalletMatches(wallet, walletAddress);
  const built = await buildHyperliquidSpotWithdrawTxs({
    walletAddress,
    chain,
    coin,
    amount,
  });
  const tx = built.txs[0];
  const signature = await wallet.signTypedData(
    tx.sign.domain,
    tx.sign.types,
    tx.sign.value,
  );
  const submitted = await submitHyperliquidSpotWithdrawSignature({
    walletAddress,
    tx,
    signature,
  });

  return {
    ...built,
    txs: [submitted],
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
