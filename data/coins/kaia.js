const kaia = {
  KAIA: { native: true, decimals: 18, name: "Kaia", type: "native" },
  WKAIA: {
    address: "0x19aac5f612f524b754ca7e7c41cbfa2e981a4432",
    decimals: 18,
    name: "Wrapped KAIA",
    type: "wrapped",
  },
  USDT: {
    address: "0xd077a400968890eacc75cdc901f0356c943e4fdb",
    decimals: 6,
    name: "Tether",
    type: "stablecoin",
  },
  "USDC.E": {
    address: "0xe2053bcf56d2030d2470fb454574237cf9ee3d4b",
    decimals: 6,
    name: "Stargate Bridged USDC",
    type: "stablecoin",
  },
  OUSDT: {
    address: "0xcee8faf64bb97a73bb51e115aa89c17ffa8dd167",
    decimals: 6,
    name: "Orbit Bridged USDT",
    type: "stablecoin",
  },
  OUSDC: {
    address: "0x754288077d0ff82af7a5317c7cb8c444d421d103",
    decimals: 6,
    name: "Orbit Bridged USD Coin",
    type: "stablecoin",
  },
  DAI: {
    address: "0x078db7827a5531359f6cb63f62cfa20183c4f10c",
    decimals: 18,
    name: "Bridged DAI",
    type: "stablecoin",
  },
  KDAI: {
    address: "0x5c74070fdea071359b86082bd9f9b3deaafbe32b",
    decimals: 18,
    name: "Klaytn Dai",
    type: "stablecoin",
  },
  WETH: {
    address: "0x09d428a066e77806f9de48fe3a57e837ccd0912f",
    decimals: 18,
    name: "Stargate Bridged WETH",
    type: "wrapped",
  },
  OETH: {
    address: "0x34d21b1e550d73cee41151c77f3c73359527a396",
    decimals: 18,
    name: "Orbit Bridge Klaytn Ethereum",
    type: "wrapped",
  },
  WBTC: {
    address: "0xdcbacf3f7a069922e677912998c8d57423c37dfa",
    decimals: 8,
    name: "Bridged WBTC",
    type: "wrapped",
  },
  OWBTC: {
    address: "0x16d0e1fbd024c600ca0380a4c5d57ee7a2ecbf9c",
    decimals: 8,
    name: "Orbit Bridge Klaytn Wrapped BTC",
    type: "wrapped",
  },
  LINK: {
    address: "0x7311ded199cc28d80e58e81e8589aa160199fcd2",
    decimals: 18,
    name: "Chainlink",
    type: "oracle",
  },
  stKAIA: {
    address: "0x42952b873ed6f7f0a7e4992e2a9818e3a9001995",
    decimals: 18,
    name: "Lair Staked KAIA",
    type: "yield",
  },
};

export default kaia;
