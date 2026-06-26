const zkSyncEra = {
  ETH: { native: true, decimals: 18, name: "Ethereum", type: "native" },
  WETH: {
    address: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91",
    decimals: 18,
    name: "Wrapped Ether",
    type: "wrapped",
  },
  ZK: {
    address: "0x5a7d6b2f92c77fadd091b33a78f51703d7ec6a2e",
    decimals: 18,
    name: "ZKsync",
    type: "governance",
  },
  USDC: {
    address: "0x1d17cbcf0d6d143135ae902365d2e5e2a16538d4",
    decimals: 6,
    name: "USD Coin",
    type: "stablecoin",
  },
  "USDC.E": {
    address: "0x3355df6d4c9c3035724fd0e3914de96a5a83aaf4",
    decimals: 6,
    name: "Bridged USDC",
    type: "stablecoin",
  },
  USDT: {
    address: "0x493257fd37edb34451f62edf8d2a0c418852ba4c",
    decimals: 6,
    name: "Tether USD",
    type: "stablecoin",
  },
  DAI: {
    address: "0x4bef76b6b7f2823c6c1f4fcfeacd85c24548ad7e",
    decimals: 18,
    name: "Dai Stablecoin",
    type: "stablecoin",
  },
  WBTC: {
    address: "0xbbeb516fb02a01611cbbe0453fe3c580d7281011",
    decimals: 8,
    name: "Wrapped BTC",
    type: "wrapped",
  },
  aZksUSDC: {
    address: "0xE977F9B2a5ccf0457870a67231F23BE4DaecfbDb",
    decimals: 6,
    name: "Aave ZkSync USDC",
    type: "lending"
  },
  vUSDC_Core: {
    address: "0x84064c058F2EFea4AB648bB6Bd7e40f83fFDe39a",
    decimals: 8,
    name: "Venus USDC (Core)",
    type: "lending"
  },

};

export default zkSyncEra;
