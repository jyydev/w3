const ethereum = {
  ETH: { native: true, decimals: 18, name: "Ethereum", type: "native" },
  USDT: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    name: "Tether USD",
    type: "stablecoin",
  },
  USDC: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    name: "USD Coin",
    type: "stablecoin",
  },
  USDe: {
    address: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3",
    decimals: 18,
    name: "USDe",
    type: "stablecoin",
  },
  sUSDe: {
    address: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
    decimals: 18,
    name: "Staked USDe",
    type: "yield",
  },
  spUSDT: {
    address: "0xe2e7a17dFf93280dec073C995595155283e3C372",
    decimals: 6,
    name: "Spark Savings USDT",
    type: "yield",
  },
  aEthUSDT: {
    address: "0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a",
    decimals: 6,
    name: "Aave Ethereum USDT",
    type: "lending",
  },
  DAI: {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    decimals: 18,
    name: "Dai Stablecoin",
    type: "stablecoin",
  },
  WBTC: {
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    decimals: 8,
    name: "Wrapped BTC",
    type: "wrapped",
  },
  WETH: {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    decimals: 18,
    name: "Wrapped Ether",
    type: "wrapped",
  },
  "stkwaEthUSDC.v1": {
    address: "0x6bf183243FdD1e306ad2C4450BC7dcf6f0bf8Aa6",
    decimals: 6,
    name: "Umbrella Stake Wrapped Aave Ethereum USDC v1",
    type: "yield",
  },
  "stkwaEthUSDT.v1": {
    address: "0xA484Ab92fe32B143AEE7019fC1502b1dAA522D31",
    decimals: 6,
    name: "Umbrella Stake Wrapped Aave Ethereum USDT v1",
    type: "yield",
  },
  skyMoneyUsdsRiskCapital: {
    address: "0xf42bca228D9bd3e2F8EE65Fec3d21De1063882d4",
    decimals: 18,
    name: "sky.money USDS Risk Capital",
    type: "yield",
  },
  spUSDC: {
    address: "0x28B3a8fb53B741A8Fd78c0fb9A6B2393d896a43d",
    decimals: 6,
    name: "Spark Savings USDC",
    type: "yield"
  },

};

export default ethereum;
