"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import {
  approveExactIfNeeded,
  assertWalletMatches,
  erc20Abi,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getEvmTokenAddress,
  getPrivateKey,
  getUnsignedTx,
  getUsableChainRpc,
  getWallet,
  relayChainIds,
} from "../../sharedServer";
import {
  cleanMarketSymbol,
  mapWithConcurrency,
  sameEvmAddress,
  withTimeout,
} from "../shared";

const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const erc4626Abi = [
  "function asset() view returns (address)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function deposit(uint256 assets,address receiver) returns (uint256)",
  "function redeem(uint256 shares,address receiver,address owner) returns (uint256)",
];
const erc4626Interface = new ethers.Interface(erc4626Abi);
const sparkPsm3Abi = [
  "function convertToAssets(address asset,uint256 numShares) view returns (uint256)",
  "function convertToShares(address asset,uint256 assets) view returns (uint256)",
  "function deposit(address asset,address receiver,uint256 assetsToDeposit) returns (uint256)",
  "function previewDeposit(address asset,uint256 assetsToDeposit) view returns (uint256)",
  "function previewWithdraw(address asset,uint256 maxAssetsToWithdraw) view returns (uint256 sharesToBurn,uint256 assetsWithdrawn)",
  "function swapExactIn(address assetIn,address assetOut,uint256 amountIn,uint256 minAmountOut,address receiver,uint256 referralCode) returns (uint256)",
  "function withdraw(address asset,address receiver,uint256 maxAssetsToWithdraw) returns (uint256)",
];
const sparkPsm3Interface = new ethers.Interface(sparkPsm3Abi);
const sparkSavingsRateApi =
  "https://info-sky.blockanalitica.com/api/v1/savings-rate/";
const sparkMarketFetchTimeoutMs = 15000;
const sparkSavingsRateTimeoutMs = 8000;
const sparkTokenMetaTimeoutMs = 8000;
const sparkSavingsRateCacheMs = 10 * 60 * 1000;
let sparkSavingsRateCache = { ts: 0, rates: null };
const sparkPsm3AddressM = {
  Arbitrum: "0x2B05F8e1cACC6974fD79A673a341Fe1f58d27266",
  Base: "0x1601843c5E9bC251A3272907010AFa41Fa18347E",
  Optimism: "0xe0F9978b907853F354d79188A3dEfbD41978af62",
};
const sparkKnownMarketM = {
  Ethereum: {
    sDAI: {
      address: "0x83F20F44975D03b1b09e64809B757c47f942BEeA",
      decimals: 18,
      name: "Savings Dai",
      type: "yield",
      underlyingCoin: "DAI",
      underlyingAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      underlyingDecimals: 18,
    },
    sUSDS: {
      address: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
      decimals: 18,
      name: "Savings USDS",
      type: "yield",
      underlyingCoin: "USDS",
      underlyingAddress: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
      underlyingDecimals: 18,
    },
    sUSDC: {
      address: "0xBc65ad17c5C0a2A4D159fa5a503f4992c7B545FE",
      decimals: 18,
      name: "Spark USDC Vault",
      type: "yield",
      underlyingCoin: "USDC",
      underlyingAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      underlyingDecimals: 6,
    },
    spUSDC: {
      address: "0x28B3a8fb53B741A8Fd78c0fb9A6B2393d896a43d",
      decimals: 6,
      name: "Spark Savings USDC",
      type: "yield",
      underlyingCoin: "USDC",
      underlyingAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      underlyingDecimals: 6,
    },
    spUSDT: {
      address: "0xe2e7a17dFf93280dec073C995595155283e3C372",
      decimals: 6,
      name: "Spark Savings USDT",
      type: "yield",
      underlyingCoin: "USDT",
      underlyingAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      underlyingDecimals: 6,
    },
    spETH: {
      address: "0xfE6eb3b609a7C8352A241f7F3A21CEA4e9209B8f",
      decimals: 18,
      name: "Spark Savings ETH",
      type: "yield",
      underlyingCoin: "WETH",
      underlyingAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      underlyingDecimals: 18,
    },
    spPYUSD: {
      address: "0x80128DbB9f07b93DDE62A6daeadb69ED14a7D354",
      decimals: 6,
      name: "Spark Savings PYUSD",
      type: "yield",
      underlyingCoin: "PYUSD",
      underlyingAddress: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
      underlyingDecimals: 6,
    },
  },
  Arbitrum: {
    sUSDS: {
      address: "0xdDb46999F8891663a8F2828d25298f70416d7610",
      decimals: 18,
      name: "Savings USDS",
      type: "yield",
      underlyingCoin: "USDS",
      underlyingAddress: "0x6491c05A82219b8D1479057361ff1654749b876b",
      underlyingDecimals: 18,
      supportsVaultActions: false,
      underlyingPerReceipt: 1,
      receiptPerUnderlying: 1,
      psm3Assets: ["USDS", "USDC"],
    },
    sUSDC: {
      address: "0x940098b108fB7D0a7E374f6eDED7760787464609",
      decimals: 18,
      name: "Spark USDC Vault",
      type: "yield",
      underlyingCoin: "USDC",
      underlyingAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      underlyingDecimals: 6,
    },
  },
  Avalanche: {
    spUSDC: {
      address: "0x28B3a8fb53B741A8Fd78c0fb9A6B2393d896a43d",
      decimals: 6,
      name: "Spark Savings USDC",
      type: "yield",
      underlyingCoin: "USDC",
      underlyingAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      underlyingDecimals: 6,
    },
  },
  Base: {
    sUSDS: {
      address: "0x5875eEE11Cf8398102FdAd704C9E96607675467a",
      decimals: 18,
      name: "Savings USDS",
      type: "yield",
      underlyingCoin: "USDS",
      underlyingAddress: "0x820C137fa70C8691f0e44Dc420a5e53c168921Dc",
      underlyingDecimals: 18,
      supportsVaultActions: false,
      underlyingPerReceipt: 1,
      receiptPerUnderlying: 1,
      psm3Assets: ["USDS", "USDC"],
    },
    sUSDC: {
      address: "0x3128a0F7f0ea68E7B7c9B00AFa7E41045828e858",
      decimals: 18,
      name: "Spark USDC Vault",
      type: "yield",
      underlyingCoin: "USDC",
      underlyingAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      underlyingDecimals: 6,
    },
  },
  Optimism: {
    sUSDS: {
      address: "0xb5B2dc7fd34C249F4be7fB1fCea07950784229e0",
      decimals: 18,
      name: "Savings USDS",
      type: "yield",
      underlyingCoin: "USDS",
      underlyingAddress: "0x4F13a96EC5C4Cf34e442b46Bbd98a0791F20edC3",
      underlyingDecimals: 18,
      supportsVaultActions: false,
      underlyingPerReceipt: 1,
      receiptPerUnderlying: 1,
      psm3Assets: ["USDS", "USDC"],
    },
    sUSDC: {
      address: "0xCF9326e24EBfFBEF22ce1050007A43A3c0B6DB55",
      decimals: 18,
      name: "Spark USDC Vault",
      type: "yield",
      underlyingCoin: "USDC",
      underlyingAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      underlyingDecimals: 6,
    },
  },
};

function getUsableChainRpcs(chain = "") {
  const chainRpc = rpcs?.[chain];
  const list = Array.isArray(chainRpc)
    ? chainRpc
    : Array.isArray(chainRpc?.rpc)
      ? chainRpc.rpc
      : Array.isArray(chainRpc?.rpcs)
        ? chainRpc.rpcs
        : [chainRpc?.rpc ?? chainRpc?.rpcs ?? chainRpc];

  return list.filter(
    (rpc) =>
      rpc &&
      !String(rpc).includes("undefined") &&
      !String(rpc).includes("YOUR_KEY"),
  );
}

function getCoinByAddress(chain = "", address = "") {
  if (!ethers.isAddress(address)) return null;

  return (
    Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
      sameEvmAddress(coinE?.address, address),
    ) || null
  );
}

function getKnownSparkMarket(chain = "", { coin = "", address = "" } = {}) {
  const found = Object.entries(sparkKnownMarketM?.[chain] || {}).find(
    ([knownCoin, coinE]) =>
      (coin && knownCoin == coin) ||
      (address && sameEvmAddress(coinE?.address, address)),
  );

  return found ? { coin: found[0], ...found[1] } : null;
}

function getKnownSparkUnderlying(chain = "", market = {}) {
  if (!market) return null;

  const configured = coinM?.[chain]?.[market.underlyingCoin];
  const address = ethers.isAddress(market.underlyingAddress || "")
    ? ethers.getAddress(market.underlyingAddress)
    : ethers.isAddress(configured?.address || "")
      ? ethers.getAddress(configured.address)
      : "";
  if (!address) return null;

  return {
    coin: market.underlyingCoin || getCoinByAddress(chain, address)?.[0] || "",
    address,
    decimals: Number.isInteger(market.underlyingDecimals)
      ? market.underlyingDecimals
      : Number.isInteger(configured?.decimals)
        ? configured.decimals
        : null,
  };
}

async function getTokenMeta(
  provider,
  address = "",
  chain = "",
  timeoutMs = sparkTokenMetaTimeoutMs,
) {
  const localCoin = Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
    sameEvmAddress(coinE?.address, address),
  );
  if (localCoin) {
    const [symbol, coinE] = localCoin;

    return {
      address: ethers.getAddress(address),
      name: coinE.name || symbol,
      symbol,
      decimals: coinE.decimals ?? 18,
      fallback: false,
    };
  }

  const token = new ethers.Contract(address, erc20MetaAbi, provider);
  const [name, symbol, decimals] = await Promise.all([
    withTimeout(token.name(), timeoutMs, "token name timeout").catch(() => ""),
    withTimeout(
      token.symbol(),
      timeoutMs,
      "token symbol timeout",
    ).catch(() => ""),
    withTimeout(
      token.decimals(),
      timeoutMs,
      "token decimals timeout",
    ).catch(() => 18),
  ]);

  return {
    address: ethers.getAddress(address),
    name: String(name || "").trim(),
    symbol: cleanMarketSymbol(symbol, address),
    decimals: Number(decimals),
    fallback: !String(symbol || "").trim(),
  };
}

function isSparkSavingsCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE?.name || ""}`.toLowerCase();

  return (
    coinE?.type == "yield" &&
    ethers.isAddress(coinE?.address || "") &&
    (text.includes("spark") ||
      text.includes("savings") ||
      text.includes("susds") ||
      /^sp[A-Z]/.test(coin))
  );
}

function getSparkMarkets(chain = "") {
  const marketM = {};

  for (const [coin, coinE] of Object.entries(sparkKnownMarketM?.[chain] || {})) {
    if (isSparkSavingsCoin(coin, coinE)) marketM[coin] = { ...coinE };
  }
  for (const [coin, coinE] of Object.entries(coinM?.[chain] || {})) {
    if (isSparkSavingsCoin(coin, coinE)) {
      marketM[coin] = { ...(marketM[coin] || {}), ...coinE };
    }
  }

  return Object.entries(marketM);
}

function toSparkAprPercent(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate <= 1 ? rate * 100 : rate;
}

async function getSparkSavingsRates() {
  const now = Date.now();
  if (
    sparkSavingsRateCache.rates &&
    now - sparkSavingsRateCache.ts < sparkSavingsRateCacheMs
  ) {
    return sparkSavingsRateCache.rates;
  }

  const rates = await withTimeout(
    fetch(sparkSavingsRateApi, { next: { revalidate: 600 } }),
    sparkSavingsRateTimeoutMs,
    "Spark savings rate timeout",
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`Spark savings rate HTTP ${response.status}`);
      const json = await response.json();
      const rows = Array.isArray(json) ? json : [json];
      const latest =
        rows.find(
          (entry) =>
            entry?.ssr_rate != null || entry?.dsr_rate != null || entry?.rate != null,
        ) || {};

      return {
        ssr: toSparkAprPercent(latest.ssr_rate ?? latest.rate),
        dsr: toSparkAprPercent(latest.dsr_rate ?? latest.rate),
      };
    })
    .catch(() => ({ ssr: 0, dsr: 0 }));

  sparkSavingsRateCache = { ts: now, rates };
  return rates;
}

function getSparkMarketSupplyApr({
  lendCoin = "",
  underlyingCoin = "",
  knownMarket = {},
  rates = {},
} = {}) {
  if (knownMarket?.supplyApr) return Number(knownMarket.supplyApr) || 0;

  const lend = String(lendCoin || knownMarket?.coin || "").toUpperCase();
  const underlying = String(
    underlyingCoin || knownMarket?.underlyingCoin || "",
  ).toUpperCase();

  if (lend == "SDAI" || underlying == "DAI") return rates.dsr || 0;
  return rates.ssr || rates.dsr || 0;
}

function getSparkToken(chain = "", lendCoin = "") {
  return getEvmTokenAddress(chain, lendCoin, "Spark savings token");
}

async function getSparkExchangeRate({
  vault,
  underlyingDecimals = 18,
  receiptDecimals = 18,
} = {}) {
  const oneShare = ethers.parseUnits("1", receiptDecimals);
  const oneAsset = ethers.parseUnits("1", underlyingDecimals);
  const [assetsPerShareRaw, sharesPerAssetRaw] = await Promise.all([
    withTimeout(
      vault.convertToAssets(oneShare),
      sparkTokenMetaTimeoutMs,
      "Spark convertToAssets timeout",
    ).catch(() => 0n),
    withTimeout(
      vault.convertToShares(oneAsset),
      sparkTokenMetaTimeoutMs,
      "Spark convertToShares timeout",
    ).catch(() => 0n),
  ]);
  const underlyingPerReceipt = Number(
    ethers.formatUnits(BigInt(assetsPerShareRaw || 0), underlyingDecimals),
  );
  const receiptPerUnderlying = Number(
    ethers.formatUnits(BigInt(sharesPerAssetRaw || 0), receiptDecimals),
  );

  return {
    underlyingPerReceipt:
      Number.isFinite(underlyingPerReceipt) && underlyingPerReceipt > 0
        ? underlyingPerReceipt
        : receiptPerUnderlying
          ? 1 / receiptPerUnderlying
          : 0,
    receiptPerUnderlying:
      Number.isFinite(receiptPerUnderlying) && receiptPerUnderlying > 0
        ? receiptPerUnderlying
        : underlyingPerReceipt
          ? 1 / underlyingPerReceipt
          : 0,
  };
}

async function getSparkPsm3ExchangeRate({
  psm3,
  asset,
  underlyingDecimals = 18,
  receiptDecimals = 18,
} = {}) {
  const oneShare = ethers.parseUnits("1", receiptDecimals);
  const oneAsset = ethers.parseUnits("1", underlyingDecimals);
  const [assetsPerShareRaw, sharesPerAssetRaw] = await Promise.all([
    withTimeout(
      psm3.convertToAssets(asset, oneShare),
      sparkTokenMetaTimeoutMs,
      "Spark PSM3 convertToAssets timeout",
    ).catch(() => 0n),
    withTimeout(
      psm3.previewDeposit(asset, oneAsset),
      sparkTokenMetaTimeoutMs,
      "Spark PSM3 previewDeposit timeout",
    ).catch(() => 0n),
  ]);
  const underlyingPerReceipt = Number(
    ethers.formatUnits(BigInt(assetsPerShareRaw || 0), underlyingDecimals),
  );
  const receiptPerUnderlying = Number(
    ethers.formatUnits(BigInt(sharesPerAssetRaw || 0), receiptDecimals),
  );

  return {
    underlyingPerReceipt:
      Number.isFinite(underlyingPerReceipt) && underlyingPerReceipt > 0
        ? underlyingPerReceipt
        : receiptPerUnderlying
          ? 1 / receiptPerUnderlying
          : 0,
    receiptPerUnderlying:
      Number.isFinite(receiptPerUnderlying) && receiptPerUnderlying > 0
        ? receiptPerUnderlying
        : underlyingPerReceipt
          ? 1 / underlyingPerReceipt
          : 0,
  };
}

function getSparkPsm3SwapData({
  action = "lend",
  market,
  walletAddress = "",
  amountIn = 0n,
} = {}) {
  return sparkPsm3Interface.encodeFunctionData("swapExactIn", [
    action == "redeem" ? market.vaultAddress : market.underlying,
    action == "redeem" ? market.underlying : market.vaultAddress,
    amountIn,
    0,
    ethers.getAddress(walletAddress),
    0,
  ]);
}

async function getSafeErc20Balance({
  provider,
  tokenAddress = "",
  owner = "",
} = {}) {
  if (!ethers.isAddress(tokenAddress) || !ethers.isAddress(owner)) return 0n;

  try {
    const code = await provider.getCode(tokenAddress);
    if (!code || code == "0x") return 0n;

    return await new ethers.Contract(
      tokenAddress,
      erc20Abi,
      provider,
    ).balanceOf(owner);
  } catch {
    return 0n;
  }
}

function buildSparkKnownMarketEntry({
  chain = "",
  savedCoin = "",
  savedCoinE = {},
  assetCoin = "",
  assetAddress = "",
  assetDecimals,
  psm3Address = "",
  rates = {},
} = {}) {
  if (!ethers.isAddress(savedCoinE?.address || "")) return null;

  const lendAddress = ethers.getAddress(savedCoinE.address);
  const knownMarket = getKnownSparkMarket(chain, {
    coin: savedCoin,
    address: lendAddress,
  });
  const knownUnderlying = getKnownSparkUnderlying(chain, knownMarket);
  if (!knownMarket) return null;
  const underlyingAddress = ethers.isAddress(assetAddress || "")
    ? ethers.getAddress(assetAddress)
    : knownUnderlying?.address || "";
  if (!underlyingAddress) return null;

  const addedUnderlying = getCoinByAddress(chain, underlyingAddress);
  const addedLend = getCoinByAddress(chain, lendAddress);
  const underlyingCoin =
    assetCoin || addedUnderlying?.[0] || knownUnderlying?.coin || knownMarket.underlyingCoin;
  const lendCoin = addedLend?.[0] || savedCoin || knownMarket.coin;
  const underlyingE = addedUnderlying?.[1] || {};
  const lendE = addedLend?.[1] || savedCoinE || {};
  const underlyingDecimals = Number.isInteger(assetDecimals)
    ? assetDecimals
    : Number.isInteger(knownUnderlying?.decimals)
      ? knownUnderlying.decimals
    : Number.isInteger(underlyingE.decimals)
      ? underlyingE.decimals
      : knownMarket.underlyingDecimals ?? 18;
  const lendDecimals = Number.isInteger(savedCoinE.decimals)
    ? savedCoinE.decimals
    : Number.isInteger(knownMarket.decimals)
      ? knownMarket.decimals
      : Number.isInteger(lendE.decimals)
        ? lendE.decimals
        : 18;
  const supportsVaultActions = knownMarket.supportsVaultActions !== false;
  const isPsm3Market = !!psm3Address;

  return {
    value: `${underlyingCoin}:${lendCoin}:${lendAddress}`,
    chain,
    underlyingCoin,
    underlyingName: underlyingE.name || underlyingCoin,
    underlyingAddress,
    underlyingDecimals,
    lendCoin,
    lendName: savedCoinE.name || lendE.name || knownMarket.name || lendCoin,
    lendAddress,
    lendDecimals,
    underlyingPerReceipt: knownMarket.underlyingPerReceipt || 1,
    receiptPerUnderlying: knownMarket.receiptPerUnderlying || 1,
    actionMode: isPsm3Market ? "psm3Swap" : "vault",
    psm3Address,
    actionUnavailable: !isPsm3Market && !supportsVaultActions,
    actionUnavailableReason: !isPsm3Market && !supportsVaultActions
      ? `${lendCoin} on ${chain} does not expose Spark lend/redeem vault calls here`
      : "",
    addedUnderlying: !!addedUnderlying,
    addedLend: !!addedLend,
    supplyApr: getSparkMarketSupplyApr({
      lendCoin,
      underlyingCoin,
      knownMarket,
      rates,
    }),
    metaFallback: false,
  };
}

function buildSparkKnownMarketEntries(
  chain = "",
  savedCoin = "",
  savedCoinE = {},
  rates = {},
) {
  const knownMarket = getKnownSparkMarket(chain, {
    coin: savedCoin,
    address: savedCoinE?.address,
  });
  const psm3Address = sparkPsm3AddressM[chain] || "";
  const psm3Assets =
    Array.isArray(knownMarket?.psm3Assets) && knownMarket.psm3Assets.length
      ? knownMarket.psm3Assets
      : [];
  const assetCoins = psm3Address && psm3Assets.length
    ? [...new Set(psm3Assets)]
    : [];

  if (assetCoins.length) {
    return assetCoins
      .map((assetCoin) => {
        const configured = coinM?.[chain]?.[assetCoin] || {};
        const assetAddress =
          configured.address ||
          (assetCoin == knownMarket?.underlyingCoin
            ? knownMarket?.underlyingAddress
            : "");

        return buildSparkKnownMarketEntry({
          chain,
          savedCoin,
          savedCoinE,
          assetCoin,
          assetAddress,
          assetDecimals: configured.decimals ?? knownMarket?.underlyingDecimals,
          psm3Address,
          rates,
        });
      })
      .filter(Boolean);
  }

  return [
    buildSparkKnownMarketEntry({
      chain,
      savedCoin,
      savedCoinE,
      rates,
    }),
  ].filter(Boolean);
}

export async function getSparkAllMarkets({ chain = "" } = {}) {
  if (chain == "Solana") return { ok: true, chain, markets: [] };

  const savedMarkets = getSparkMarkets(chain);
  if (!savedMarkets.length) {
    return { ok: true, chain, markets: [] };
  }
  const savingsRates = await getSparkSavingsRates();
  const knownMarkets = savedMarkets
    .flatMap(([savedCoin, savedCoinE]) =>
      buildSparkKnownMarketEntries(chain, savedCoin, savedCoinE, savingsRates),
    )
    .filter(Boolean);
  const knownAddressM = new Set(
    knownMarkets.map((entry) => String(entry.lendAddress || "").toLowerCase()),
  );
  const rpcSavedMarkets = savedMarkets.filter(
    ([, savedCoinE]) =>
      !knownAddressM.has(String(savedCoinE?.address || "").toLowerCase()),
  );
  if (!rpcSavedMarkets.length) {
    return {
      ok: true,
      chain,
      markets: knownMarkets.sort((a, b) =>
        a.underlyingCoin.localeCompare(b.underlyingCoin),
      ),
    };
  }

  const rpcList = getUsableChainRpcs(chain);
  if (!rpcList.length) {
    return {
      ok: true,
      chain,
      markets: knownMarkets.sort((a, b) =>
        a.underlyingCoin.localeCompare(b.underlyingCoin),
      ),
    };
  }

  let bestResult = null;
  let lastError = null;

  async function fetchMarkets(rpc) {
    const provider = new ethers.JsonRpcProvider(rpc);

    try {
      const markets = (
        await mapWithConcurrency(
          rpcSavedMarkets,
          4,
          async ([savedCoin, savedCoinE]) => {
            try {
              const lendAddress = ethers.getAddress(savedCoinE.address);
              const knownMarket = getKnownSparkMarket(chain, {
                coin: savedCoin,
                address: lendAddress,
              });
              const knownUnderlying = getKnownSparkUnderlying(chain, knownMarket);
              const vault = new ethers.Contract(lendAddress, erc4626Abi, provider);
              const shouldReadAsset = knownMarket?.supportsVaultActions !== false;
              const actualUnderlyingAddress = shouldReadAsset
                ? await withTimeout(
                    vault.asset(),
                    sparkMarketFetchTimeoutMs,
                    `${chain} Spark asset timeout`,
                  ).catch(() => "")
                : "";
              const underlyingAddress = ethers.isAddress(actualUnderlyingAddress)
                ? ethers.getAddress(actualUnderlyingAddress)
                : knownUnderlying?.address || "";
              if (!ethers.isAddress(underlyingAddress)) return null;

              const [underlyingMeta, lendMeta] = await Promise.all([
                getTokenMeta(
                  provider,
                  underlyingAddress,
                  chain,
                  sparkTokenMetaTimeoutMs,
                ),
                getTokenMeta(provider, lendAddress, chain, sparkTokenMetaTimeoutMs),
              ]);
              const supportsVaultActions =
                shouldReadAsset && ethers.isAddress(actualUnderlyingAddress);
              const rates = supportsVaultActions
                ? await getSparkExchangeRate({
                    vault,
                    underlyingDecimals: underlyingMeta.decimals,
                    receiptDecimals: lendMeta.decimals,
                  })
                : {
                    underlyingPerReceipt: knownMarket?.underlyingPerReceipt || 1,
                    receiptPerUnderlying: knownMarket?.receiptPerUnderlying || 1,
                  };
              const addedUnderlying = getCoinByAddress(
                chain,
                underlyingMeta.address,
              );
              const addedLend = getCoinByAddress(chain, lendMeta.address);
              const metaFallback = !!underlyingMeta.fallback || !!lendMeta.fallback;

              return {
                value: `${underlyingMeta.symbol}:${savedCoin}:${lendMeta.address}`,
                chain,
                underlyingCoin: addedUnderlying?.[0] || underlyingMeta.symbol,
                underlyingName: underlyingMeta.name || underlyingMeta.symbol,
                underlyingAddress: underlyingMeta.address,
                underlyingDecimals: underlyingMeta.decimals,
                lendCoin: addedLend?.[0] || savedCoin || lendMeta.symbol,
                lendName: savedCoinE.name || lendMeta.name || lendMeta.symbol,
                lendAddress: lendMeta.address,
                lendDecimals: lendMeta.decimals,
                underlyingPerReceipt: rates.underlyingPerReceipt,
                receiptPerUnderlying: rates.receiptPerUnderlying,
                actionUnavailable: !supportsVaultActions,
                actionUnavailableReason: !supportsVaultActions
                  ? `${savedCoin} on ${chain} does not expose Spark lend/redeem vault calls here`
                  : "",
                addedUnderlying: !!addedUnderlying,
                addedLend: !!addedLend,
                supplyApr: getSparkMarketSupplyApr({
                  lendCoin: addedLend?.[0] || savedCoin || lendMeta.symbol,
                  underlyingCoin: addedUnderlying?.[0] || underlyingMeta.symbol,
                  knownMarket,
                  rates: savingsRates,
                }),
                metaFallback,
              };
            } catch {
              return null;
            }
          },
        )
      ).filter(Boolean);

      return {
        rpc,
        marketCount: rpcSavedMarkets.length,
        fallbackCount: markets.filter((entry) => entry.metaFallback).length,
        markets,
      };
    } finally {
      provider.destroy?.();
    }
  }

  for (const rpc of rpcList) {
    try {
      const result = await fetchMarkets(rpc);
      if (
        !bestResult ||
        result.markets.length > bestResult.markets.length ||
        (result.markets.length == bestResult.markets.length &&
          result.fallbackCount < bestResult.fallbackCount)
      ) {
        bestResult = result;
      }
      if (
        result.markets.length >= result.marketCount &&
        result.fallbackCount == 0
      ) {
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!bestResult) {
    return {
      ok: true,
      chain,
      markets: knownMarkets.sort((a, b) =>
        a.underlyingCoin.localeCompare(b.underlyingCoin),
      ),
    };
  }

  const marketM = {};
  for (const entry of [...knownMarkets, ...bestResult.markets]) {
    const key = String(entry.lendAddress || entry.value || "").toLowerCase();
    marketM[key] = entry;
  }

  return {
    ok: true,
    chain,
    rpc: bestResult.rpc,
    markets: Object.values(marketM).sort((a, b) =>
      a.underlyingCoin.localeCompare(b.underlyingCoin),
    ),
  };
}

export async function getSparkMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = 18,
} = {}) {
  if (chain == "Solana") throw new Error("Spark is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");
  if (!ethers.isAddress(underlyingAddress)) throw new Error("underlying address invalid");
  if (!ethers.isAddress(lendAddress)) throw new Error("Spark savings address invalid");

  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const owner = ethers.getAddress(walletAddress);
    const [underlyingRaw, lendRaw] = await Promise.all([
      getSafeErc20Balance({
        provider,
        tokenAddress: underlyingAddress,
        owner,
      }),
      getSafeErc20Balance({
        provider,
        tokenAddress: lendAddress,
        owner,
      }),
    ]);

    return {
      ok: true,
      chain,
      walletAddress: owner,
      underlying: {
        address: ethers.getAddress(underlyingAddress),
        raw: underlyingRaw.toString(),
        balance: ethers.formatUnits(underlyingRaw, underlyingDecimals),
        decimals: underlyingDecimals,
      },
      lend: {
        address: ethers.getAddress(lendAddress),
        raw: lendRaw.toString(),
        balance: ethers.formatUnits(lendRaw, lendDecimals),
        decimals: lendDecimals,
      },
    };
  } finally {
    provider.destroy?.();
  }
}

function getSparkAmount({
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  underlyingDecimals,
  lendDecimals,
} = {}) {
  const coin = action == "redeem" ? lendCoin : underlyingCoin;
  const decimals =
    action == "redeem"
      ? lendDecimals
      : underlyingDecimals;
  const configuredDecimals = coinM?.[chain]?.[coin]?.decimals;
  const resolvedDecimals = Number.isInteger(decimals)
    ? decimals
    : Number.isInteger(configuredDecimals)
      ? configuredDecimals
      : null;
  if (!Number.isInteger(resolvedDecimals)) {
    throw new Error(`coin decimals missing: ${chain} ${coin}`);
  }
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    resolvedDecimals,
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

async function assertSparkMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  psm3Address = "",
} = {}) {
  const vaultAddress = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress)
    : getSparkToken(chain, lendCoin);
  const knownMarket = getKnownSparkMarket(chain, {
    coin: lendCoin,
    address: vaultAddress,
  });
  const knownUnderlying = getKnownSparkUnderlying(chain, knownMarket);
  const vault = new ethers.Contract(vaultAddress, erc4626Abi, provider);
  const actualUnderlyingRaw = await withTimeout(
    vault.asset(),
    sparkTokenMetaTimeoutMs,
    `${chain} Spark asset timeout`,
  ).catch(() => "");
  const actualUnderlying = ethers.isAddress(actualUnderlyingRaw)
    ? ethers.getAddress(actualUnderlyingRaw)
    : "";
  const configuredUnderlying = coinM?.[chain]?.[underlyingCoin]?.address;
  const underlying = ethers.isAddress(underlyingAddress)
    ? ethers.getAddress(underlyingAddress)
    : ethers.isAddress(configuredUnderlying || "")
      ? getEvmTokenAddress(chain, underlyingCoin, "Spark underlying")
      : knownUnderlying?.address || actualUnderlying;

  if (!ethers.isAddress(underlying)) {
    throw new Error(`${lendCoin} underlying is not configured`);
  }
  if (actualUnderlying && actualUnderlying != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  const knownPsm3Address =
    sparkPsm3AddressM[chain] &&
    knownMarket?.psm3Assets?.includes?.(underlyingCoin)
      ? sparkPsm3AddressM[chain]
      : "";
  const resolvedPsm3Address = ethers.isAddress(psm3Address)
    ? ethers.getAddress(psm3Address)
    : ethers.isAddress(knownPsm3Address)
      ? ethers.getAddress(knownPsm3Address)
      : "";
  const configuredUnderlyingDecimals = coinM?.[chain]?.[underlyingCoin]?.decimals;
  const configuredLendDecimals = coinM?.[chain]?.[lendCoin]?.decimals;
  const resolvedUnderlyingDecimals = Number.isInteger(underlyingDecimals)
    ? underlyingDecimals
    : Number.isInteger(configuredUnderlyingDecimals)
      ? configuredUnderlyingDecimals
      : Number.isInteger(knownUnderlying?.decimals)
        ? knownUnderlying.decimals
        : await new ethers.Contract(underlying, erc20MetaAbi, provider).decimals();
  const resolvedLendDecimals = Number.isInteger(lendDecimals)
    ? lendDecimals
    : Number.isInteger(configuredLendDecimals)
      ? configuredLendDecimals
      : Number.isInteger(knownMarket?.decimals)
        ? knownMarket.decimals
        : await new ethers.Contract(vaultAddress, erc20MetaAbi, provider).decimals();
  const usesPsm3Swap = !!resolvedPsm3Address;
  const supportsVaultActions =
    usesPsm3Swap || (knownMarket?.supportsVaultActions !== false && !!actualUnderlying);
  const rates = usesPsm3Swap
    ? await getSparkPsm3ExchangeRate({
        psm3: new ethers.Contract(resolvedPsm3Address, sparkPsm3Abi, provider),
        asset: underlying,
        underlyingDecimals: Number(resolvedUnderlyingDecimals),
        receiptDecimals: Number(resolvedLendDecimals),
      })
    : supportsVaultActions
    ? await getSparkExchangeRate({
        vault,
        underlyingDecimals: Number(resolvedUnderlyingDecimals),
        receiptDecimals: Number(resolvedLendDecimals),
      })
    : {
        underlyingPerReceipt: knownMarket?.underlyingPerReceipt || 1,
        receiptPerUnderlying: knownMarket?.receiptPerUnderlying || 1,
      };

  return {
    underlying,
    vaultAddress,
    psm3Address: resolvedPsm3Address,
    actionMode: usesPsm3Swap ? "psm3Swap" : "vault",
    underlyingDecimals: Number(resolvedUnderlyingDecimals),
    lendDecimals: Number(resolvedLendDecimals),
    underlyingPerReceipt: rates.underlyingPerReceipt,
    receiptPerUnderlying: rates.receiptPerUnderlying,
    actionUnavailable: !supportsVaultActions,
    actionUnavailableReason: !supportsVaultActions
      ? `${lendCoin} on ${chain} does not expose Spark lend/redeem vault calls here`
      : "",
  };
}

export async function getSparkLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  psm3Address = "",
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Spark is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertSparkMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
      psm3Address,
    });
    const amountIn = getSparkAmount({
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amount,
      underlyingDecimals: market.underlyingDecimals,
      lendDecimals: market.lendDecimals,
    });
    if (market.actionUnavailable) {
      return {
        ok: true,
        defi: "Spark",
        chain,
        action,
        approvalNeeded: false,
        allowance: "0",
        amountIn: amountIn.toString(),
        market: market.vaultAddress,
        underlyingDecimals: market.underlyingDecimals,
        lendDecimals: market.lendDecimals,
        underlyingPerReceipt: market.underlyingPerReceipt,
        receiptPerUnderlying: market.receiptPerUnderlying,
        actionUnavailable: true,
        actionUnavailableReason: market.actionUnavailableReason,
      };
    }
    const needsAllowance = action != "redeem" || market.actionMode == "psm3Swap";
    const allowanceToken =
      action == "redeem" && market.actionMode == "psm3Swap"
        ? market.vaultAddress
        : market.underlying;
    const spender =
      market.actionMode == "psm3Swap"
        ? market.psm3Address
        : market.vaultAddress;
    const allowance = needsAllowance
      ? BigInt(
          await new ethers.Contract(
            allowanceToken,
            erc20Abi,
            provider,
          ).allowance(walletAddress, spender),
        )
      : amountIn;

    return {
      ok: true,
      defi: "Spark",
      chain,
      action,
      approvalNeeded: needsAllowance && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      market: market.vaultAddress,
      psm3Address: market.psm3Address,
      actionMode: market.actionMode,
      underlyingDecimals: market.underlyingDecimals,
      lendDecimals: market.lendDecimals,
      underlyingPerReceipt: market.underlyingPerReceipt,
      receiptPerUnderlying: market.receiptPerUnderlying,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildSparkLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  psm3Address = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Spark is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertSparkMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
      psm3Address,
    });
    const amountIn = getSparkAmount({
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amount,
      underlyingDecimals: market.underlyingDecimals,
      lendDecimals: market.lendDecimals,
    });
    if (market.actionUnavailable) {
      throw new Error(market.actionUnavailableReason);
    }
    const txs = [];
    const isPsm3Swap = market.actionMode == "psm3Swap";

    if (action == "redeem") {
      if (isPsm3Swap) {
        const allowance = BigInt(
          await new ethers.Contract(
            market.vaultAddress,
            erc20Abi,
            provider,
          ).allowance(walletAddress, market.psm3Address),
        );
        const approveAmount = getApprovalAmount({
          chain,
          fromCoin: lendCoin,
          approvalAmount,
          amountIn,
          defaultAmount: amountIn,
          decimals: market.lendDecimals,
        });

        if (allowance < amountIn && approveAmount != null) {
          if (allowance > 0n) {
            txs.push(
              getApproveTx({
                chain,
                chainId,
                token: market.vaultAddress,
                spender: market.psm3Address,
                amount: 0n,
              }),
            );
          }
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: market.vaultAddress,
              spender: market.psm3Address,
              amount: approveAmount,
            }),
          );
        }
        txs.push(
          getUnsignedTx({
            chain,
            chainId,
            type: "redeem",
            txData: {
              to: market.psm3Address,
              data: getSparkPsm3SwapData({
                action,
                market,
                walletAddress,
                amountIn,
              }),
              value: "0",
            },
          }),
        );

        return {
          ok: true,
          defi: "Spark",
          chain,
          action,
          underlyingCoin,
          lendCoin,
          amountIn: amountIn.toString(),
          market: market.psm3Address,
          txs,
        };
      }

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "redeem",
          txData: {
            to: market.vaultAddress,
            data: erc4626Interface.encodeFunctionData("redeem", [
              amountIn,
              ethers.getAddress(walletAddress),
              ethers.getAddress(walletAddress),
            ]),
            value: "0",
          },
        }),
      );
    } else {
      const spender =
        isPsm3Swap ? market.psm3Address : market.vaultAddress;
      const allowance = BigInt(
        await new ethers.Contract(
          market.underlying,
          erc20Abi,
          provider,
        ).allowance(walletAddress, spender),
      );
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        defaultAmount: amountIn,
        decimals: market.underlyingDecimals,
      });

      if (allowance < amountIn && approveAmount != null) {
        if (allowance > 0n) {
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: market.underlying,
              spender,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: market.underlying,
            spender,
            amount: approveAmount,
          }),
        );
      }

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "lend",
          txData:
            isPsm3Swap
              ? {
                  to: market.psm3Address,
                  data: getSparkPsm3SwapData({
                    action,
                    market,
                    walletAddress,
                    amountIn,
                  }),
                  value: "0",
                }
              : {
                  to: market.vaultAddress,
                  data: erc4626Interface.encodeFunctionData("deposit", [
                    amountIn,
                    ethers.getAddress(walletAddress),
                  ]),
                  value: "0",
                },
        }),
      );
    }

    return {
      ok: true,
      defi: "Spark",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vaultAddress,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeSparkLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  psm3Address = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Spark is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const market = await assertSparkMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
      psm3Address,
    });
    const amountIn = getSparkAmount({
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amount,
      underlyingDecimals: market.underlyingDecimals,
      lendDecimals: market.lendDecimals,
    });
    if (market.actionUnavailable) {
      throw new Error(market.actionUnavailableReason);
    }
    const vault = new ethers.Contract(market.vaultAddress, erc4626Abi, wallet);
    const psm3 = market.actionMode == "psm3Swap"
      ? new ethers.Contract(market.psm3Address, sparkPsm3Abi, wallet)
      : null;
    const txs = [];

    if (action == "redeem") {
      if (psm3) {
        const token = new ethers.Contract(market.vaultAddress, erc20Abi, wallet);
        const approveAmount = getApprovalAmount({
          chain,
          fromCoin: lendCoin,
          approvalAmount,
          amountIn,
          decimals: market.lendDecimals,
        });
        txs.push(
          ...(await approveExactIfNeeded({
            chain,
            token,
            owner: wallet.address,
            spender: market.psm3Address,
            amount: amountIn,
            approvalAmount: approveAmount,
          })),
        );
      }
      const redeemTx = psm3
        ? await psm3.swapExactIn(
            market.vaultAddress,
            market.underlying,
            amountIn,
            0,
            wallet.address,
            0,
          )
        : await vault.redeem(
            amountIn,
            wallet.address,
            wallet.address,
          );
      const receipt = await redeemTx.wait();
      txs.push({
        chain,
        type: "redeem",
        hash: redeemTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else {
      const token = new ethers.Contract(market.underlying, erc20Abi, wallet);
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        decimals: market.underlyingDecimals,
      });
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: psm3 ? market.psm3Address : market.vaultAddress,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );

      const lendTx = psm3
        ? await psm3.swapExactIn(
            market.underlying,
            market.vaultAddress,
            amountIn,
            0,
            wallet.address,
            0,
          )
        : await vault.deposit(amountIn, wallet.address);
      const receipt = await lendTx.wait();
      txs.push({
        chain,
        type: "lend",
        hash: lendTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    }

    return {
      ok: true,
      defi: "Spark",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vaultAddress,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}
