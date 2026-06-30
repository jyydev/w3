const arbitrum = {
  ETH: { native: true, decimals: 18, name: "Ethereum", type: "native" },
  USDC: {
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    name: "USD Coin",
    type: "stable",
  },
  USDT: {
    address: "0xFd086bC7CD5C481DCC9C85ebe478A1C0b69FCbb9",
    decimals: 6,
    name: "Tether USD",
    type: "stable",
  },
  USDS: {
    address: "0x6491c05A82219b8D1479057361ff1654749b876b",
    decimals: 18,
    name: "USDS Stablecoin",
    type: "stable",
  },
  sUSDS: {
    address: "0xdDb46999F8891663a8F2828d25298f70416d7610",
    decimals: 18,
    name: "Savings USDS",
    type: "yield",
  },
  sUSDC: {
    address: "0x940098b108fB7D0a7E374f6eDED7760787464609",
    decimals: 18,
    name: "Spark USDC Vault",
    type: "yield",
  },
  aArbUSDCn: {
    address: "0x724dc807b04555b71ed48a6896b6F41593b8C637",
    decimals: 6,
    name: "Aave Arbitrum USDCn",
    type: "lend",
  },
  vUSDC_Core: {
    address: "0x7D8609f8da70fF9027E9bc5229Af4F6727662707",
    decimals: 8,
    name: "Venus USDC (Core)",
    type: "lend",
  },
  "USDC.E": {
    address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    decimals: 6,
    name: "Bridged USDC",
    type: "stable",
  },
  ARB: {
    address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
    decimals: 18,
    name: "Arbitrum",
    type: "governance",
  },
  WBTC: {
    address: "0x2f2a2543B76A4166549F7aaB2e75B0f6C1b0f",
    decimals: 8,
    name: "Wrapped BTC",
    type: "wrapped",
  },
  WETH: {
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    decimals: 18,
    name: "Wrapped Ether",
    type: "wrapped",
  },
  DAI: {
    address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    decimals: 18,
    name: "Dai Stablecoin",
    type: "stable",
  },
};

export default arbitrum;
