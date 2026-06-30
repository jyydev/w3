const base = {
  ETH: { native: true, decimals: 18, name: "Ethereum", type: "native" },
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    name: "Wrapped Ether",
    type: "wrapped",
  },
  USDC: {
    address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    decimals: 6,
    name: "USD Coin",
    type: "stable",
  },
  USDbC: {
    address: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
    decimals: 6,
    name: "USD Base Coin",
    type: "stable",
  },
  USDT: {
    address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
    decimals: 6,
    name: "Bridged Tether USD",
    type: "stable",
  },
  DAI: {
    address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
    decimals: 18,
    name: "Dai Stablecoin",
    type: "stable",
  },
  EURC: {
    address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42",
    decimals: 6,
    name: "EURC",
    type: "stable",
  },
  cbBTC: {
    address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
    decimals: 8,
    name: "Coinbase Wrapped BTC",
    type: "wrapped",
  },
  WBTC: {
    address: "0x0555e30da8f98308edb960aa94c0db47230d2b9c",
    decimals: 8,
    name: "Wrapped BTC",
    type: "wrapped",
  },
  cbETH: {
    address: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
    decimals: 18,
    name: "Coinbase Wrapped Staked ETH",
    type: "yield",
  },
  AERO: {
    address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    decimals: 18,
    name: "Aerodrome",
    type: "token",
  },
  aBasUSDC: {
    address: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
    decimals: 6,
    name: "Aave Base USDC",
    type: "lend"
  },

};

export default base;
