"use server";

import { ethers } from "ethers";
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
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getPrivateKey,
  getSolanaKeypair,
  getSolanaPublicKey,
  getTradeCoinEntry,
  getUnsignedTx,
  nativeEvmAddress,
} from "../../sharedServer";
import { getArrayPayload, getTimeoutSignal, parseJson } from "../shared";

const jumperApiBase =
  process.env.LIFI_API_BASE ||
  process.env.lifi_api_base ||
  "https://li.quest/v1";
const defaultSlippage = "0.005";
const nativeSolanaAddress = "11111111111111111111111111111111";
const jumperDiscoveryCacheM = {};
const jumperChainIds = {
  ...chainIds,
  Solana: 1151111081099710,
};
const jumperChainById = {
  ...chainById,
  1151111081099710: "Solana",
};
const jumperChainNameM = {
  "arbitrum one": "Arbitrum",
  arbitrum: "Arbitrum",
  avalanche: "Avalanche",
  "avalanche c-chain": "Avalanche",
  base: "Base",
  bnb: "BSC",
  "bnb smart chain": "BSC",
  bsc: "BSC",
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
  sonic: "Sonic",
  solana: "Solana",
  wemix: "WEMIX",
  zksync: "zkSyncEra",
  "zksync era": "zkSyncEra",
};

function getJumperHeaders() {
  const apiKey = process.env.LIFI_API_KEY || process.env.lifi_api_key;

  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-lifi-api-key": apiKey } : {}),
  };
}

async function jumperFetch(endpoint, params = {}, options = {}) {
  const url = new URL(`${jumperApiBase}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = getTimeoutSignal(options.timeoutMs || 0);
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        ...getJumperHeaders(),
        ...(options.headers || {}),
      },
      ...(options.body ? { body: options.body } : {}),
      ...(timeout.signal ? { signal: timeout.signal } : {}),
    });
    const text = await res.text();
    const data = parseJson(text);

    if (!res.ok || data?.error) {
      const message =
        data?.message ||
        data?.error ||
        data?.errorMessage ||
        data?.detail ||
        `Jumper request failed: ${res.status}`;
      throw new Error(message);
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") {
      throw new Error(options.timeoutMessage || "Jumper request timeout");
    }
    throw e;
  } finally {
    timeout.clear?.();
  }
}

function getJumperLocalChain(entry = {}) {
  const chainId = Number(entry.id ?? entry.chainId ?? entry.chainID);
  if (Number.isFinite(chainId) && jumperChainById[chainId]) {
    return jumperChainById[chainId];
  }

  const names = [entry.name, entry.chainName, entry.key, entry.coin];
  for (const nameE of names) {
    const name = String(nameE || "").trim().toLowerCase();
    if (jumperChainNameM[name]) return jumperChainNameM[name];
  }

  return "";
}

function normalizeJumperChain(entry = {}) {
  const chainId = Number(entry.id ?? entry.chainId ?? entry.chainID);
  const chain = getJumperLocalChain(entry);
  const name = String(entry.name || entry.chainName || chain || chainId || "")
    .trim();

  return {
    chain,
    chainId: Number.isFinite(chainId) ? chainId : "",
    name,
    added: !!(chain && coinM?.[chain]),
    disabled: entry.mainnet === false,
    explorerUrl: entry.metamask?.blockExplorerUrls?.[0] || entry.explorerUrl || "",
    logoUrl: entry.logoURI || entry.logoUrl || "",
    publicRpcUrl: entry.metamask?.rpcUrls?.[0] || "",
  };
}

function getJumperTokenRows(data = {}) {
  const rows = getArrayPayload(data, ["tokens", "data", "result"]);
  if (rows.length) return rows;

  const tokenM =
    data?.tokens && typeof data.tokens == "object"
      ? data.tokens
      : data && typeof data == "object"
        ? data
        : {};

  return Object.entries(tokenM).flatMap(([chainId, tokens]) =>
    Array.isArray(tokens)
      ? tokens.map((token) => ({
          ...token,
          chainId: token.chainId ?? chainId,
        }))
      : [],
  );
}

function normalizeJumperToken(entry = {}, chainByIdM = {}) {
  const chainId = Number(entry.chainId ?? entry.chainID ?? entry.id);
  const chain = chainByIdM[chainId] || jumperChainById[chainId] || "";
  const symbol = String(entry.symbol || entry.coinKey || "").trim();
  const address = String(entry.address || "").trim();
  const coinInfoM = coinM?.[chain] || {};
  const isNativeSolana =
    chain == "Solana" &&
    address == nativeSolanaAddress &&
    !!coinInfoM[symbol]?.native;
  const added =
    isNativeSolana ||
    !!(symbol && coinInfoM[symbol]) ||
    Object.values(coinInfoM).some(
      (coinE) =>
        address &&
        coinE?.address &&
        String(coinE.address).toLowerCase() == address.toLowerCase(),
    );

  return {
    chain,
    chainId: Number.isFinite(chainId) ? chainId : "",
    address,
    symbol,
    name: entry.name || "",
    decimals: Number(entry.decimals),
    priceUsd: Number(entry.priceUSD || entry.priceUsd || 0),
    added,
    verified: entry.verificationStatus == "verified",
  };
}

function filterJumperTokens(tokens = [], term = "") {
  const cleanTerm = String(term || "").trim().toLowerCase();
  const filtered = cleanTerm
    ? tokens.filter((entry) => {
        const address = String(entry.address || "").toLowerCase();
        return (
          String(entry.symbol || "").toLowerCase().includes(cleanTerm) ||
          String(entry.name || "").toLowerCase().includes(cleanTerm) ||
          (address && address == cleanTerm)
        );
      })
    : tokens.filter((entry) => entry.verified || entry.added);
  const seen = new Set();

  return filtered
    .filter((entry) => {
      const key = [
        entry.chain || "",
        String(entry.address || "").toLowerCase(),
        entry.symbol || "",
      ].join(":");
      if (!entry.chain || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 150);
}

function getJumperDiscoveryCache(key = "") {
  const cached = getDiscoveryCacheMapEntry(jumperDiscoveryCacheM, key);
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

function setJumperDiscoveryCache(key = "", data = {}) {
  const at = Date.now();
  setDiscoveryCacheMapEntry(jumperDiscoveryCacheM, key, { at, data });

  return {
    ...data,
    cache: makeDiscoveryCacheMeta({ source: "api", at, ttlMs: discoveryCacheMs }),
  };
}

export async function clearJumperRuntimeCache() {
  clearDiscoveryCacheMap(jumperDiscoveryCacheM);

  return { ok: true };
}

function getJumperToken(chain = "", coin = "") {
  const coinE = getTradeCoinEntry(chain, coin);
  if (chain == "Solana") {
    if (coinE.native) return nativeSolanaAddress;
    if (!coinE.address) throw new Error(`coin address missing: ${chain} ${coin}`);

    return getSolanaPublicKey(
      coinE.address,
      `Jumper ${coin} mint`,
    ).toBase58();
  }
  if (coinE.native) return nativeEvmAddress;
  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`coin address missing: ${chain} ${coin}`);
  }

  return ethers.getAddress(coinE.address);
}

function getJumperAddress(chain = "", address = "", label = "Jumper address") {
  if (chain == "Solana") return getSolanaPublicKey(address, label).toBase58();
  if (!ethers.isAddress(address)) throw new Error(`${label} must be EVM`);

  return ethers.getAddress(address);
}

function getJumperAmountIn({ chain = "", fromCoin = "", amount = "" } = {}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, fromCoin),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

async function getJumperAllowanceInfo({
  walletAddress = "",
  fromChain = "",
  fromCoin = "",
  amountIn = 0n,
  quote = {},
} = {}) {
  if (fromChain == "Solana") {
    return {
      needed: false,
      token: "",
      spender: "",
      allowance: 0n,
      amountIn,
    };
  }

  const coinE = getTradeCoinEntry(fromChain, fromCoin);
  const approvalAddress =
    quote.estimate?.approvalAddress ||
    quote.includedSteps?.find((step) => step?.estimate?.approvalAddress)
      ?.estimate?.approvalAddress ||
    "";
  if (!coinE || coinE.native || !approvalAddress) {
    return {
      needed: false,
      token: "",
      spender: "",
      allowance: 0n,
      amountIn,
    };
  }
  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`coin address missing: ${fromChain} ${fromCoin}`);
  }

  const rpc = getChainRpc(fromChain);
  if (!rpc) throw new Error(`rpc not configured: ${fromChain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain: fromChain,
    scope: "Jumper",
  });
  try {
    const owner = ethers.getAddress(walletAddress);
    const token = new ethers.Contract(
      ethers.getAddress(coinE.address),
      erc20Abi,
      provider,
    );
    const spender = ethers.getAddress(approvalAddress);
    const allowance = BigInt(await token.allowance(owner, spender));

    return {
      needed: allowance < amountIn,
      token: ethers.getAddress(coinE.address),
      spender,
      allowance,
      amountIn,
    };
  } finally {
    provider.destroy?.();
  }
}

async function getJumperQuote({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
} = {}) {
  if (fromChain == toChain && fromCoin == toCoin) {
    throw new Error("sell coin and buy coin are the same");
  }

  const fromChainId = jumperChainIds[fromChain];
  const toChainId = jumperChainIds[toChain];
  if (!fromChainId) throw new Error(`Jumper chain unsupported: ${fromChain}`);
  if (!toChainId) throw new Error(`Jumper chain unsupported: ${toChain}`);

  const fromAddress = getJumperAddress(fromChain, walletAddress, "Jumper sender");
  const toAddress = getJumperAddress(
    toChain,
    recipient || walletAddress,
    "Jumper recipient",
  );
  const amountIn = getJumperAmountIn({ chain: fromChain, fromCoin, amount });
  const quote = await jumperFetch("/quote", {
    fromChain: fromChainId,
    toChain: toChainId,
    fromToken: getJumperToken(fromChain, fromCoin),
    toToken: getJumperToken(toChain, toCoin),
    fromAmount: amountIn.toString(),
    fromAddress,
    toAddress,
    slippage: defaultSlippage,
    integrator:
      process.env.LIFI_INTEGRATOR ||
      process.env.lifi_integrator ||
      "w3",
  });

  return { amountIn, quote };
}

function getJumperUnsignedTx({ quote = {}, type = "swap" } = {}) {
  const txData = quote.transactionRequest || {};
  const chainId = Number(txData.chainId || quote.action?.fromChainId);
  const chain = jumperChainById[chainId] || "";
  if (!chain) throw new Error(`Jumper chainId unsupported: ${chainId}`);
  if (chain == "Solana") {
    if (!txData.data) throw new Error("Jumper quote returned no Solana tx");

    return {
      chain,
      chainId,
      type,
      transaction: txData.data,
      format: "solana:serialized",
    };
  }
  if (!txData.to || !txData.data) throw new Error("Jumper quote returned no tx");

  return getUnsignedTx({
    chain,
    chainId,
    type,
    txData,
  });
}

function getJumperQuoteDetails({ amountIn = 0n, quote = {} } = {}) {
  return {
    id: quote.id || "",
    transactionId: quote.transactionId || "",
    tool: quote.toolDetails?.name || quote.tool || "",
    amountIn: amountIn.toString(),
    amountOut: quote.estimate?.toAmount,
    amountOutMinimum: quote.estimate?.toAmountMin,
    fromAmountUsd: quote.estimate?.fromAmountUSD,
    toAmountUsd: quote.estimate?.toAmountUSD,
    executionDuration: quote.estimate?.executionDuration,
    gasUsd: (quote.estimate?.gasCosts || []).reduce(
      (sum, entry) => sum + Number(entry.amountUSD || 0),
      0,
    ),
    feeUsd: (quote.estimate?.feeCosts || []).reduce(
      (sum, entry) => sum + Number(entry.amountUSD || 0),
      0,
    ),
  };
}

export async function getJumperSupportedBridge({ refresh = false } = {}) {
  const cacheKey = "support";
  if (!refresh) {
    const cached = getJumperDiscoveryCache(cacheKey);
    if (cached) return cached;
  }

  const data = await jumperFetch("/chains", {}, {
    timeoutMs: 10000,
    timeoutMessage: "Jumper chain discovery timeout",
  });
  const chains = getArrayPayload(data, ["chains", "data", "result"])
    .map(normalizeJumperChain)
    .filter((entry) => (entry.chainId || entry.name) && !entry.disabled);
  if (!chains.some((entry) => entry.chain == "Solana")) {
    chains.push({
      chain: "Solana",
      chainId: jumperChainIds.Solana,
      name: "Solana",
      added: !!coinM?.Solana,
      disabled: false,
      explorerUrl: "",
      logoUrl: "",
      publicRpcUrl: "",
    });
  }

  return setJumperDiscoveryCache(cacheKey, { chains, tokens: [] });
}

export async function getJumperTokenDiscovery({
  chain = "",
  term = "",
  refresh = false,
} = {}) {
  const chainId = jumperChainIds[chain];
  if (!chainId) throw new Error(`Jumper chain unsupported: ${chain}`);

  const cleanTerm = String(term || "").trim();
  const cacheKey = `token:${chain}:${cleanTerm.toLowerCase()}`;
  const useServerCache = !cleanTerm;
  if (useServerCache && !refresh) {
    const cached = getJumperDiscoveryCache(cacheKey);
    if (cached) return cached;
  }

  const data = await jumperFetch("/tokens", { chains: chainId }, {
    timeoutMs: 10000,
    timeoutMessage: "Jumper token discovery timeout",
  });
  const chainByIdM = { [chainId]: chain };
  const tokens = filterJumperTokens(
    getJumperTokenRows(data).map((entry) =>
      normalizeJumperToken(entry, chainByIdM),
    ),
    cleanTerm,
  );

  if (!useServerCache) return { chain, term: cleanTerm, tokens };

  return setJumperDiscoveryCache(cacheKey, { chain, term: cleanTerm, tokens });
}

export async function getJumperSwapPreview({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
} = {}) {
  const { amountIn, quote } = await getJumperQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
    recipient,
  });
  const approval = await getJumperAllowanceInfo({
    walletAddress,
    fromChain,
    fromCoin,
    amountIn,
    quote,
  });

  return {
    ok: true,
    dex: "Jumper",
    fromChain,
    toChain,
    approvalNeeded: approval.needed,
    allowance: approval.allowance.toString(),
    approvalExpected: amountIn.toString(),
    spender: approval.spender,
    amountIn: amountIn.toString(),
    quote: getJumperQuoteDetails({ amountIn, quote }),
  };
}

export async function buildJumperSwapTxs({
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
  const { amountIn, quote } = await getJumperQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
    recipient,
  });
  const txs = [];
  const approval = await getJumperAllowanceInfo({
    walletAddress,
    fromChain,
    fromCoin,
    amountIn,
    quote,
  });

  if (includeApprovals && approval.needed) {
    const approveAmount = getApprovalAmount({
      chain: fromChain,
      fromCoin,
      approvalAmount,
      amountIn,
      defaultAmount: amountIn,
    });

    if (approval.allowance > 0n) {
      txs.push(
        getApproveTx({
          chain: fromChain,
          chainId: jumperChainIds[fromChain],
          token: approval.token,
          spender: approval.spender,
          amount: 0n,
        }),
      );
    }
    txs.push(
      getApproveTx({
        chain: fromChain,
        chainId: jumperChainIds[fromChain],
        token: approval.token,
        spender: approval.spender,
        amount: approveAmount,
      }),
    );
  }
  txs.push(getJumperUnsignedTx({ quote, type: "swap" }));

  return {
    ok: true,
    dex: "Jumper",
    txs,
    approval: {
      needed: approval.needed,
      token: approval.token,
      spender: approval.spender,
      allowance: approval.allowance.toString(),
      amountIn: amountIn.toString(),
    },
    quote: getJumperQuoteDetails({ amountIn, quote }),
  };
}

export async function executeJumperSwap({
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
  try {
    assertWhitelistedRecipient({ address: recipient || walletAddress });
  } catch (e) {
    return {
      ok: false,
      dex: "Jumper",
      error: e?.message || "recipient not whitelisted",
      txs: [],
    };
  }

  const built = await buildJumperSwapTxs({
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

  for (const tx of built.txs || []) {
    if (tx.chain == "Solana" || tx.format?.startsWith("solana:")) {
      if (!solanaKeypair) {
        throw new Error(`private key missing: pk_sol_${walletName}`);
      }
      txs.push(
        await executeSolanaTx({
          keypair: solanaKeypair,
          expectedAddress: walletAddress,
          tx,
        }),
      );
    } else {
      txs.push(
        await executeRawEvmTx({
          privateKey,
          expectedAddress: walletAddress,
          chainId: tx.chainId,
          txData: tx,
          type: tx.type || "tx",
        }),
      );
    }
  }

  return { ...built, txs };
}
