"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import {
  executeSolanaTx,
  getCoinDecimals,
  getSolanaKeypair,
  getSolanaPublicKey,
  relayChainIds,
} from "../sharedServer";
import { getArrayPayload, getTimeoutSignal, parseJson } from "./shared";

const jupiterApiBase =
  process.env.JUPITER_API_BASE ||
  process.env.jupiter_api_base ||
  "https://lite-api.jup.ag/swap/v1";
const jupiterTokenApiBase =
  process.env.JUPITER_TOKEN_API_BASE ||
  process.env.jupiter_token_api_base ||
  "https://lite-api.jup.ag/tokens/v2";const jupiterNativeSolAddress = "So11111111111111111111111111111111111111112";const defaultSlippageBps = 50n;

function getJupiterToken(coin = "") {
  const coinE = coinM?.Solana?.[coin];
  if (!coinE) throw new Error(`coin not found: Solana ${coin}`);
  if (coinE.native) return jupiterNativeSolAddress;

  return getSolanaPublicKey(coinE.address, "Jupiter token mint").toBase58();
}

function getJupiterHeaders() {
  const apiKey = process.env.JUPITER_API_KEY || process.env.jupiter_api_key;

  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
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
