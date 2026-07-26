export const sparkPsm3AddressM = {
  Arbitrum: "0x2B05F8e1cACC6974fD79A673a341Fe1f58d27266",
  Base: "0x1601843c5E9bC251A3272907010AFa41Fa18347E",
  Optimism: "0xe0F9978b907853F354d79188A3dEfbD41978af62",
};

export const sparkKnownMarketM = {
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

export const sparkSupportedChainNames = Object.keys(sparkKnownMarketM);
export const sparkSupportedChains = new Set(sparkSupportedChainNames);

export function getSparkMarketSupplyApr({
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

export function getSparkSavingsUrl() {
  return "https://app.spark.fi/savings/";
}
