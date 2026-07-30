"use server";

import { ethers } from "ethers";
import { CurrencyAmount, Native, Percent, Token, TradeType } from "@pancakeswap/sdk";
import {
  SMART_ROUTER_ADDRESSES,
  SmartRouter,
  SwapRouter,
} from "@pancakeswap/smart-router";
import { createPublicClient, http, parseAbi } from "viem";
import { arbitrum, base, bsc, linea, mainnet, zkSync } from "viem/chains";
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
  assertWhitelistedRecipient,
  executeRawEvmTx,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getPrivateKey,
  getTradeCoinEntry,
  getUnsignedTx,
  nativeEvmAddress,
} from "../../sharedServer";
import { getTimeoutSignal, parseJson } from "../shared";
import {
  pancakeSupportedChains,
  pancakeTokenListBase,
  pancakeTokenListFileM,
  pancakeTokenSearchListFileM,
} from "./shared";

const pancakeGatewayBase =
  "https://cross-chain.pancakeswap.com/gateway/api";
const defaultSlippageBps = 50n;
const defaultSlippagePercent = 0.5;
const routeCacheMs = 60 * 60 * 1000;
const maxPermit2Amount = (1n << 160n) - 1n;
const permit2ExpirationSeconds = 30 * 24 * 60 * 60;
const pancakeRouteCacheM = new Map();
const pancakeTokenPromiseM = new Map();
const pancakeDiscoveryCacheM = {};
const pancakeViemChainM = {
  Ethereum: mainnet,
  BSC: bsc,
  Arbitrum: arbitrum,
  Base: base,
  zkSyncEra: zkSync,
  Linea: linea,
};
const erc20ReadAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);
const permit2Interface = new ethers.Interface([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const wrappedNativeInterface = new ethers.Interface([
  "function deposit() payable",
  "function withdraw(uint256 amount)",
]);

function getPancakeChain(chain = "") {
  const viemChain = pancakeViemChainM[chain];
  if (!viemChain || !SMART_ROUTER_ADDRESSES[chainIds[chain]]) {
    throw new Error(`PancakeSwap chain unsupported: ${chain}`);
  }

  return viemChain;
}

function getPancakeClient(chain = "") {
  const viemChain = getPancakeChain(chain);
  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  return createPublicClient({
    chain: viemChain,
    transport: http(rpc, {
      retryCount: 0,
      timeout: 15_000,
    }),
    batch: {
      multicall: {
        batchSize: 200_000,
      },
    },
  });
}

function getPancakeCurrency(chain = "", coin = "", dynamicCoinE = null) {
  const chainId = chainIds[chain];
  getPancakeChain(chain);
  const coinE = getTradeCoinEntry(chain, coin, dynamicCoinE);
  if (coinE.native) return Native.onChain(chainId);

  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`EVM token address missing: ${chain} ${coin}`);
  }
  const decimals = Number.isInteger(coinE.decimals)
    ? coinE.decimals
    : getCoinDecimals(chain, coin, coinE);

  return new Token(
    chainId,
    ethers.getAddress(coinE.address).toLowerCase(),
    decimals,
    String(coinE.symbol || coin || "TOKEN"),
    String(coinE.name || coinE.symbol || coin || "Token"),
  );
}

function getPancakeAmount(currency, amount = "") {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    currency.decimals,
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return CurrencyAmount.fromRawAmount(currency, amountIn);
}

function sameCurrencyAddress(a, b) {
  return (
    a?.chainId == b?.chainId &&
    a?.wrapped?.address?.toLowerCase() == b?.wrapped?.address?.toLowerCase()
  );
}

function sameExactCurrency(a, b) {
  return sameCurrencyAddress(a, b) && !!a?.isNative == !!b?.isNative;
}

function gatewayCurrencyAddress(currency) {
  return currency.isNative ? nativeEvmAddress : currency.wrapped.address;
}

function serializePancakeTrade(trade) {
  return JSON.parse(
    JSON.stringify(trade, (_key, value) =>
      typeof value == "bigint" ? value.toString() : value,
    ),
  );
}

async function getPancakeTrade({
  chain = "",
  currencyIn,
  currencyOut,
  amountIn,
} = {}) {
  if (sameCurrencyAddress(currencyIn, currencyOut)) {
    throw new Error("wrapped/native conversion does not require a pool route");
  }

  const client = getPancakeClient(chain);
  const candidateParams = {
    onChainProvider: () => client,
    currencyA: currencyIn,
    currencyB: currencyOut,
  };
  const poolResults = await Promise.allSettled([
    SmartRouter.getV2CandidatePools(candidateParams),
    SmartRouter.getV3CandidatePools({
      ...candidateParams,
      fallbackTimeout: 1_500,
      staticFallback: true,
      subgraphFallback: true,
    }),
    SmartRouter.getStableCandidatePools(candidateParams),
  ]);
  const pools = poolResults.flatMap((result) =>
    result.status == "fulfilled" ? result.value : [],
  );
  if (!pools.length) {
    const reason = poolResults.find((result) => result.status == "rejected");
    throw new Error(
      reason?.reason?.message ||
        `No PancakeSwap pools found on ${chain}`,
    );
  }

  const trade = await SmartRouter.getBestTrade(
    amountIn,
    currencyOut,
    TradeType.EXACT_INPUT,
    {
      gasPriceWei: () => client.getGasPrice(),
      maxHops: 2,
      maxSplits: 2,
      poolProvider: SmartRouter.createStaticPoolProvider(pools),
      quoteProvider: SmartRouter.createQuoteProvider({
        onChainProvider: () => client,
      }),
      quoterOptimization: true,
    },
  );
  if (!trade) {
    throw new Error(`No PancakeSwap route found on ${chain}`);
  }

  return trade;
}

function getPancakeMinimumOutput(amountOut) {
  return (
    (BigInt(amountOut.quotient.toString()) *
      (10_000n - defaultSlippageBps)) /
    10_000n
  );
}

function getWrappedNativeRoute({
  chain = "",
  currencyIn,
  currencyOut,
  amountIn,
  recipient = "",
} = {}) {
  if (!sameCurrencyAddress(currencyIn, currencyOut)) return null;
  if (sameExactCurrency(currencyIn, currencyOut)) {
    throw new Error("sell coin and buy coin are the same");
  }

  const wrappedAddress = currencyIn.wrapped.address;
  const rawAmount = BigInt(amountIn.quotient.toString());
  const data = currencyIn.isNative
    ? wrappedNativeInterface.encodeFunctionData("deposit")
    : wrappedNativeInterface.encodeFunctionData("withdraw", [rawAmount]);

  return {
    router: wrappedAddress,
    txData: {
      to: wrappedAddress,
      data,
      value: currencyIn.isNative ? rawAmount.toString() : "0",
    },
    quote: {
      amountIn: rawAmount.toString(),
      amountOut: rawAmount.toString(),
      amountOutMinimum: rawAmount.toString(),
      recipient,
      route: "wrapped native",
      slippageBps: 0,
    },
  };
}

async function getSameChainPancakeRoute({
  chain = "",
  currencyIn,
  currencyOut,
  amountIn,
  recipient = "",
} = {}) {
  const wrappedRoute = getWrappedNativeRoute({
    chain,
    currencyIn,
    currencyOut,
    amountIn,
    recipient,
  });
  if (wrappedRoute) return wrappedRoute;

  const trade = await getPancakeTrade({
    chain,
    currencyIn,
    currencyOut,
    amountIn,
  });
  const router = SMART_ROUTER_ADDRESSES[chainIds[chain]];
  const { calldata, value } = SwapRouter.swapCallParameters(trade, {
    recipient: ethers.getAddress(recipient),
    slippageTolerance: new Percent(defaultSlippageBps, 10_000n),
  });

  return {
    router,
    trade,
    txData: {
      to: router,
      data: calldata,
      value: BigInt(value || 0).toString(),
    },
    quote: {
      amountIn: trade.inputAmount.quotient.toString(),
      amountOut: trade.outputAmount.quotient.toString(),
      amountOutMinimum: getPancakeMinimumOutput(
        trade.outputAmount,
      ).toString(),
      recipient,
      route: "PancakeSwap pools",
      slippageBps: Number(defaultSlippageBps),
    },
  };
}

async function pancakeGatewayFetch(
  path = "",
  { params = {}, body = null, method = "GET" } = {},
) {
  const url = new URL(`${pancakeGatewayBase}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = getTimeoutSignal(20_000);
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      ...(timeout.signal ? { signal: timeout.signal } : {}),
      cache: "no-store",
    });
    const text = await res.text();
    const data = parseJson(text);
    if (!res.ok) {
      throw new Error(
        data?.error?.message ||
          data?.message ||
          `PancakeSwap request failed: ${res.status}`,
      );
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") {
      throw new Error("PancakeSwap request timeout");
    }
    throw e;
  } finally {
    timeout.clear?.();
  }
}

async function pancakeTokenListFetch(chain = "", { search = false } = {}) {
  const fileM = search
    ? pancakeTokenSearchListFileM
    : pancakeTokenListFileM;
  const file = fileM[chain];
  if (!file) throw new Error(`PancakeSwap chain unsupported: ${chain}`);

  const timeout = getTimeoutSignal(10_000);
  try {
    const res = await fetch(`${pancakeTokenListBase}/${file}`, {
      ...(timeout.signal ? { signal: timeout.signal } : {}),
      cache: "no-store",
    });
    const text = await res.text();
    const data = parseJson(text);
    if (!res.ok) {
      throw new Error(
        data?.message ||
          `PancakeSwap token discovery failed: ${res.status}`,
      );
    }
    if (!Array.isArray(data?.tokens)) {
      throw new Error(
        data?.message || "PancakeSwap token discovery returned no tokens",
      );
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") {
      throw new Error("PancakeSwap token discovery timeout");
    }
    throw e;
  } finally {
    timeout.clear?.();
  }
}

function getPancakeTokenAddressKey(address = "") {
  const clean = String(address || "").trim();
  return ethers.isAddress(clean) ? clean.toLowerCase() : "";
}

function normalizePancakeToken(entry = {}, chain = "") {
  const expectedChainId = Number(chainIds[chain]);
  const chainId = Number(entry.chainId);
  const address = getPancakeTokenAddressKey(entry.address);
  const symbol = String(entry.symbol || "").trim();
  const decimals = Number(entry.decimals);
  if (
    !address ||
    !symbol ||
    !Number.isInteger(decimals) ||
    chainId != expectedChainId
  ) {
    return null;
  }

  const coinInfoM = coinM?.[chain] || {};
  const added =
    !!coinInfoM[symbol] ||
    Object.values(coinInfoM).some(
      (coinE) =>
        getPancakeTokenAddressKey(coinE?.address) == address,
    );

  return {
    chain,
    chainId,
    address: ethers.getAddress(address),
    symbol,
    name: String(entry.name || "").trim(),
    decimals,
    logoUrl: entry.logoURI || entry.logoUrl || "",
    added,
  };
}

function filterPancakeTokens(tokens = [], term = "") {
  const cleanTerm = String(term || "").trim().toLowerCase();
  if (!cleanTerm) return tokens.slice(0, 100);

  return tokens
    .filter((entry) =>
      [entry.symbol, entry.name, entry.address].some((value) =>
        String(value || "").toLowerCase().includes(cleanTerm),
      ),
    )
    .sort((a, b) => {
      const score = (entry) => {
        const symbol = String(entry.symbol || "").toLowerCase();
        const name = String(entry.name || "").toLowerCase();
        const address = String(entry.address || "").toLowerCase();
        return (
          (address == cleanTerm ? 8 : 0) +
          (symbol == cleanTerm ? 4 : 0) +
          (name == cleanTerm ? 2 : 0) +
          (symbol.startsWith(cleanTerm) ? 1 : 0)
        );
      };

      return score(b) - score(a);
    })
    .slice(0, 100);
}

async function getPancakeBridgeRoutes(fromChain = "", toChain = "") {
  const originChainId = chainIds[fromChain];
  const destinationChainId = chainIds[toChain];
  getPancakeChain(fromChain);
  getPancakeChain(toChain);
  const key = `${originChainId}:${destinationChainId}`;
  const cached = pancakeRouteCacheM.get(key);
  if (cached && Date.now() - cached.at < routeCacheMs) return cached.routes;

  const data = await pancakeGatewayFetch("/v1/routes", {
    params: { originChainId, destinationChainId },
  });
  const seen = new Set();
  const routes = (Array.isArray(data?.routes) ? data.routes : []).filter(
    (route) => {
      const routeKey = `${String(route.originToken).toLowerCase()}:${String(
        route.destinationToken,
      ).toLowerCase()}`;
      if (
        !ethers.isAddress(route.originToken) ||
        !ethers.isAddress(route.destinationToken) ||
        seen.has(routeKey)
      ) {
        return false;
      }
      seen.add(routeKey);
      return true;
    },
  );
  pancakeRouteCacheM.set(key, { at: Date.now(), routes });

  return routes;
}

async function getPancakeBridgeToken({
  chain = "",
  address = "",
  symbol = "",
} = {}) {
  const chainId = chainIds[chain];
  const normalizedAddress = ethers.getAddress(address).toLowerCase();
  const native = Native.onChain(chainId);
  if (normalizedAddress == native.wrapped.address.toLowerCase()) {
    return native.wrapped;
  }

  const key = `${chainId}:${normalizedAddress}`;
  if (!pancakeTokenPromiseM.has(key)) {
    const client = getPancakeClient(chain);
    pancakeTokenPromiseM.set(
      key,
      Promise.all([
        client.readContract({
          address: normalizedAddress,
          abi: erc20ReadAbi,
          functionName: "decimals",
        }),
        client
          .readContract({
            address: normalizedAddress,
            abi: erc20ReadAbi,
            functionName: "symbol",
          })
          .catch(() => symbol || "TOKEN"),
        client
          .readContract({
            address: normalizedAddress,
            abi: erc20ReadAbi,
            functionName: "name",
          })
          .catch(() => symbol || "Token"),
      ]).then(
        ([decimals, tokenSymbol, name]) =>
          new Token(
            chainId,
            normalizedAddress,
            Number(decimals),
            String(tokenSymbol || symbol || "TOKEN"),
            String(name || tokenSymbol || symbol || "Token"),
          ),
      ),
    );
  }

  return pancakeTokenPromiseM.get(key);
}

async function getPancakeAddressDiscoveryToken(chain = "", address = "") {
  if (!ethers.isAddress(address)) return null;

  try {
    const token = await getPancakeBridgeToken({ chain, address });
    return normalizePancakeToken(
      {
        chainId: chainIds[chain],
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
      },
      chain,
    );
  } catch {
    return null;
  }
}

function rankPancakeBridgeRoutes(routes = [], currencyIn, currencyOut) {
  const inputAddress = currencyIn.wrapped.address.toLowerCase();
  const outputAddress = currencyOut.wrapped.address.toLowerCase();

  return [...routes].sort((a, b) => {
    const score = (route) => {
      const origin = String(route.originToken).toLowerCase();
      const destination = String(route.destinationToken).toLowerCase();
      const symbol = String(route.destinationTokenSymbol || "").toUpperCase();

      return (
        (origin == inputAddress ? 16 : 0) +
        (destination == outputAddress ? 8 : 0) +
        (symbol.includes("USDC") ? 4 : 0) +
        (symbol.includes("USDT") ? 2 : 0) +
        (symbol.includes("WETH") || symbol == "ETH" ? 1 : 0)
      );
    };

    return score(b) - score(a);
  });
}

async function getPancakeBridgeMetadata({
  fromChain = "",
  toChain = "",
  originToken = "",
  destinationToken = "",
  amount = "",
  walletAddress = "",
  recipient = "",
} = {}) {
  const data = await pancakeGatewayFetch("/v1/metadata", {
    method: "POST",
    params: {
      inputToken: originToken,
      originChainId: chainIds[fromChain],
      outputToken: destinationToken,
      destinationChainId: chainIds[toChain],
      amount,
    },
    body: {
      recipientOnDestChain: recipient,
      commands: [],
      type: "EVM",
      slippageTolerance: defaultSlippagePercent,
      user: walletAddress,
    },
  });
  if (!data?.supported) {
    throw new Error(
      data?.reason ||
        data?.error?.message ||
        "PancakeSwap bridge route unsupported",
    );
  }
  if (data.isAmountTooLow) {
    throw new Error("PancakeSwap bridge amount is below the minimum");
  }
  if (!data.bridgeTransactionData?.outputAmount) {
    throw new Error("PancakeSwap bridge quote returned no output");
  }

  return data;
}

async function getCrossChainPancakeRoute({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  currencyIn,
  currencyOut,
  amountIn,
  recipient = "",
} = {}) {
  const routes = rankPancakeBridgeRoutes(
    await getPancakeBridgeRoutes(fromChain, toChain),
    currencyIn,
    currencyOut,
  );
  if (!routes.length) {
    throw new Error(
      `PancakeSwap cross-chain route unsupported: ${fromChain} to ${toChain}`,
    );
  }

  let lastError = null;
  for (const route of routes) {
    try {
      const originCurrency = await getPancakeBridgeToken({
        chain: fromChain,
        address: route.originToken,
        symbol: route.destinationTokenSymbol,
      });
      const destinationCurrency = await getPancakeBridgeToken({
        chain: toChain,
        address: route.destinationToken,
        symbol: route.destinationTokenSymbol,
      });
      const sourceTrade = sameCurrencyAddress(currencyIn, originCurrency)
        ? null
        : await getPancakeTrade({
            chain: fromChain,
            currencyIn,
            currencyOut: originCurrency,
            amountIn,
          });
      const bridgeInputAmount = sourceTrade
        ? sourceTrade.outputAmount.quotient.toString()
        : amountIn.quotient.toString();
      const metadata = await getPancakeBridgeMetadata({
        fromChain,
        toChain,
        originToken: originCurrency.address,
        destinationToken: destinationCurrency.address,
        amount: bridgeInputAmount,
        walletAddress,
        recipient,
      });
      const bridgeOutputAmount =
        metadata.bridgeTransactionData.outputAmount;
      const destinationTrade = sameCurrencyAddress(
        destinationCurrency,
        currencyOut,
      )
        ? null
        : await getPancakeTrade({
            chain: toChain,
            currencyIn: destinationCurrency,
            currencyOut,
            amountIn: CurrencyAmount.fromRawAmount(
              destinationCurrency,
              BigInt(bridgeOutputAmount),
            ),
          });
      const commands = [];

      if (sourceTrade) {
        commands.push({
          command: "SWAP",
          data: {
            originChainId: chainIds[fromChain],
            trade: serializePancakeTrade(sourceTrade),
            slippageTolerance: defaultSlippagePercent,
          },
        });
      }
      commands.push({
        command: "BRIDGE",
        data: {
          inputToken: originCurrency.address,
          outputToken: destinationCurrency.address,
          inputAmount: bridgeInputAmount,
          originChainId: chainIds[fromChain],
          destinationChainId: chainIds[toChain],
          originChainRecipient: walletAddress,
          minOutputAmount: bridgeOutputAmount,
          bridgeTransactionData: metadata.bridgeTransactionData,
        },
      });
      if (destinationTrade) {
        commands.push({
          command: "SWAP",
          data: {
            originChainId: chainIds[toChain],
            trade: serializePancakeTrade(destinationTrade),
            slippageTolerance: defaultSlippagePercent,
          },
        });
      }

      const calldata = await pancakeGatewayFetch("/v1/calldata", {
        method: "POST",
        body: {
          inputToken: gatewayCurrencyAddress(currencyIn),
          outputToken: gatewayCurrencyAddress(currencyOut),
          inputAmount: amountIn.quotient.toString(),
          originChainId: chainIds[fromChain],
          destinationChainId: chainIds[toChain],
          recipientOnDestChain: recipient,
          commands,
          type: "EVM",
        },
      });
      const router = calldata?.transactionData?.router;
      const data = calldata?.transactionData?.calldata;
      if (!ethers.isAddress(router) || !ethers.isHexString(data)) {
        throw new Error("PancakeSwap bridge returned invalid calldata");
      }
      const amountOut = destinationTrade
        ? destinationTrade.outputAmount.quotient.toString()
        : bridgeOutputAmount;

      return {
        destinationCurrency,
        destinationTrade,
        metadata,
        originCurrency,
        router: ethers.getAddress(router),
        sourceTrade,
        txData: {
          to: ethers.getAddress(router),
          data,
          value: currencyIn.isNative
            ? amountIn.quotient.toString()
            : "0",
        },
        quote: {
          amountIn: amountIn.quotient.toString(),
          amountOut,
          amountOutMinimum: (
            (BigInt(amountOut) * (10_000n - defaultSlippageBps)) /
            10_000n
          ).toString(),
          bridgeInputAmount,
          bridgeOutputAmount,
          bridgeToken: route.destinationTokenSymbol || "",
          expectedFillTimeSec: String(metadata.expectedFillTimeSec || ""),
          recipient,
          route: "PancakeSwap cross-chain",
          slippageBps: Number(defaultSlippageBps),
        },
      };
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("No PancakeSwap cross-chain route found");
}

async function getPancakeRoute({
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
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("EVM wallet address required");
  }
  const finalRecipient = recipient || walletAddress;
  if (!ethers.isAddress(finalRecipient)) {
    throw new Error("EVM recipient address required");
  }
  const currencyIn = getPancakeCurrency(fromChain, fromCoin, fromCoinE);
  const currencyOut = getPancakeCurrency(toChain, toCoin, toCoinE);
  const amountIn = getPancakeAmount(currencyIn, amount);
  const route =
    fromChain == toChain
      ? await getSameChainPancakeRoute({
          chain: fromChain,
          currencyIn,
          currencyOut,
          amountIn,
          recipient: finalRecipient,
        })
      : await getCrossChainPancakeRoute({
          walletAddress: ethers.getAddress(walletAddress),
          fromChain,
          toChain,
          currencyIn,
          currencyOut,
          amountIn,
          recipient: ethers.getAddress(finalRecipient),
        });

  return {
    ...route,
    amountIn,
    currencyIn,
    currencyOut,
    recipient: ethers.getAddress(finalRecipient),
  };
}

const pancakeRouteTypeM = {
  0: "V2",
  1: "V3",
  2: "stable",
  3: "mixed",
  4: "market maker",
  5: "Infinity CL",
  6: "Infinity BIN",
  7: "bridge",
  8: "SVM",
};
const pancakePoolTypeM = {
  0: "V2",
  1: "V3",
  2: "stable",
  3: "Infinity CL",
  4: "Infinity BIN",
  5: "SVM",
};

function formatPancakeAmount(amount = "", currency = null) {
  const decimals = Number(currency?.decimals);
  if (
    amount === "" ||
    amount === null ||
    !Number.isInteger(decimals)
  ) {
    return "";
  }

  try {
    return ethers.formatUnits(amount, decimals);
  } catch {
    return "";
  }
}

function getPancakeCurrencySymbol(currency = null, fallback = "") {
  return String(
    currency?.symbol ||
      currency?.wrapped?.symbol ||
      fallback ||
      "",
  );
}

function normalizePancakeAmount({
  chain = "",
  coin = "",
  currency = null,
  amount = "",
  minimumAmount = "",
} = {}) {
  return {
    chain,
    coin: getPancakeCurrencySymbol(currency, coin),
    name: String(currency?.name || coin || ""),
    decimals: Number(currency?.decimals),
    amount: String(amount ?? ""),
    amountFormatted: formatPancakeAmount(amount, currency),
    amountUsd: "",
    minimumAmount: String(minimumAmount ?? ""),
    minimumAmountFormatted: formatPancakeAmount(minimumAmount, currency),
  };
}

function getPancakeTradeRoutes(
  trade = null,
  chain = "",
  side = "pool route",
) {
  const routes = Array.isArray(trade?.routes) ? trade.routes : [];

  return routes.map((route, index) => {
    const inputCurrency = route.inputAmount?.currency || route.input;
    const outputCurrency = route.outputAmount?.currency || route.output;
    const routeType =
      pancakeRouteTypeM[Number(route.type)] || "pools";
    const path = (Array.isArray(route.path) ? route.path : [])
      .map((entry) => getPancakeCurrencySymbol(entry))
      .filter(Boolean);
    const poolTypes = [
      ...new Set(
        (Array.isArray(route.pools) ? route.pools : [])
          .map((pool) => pancakePoolTypeM[Number(pool?.type)])
          .filter(Boolean),
      ),
    ];
    const percent = Number(route.percent);
    const splitLabel =
      routes.length > 1 && Number.isFinite(percent)
        ? `${side} ${index + 1} (${percent}%)`
        : side;

    return {
      side: splitLabel,
      chain,
      input: normalizePancakeAmount({
        chain,
        currency: inputCurrency,
        amount: route.inputAmount?.quotient?.toString?.() || "",
      }),
      output: normalizePancakeAmount({
        chain,
        currency: outputCurrency,
        amount: route.outputAmount?.quotient?.toString?.() || "",
      }),
      router: `PancakeSwap ${routeType}`,
      sources: [
        ...(path.length > 1 ? [path.join(" → ")] : []),
        ...(poolTypes.length ? [`pools: ${poolTypes.join(", ")}`] : []),
      ],
    };
  });
}

function getPancakeTradeGasFee(
  trade = null,
  key = "",
  label = "",
) {
  const gasEstimate = BigInt(trade?.gasEstimate || 0);
  if (gasEstimate <= 0n) return null;

  let amountUsd = "";
  try {
    amountUsd = trade?.gasEstimateInUSD?.toExact?.() || "";
  } catch {
    amountUsd = "";
  }

  return {
    key,
    label,
    amount: gasEstimate.toString(),
    amountFormatted: gasEstimate.toString(),
    amountUsd,
    coin: "gas units",
    percent: "",
    description: "route gas estimate",
  };
}

function getPancakeQuoteDetails(route = {}, options = {}) {
  const quote = route.quote || {};
  const currencyIn = normalizePancakeAmount({
    chain: options.fromChain,
    coin: options.fromCoin,
    currency: route.currencyIn,
    amount: quote.amountIn,
  });
  const currencyOut = normalizePancakeAmount({
    chain: options.toChain,
    coin: options.toCoin,
    currency: route.currencyOut,
    amount: quote.amountOut,
    minimumAmount: quote.amountOutMinimum,
  });
  const inputQty = Number(currencyIn.amountFormatted);
  const outputQty = Number(currencyOut.amountFormatted);
  const slippageBps = Number(quote.slippageBps);
  const routes = [];
  const fees = [];

  if (route.sourceTrade) {
    routes.push(
      ...getPancakeTradeRoutes(
        route.sourceTrade,
        options.fromChain,
        "origin swap",
      ),
    );
    fees.push(
      getPancakeTradeGasFee(
        route.sourceTrade,
        "origin-gas",
        "origin route gas",
      ),
    );
  }
  if (route.originCurrency && route.destinationCurrency) {
    routes.push({
      side: "bridge",
      chain: `${options.fromChain} → ${options.toChain}`,
      input: normalizePancakeAmount({
        chain: options.fromChain,
        currency: route.originCurrency,
        amount: quote.bridgeInputAmount,
      }),
      output: normalizePancakeAmount({
        chain: options.toChain,
        currency: route.destinationCurrency,
        amount: quote.bridgeOutputAmount,
      }),
      router: "PancakeSwap bridge",
      sources: quote.bridgeToken
        ? [`bridge token: ${quote.bridgeToken}`]
        : [],
    });
  }
  if (route.destinationTrade) {
    routes.push(
      ...getPancakeTradeRoutes(
        route.destinationTrade,
        options.toChain,
        "destination swap",
      ),
    );
    fees.push(
      getPancakeTradeGasFee(
        route.destinationTrade,
        "destination-gas",
        "destination route gas",
      ),
    );
  }
  if (route.trade) {
    routes.push(
      ...getPancakeTradeRoutes(route.trade, options.fromChain),
    );
    fees.push(
      getPancakeTradeGasFee(route.trade, "route-gas", "route gas"),
    );
  }
  if (!routes.length) {
    routes.push({
      side: "route",
      chain:
        options.fromChain == options.toChain
          ? options.fromChain
          : `${options.fromChain} → ${options.toChain}`,
      input: currencyIn,
      output: currencyOut,
      router: String(quote.route || "PancakeSwap"),
      sources: [],
    });
  }

  return {
    rate:
      Number.isFinite(inputQty) &&
      inputQty > 0 &&
      Number.isFinite(outputQty)
        ? String(outputQty / inputQty)
        : "",
    timeEstimate: Number(quote.expectedFillTimeSec) || 0,
    amountIn: currencyIn.amountFormatted,
    amountOut: currencyOut.amountFormatted,
    minimumAmountOut: currencyOut.minimumAmountFormatted,
    currencyIn,
    currencyOut,
    totalImpact: {},
    swapImpact: {},
    slippageTolerance: Number.isFinite(slippageBps)
      ? {
          route: {
            usd: "",
            value: String(slippageBps / 10_000),
            percent: String(slippageBps / 100),
          },
        }
      : {},
    routes,
    fees: fees.filter(Boolean),
    priceImpacts: [],
    steps: [
      {
        id: "route-type",
        kind: "route",
        action: "route type",
        description: String(quote.route || "PancakeSwap"),
      },
    ],
    quotedAt: Date.now(),
  };
}

async function getPancakeApproval({
  chain = "",
  walletAddress = "",
  currencyIn,
  amountIn,
  router = "",
  crossChain = false,
} = {}) {
  if (currencyIn.isNative) {
    return {
      needed: false,
      tokenApprovalNeeded: false,
      permit2ApprovalNeeded: false,
    };
  }

  const client = getPancakeClient(chain);
  const owner = ethers.getAddress(walletAddress);
  const token = currencyIn.address;
  if (!crossChain) {
    const allowance = await client.readContract({
      address: token,
      abi: erc20ReadAbi,
      functionName: "allowance",
      args: [owner, ethers.getAddress(router)],
    });

    return {
      needed: BigInt(allowance) < BigInt(amountIn.quotient.toString()),
      tokenApprovalNeeded:
        BigInt(allowance) < BigInt(amountIn.quotient.toString()),
      permit2ApprovalNeeded: false,
      allowance: BigInt(allowance).toString(),
      spender: ethers.getAddress(router),
    };
  }

  const check = await pancakeGatewayFetch("/v1/check-approval", {
    method: "POST",
    body: {
      walletAddress: owner,
      tokenAddress: token,
      amount: amountIn.quotient.toString(),
      chainId: chainIds[chain],
    },
  });
  if (
    !ethers.isAddress(check?.permit2Address) ||
    !ethers.isAddress(check?.spender)
  ) {
    throw new Error("PancakeSwap approval response invalid");
  }
  const permit2Address = ethers.getAddress(check.permit2Address);
  const allowance = check.isApprovalRequired
    ? await client.readContract({
        address: token,
        abi: erc20ReadAbi,
        functionName: "allowance",
        args: [owner, permit2Address],
      })
    : 0n;

  return {
    needed: !!check.isApprovalRequired || !!check.isPermit2Required,
    tokenApprovalNeeded: !!check.isApprovalRequired,
    permit2ApprovalNeeded: !!check.isPermit2Required,
    permit2Address,
    spender: ethers.getAddress(check.spender),
    allowance: BigInt(allowance).toString(),
  };
}

function getPancakeApprovalTxs({
  chain = "",
  currencyIn,
  amountIn,
  approval,
  approvalAmount = "",
} = {}) {
  if (!approval?.needed || currencyIn.isNative) return [];

  const parsedApprovalAmount = getApprovalAmount({
    chain,
    fromCoin: currencyIn.symbol,
    approvalAmount,
    amountIn: BigInt(amountIn.quotient.toString()),
    defaultAmount: BigInt(amountIn.quotient.toString()),
    decimals: currencyIn.decimals,
  });
  if (parsedApprovalAmount > maxPermit2Amount && approval.permit2ApprovalNeeded) {
    throw new Error("PancakeSwap Permit2 approval qty is too large");
  }
  const txs = [];

  if (approval.tokenApprovalNeeded) {
    if (BigInt(approval.allowance || 0) > 0n) {
      txs.push(
        getApproveTx({
          chain,
          chainId: chainIds[chain],
          token: currencyIn.address,
          spender: approval.permit2Address || approval.spender,
          amount: 0n,
        }),
      );
    }
    txs.push(
      getApproveTx({
        chain,
        chainId: chainIds[chain],
        token: currencyIn.address,
        spender: approval.permit2Address || approval.spender,
        amount: parsedApprovalAmount,
      }),
    );
  }
  if (approval.permit2ApprovalNeeded) {
    txs.push(
      getUnsignedTx({
        chain,
        chainId: chainIds[chain],
        type: "permit2",
        txData: {
          to: approval.permit2Address,
          data: permit2Interface.encodeFunctionData("approve", [
            currencyIn.address,
            approval.spender,
            parsedApprovalAmount,
            Math.floor(Date.now() / 1000) + permit2ExpirationSeconds,
          ]),
          value: "0",
        },
      }),
    );
  }

  return txs;
}

function getPancakeDiscoveryCache(key = "") {
  const cached = getDiscoveryCacheMapEntry(pancakeDiscoveryCacheM, key);
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

function setPancakeDiscoveryCache(key = "", data = {}) {
  const at = Date.now();
  setDiscoveryCacheMapEntry(pancakeDiscoveryCacheM, key, { at, data });

  return {
    ...data,
    cache: makeDiscoveryCacheMeta({
      source: "api",
      at,
      ttlMs: discoveryCacheMs,
    }),
  };
}

export async function clearPancakeRuntimeCache() {
  clearDiscoveryCacheMap(pancakeDiscoveryCacheM);
  pancakeRouteCacheM.clear();
  pancakeTokenPromiseM.clear();

  return { ok: true };
}

export async function getPancakeTokenDiscovery({
  chain = "",
  term = "",
  refresh = false,
} = {}) {
  if (!pancakeSupportedChains.includes(chain)) {
    throw new Error(`PancakeSwap chain unsupported: ${chain}`);
  }

  const cleanTerm = String(term || "").trim();
  const cacheKey = `token:${chain}`;
  if (!cleanTerm && !refresh) {
    const cached = getPancakeDiscoveryCache(cacheKey);
    if (cached) return cached;
  }

  const data = await pancakeTokenListFetch(chain, {
    search: !!cleanTerm,
  });
  const seen = new Set();
  const normalizedTokens = data.tokens
    .map((entry) => normalizePancakeToken(entry, chain))
    .filter((entry) => {
      if (!entry || seen.has(entry.address.toLowerCase())) return false;
      seen.add(entry.address.toLowerCase());
      return true;
    });
  const tokens = filterPancakeTokens(normalizedTokens, cleanTerm);
  if (ethers.isAddress(cleanTerm)) {
    const addressKey = cleanTerm.toLowerCase();
    if (!tokens.some((entry) => entry.address.toLowerCase() == addressKey)) {
      const token = await getPancakeAddressDiscoveryToken(chain, cleanTerm);
      if (token) tokens.unshift(token);
    }
  }

  const result = {
    chain,
    term: cleanTerm,
    list: data.name || "PancakeSwap token list",
    tokens,
  };
  if (cleanTerm) return result;

  return setPancakeDiscoveryCache(cacheKey, result);
}

export async function getPancakeSwapPreview(options = {}) {
  const route = await getPancakeRoute(options);
  const approval = await getPancakeApproval({
    chain: options.fromChain,
    walletAddress: options.walletAddress,
    currencyIn: route.currencyIn,
    amountIn: route.amountIn,
    router: route.router,
    crossChain: options.fromChain != options.toChain,
  });

  return {
    ok: true,
    approvalNeeded: approval.needed,
    amountIn: route.amountIn.quotient.toString(),
    quote: route.quote,
  };
}

export async function getPancakeSwapEstimate(options = {}) {
  const route = await getPancakeRoute(options);

  return {
    ok: true,
    dex: "PancakeSwap",
    details: getPancakeQuoteDetails(route, options),
  };
}

export async function buildPancakeSwapTxs(options = {}) {
  assertWhitelistedRecipient({
    address: options.recipient || options.walletAddress,
  });
  const route = await getPancakeRoute(options);
  const approval = await getPancakeApproval({
    chain: options.fromChain,
    walletAddress: options.walletAddress,
    currencyIn: route.currencyIn,
    amountIn: route.amountIn,
    router: route.router,
    crossChain: options.fromChain != options.toChain,
  });
  const txs = getPancakeApprovalTxs({
    chain: options.fromChain,
    currencyIn: route.currencyIn,
    amountIn: route.amountIn,
    approval,
    approvalAmount: options.approvalAmount,
  });
  txs.push(
    getUnsignedTx({
      chain: options.fromChain,
      chainId: chainIds[options.fromChain],
      type: options.fromChain == options.toChain ? "swap" : "bridge",
      txData: route.txData,
    }),
  );

  return {
    ok: true,
    dex: "PancakeSwap",
    txs,
    quote: route.quote,
  };
}

export async function executePancakeSwap(options = {}) {
  const privateKey = getPrivateKey(options.walletName);
  if (!privateKey) {
    throw new Error(
      `private key missing: pk_raw_${options.walletName} or pk_${options.walletName}`,
    );
  }
  const built = await buildPancakeSwapTxs(options);
  const txs = [];

  for (const tx of built.txs) {
    txs.push(
      await executeRawEvmTx({
        privateKey,
        expectedAddress: options.walletAddress,
        chainId: tx.chainId,
        txData: tx,
        type: tx.type,
      }),
    );
  }

  return {
    ...built,
    txs,
  };
}
