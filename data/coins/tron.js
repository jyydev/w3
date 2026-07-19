export const tronEnergyStakeCoin = "TRX-Energy";
export const tronEnergyStakeCoinE = {
  decimals: 6,
  name: "TRX Staked for Energy",
  type: "yield",
  synthetic: true,
  syntheticKind: "tronEnergyStakeV2",
  syntheticInfo:
    "Derived from the account's self-staked TRON Stake 2.0 Energy balance; delegated stake is excluded",
  ref: "TRON Stake 2.0: Energy",
};

const tron = [
  {
    coin: "TRX",
    native: true,
    decimals: 6,
    name: "TRON",
    type: "native",
  },
  {
    coin: "USDT",
    address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    decimals: 6,
    name: "Tether USD",
    type: "stable",
  },
  {
    coin: "WTRX",
    address: "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR",
    decimals: 6,
    name: "Wrapped TRON",
    type: "wrapped",
  },
  {
    coin: "USDD",
    address: "TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn",
    decimals: 18,
    name: "Decentralized USD",
    type: "stable",
  },
  {
    coin: tronEnergyStakeCoin,
    ...tronEnergyStakeCoinE,
  },
];

export default tron;
