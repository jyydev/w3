/***** copy this into set.js to overwite default value here in sets.js */
exports.ckPrefix = "w3_";

// exports.walletNotes = { hpY11ht: "20/6/26:$4k" };

exports.dexs = [
  { value: "relay", label: "Relay.link", bridge: true },
  { value: "across", label: "Across.to", bridge: true },
  { value: "uniswap", label: "Uniswap", bridge: false },
  // { value: "pancake", label: "PancakeSwap", bridge: false },
];

exports.lendings = [
  { value: "aave", label: "Aave" },
  { value: "venus", label: "Venus" },
];

exports.sets = {
  useAlchemy: 1,
  alchemyMinUsd: 0.01,
};

exports.alchemyNetworks = {
  Ethereum: "eth-mainnet",
  BSC: "bnb-mainnet",
  Arbitrum: "arb-mainnet",
  Optimism: "opt-mainnet",
  Base: "base-mainnet",
  Avalanche: "avax-mainnet",
  zkSyncEra: "zksync-mainnet",
  Solana: "solana-mainnet",
};

exports.rpcs = {
  BSC: [
    "https://bsc-rpc.publicnode.com",
    "https://bsc-mainnet.public.blastapi.io",
    "https://bsc.meowrpc.com",
  ],
  Arbitrum: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arbitrum-one.public.blastapi.io",
  ],
  Ethereum: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth-mainnet.public.blastapi.io",
    "https://eth.llamarpc.com",
  ],
  Optimism: [
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
    "https://optimism-mainnet.public.blastapi.io",
  ],
  Base: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://base-mainnet.public.blastapi.io",
  ],
  zkSyncEra: [
    "https://mainnet.era.zksync.io",
    "https://zksync-era-rpc.publicnode.com",
  ],
  Kaia: [
    "https://public-en.node.kaia.io",
    "https://kaia.blockpi.network/v1/rpc/public",
    "https://klaytn.api.onfinality.io/public",
    "https://klaytn.drpc.org",
  ],
  WEMIX: ["https://api.wemix.com", "https://wemix.drpc.org"],
  Avalanche: [
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://api.avax.network/ext/bc/C/rpc",
    "https://ava-mainnet.public.blastapi.io/ext/bc/C/rpc",
  ],
  Solana: [
    `https://solana-mainnet.g.alchemy.com/v2/${process.env.rpc_solana_alchemy1}`,
    // "https://solana-rpc.publicnode.com",
    // "https://api.mainnet-beta.solana.com",
    // "https://api.mainnet.solana.com",
    // "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
    // "https://rpc.ankr.com/solana", // neeed key
  ],
};
exports.scanners = {
  Solana: "https://solscan.io",
  Ethereum: "https://etherscan.io",
  BSC: "https://bscscan.com",
  Arbitrum: "https://arbiscan.io",
  Base: "https://basescan.org",
  Optimism: "https://optimistic.etherscan.io",
  Kaia: "https://kaiascan.io",
  WEMIX: "https://explorer.wemix.com",
  Avalanche: "https://snowscan.xyz",
  zkSyncEra: "https://explorer.zksync.io",
};

exports.publicWallets = {
  // yb24: "0x21eb436144d38d07d8e0c41b706c02c65b771f45",
};

exports.walletNotes = {};

/***** DON'T copy this into set.js */
if (typeof window == "undefined") {
  try {
    const req = eval("require");
    Object.assign(exports, req(`${process.cwd()}/set.js`));
  } catch (e) {
    if (e.code != "MODULE_NOT_FOUND") throw e;
  }
}
