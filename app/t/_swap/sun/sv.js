"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { chainIds } from "@/data/basic";
import {
  discoveryCacheMs,
  makeDiscoveryCacheMeta,
} from "@/fn/discoveryCache";
import {
  assertWhitelistedRecipient,
  executeTronTx,
  getApprovalAmount,
  getCoinDecimals,
  getTradeCoinEntry,
  getTronAddress,
  getTronPrivateKey,
  runTronRpc,
} from "../../sharedServer";
import { getTimeoutSignal, parseJson } from "../shared";

const sunApiBase =
  process.env.SUN_API_BASE ||
  process.env.sun_api_base ||
  "https://open.sun.io";
const sunRouterApiBase =
  process.env.SUN_ROUTER_API_BASE ||
  process.env.sun_router_api_base ||
  "https://rot.endjgfsv.link/swap";
const sunSmartRouter = "TGnC7LMji8hBpyvZt1TTEJhVpAZ5HFyJ3r";
const sunNativeTrx = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const sunNativePathAddress = "0x0000000000000000000000000000000000000000";
const sunRouteTypes = "SUNSWAP_V1,SUNSWAP_V2,SUNSWAP_V3,PSM,CURVE";
const sunSupportedTokenProtocols = new Set([
  "V1",
  "V1_5",
  "V2",
  "V3",
  "PSM",
  "CURVE",
]);
const sunSlippageBips = 50n;
const sunDeadlineSeconds = 20 * 60;
const sunApproveFeeLimit = 100_000_000;
const sunSwapFeeLimit = 1_000_000_000;
const sunSwapAbi = {
  inputs: [
    { internalType: "address[]", name: "path", type: "address[]" },
    { internalType: "string[]", name: "poolVersion", type: "string[]" },
    { internalType: "uint256[]", name: "versionLen", type: "uint256[]" },
    { internalType: "uint24[]", name: "fees", type: "uint24[]" },
    {
      components: [
        { internalType: "uint256", name: "amountIn", type: "uint256" },
        {
          internalType: "uint256",
          name: "amountOutMin",
          type: "uint256",
        },
        { internalType: "address", name: "to", type: "address" },
        { internalType: "uint256", name: "deadline", type: "uint256" },
      ],
      internalType: "struct SmartExchangeRouter.SwapData",
      name: "data",
      type: "tuple",
    },
  ],
  name: "swapExactInput",
  outputs: [
    {
      internalType: "uint256[]",
      name: "amountsOut",
      type: "uint256[]",
    },
  ],
  stateMutability: "payable",
  type: "function",
};
const sunAllowanceAbi = [
  {
    constant: true,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

function getSunHeaders() {
  const apiKey = String(
    process.env.SUN_API_KEY || process.env.sun_api_key || "",
  ).trim();

  return apiKey ? { "X-API-KEY": apiKey } : {};
}

async function sunFetch(
  base = "",
  endpoint = "",
  params = {},
  {
    headers = {},
    timeoutMs = 12000,
    timeoutMessage = "SUN request timeout",
  } = {},
) {
  const url = new URL(`${String(base).replace(/\/+$/, "")}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = getTimeoutSignal(timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      ...(timeout.signal ? { signal: timeout.signal } : {}),
    });
    const text = await res.text();
    const data = parseJson(text);
    const apiCode = Number(data?.code);

    if (!res.ok || (Number.isFinite(apiCode) && apiCode != 0)) {
      throw new Error(
        data?.message ||
          data?.msg ||
          `SUN request failed: ${res.status}`,
      );
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") throw new Error(timeoutMessage);
    throw e;
  } finally {
    timeout.clear?.();
  }
}

function getSunToken(chain = "", coin = "", dynamicCoinE = null) {
  if (chain != "Tron") throw new Error(`SUN chain unsupported: ${chain}`);

  const coinE = getTradeCoinEntry(chain, coin, dynamicCoinE);
  if (coinE.native) {
    return {
      address: sunNativeTrx,
      coinE,
      native: true,
    };
  }
  if (!coinE.address) throw new Error(`coin address missing: ${chain} ${coin}`);

  return {
    address: getTronAddress(coinE.address, `SUN ${coin} token`),
    coinE,
    native: false,
  };
}

function sameTronAddress(left = "", right = "") {
  try {
    return getTronAddress(left) == getTronAddress(right);
  } catch {
    return false;
  }
}

function getSunPoolVersion(value = "") {
  const version = String(value || "").trim();
  const lower = version.toLowerCase();
  if (["v1", "v2", "v3"].includes(lower)) return version;
  if (
    [
      "usdt20psm",
      "usdd202pool",
      "2pooltusdusdt",
      "usdc2pooltusdusdt",
      "usdd2pooltusdusdt",
      "usdj2pooltusdusdt",
      "oldusdcpool",
      "old3pool",
    ].includes(lower)
  ) {
    return version;
  }

  throw new Error(`SUN route version unsupported: ${version || "missing"}`);
}

function getSunVersionGroups(poolVersions = []) {
  const versions = poolVersions.map(getSunPoolVersion);
  const grouped = [];

  for (const version of versions) {
    const last = grouped[grouped.length - 1];
    if (last?.version == version) {
      last.length += 1;
    } else {
      grouped.push({ version, length: 1 });
    }
  }
  if (!grouped.length) throw new Error("SUN route has no pools");

  return {
    poolVersions: grouped.map((entry) => entry.version),
    versionLengths: grouped.map((entry, index) =>
      index ? entry.length : entry.length + 1,
    ),
    versions,
  };
}

function getSunFees(route = {}, versions = []) {
  const poolFees = Array.isArray(route.poolFees) ? route.poolFees : [];

  return [
    ...versions.map((version, index) => {
      if (version.toLowerCase() != "v3") return 0;
      const fee = Number(poolFees[index]);
      if (!Number.isInteger(fee) || fee < 0 || fee > 0xffffff) {
        throw new Error("SUN V3 route fee invalid");
      }
      return fee;
    }),
    0,
  ];
}

function isUsableSunRoute(
  route = {},
  fromTokenAddress = "",
  toTokenAddress = "",
) {
  const tokens = Array.isArray(route.tokens) ? route.tokens : [];
  const versions = Array.isArray(route.poolVersions)
    ? route.poolVersions
    : [];
  if (
    route.containsUnverifiedHook ||
    tokens.length < 2 ||
    versions.length != tokens.length - 1 ||
    !sameTronAddress(tokens[0], fromTokenAddress) ||
    !sameTronAddress(tokens[tokens.length - 1], toTokenAddress)
  ) {
    return false;
  }

  try {
    if (BigInt(route.amountOutRaw || 0) <= 0n) return false;
    versions.forEach(getSunPoolVersion);
    return true;
  } catch {
    return false;
  }
}

async function getSunRoute({
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
  if (fromChain != "Tron" || toChain != "Tron") {
    throw new Error("SUN is for Tron swaps only");
  }
  if (fromCoin == toCoin) {
    throw new Error("sell coin and buy coin are the same");
  }

  const owner = getTronAddress(walletAddress, "SUN sender");
  const to = getTronAddress(recipient || walletAddress, "SUN recipient");
  const fromToken = getSunToken(fromChain, fromCoin, fromCoinE);
  const toToken = getSunToken(toChain, toCoin, toCoinE);
  if (sameTronAddress(fromToken.address, toToken.address)) {
    throw new Error("SUN sell and buy tokens resolve to the same address");
  }

  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(fromChain, fromCoin, fromCoinE),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  const data = await sunFetch(
    sunRouterApiBase,
    "/routerUniversal",
    {
      fromToken: fromToken.address,
      toToken: toToken.address,
      amountIn: amountIn.toString(),
      typeList: sunRouteTypes,
    },
    {
      timeoutMs: 15000,
      timeoutMessage: "SUN route quote timeout",
    },
  );
  const routes = (Array.isArray(data?.data) ? data.data : [])
    .filter((route) =>
      isUsableSunRoute(route, fromToken.address, toToken.address),
    )
    .sort((left, right) => {
      const leftAmount = BigInt(left.amountOutRaw || 0);
      const rightAmount = BigInt(right.amountOutRaw || 0);
      return leftAmount == rightAmount ? 0 : leftAmount > rightAmount ? -1 : 1;
    });
  const route = routes[0];
  if (!route) {
    throw new Error(data?.message || "SUN returned no supported swap route");
  }

  const routeTokens = route.tokens.map((address) =>
    getTronAddress(address, "SUN route token"),
  );
  if (fromToken.native) routeTokens[0] = sunNativePathAddress;
  if (toToken.native) {
    routeTokens[routeTokens.length - 1] = sunNativePathAddress;
  }
  const amountOut = BigInt(route.amountOutRaw);
  const amountOutMinimum =
    (amountOut * (10_000n - sunSlippageBips)) / 10_000n;
  if (amountOutMinimum <= 0n) throw new Error("SUN minimum output is 0");

  return {
    owner,
    recipient: to,
    fromToken,
    toToken,
    amountIn,
    amountOut,
    amountOutMinimum,
    route,
    routeTokens,
  };
}

async function getSunAllowance({
  owner = "",
  fromToken = {},
  amountIn = 0n,
} = {}) {
  if (fromToken.native) {
    return {
      needed: false,
      allowance: 0n,
      token: "",
      spender: "",
    };
  }

  const tokenAddress = getTronAddress(fromToken.address, "SUN approval token");
  const spender = getTronAddress(sunSmartRouter, "SUN Smart Router");
  const allowance = await runTronRpc({
    scope: "SUN allowance",
    action: async (tronWeb) => {
      tronWeb.setAddress(owner);
      const token = tronWeb.contract(sunAllowanceAbi, tokenAddress);
      const result = await token
        .allowance(owner, spender)
        .call({ from: owner });
      return BigInt(String(result));
    },
  });

  return {
    needed: allowance < amountIn,
    allowance,
    token: tokenAddress,
    spender,
  };
}

function getSunTriggerError(result = {}, fallback = "SUN transaction unavailable") {
  const message = result?.result?.message;
  if (!message) return fallback;

  try {
    return Buffer.from(message, "base64").toString("utf8") || fallback;
  } catch {
    return String(message) || fallback;
  }
}

async function getSunApprovalTx({
  owner = "",
  token = "",
  spender = "",
  amount = 0n,
} = {}) {
  const result = await runTronRpc({
    scope: "SUN approval build",
    action: (tronWeb) =>
      tronWeb.transactionBuilder.triggerSmartContract(
        getTronAddress(token, "SUN approval token"),
        "approve(address,uint256)",
        { feeLimit: sunApproveFeeLimit, callValue: 0 },
        [
          {
            type: "address",
            value: getTronAddress(spender, "SUN approval address"),
          },
          { type: "uint256", value: amount.toString() },
        ],
        getTronAddress(owner, "SUN sender"),
      ),
  });
  if (!result?.result?.result || !result?.transaction) {
    throw new Error(getSunTriggerError(result, "SUN approval unavailable"));
  }

  return {
    chain: "Tron",
    chainId: chainIds.Tron,
    type: "approve",
    transaction: result.transaction,
    format: "tron:transaction",
    refreshBlockRef: true,
  };
}

async function getSunSwapTx(routeE = {}) {
  if (
    routeE.fromToken.native &&
    routeE.amountIn > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error("SUN TRX amount exceeds the transaction builder limit");
  }

  const { poolVersions, versionLengths, versions } = getSunVersionGroups(
    routeE.route.poolVersions,
  );
  const fees = getSunFees(routeE.route, versions);
  const deadline = Math.floor(Date.now() / 1000) + sunDeadlineSeconds;
  const parametersV2 = [
    [...routeE.routeTokens],
    poolVersions,
    versionLengths.map(String),
    fees,
    [
      routeE.amountIn.toString(),
      routeE.amountOutMinimum.toString(),
      routeE.recipient,
      String(deadline),
    ],
  ];
  const result = await runTronRpc({
    scope: "SUN swap build",
    action: (tronWeb) =>
      tronWeb.transactionBuilder.triggerSmartContract(
        getTronAddress(sunSmartRouter, "SUN Smart Router"),
        "swapExactInput(address[],string[],uint256[],uint24[],(uint256,uint256,address,uint256))",
        {
          feeLimit: sunSwapFeeLimit,
          callValue: routeE.fromToken.native ? Number(routeE.amountIn) : 0,
          funcABIV2: sunSwapAbi,
          parametersV2,
        },
        [],
        routeE.owner,
      ),
  });
  if (!result?.result?.result || !result?.transaction) {
    throw new Error(getSunTriggerError(result, "SUN swap unavailable"));
  }

  return {
    chain: "Tron",
    chainId: chainIds.Tron,
    type: "swap",
    transaction: result.transaction,
    format: "tron:transaction",
    refreshBlockRef: true,
  };
}

function getSunQuoteDetails(routeE = {}) {
  return {
    amountIn: routeE.amountIn.toString(),
    amountOut: routeE.amountOut.toString(),
    amountOutMinimum: routeE.amountOutMinimum.toString(),
    fromAmountUsd: routeE.route.inUsd || "",
    toAmountUsd: routeE.route.outUsd || "",
    priceImpact: routeE.route.impact || "",
    fee: routeE.route.fee || "",
    path: Array.isArray(routeE.route.symbols) ? routeE.route.symbols : [],
    poolVersions: Array.isArray(routeE.route.poolVersions)
      ? routeE.route.poolVersions
      : [],
  };
}

export async function getSunTokenDiscovery({
  chain = "",
  term = "",
} = {}) {
  if (chain != "Tron") throw new Error(`SUN chain unsupported: ${chain}`);

  const cleanTerm = String(term || "").trim();
  const data = await sunFetch(
    sunApiBase,
    "/apiv2/tokens/search",
    {
      query: cleanTerm,
      protocol: "ALL",
      pageSize: 50,
    },
    {
      headers: getSunHeaders(),
      timeoutMs: 12000,
      timeoutMessage: "SUN token discovery timeout",
    },
  );
  const localCoinM = coinM.Tron || {};
  const seen = new Set();
  const tokens = (Array.isArray(data?.data?.list) ? data.data.list : [])
    .map((entry) => {
      const address = String(entry.tokenAddress || "").trim();
      const symbol = String(entry.tokenSymbol || "").trim();
      const protocols = Array.isArray(entry.relevantProtocolList)
        ? entry.relevantProtocolList.map((value) =>
            String(value || "").toUpperCase(),
          )
        : [];
      const addressKey = (() => {
        try {
          return getTronAddress(address);
        } catch {
          return "";
        }
      })();
      const added =
        !!localCoinM[symbol] ||
        Object.values(localCoinM).some(
          (coinE) =>
            coinE?.address &&
            sameTronAddress(coinE.address, addressKey),
        );

      return {
        chain: "Tron",
        address: addressKey,
        symbol,
        name: String(entry.tokenName || "").trim(),
        decimals: Number(entry.tokenDecimal),
        priceUsd: Number(entry.tokenPriceUsd || 0),
        reserveUsd: Number(entry.reserveUsd || 0),
        volumeUsd1d: Number(entry.volumeUsd1d || 0),
        logoUrl: String(entry.tokenLogo || "").trim(),
        protocol: protocols.join(", ") || String(entry.protocol || ""),
        protocols,
        added,
        native: sameTronAddress(addressKey, sunNativeTrx),
      };
    })
    .filter((entry) => {
      if (
        !entry.address ||
        !entry.symbol ||
        !Number.isInteger(entry.decimals) ||
        entry.decimals < 0 ||
        entry.decimals > 255 ||
        (entry.protocols.length &&
          !entry.protocols.some((protocol) =>
            sunSupportedTokenProtocols.has(protocol),
          ))
      ) {
        return false;
      }
      const key = entry.address;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    chain: "Tron",
    term: cleanTerm,
    tokens,
    cache: makeDiscoveryCacheMeta({
      source: "api",
      location: "client",
      ttlMs: discoveryCacheMs,
    }),
  };
}

export async function getSunSwapPreview(options = {}) {
  const routeE = await getSunRoute(options);
  const approval = await getSunAllowance({
    owner: routeE.owner,
    fromToken: routeE.fromToken,
    amountIn: routeE.amountIn,
  });

  return {
    ok: true,
    dex: "SUN",
    fromChain: "Tron",
    toChain: "Tron",
    approvalNeeded: approval.needed,
    allowance: approval.allowance.toString(),
    approvalExpected: routeE.amountIn.toString(),
    spender: approval.spender,
    quote: getSunQuoteDetails(routeE),
  };
}

export async function buildSunSwapTxs({
  approvalAmount = "",
  includeApprovals = true,
  ...options
} = {}) {
  const routeE = await getSunRoute(options);
  const approval = await getSunAllowance({
    owner: routeE.owner,
    fromToken: routeE.fromToken,
    amountIn: routeE.amountIn,
  });
  const txs = [];

  if (includeApprovals && approval.needed) {
    const approveAmount = getApprovalAmount({
      chain: "Tron",
      fromCoin: options.fromCoin,
      approvalAmount,
      amountIn: routeE.amountIn,
      defaultAmount: routeE.amountIn,
      decimals: getCoinDecimals("Tron", options.fromCoin, options.fromCoinE),
    });
    txs.push(
      await getSunApprovalTx({
        owner: routeE.owner,
        token: approval.token,
        spender: approval.spender,
        amount: approveAmount,
      }),
    );
  }
  txs.push(await getSunSwapTx(routeE));

  return {
    ok: true,
    dex: "SUN",
    txs,
    approval: {
      needed: approval.needed,
      token: approval.token,
      spender: approval.spender,
      allowance: approval.allowance.toString(),
      amountIn: routeE.amountIn.toString(),
    },
    quote: getSunQuoteDetails(routeE),
  };
}

export async function executeSunSwap({
  walletName = "",
  walletAddress = "",
  recipient = "",
  ...options
} = {}) {
  const privateKey = getTronPrivateKey(walletName);
  if (!privateKey) {
    throw new Error(
      `private key missing: pk_tron_raw_${walletName} or pk_tron_${walletName}`,
    );
  }
  try {
    assertWhitelistedRecipient({ address: recipient || walletAddress });
  } catch (e) {
    return {
      ok: false,
      dex: "SUN",
      error: e?.message || "recipient not whitelisted",
      txs: [],
    };
  }

  const built = await buildSunSwapTxs({
    ...options,
    walletAddress,
    recipient,
  });
  const txs = [];

  const builtTxs = built.txs || [];
  for (const [index, tx] of builtTxs.entries()) {
    txs.push(
      await executeTronTx({
        privateKey,
        expectedAddress: walletAddress,
        tx,
        waitForConfirmation: index < builtTxs.length - 1,
      }),
    );
  }

  return { ...built, txs };
}
