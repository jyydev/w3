"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { chainIds } from "@/data/basic";
import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";
import {
  executeSolanaTx,
  getCoinDecimals,
  getSolanaKeypair,
  getSolanaPublicKey,
  getTradeCoinEntry,
} from "../../sharedServer";
import { getArrayPayload, getTimeoutSignal, parseJson } from "../shared";

const jupiterApiBase = "https://lite-api.jup.ag/swap/v1";
const jupiterTokenApiBase =
  process.env.JUPITER_TOKEN_API_BASE ||
  process.env.jupiter_token_api_base ||
  "https://lite-api.jup.ag/tokens/v2";
const jupiterNativeSolAddress = "So11111111111111111111111111111111111111112";
const defaultSlippageBps = 50n;
const jupiterSwapDiscoveryCacheM = {};

function getJupiterToken(coin = "", dynamicCoinE = null) {
  const coinE = getTradeCoinEntry("Solana", coin, dynamicCoinE);
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
    chainId: chainIds.Solana,
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

function getJupiterSwapDiscoveryCache(key = "") {
  const cached = getDiscoveryCacheMapEntry(jupiterSwapDiscoveryCacheM, key);
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

function setJupiterSwapDiscoveryCache(key = "", data = {}) {
  const at = Date.now();
  setDiscoveryCacheMapEntry(jupiterSwapDiscoveryCacheM, key, { at, data });

  return {
    ...data,
    cache: makeDiscoveryCacheMeta({ source: "api", at, ttlMs: discoveryCacheMs }),
  };
}

export async function clearJupiterSwapRuntimeCache() {
  clearDiscoveryCacheMap(jupiterSwapDiscoveryCacheM);

  return { ok: true };
}

export async function getJupiterTokenDiscovery({
  chain = "Solana",
  term = "",
  refresh = false,
} = {}) {
  if (chain != "Solana") throw new Error("Jupiter is Solana-only");

  const cleanTerm = String(term || "").trim();
  const cacheKey = `token:${chain}:${cleanTerm.toLowerCase()}`;
  const useServerCache = !cleanTerm;
  if (useServerCache && !refresh) {
    const cached = getJupiterSwapDiscoveryCache(cacheKey);
    if (cached) return cached;
  }

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

  if (!useServerCache) return { chain, term: cleanTerm, tokens };

  return setJupiterSwapDiscoveryCache(cacheKey, {
    chain,
    term: cleanTerm,
    tokens,
  });
}

async function jupiterFetch(endpoint, options = {}) {
  const {
    timeoutMs = 0,
    timeoutMessage = "Jupiter request timeout",
    ...fetchOptions
  } = options;
  const timeout = getTimeoutSignal(timeoutMs);

  try {
    const res = await fetch(`${jupiterApiBase}${endpoint}`, {
      ...fetchOptions,
      cache: "no-store",
      headers: {
        ...getJupiterHeaders(),
        ...(fetchOptions.headers || {}),
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
        `Jupiter request failed: ${res.status}`;
      throw new Error(message);
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw e;
  } finally {
    timeout.clear?.();
  }
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

function getJupiterAmountIn({
  fromCoin,
  fromCoinE = null,
  amount,
}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals("Solana", fromCoin, fromCoinE),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

async function getJupiterQuote({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  fromCoinE = null,
  toCoinE = null,
  amount = "",
  timeoutMs = 0,
} = {}) {
  assertJupiterRoute({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
  });

  const amountIn = getJupiterAmountIn({ fromCoin, fromCoinE, amount });
  const params = new URLSearchParams({
    inputMint: getJupiterToken(fromCoin, fromCoinE),
    outputMint: getJupiterToken(toCoin, toCoinE),
    amount: amountIn.toString(),
    slippageBps: String(defaultSlippageBps),
    restrictIntermediateTokens: "true",
  });

  return {
    amountIn,
    quote: await jupiterFetch(`/quote?${params}`, {
      timeoutMs,
      timeoutMessage: "Jupiter quote timeout",
    }),
  };
}

function getJupiterMintLabel(mint = "") {
  const value = String(mint || "");
  if (value.length <= 12) return value;

  return `${value.slice(0, 5)}..${value.slice(-4)}`;
}

function getJupiterMintEntry(
  mint = "",
  selectedEntries = [],
) {
  const cleanMint = String(mint || "");
  if (cleanMint == jupiterNativeSolAddress) {
    return {
      coin: "SOL",
      ...(coinM?.Solana?.SOL || {}),
      address: jupiterNativeSolAddress,
    };
  }

  for (const entry of selectedEntries) {
    if (
      entry?.address &&
      String(entry.address) == cleanMint
    ) {
      return entry;
    }
  }

  for (const [coin, coinE] of Object.entries(coinM?.Solana || {})) {
    if (coinE?.address && String(coinE.address) == cleanMint) {
      return { coin, ...coinE };
    }
  }

  return {
    coin: getJupiterMintLabel(cleanMint),
    address: cleanMint,
  };
}

function formatJupiterAmount(amount = "", decimals) {
  if (amount === "" || amount === null || !Number.isInteger(decimals)) {
    return "";
  }

  try {
    return ethers.formatUnits(amount, decimals);
  } catch {
    return "";
  }
}

function normalizeJupiterAmount({
  mint = "",
  amount = "",
  amountUsd = "",
  minimumAmount = "",
  selectedEntries = [],
} = {}) {
  const coinE = getJupiterMintEntry(mint, selectedEntries);
  const decimals = Number(coinE.decimals);

  return {
    chain: "Solana",
    coin: String(coinE.coin || getJupiterMintLabel(mint)),
    name: String(coinE.name || coinE.coin || ""),
    decimals: Number.isInteger(decimals) ? decimals : "",
    amount: String(amount ?? ""),
    amountFormatted: formatJupiterAmount(amount, decimals),
    amountUsd: String(amountUsd ?? ""),
    minimumAmount: String(minimumAmount ?? ""),
    minimumAmountFormatted: formatJupiterAmount(
      minimumAmount,
      decimals,
    ),
  };
}

function getJupiterQuoteDetails({
  amountIn = 0n,
  quote = {},
  fromCoin = "",
  toCoin = "",
  fromCoinE = null,
  toCoinE = null,
} = {}) {
  const inputMint = String(
    quote.inputMint || getJupiterToken(fromCoin, fromCoinE),
  );
  const outputMint = String(
    quote.outputMint || getJupiterToken(toCoin, toCoinE),
  );
  const selectedEntries = [
    {
      coin: fromCoin,
      ...getTradeCoinEntry("Solana", fromCoin, fromCoinE),
      address: inputMint,
    },
    {
      coin: toCoin,
      ...getTradeCoinEntry("Solana", toCoin, toCoinE),
      address: outputMint,
    },
  ];
  const currencyIn = normalizeJupiterAmount({
    mint: inputMint,
    amount: quote.inAmount || amountIn.toString(),
    selectedEntries,
  });
  const currencyOut = normalizeJupiterAmount({
    mint: outputMint,
    amount: quote.outAmount,
    amountUsd: quote.swapUsdValue,
    minimumAmount: quote.otherAmountThreshold,
    selectedEntries,
  });
  const inputQty = Number(currencyIn.amountFormatted);
  const outputQty = Number(currencyOut.amountFormatted);
  const priceImpact = Number(quote.priceImpactPct);
  const slippageBps = Number(quote.slippageBps);
  const routePlan = Array.isArray(quote.routePlan)
    ? quote.routePlan
    : [];
  const fees = routePlan
    .map((entry, index) => {
      const swapInfo = entry?.swapInfo || {};
      const feeAmount = BigInt(swapInfo.feeAmount || 0);
      if (feeAmount <= 0n) return null;

      const feeE = normalizeJupiterAmount({
        mint: swapInfo.feeMint,
        amount: feeAmount,
        selectedEntries,
      });

      return {
        key: `route-fee-${index}`,
        label: `${swapInfo.label || `route ${index + 1}`} fee`,
        amount: feeAmount.toString(),
        amountFormatted: feeE.amountFormatted,
        amountUsd: "",
        coin: feeE.coin,
        percent: "",
        description: "Jupiter route fee",
      };
    })
    .filter(Boolean);
  const platformFeeAmount = BigInt(quote.platformFee?.amount || 0);
  if (platformFeeAmount > 0n) {
    const platformFeeE = normalizeJupiterAmount({
      mint: quote.platformFee?.feeMint || outputMint,
      amount: platformFeeAmount,
      selectedEntries,
    });
    fees.push({
      key: "platform-fee",
      label: "platform fee",
      amount: platformFeeAmount.toString(),
      amountFormatted: platformFeeE.amountFormatted,
      amountUsd: "",
      coin: platformFeeE.coin,
      percent: Number.isFinite(Number(quote.platformFee?.feeBps))
        ? String(Number(quote.platformFee.feeBps) / 100)
        : "",
      description: "Jupiter platform fee",
    });
  }

  return {
    rate:
      Number.isFinite(inputQty) &&
      inputQty > 0 &&
      Number.isFinite(outputQty)
        ? String(outputQty / inputQty)
        : "",
    timeEstimate: 0,
    amountIn: currencyIn.amountFormatted,
    amountOut: currencyOut.amountFormatted,
    minimumAmountOut: currencyOut.minimumAmountFormatted,
    currencyIn,
    currencyOut,
    totalImpact: {},
    swapImpact: Number.isFinite(priceImpact)
      ? {
          usd: "",
          percent: String(-Math.abs(priceImpact)),
        }
      : {},
    slippageTolerance: Number.isFinite(slippageBps)
      ? {
          route: {
            usd: "",
            value: String(slippageBps / 10_000),
            percent: String(slippageBps / 100),
          },
        }
      : {},
    routes: routePlan.map((entry, index) => {
      const swapInfo = entry?.swapInfo || {};
      const percent = Number(entry?.percent);

      return {
        side:
          routePlan.length > 1
            ? `route ${index + 1}${
                Number.isFinite(percent) ? ` (${percent}%)` : ""
              }`
            : "route",
        chain: "Solana",
        input: normalizeJupiterAmount({
          mint: swapInfo.inputMint,
          amount: swapInfo.inAmount,
          selectedEntries,
        }),
        output: normalizeJupiterAmount({
          mint: swapInfo.outputMint,
          amount: swapInfo.outAmount,
          selectedEntries,
        }),
        router: String(swapInfo.label || "Jupiter"),
        sources: swapInfo.ammKey
          ? [`AMM: ${getJupiterMintLabel(swapInfo.ammKey)}`]
          : [],
      };
    }),
    fees,
    priceImpacts: [],
    steps: [
      {
        id: "swap-mode",
        kind: "route",
        action: "swap mode",
        description: String(quote.swapMode || "ExactIn"),
      },
      ...(quote.contextSlot
        ? [
            {
              id: "context-slot",
              kind: "quote",
              action: "Solana slot",
              description: String(quote.contextSlot),
            },
          ]
        : []),
      ...(Number(quote.timeTaken) > 0
        ? [
            {
              id: "quote-time",
              kind: "quote",
              action: "quote calculation",
              description: `${Math.round(Number(quote.timeTaken) * 1000)}ms`,
            },
          ]
        : []),
    ],
    quotedAt: Date.now(),
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
    chainId: chainIds.Solana,
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

export async function getJupiterSwapEstimate(options = {}) {
  const { amountIn, quote } = await getJupiterQuote({
    ...options,
    timeoutMs: 20_000,
  });

  return {
    ok: true,
    dex: "Jupiter",
    details: getJupiterQuoteDetails({
      amountIn,
      quote,
      fromCoin: options.fromCoin,
      toCoin: options.toCoin,
      fromCoinE: options.fromCoinE,
      toCoinE: options.toCoinE,
    }),
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
