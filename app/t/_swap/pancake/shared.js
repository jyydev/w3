export const pancakeTokenListBase =
  "https://tokens.pancakeswap.finance";

export const pancakeTokenListFileM = {
  Ethereum: "pancakeswap-eth-default.json",
  BSC: "pancakeswap-default.json",
  Arbitrum: "pancakeswap-arbitrum-default.json",
  Base: "pancakeswap-base-default.json",
  zkSyncEra: "pancakeswap-zksync-default.json",
  Linea: "pancakeswap-linea-default.json",
};

export const pancakeTokenSearchListFileM = {
  ...pancakeTokenListFileM,
  BSC: "pancakeswap-extended.json",
};

export const pancakeSupportedChains = Object.keys(pancakeTokenListFileM);
