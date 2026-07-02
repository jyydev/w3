"use client";

export const aaveConfiguredChainSet = new Set([
  "Ethereum",
  "EthereumEtherFi",
  "EthereumHorizon",
  "EthereumLido",
  "BSC",
  "BNB",
  "Arbitrum",
  "Avalanche",
  "Optimism",
  "Polygon",
  "Base",
  "Celo",
  "Fantom",
  "Gnosis",
  "Harmony",
  "Ink",
  "Linea",
  "Mantle",
  "MegaEth",
  "Metis",
  "Monad",
  "Plasma",
  "Scroll",
  "Soneium",
  "Sonic",
  "XLayer",
  "ZkSync",
  "zkSyncEra",
]);

export function isAaveCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toLowerCase();
  return coinE.type == "lend" && (text.includes("aave") || /^a[A-Z]/.test(coin));
}

export function getAaveUnderlyingCoin(lendCoin = "") {
  const coin = String(lendCoin || "");
  const chainPrefixes = [
    "Scroll",
    "Wemix",
    "Sonic",
    "Kaia",
    "Base",
    "Bnb",
    "Eth",
    "Arb",
    "Opt",
    "Bas",
    "Ava",
    "Pol",
    "Gno",
    "Lin",
    "Met",
    "Zk",
  ];

  for (const prefix of chainPrefixes) {
    if (coin.startsWith(`a${prefix}`) && coin.length > prefix.length + 1) {
      return coin.slice(prefix.length + 1);
    }
  }
  if (/^a[A-Z0-9.]{2,}$/.test(coin)) return coin.slice(1);

  return "";
}

export function isAaveChainAvailable(chain = "", chainMarkets = []) {
  return aaveConfiguredChainSet.has(chain) || !!chainMarkets.length;
}

export default function AaveClient({ children }) {
  return children;
}
