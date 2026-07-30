import { ethers } from "ethers";
import { chainIds } from "@/data/basic";

export const venusTokenAbi = [
  "function underlying() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function mint(uint256 mintAmount) returns (uint256)",
  "function redeem(uint256 redeemTokens) returns (uint256)",
];

export const venusComptrollerAbi = [
  "function getAllMarkets() view returns (address[])",
];

export const venusBlocksPerYearM = {
  Arbitrum: 126144000,
  Base: 15768000,
  BSC: 10512000,
  Ethereum: 2628000,
  zkSyncEra: 31536000,
};

export const venusComptrollerSeedsM = {
  Arbitrum: ["0x317c1a5739f39046e20b08ac9beea3f10fd43326"],
  Base: ["0x0C7973F9598AA62f9e03B94E92C967fD5437426C"],
  BSC: ["0xfd36e2c2a6789db23113685031d7f16329158384"],
  Ethereum: ["0x687a01ecF6d3907658f7A7c714749fAC32336D1B"],
  zkSyncEra: ["0xdde4d098d9995b659724ae6d5e3fb9681ac941b1"],
};

export const venusLendingChains = Object.keys(venusComptrollerSeedsM);
export const venusFluxChains = ["BSC"];

export const venusApiBase = "https://api.venus.io";
export const venusFluxApiBase = "https://api.fluid.instadapp.io";
export const venusFluxMarketFetchTimeoutMs = 12000;
export const venusFluxTokenMetaTimeoutMs = 8000;

export const venusErc4626Abi = [
  "function asset() view returns (address)",
  "function balanceOf(address account) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function deposit(uint256 assets,address receiver) returns (uint256)",
  "function redeem(uint256 shares,address receiver,address owner) returns (uint256)",
];

export function getVenusMarketUrl(chain = "") {
  const chainId = chainIds[chain];
  return chainId
    ? `https://venus.io/#/markets/any?chainId=${encodeURIComponent(chainId)}`
    : "https://venus.io/#/markets";
}

export function getVenusFluxUrl(chain = "") {
  const chainId = chainIds[chain];
  return chainId
    ? `https://flux.venus.io/lending/${encodeURIComponent(chainId)}`
    : "https://flux.venus.io/lending/56";
}

export function getVenusExchangeRate({
  rateRaw = 0n,
  underlyingDecimals = 18,
  receiptDecimals = 8,
} = {}) {
  const scaleDecimals = 18 + underlyingDecimals - receiptDecimals;
  if (scaleDecimals < 0) {
    return Number(rateRaw) * 10 ** Math.abs(scaleDecimals);
  }

  return Number(ethers.formatUnits(rateRaw, scaleDecimals));
}
