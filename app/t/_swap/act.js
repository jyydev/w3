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
  approveExactIfNeeded,
  assertWalletMatches,
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
  getTradeCoinBalance as getTradeCoinBalanceShared,
  getTradeCoinPrice as getTradeCoinPriceShared,
  getUnsignedTx,
  getWallet,
  nativeEvmAddress,
  relayChainById,
  relayChainIds,
} from "../sharedServer";

const relayApiBase = "https://api.relay.link";
const acrossApiBase = "https://app.across.to/api";
const jupiterApiBase =
  process.env.JUPITER_API_BASE ||
  process.env.jupiter_api_base ||
  "https://lite-api.jup.ag/swap/v1";
const jupiterTokenApiBase =
  process.env.JUPITER_TOKEN_API_BASE ||
  process.env.jupiter_token_api_base ||
  "https://lite-api.jup.ag/tokens/v2";
const nativeSolanaAddress = "11111111111111111111111111111111";
const jupiterNativeSolAddress = "So11111111111111111111111111111111111111112";
const defaultSlippageBps = 50n;
const uniswapFeeTiers = [100, 500, 3000, 10000];
const acrossChainIds = {
  Ethereum: 1,
  Optimism: 10,
  BSC: 56,
  zkSyncEra: 324,
  Base: 8453,
  Arbitrum: 42161,
  Avalanche: 43114,
  Solana: 34268394551451,
};
const acrossChainById = Object.fromEntries(
  Object.entries(acrossChainIds).map(([chain, id]) => [id, chain]),
);
const acrossChainNameM = {
  "arbitrum one": "Arbitrum",
  arbitrum: "Arbitrum",
  avalanche: "Avalanche",
  "avalanche c-chain": "Avalanche",
  base: "Base",
  bnb: "BSC",
  "bnb smart chain": "BSC",
  bsc: "BSC",
  ethereum: "Ethereum",
  optimism: "Optimism",
  "op mainnet": "Optimism",
  solana: "Solana",
  zksync: "zkSyncEra",
  "zksync era": "zkSyncEra",
};
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
const uniswapV3M = {
  Ethereum: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  BSC: {
    quoter: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
    router: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
  },
  Arbitrum: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  Optimism: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  Base: {
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  },
  zkSyncEra: {
    quoter: "0x8Cb537fc92E26d8EBBb760E632c95484b6Ea3e28",
    router: "0x99c56385daBCE3E81d8499d0b8d0257aBC07E8A3",
  },
  Avalanche: {
    quoter: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
    router: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
  },
};
const uniswapWrappedNativeM = {
  Ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  BSC: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  Arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  Optimism: "0x4200000000000000000000000000000000000006",
  Base: "0x4200000000000000000000000000000000000006",
  zkSyncEra: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91",
  Avalanche: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
};
const uniswapQuoterAbi = [
  "function quoteExactInputSingle(tuple(address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
];
const uniswapRouterAbi = [
  "function exactInputSingle(tuple(address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
  "function unwrapWETH9(uint256 amountMinimum,address recipient) payable",
];
const uniswapRouterInterface = new ethers.Interface(uniswapRouterAbi);

export async function getTradeCoinPrice(args) {
  return getTradeCoinPriceShared(args);
}

export async function getTradeCoinBalance(args) {
  return getTradeCoinBalanceShared(args);
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

function getAcrossToken(chain = "", coin = "") {
  const coinE = coinM?.[chain]?.[coin];
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (chain == "Solana" && coinE.native) return nativeSolanaAddress;
  if (coinE.native) return nativeEvmAddress;
  if (chain == "Solana") {
    return getSolanaPublicKey(coinE.address, "Solana token mint").toBase58();
  }
  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`EVM token address missing: ${chain} ${coin}`);
  }

  return ethers.getAddress(coinE.address);
}

function getJupiterToken(coin = "") {
  const coinE = coinM?.Solana?.[coin];
  if (!coinE) throw new Error(`coin not found: Solana ${coin}`);
  if (coinE.native) return jupiterNativeSolAddress;

  return getSolanaPublicKey(coinE.address, "Jupiter token mint").toBase58();
}

function isSolanaAddress(address = "") {
  try {
    getSolanaPublicKey(address, "Solana address");
    return true;
  } catch {
    return false;
  }
}

function getUniswapToken(chain = "", coin = "") {
  const coinE = coinM?.[chain]?.[coin];
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (coinE.native) {
    const wrapped = uniswapWrappedNativeM[chain];
    if (!wrapped) throw new Error(`wrapped native missing: ${chain} ${coin}`);

    return {
      address: ethers.getAddress(wrapped),
      native: true,
    };
  }
  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`EVM token address missing: ${chain} ${coin}`);
  }

  return {
    address: ethers.getAddress(coinE.address),
    native: false,
  };
}

function getRelayHeaders() {
  const apiKey = process.env.RELAY_API_KEY || process.env.relay_api_key;

  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
  };
}

function getAcrossHeaders({ required = true } = {}) {
  const apiKey = process.env.ACROSS_API_KEY || process.env.across_api_key;
  if (!apiKey) {
    if (required) throw new Error("Across API key missing: ACROSS_API_KEY");
    return {};
  }

  return { Authorization: `Bearer ${apiKey}` };
}

function getJupiterHeaders() {
  const apiKey = process.env.JUPITER_API_KEY || process.env.jupiter_api_key;

  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
  };
}

function getAcrossIntegratorId() {
  return (
    process.env.ACROSS_INTEGRATOR_ID ||
    process.env.across_integrator_id ||
    "0xdead"
  );
}

function parseJson(text = "") {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}

function getTimeoutSignal(timeoutMs = 0) {
  if (!timeoutMs) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
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

async function acrossFetch(endpoint, params = {}, options = {}) {
  const url = new URL(`${acrossApiBase}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = getTimeoutSignal(options.timeoutMs || 0);
  try {
    const res = await fetch(url, {
      headers: getAcrossHeaders({
        required: options.requireApiKey !== false,
      }),
      ...(timeout.signal ? { signal: timeout.signal } : {}),
    });
    const text = await res.text();
    const data = parseJson(text);

    if (!res.ok) {
      const message =
        data?.message ||
        data?.error ||
        data?.description ||
        `Across request failed: ${res.status}`;
      throw new Error(message);
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") {
      throw new Error(options.timeoutMessage || "Across request timeout");
    }
    throw e;
  } finally {
    timeout.clear?.();
  }
}

function getArrayPayload(data, keys = []) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}

function getAcrossLocalChain(entry = {}) {
  const chainId = Number(entry.chainId ?? entry.chainID ?? entry.id);
  if (Number.isFinite(chainId) && acrossChainById[chainId]) {
    return acrossChainById[chainId];
  }

  const name = String(entry.name || entry.chainName || "").trim().toLowerCase();
  return acrossChainNameM[name] || "";
}

function getAcrossChainRows(data = {}) {
  return getArrayPayload(data, ["chains", "data", "result"]);
}

function getAcrossTokenRows(data = {}) {
  const rows = getArrayPayload(data, ["tokens", "data", "result"]);
  if (rows.length) return rows;

  if (!data || typeof data != "object") return [];

  return Object.entries(data).flatMap(([chainId, tokens]) =>
    Array.isArray(tokens)
      ? tokens.map((token) => ({
          ...token,
          chainId: token.chainId ?? chainId,
        }))
      : [],
  );
}

function normalizeAcrossChain(entry = {}) {
  const chainId = Number(entry.chainId ?? entry.chainID ?? entry.id);
  const chain = getAcrossLocalChain(entry);
  const name = String(entry.name || entry.chainName || chain || chainId || "")
    .trim();

  return {
    chain,
    chainId: Number.isFinite(chainId) ? chainId : "",
    name,
    added: !!(chain && coinM?.[chain]),
    explorerUrl: entry.explorerUrl || "",
    logoUrl: entry.logoUrl || "",
    publicRpcUrl: entry.publicRpcUrl || "",
  };
}

function normalizeAcrossToken(entry = {}, chainByIdM = {}) {
  const chainId = Number(entry.chainId ?? entry.chainID ?? entry.id);
  const chain = chainByIdM[chainId] || acrossChainById[chainId] || "";
  const symbol = String(entry.symbol || entry.tokenSymbol || "").trim();
  const coinInfoM = coinM?.[chain] || {};
  const added =
    !!(symbol && coinInfoM[symbol]) ||
    Object.values(coinInfoM).some(
      (coinE) =>
        entry.address &&
        coinE?.address &&
        String(coinE.address).toLowerCase() ==
          String(entry.address).toLowerCase(),
    );

  return {
    chain,
    chainId: Number.isFinite(chainId) ? chainId : "",
    address: entry.address || "",
    symbol,
    name: entry.name || "",
    decimals: Number(entry.decimals),
    priceUsd: Number(entry.priceUsd || 0),
    added,
  };
}

function normalizeJupiterToken(entry = {}) {
  const address = String(
    entry.id || entry.address || entry.mint || entry.mintAddress || "",
  ).trim();
  const symbol = String(entry.symbol || "").trim();
  const chain = "Solana";
  const coinInfoM = coinM?.[chain] || {};
  const added =
    !!(symbol && coinInfoM[symbol]) ||
    Object.values(coinInfoM).some(
      (coinE) =>
        address &&
        coinE?.address &&
        String(coinE.address).toLowerCase() == address.toLowerCase(),
    );

  return {
    chain,
    chainId: relayChainIds.Solana,
    address,
    symbol,
    name: entry.name || "",
    decimals: Number(entry.decimals),
    priceUsd: Number(entry.usdPrice || entry.priceUsd || 0),
    added,
    verified: !!entry.isVerified,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
  };
}

export async function getAcrossSupportedBridge() {
  const chainsData = await acrossFetch("/swap/chains", {}, {
    requireApiKey: false,
    timeoutMs: 10000,
    timeoutMessage: "Across chain discovery timeout",
  });
  let tokensData = {};
  try {
    tokensData = await acrossFetch("/swap/tokens", {}, {
      requireApiKey: false,
      timeoutMs: 8000,
      timeoutMessage: "Across token discovery timeout",
    });
  } catch {
    tokensData = {};
  }
  const chains = getAcrossChainRows(chainsData)
    .map(normalizeAcrossChain)
    .filter((entry) => entry.chainId || entry.name);
  const chainByIdM = Object.fromEntries(
    chains
      .filter((entry) => entry.chainId && entry.chain)
      .map((entry) => [entry.chainId, entry.chain]),
  );
  const tokens = getAcrossTokenRows(tokensData)
    .map((entry) => normalizeAcrossToken(entry, chainByIdM))
    .filter((entry) => entry.chainId || entry.symbol || entry.address);

  return { chains, tokens };
}

export async function getUniswapSupportedSwap() {
  const chains = Object.keys(uniswapV3M).map((chain) => ({
    chain,
    chainId: relayChainIds[chain] || "",
    name: chain,
    added: !!coinM?.[chain],
    router: uniswapV3M[chain]?.router || "",
    quoter: uniswapV3M[chain]?.quoter || "",
  }));
  const tokens = Object.keys(uniswapV3M).flatMap((chain) =>
    Object.entries(coinM?.[chain] || {}).map(([symbol, coinE]) => ({
      chain,
      chainId: relayChainIds[chain] || "",
      address: coinE.native
        ? uniswapWrappedNativeM[chain] || nativeEvmAddress
        : coinE.address || "",
      symbol,
      name: coinE.name || symbol,
      decimals: Number(coinE.decimals),
      added: true,
      native: !!coinE.native,
    })),
  );

  return { chains, tokens };
}

async function jupiterTokenFetch(endpoint, options = {}) {
  const timeout = getTimeoutSignal(options.timeoutMs || 0);
  try {
    const res = await fetch(`${jupiterTokenApiBase}${endpoint}`, {
      ...options,
      headers: {
        ...getJupiterHeaders(),
        ...(options.headers || {}),
      },
      ...(timeout.signal ? { signal: timeout.signal } : {}),
    });
    const text = await res.text();
    const data = parseJson(text);

    if (!res.ok || data?.error) {
      const message =
        data?.message ||
        data?.error ||
        data?.errorMessage ||
        `Jupiter token request failed: ${res.status}`;
      throw new Error(message);
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") {
      throw new Error(options.timeoutMessage || "Jupiter token request timeout");
    }
    throw e;
  } finally {
    timeout.clear?.();
  }
}

export async function getJupiterTokenDiscovery({
  chain = "Solana",
  term = "",
} = {}) {
  if (chain != "Solana") throw new Error("Jupiter is Solana-only");

  const cleanTerm = String(term || "").trim();
  const endpoint = cleanTerm
    ? `/search?${new URLSearchParams({ query: cleanTerm })}`
    : "/toptraded/1h";
  const data = await jupiterTokenFetch(endpoint, {
    timeoutMs: 10000,
    timeoutMessage: "Jupiter token discovery timeout",
  });
  const rows = getArrayPayload(data, ["tokens", "data", "result"]);
  const seen = new Set();
  const tokens = rows
    .map(normalizeJupiterToken)
    .filter((entry) => {
      const key = String(entry.address || entry.symbol || "").toLowerCase();
      if (!entry.chain || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { chain, term: cleanTerm, tokens };
}

export async function getJupiterSupportedSwap() {
  const chain = "Solana";
  const chains = [
    {
      chain,
      chainId: relayChainIds.Solana,
      name: chain,
      added: !!coinM?.[chain],
    },
  ];

  return { chains, tokens: [] };
}

async function jupiterFetch(endpoint, options = {}) {
  const res = await fetch(`${jupiterApiBase}${endpoint}`, {
    ...options,
    headers: {
      ...getJupiterHeaders(),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = parseJson(text);

  if (!res.ok || data?.error) {
    const message =
      data?.message ||
      data?.error ||
      data?.errorMessage ||
      `Jupiter request failed: ${res.status}`;
    throw new Error(message);
  }

  return data;
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

async function getBestUniswapQuote({ chain, provider, tokenIn, tokenOut, amountIn }) {
  const uniswapE = uniswapV3M[chain];
  const quoter = new ethers.Contract(
    uniswapE.quoter,
    uniswapQuoterAbi,
    provider,
  );
  let best = null;

  for (const fee of uniswapFeeTiers) {
    try {
      const quote = await quoter.quoteExactInputSingle.staticCall({
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0,
      });
      const amountOut = BigInt(quote.amountOut ?? quote[0] ?? 0);
      if (amountOut > 0n && (!best || amountOut > best.amountOut)) {
        best = { fee, amountOut };
      }
    } catch {
      // Try the next fee tier.
    }
  }

  if (!best) throw new Error(`No Uniswap V3 direct pool quote for ${chain}`);

  return best;
}

function getUniswapAmountIn({ chain, fromCoin, amount }) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, fromCoin),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

function getAcrossAmountIn({ chain, fromCoin, amount }) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, fromCoin),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

function getJupiterAmountIn({ fromCoin, amount }) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals("Solana", fromCoin),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

function getAcrossChainId(chain = "") {
  const chainId = acrossChainIds[chain];
  if (!chainId) throw new Error(`Across chain unsupported: ${chain}`);

  return chainId;
}

function getAcrossAddress(chain = "", address = "", label = "Across address") {
  if (chain == "Solana") {
    return getSolanaPublicKey(address, label).toBase58();
  }
  if (!ethers.isAddress(address)) throw new Error(`${label} must be EVM`);

  return ethers.getAddress(address);
}

function assertJupiterRoute({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
} = {}) {
  if (fromChain != "Solana" || toChain != "Solana") {
    throw new Error("Jupiter is Solana-only");
  }
  getSolanaPublicKey(walletAddress, "Solana wallet address");
  if (fromCoin == toCoin) throw new Error("sell coin and buy coin are the same");
}

async function getJupiterQuote({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
} = {}) {
  assertJupiterRoute({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
  });

  const amountIn = getJupiterAmountIn({ fromCoin, amount });
  const params = new URLSearchParams({
    inputMint: getJupiterToken(fromCoin),
    outputMint: getJupiterToken(toCoin),
    amount: amountIn.toString(),
    slippageBps: String(defaultSlippageBps),
    restrictIntermediateTokens: "true",
  });

  return {
    amountIn,
    quote: await jupiterFetch(`/quote?${params}`),
  };
}

function getJupiterTx({
  swapResponse = {},
  type = "swap",
} = {}) {
  const transaction = swapResponse.swapTransaction || swapResponse.transaction;
  if (!transaction) {
    throw new Error(
      swapResponse.simulationError ||
        swapResponse.error ||
        swapResponse.errorMessage ||
        "Jupiter returned no swap transaction",
    );
  }

  return {
    chain: "Solana",
    chainId: relayChainIds.Solana,
    type,
    transaction,
    format: "solana:v0",
  };
}

async function getJupiterSwapBuild({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
} = {}) {
  const { amountIn, quote } = await getJupiterQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
  });
  const swapResponse = await jupiterFetch("/swap", {
    method: "POST",
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: getSolanaPublicKey(
        walletAddress,
        "Solana wallet address",
      ).toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1_000_000,
          priorityLevel: "high",
        },
      },
    }),
  });

  return { amountIn, quote, swapResponse };
}

function isAcrossSolanaTx(txData = {}) {
  return (
    txData.ecosystem == "svm" ||
    Number(txData.chainId) == acrossChainIds.Solana
  );
}

function getAcrossUnsignedTx({ txData = {}, type = "tx" } = {}) {
  const chainId = Number(txData.chainId);
  const chain = acrossChainById[chainId] || relayChainById[chainId];
  if (!chain) throw new Error(`Across chainId unsupported: ${chainId}`);

  if (isAcrossSolanaTx(txData)) {
    if (!txData.data) throw new Error("Across Solana transaction missing data");

    return {
      chain: "Solana",
      chainId,
      type,
      transaction: txData.data,
      format: "solana:serialized",
    };
  }

  return getUnsignedTx({
    chain,
    chainId,
    type,
    txData,
  });
}

async function executeAcrossTx({
  privateKey = "",
  solanaKeypair = null,
  expectedAddress = "",
  txData = {},
  type = "tx",
} = {}) {
  const tx = getAcrossUnsignedTx({ txData, type });

  if (tx.chain == "Solana") {
    if (!solanaKeypair) throw new Error("Solana private key missing");

    return executeSolanaTx({
      keypair: solanaKeypair,
      expectedAddress,
      tx,
    });
  }

  return executeRawEvmTx({
    privateKey,
    expectedAddress,
    chainId: tx.chainId,
    txData,
    type: tx.type,
  });
}

function getAcrossApprovalInfo(quote = {}) {
  const allowance = quote.checks?.allowance || {};
  const expected = BigInt(allowance.expected || 0);
  const actual = BigInt(allowance.actual || 0);
  const approvalTxns = Array.isArray(quote.approvalTxns)
    ? quote.approvalTxns
    : [];

  return {
    needed: approvalTxns.length > 0 || (expected > 0n && actual < expected),
    token: allowance.token,
    spender: allowance.spender,
    actual,
    expected,
    approvalTxns,
  };
}

async function getAcrossQuote({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
} = {}) {
  if (fromChain == toChain) {
    throw new Error("Across is for cross-chain swaps; choose a different buy chain");
  }

  const depositor = getAcrossAddress(
    fromChain,
    walletAddress,
    "Across depositor",
  );
  const recipientAddress = getAcrossAddress(
    toChain,
    recipient || walletAddress,
    "Across recipient",
  );
  const amountIn = getAcrossAmountIn({ chain: fromChain, fromCoin, amount });

  return {
    amountIn,
    quote: await acrossFetch("/swap/approval", {
      tradeType: "exactInput",
      amount: amountIn.toString(),
      inputToken: getAcrossToken(fromChain, fromCoin),
      outputToken: getAcrossToken(toChain, toCoin),
      originChainId: getAcrossChainId(fromChain),
      destinationChainId: getAcrossChainId(toChain),
      depositor,
      recipient: recipientAddress,
      refundAddress: depositor,
      integratorId: getAcrossIntegratorId(),
      slippage: "auto",
    }),
  };
}

export async function getAcrossSwapPreview({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
} = {}) {
  const { amountIn, quote } = await getAcrossQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
    recipient,
  });
  const approval = getAcrossApprovalInfo(quote);

  return {
    ok: true,
    fromChain,
    toChain,
    approvalNeeded: approval.needed,
    allowance: approval.actual.toString(),
    approvalExpected: approval.expected.toString(),
    amountIn: amountIn.toString(),
    quote: {
      id: quote.id,
      crossSwapType: quote.crossSwapType,
      expectedFillTime: quote.expectedFillTime,
      expectedOutputAmount: quote.expectedOutputAmount,
      minOutputAmount: quote.minOutputAmount,
      quoteExpiryTimestamp: quote.quoteExpiryTimestamp,
      feeUsd: quote.fees?.total?.amountUsd,
    },
  };
}

export async function getUniswapSwapPreview({
  walletAddress = "",
  chain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Uniswap is EVM-only here");
  if (!uniswapV3M[chain]) throw new Error(`Uniswap not configured: ${chain}`);
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const tokenInE = getUniswapToken(chain, fromCoin);
  const tokenOutE = getUniswapToken(chain, toCoin);
  if (tokenInE.address == tokenOutE.address) {
    throw new Error("sell coin and buy coin are the same");
  }

  const amountIn = getUniswapAmountIn({ chain, fromCoin, amount });
  const provider = new ethers.JsonRpcProvider(rpc);
  try {
    const uniswapE = uniswapV3M[chain];
    const token = new ethers.Contract(tokenInE.address, erc20Abi, provider);
    const allowancePromise = tokenInE.native
      ? Promise.resolve(amountIn)
      : token.allowance(walletAddress, uniswapE.router);
    const [allowance, quote] = await Promise.all([
      allowancePromise,
      getBestUniswapQuote({
        chain,
        provider,
        tokenIn: tokenInE.address,
        tokenOut: tokenOutE.address,
        amountIn,
      }),
    ]);
    const amountOutMinimum =
      (quote.amountOut * (10000n - defaultSlippageBps)) / 10000n;

    return {
      ok: true,
      chain,
      approvalNeeded: !tokenInE.native && BigInt(allowance) < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      quote: {
        fee: quote.fee,
        amountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        slippageBps: Number(defaultSlippageBps),
      },
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildUniswapSwapTxs({
  walletAddress = "",
  chain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Uniswap is EVM-only here");
  if (!uniswapV3M[chain]) throw new Error(`Uniswap not configured: ${chain}`);
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  const tokenInE = getUniswapToken(chain, fromCoin);
  const tokenOutE = getUniswapToken(chain, toCoin);
  if (tokenInE.address == tokenOutE.address) {
    throw new Error("sell coin and buy coin are the same");
  }

  const amountIn = getUniswapAmountIn({ chain, fromCoin, amount });
  const provider = new ethers.JsonRpcProvider(rpc);
  try {
    const uniswapE = uniswapV3M[chain];
    const token = new ethers.Contract(tokenInE.address, erc20Abi, provider);
    const allowancePromise = tokenInE.native
      ? Promise.resolve(amountIn)
      : token.allowance(walletAddress, uniswapE.router);
    const [allowance, quote] = await Promise.all([
      allowancePromise,
      getBestUniswapQuote({
        chain,
        provider,
        tokenIn: tokenInE.address,
        tokenOut: tokenOutE.address,
        amountIn,
      }),
    ]);
    const allowanceN = BigInt(allowance);
    const approveAmount = getApprovalAmount({
      chain,
      amountIn,
      fromCoin,
      approvalAmount,
      defaultAmount: amountIn,
    });
    const amountOutMinimum =
      (quote.amountOut * (10000n - defaultSlippageBps)) / 10000n;
    const txs = [];

    if (!tokenInE.native && allowanceN < amountIn && approveAmount != null) {
      if (allowanceN > 0n) {
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: tokenInE.address,
            spender: uniswapE.router,
            amount: 0n,
          }),
        );
      }
      txs.push(
        getApproveTx({
          chain,
          chainId,
          token: tokenInE.address,
          spender: uniswapE.router,
          amount: approveAmount,
        }),
      );
    }

    const swapParams = {
      tokenIn: tokenInE.address,
      tokenOut: tokenOutE.address,
      fee: quote.fee,
      recipient: tokenOutE.native ? uniswapE.router : ethers.getAddress(walletAddress),
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    };
    const data = tokenOutE.native
      ? uniswapRouterInterface.encodeFunctionData("multicall", [
          [
            uniswapRouterInterface.encodeFunctionData("exactInputSingle", [
              swapParams,
            ]),
            uniswapRouterInterface.encodeFunctionData("unwrapWETH9", [
              amountOutMinimum,
              ethers.getAddress(walletAddress),
            ]),
          ],
        ])
      : uniswapRouterInterface.encodeFunctionData("exactInputSingle", [
          swapParams,
        ]);
    txs.push(
      getUnsignedTx({
        chain,
        chainId,
        type: "swap",
        txData: {
          to: uniswapE.router,
          data,
          value: tokenInE.native ? amountIn.toString() : "0",
        },
      }),
    );

    return {
      ok: true,
      dex: "Uniswap",
      chain,
      txs,
      quote: {
        fee: quote.fee,
        amountIn: amountIn.toString(),
        amountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        slippageBps: Number(defaultSlippageBps),
      },
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeUniswapSwap({
  walletName = "",
  walletAddress = "",
  chain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Uniswap is EVM-only here");
  if (!uniswapV3M[chain]) throw new Error(`Uniswap not configured: ${chain}`);
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const tokenInE = getUniswapToken(chain, fromCoin);
  const tokenOutE = getUniswapToken(chain, toCoin);
  if (tokenInE.address == tokenOutE.address) {
    throw new Error("sell coin and buy coin are the same");
  }

  const amountIn = getUniswapAmountIn({ chain, fromCoin, amount });
  const approveAmount = getApprovalAmount({
    chain,
    fromCoin,
    approvalAmount,
    amountIn,
  });

  const provider = new ethers.JsonRpcProvider(rpc);
  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);

    const uniswapE = uniswapV3M[chain];
    const quote = await getBestUniswapQuote({
      chain,
      provider,
      tokenIn: tokenInE.address,
      tokenOut: tokenOutE.address,
      amountIn,
    });
    const amountOutMinimum =
      (quote.amountOut * (10000n - defaultSlippageBps)) / 10000n;
    const txs = [];

    if (!tokenInE.native) {
      const token = new ethers.Contract(tokenInE.address, erc20Abi, wallet);
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: uniswapE.router,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );
    }

    const router = new ethers.Contract(uniswapE.router, uniswapRouterAbi, wallet);
    const swapParams = {
      tokenIn: tokenInE.address,
      tokenOut: tokenOutE.address,
      fee: quote.fee,
      recipient: tokenOutE.native ? uniswapE.router : wallet.address,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    };
    const txOverrides = tokenInE.native ? { value: amountIn } : {};
    const swapTx = tokenOutE.native
      ? await router.multicall(
          [
            router.interface.encodeFunctionData("exactInputSingle", [
              swapParams,
            ]),
            router.interface.encodeFunctionData("unwrapWETH9", [
              amountOutMinimum,
              wallet.address,
            ]),
          ],
          txOverrides,
        )
      : await router.exactInputSingle(swapParams, txOverrides);
    const receipt = await swapTx.wait();
    txs.push({
      chain,
      type: "swap",
      hash: swapTx.hash,
      blockNumber: receipt?.blockNumber ?? null,
    });

    return {
      ok: true,
      dex: "Uniswap",
      chain,
      txs,
      quote: {
        fee: quote.fee,
        amountIn: amountIn.toString(),
        amountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        slippageBps: Number(defaultSlippageBps),
      },
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildAcrossSwapTxs({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
  approvalAmount = "",
} = {}) {
  const { amountIn, quote } = await getAcrossQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
    recipient,
  });
  const chainId = getAcrossChainId(fromChain);
  const approval = getAcrossApprovalInfo(quote);
  const txs = [];

  if (approval.needed) {
    const approveAmount = getApprovalAmount({
      chain: fromChain,
      fromCoin,
      approvalAmount,
      amountIn,
      defaultAmount: approval.expected > amountIn ? approval.expected : amountIn,
    });

    if (
      fromChain != "Solana" &&
      approveAmount != null &&
      approval.spender &&
      approval.token
    ) {
      if (ethers.getAddress(approval.token) == nativeEvmAddress) {
        throw new Error("Across returned native-token approval unexpectedly");
      }

      txs.push(
        ...(approval.actual > 0n
          ? [
              getApproveTx({
                chain: fromChain,
                chainId,
                token: approval.token,
                spender: approval.spender,
                amount: 0n,
              }),
            ]
          : []),
        getApproveTx({
          chain: fromChain,
          chainId,
          token: approval.token,
          spender: approval.spender,
          amount: approveAmount,
        }),
      );
    } else if (approval.approvalTxns.length) {
      txs.push(
        ...approval.approvalTxns.map((txData) =>
          getAcrossUnsignedTx({
            txData: {
              ...txData,
              chainId: txData.chainId || chainId,
            },
            type: "approve",
          }),
        ),
      );
    } else {
      throw new Error("Across approval needed but returned no approval tx");
    }
  }

  if (!quote.swapTx) throw new Error("Across quote returned no swap tx");
  txs.push(
    getAcrossUnsignedTx({
      type: "swap",
      txData: {
        ...quote.swapTx,
        chainId: quote.swapTx.chainId || chainId,
      },
    }),
  );

  return {
    ok: true,
    dex: "Across",
    txs,
    quote: {
      id: quote.id,
      crossSwapType: quote.crossSwapType,
      amountIn: amountIn.toString(),
      expectedOutputAmount: quote.expectedOutputAmount,
      minOutputAmount: quote.minOutputAmount,
      expectedFillTime: quote.expectedFillTime,
      quoteExpiryTimestamp: quote.quoteExpiryTimestamp,
      feeUsd: quote.fees?.total?.amountUsd,
    },
  };
}

export async function executeAcrossSwap({
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
  const privateKey = fromChain == "Solana" ? "" : getPrivateKey(walletName);
  const solanaKeypair =
    fromChain == "Solana" ? getSolanaKeypair(walletName) : null;
  if (fromChain != "Solana" && !privateKey) {
    throw new Error(`private key missing: pk_${walletName}`);
  }

  const { amountIn, quote } = await getAcrossQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
    recipient,
  });
  const txs = [];
  const approval = getAcrossApprovalInfo(quote);

  if (approval.needed) {
    const approveAmount = getApprovalAmount({
      chain: fromChain,
      fromCoin,
      approvalAmount,
      amountIn,
    });

    if (
      fromChain != "Solana" &&
      approveAmount != null &&
      approval.spender &&
      approval.token
    ) {
      if (ethers.getAddress(approval.token) == nativeEvmAddress) {
        throw new Error("Across returned native-token approval unexpectedly");
      }

      const rpc = getChainRpc(fromChain);
      if (!rpc) throw new Error(`rpc not configured: ${fromChain}`);

      const provider = new ethers.JsonRpcProvider(rpc);
      try {
        const wallet = getWallet(privateKey, provider);
        assertWalletMatches(wallet, walletAddress);
        const token = new ethers.Contract(
          ethers.getAddress(approval.token),
          erc20Abi,
          wallet,
        );

        txs.push(
          ...(await approveExactIfNeeded({
            chain: fromChain,
            token,
            owner: wallet.address,
            spender: ethers.getAddress(approval.spender),
            amount: approval.expected || amountIn,
            approvalAmount: approveAmount,
          })),
        );
      } finally {
        provider.destroy?.();
      }
    } else {
      for (const approvalTx of approval.approvalTxns) {
        txs.push(
          await executeAcrossTx({
            privateKey,
            solanaKeypair,
            expectedAddress: walletAddress,
            txData: {
              ...approvalTx,
              chainId: approvalTx.chainId || getAcrossChainId(fromChain),
            },
            type: "approve",
          }),
        );
      }
      if (!approval.approvalTxns.length) {
        throw new Error("Across approval needed but returned no approval tx");
      }
    }
  }

  if (!quote.swapTx) throw new Error("Across quote returned no swap tx");

  txs.push(
    await executeAcrossTx({
      privateKey,
      solanaKeypair,
      expectedAddress: walletAddress,
      txData: {
        ...quote.swapTx,
        chainId: quote.swapTx.chainId || getAcrossChainId(fromChain),
      },
      type: "swap",
    }),
  );

  return {
    ok: true,
    dex: "Across",
    txs,
    quote: {
      id: quote.id,
      crossSwapType: quote.crossSwapType,
      amountIn: amountIn.toString(),
      expectedOutputAmount: quote.expectedOutputAmount,
      minOutputAmount: quote.minOutputAmount,
      expectedFillTime: quote.expectedFillTime,
      quoteExpiryTimestamp: quote.quoteExpiryTimestamp,
      feeUsd: quote.fees?.total?.amountUsd,
    },
  };
}

export async function getJupiterSwapPreview({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
} = {}) {
  const { amountIn, quote } = await getJupiterQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
  });

  return {
    ok: true,
    dex: "Jupiter",
    fromChain,
    toChain,
    approvalNeeded: false,
    amountIn: amountIn.toString(),
    quote: {
      amountOut: quote.outAmount,
      amountOutMinimum: quote.otherAmountThreshold,
      slippageBps: quote.slippageBps,
      priceImpactPct: quote.priceImpactPct,
      swapUsdValue: quote.swapUsdValue,
      route: (quote.routePlan || [])
        .map((route) => route?.swapInfo?.label)
        .filter(Boolean),
    },
  };
}

export async function buildJupiterSwapTxs({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
} = {}) {
  const { amountIn, quote, swapResponse } = await getJupiterSwapBuild({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
  });

  return {
    ok: true,
    dex: "Jupiter",
    chain: "Solana",
    txs: [getJupiterTx({ swapResponse, type: "swap" })],
    quote: {
      amountIn: amountIn.toString(),
      amountOut: quote.outAmount,
      amountOutMinimum: quote.otherAmountThreshold,
      slippageBps: quote.slippageBps,
      priceImpactPct: quote.priceImpactPct,
      swapUsdValue: quote.swapUsdValue,
      route: (quote.routePlan || [])
        .map((route) => route?.swapInfo?.label)
        .filter(Boolean),
      lastValidBlockHeight: swapResponse.lastValidBlockHeight,
      prioritizationFeeLamports: swapResponse.prioritizationFeeLamports,
      computeUnitLimit: swapResponse.computeUnitLimit,
    },
  };
}

export async function executeJupiterSwap({
  walletName = "",
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
} = {}) {
  const solanaKeypair = getSolanaKeypair(walletName);
  const built = await buildJupiterSwapTxs({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
  });
  const txs = [];

  for (const tx of built.txs || []) {
    txs.push(
      await executeSolanaTx({
        keypair: solanaKeypair,
        expectedAddress: walletAddress,
        tx,
      }),
    );
  }

  return { ...built, txs };
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
