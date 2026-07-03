/***** copy this into set.js to overwite default value here in sets.js */
exports.ckPrefix = "w3_";

// exports.walletNotes = { hpY11ht: "20/6/26:$4k" };

exports.dexs = [
  { value: "relay", label: "Relay.link", bridge: true },
  { value: "jumper", label: "Jumper", bridge: true },
  { value: "jupiter", label: "Jupiter", bridge: false },
  { value: "across", label: "Across.to", bridge: true },
  { value: "uniswap", label: "Uniswap", bridge: false },
  // { value: "pancake", label: "PancakeSwap", bridge: false },
];

exports.lendings = [
  { value: "aave", label: "Aave" },
  { value: "venus", label: "Venus" },
  { value: "morpho", label: "Morpho" },
  { value: "jupiter", label: "Jupiter" },
];

exports.yields = [
  { value: "spark", label: "Spark" },
  { value: "venusFlux", label: "Venus Flux" },
  { value: "hyperliquid", label: "Hyperliquid" },
];

exports.sets = {
  useAlchemy: 1,
  alchemyMinUsd: 0.01,
};

exports.alchemyNetworks = {
  Ethereum: "eth-mainnet",
  BSC: "bnb-mainnet",
  Polygon: "polygon-mainnet",
  Gnosis: "gnosis-mainnet",
  Fantom: "fantom-mainnet",
  Sonic: "sonic-mainnet",
  XLayer: "xlayer-mainnet",
  Metis: "metis-mainnet",
  Soneium: "soneium-mainnet",
  Mantle: "mantle-mainnet",
  Celo: "celo-mainnet",
  Arbitrum: "arb-mainnet",
  Optimism: "opt-mainnet",
  Base: "base-mainnet",
  Linea: "linea-mainnet",
  Scroll: "scroll-mainnet",
  Avalanche: "avax-mainnet",
  zkSyncEra: "zksync-mainnet",
  Solana: "solana-mainnet",
};

const alchemyKey = process.env.rpc_key_alchemy;

function alchemyRpc(network) {
  return alchemyKey ? `https://${network}.g.alchemy.com/v2/${alchemyKey}` : "";
}

exports.rpcs = {
  BSC: [
    alchemyRpc("bnb-mainnet"),
    "https://bsc-rpc.publicnode.com",
    "https://bsc-mainnet.public.blastapi.io",
    "https://bsc.meowrpc.com",
    "https://bsc-dataseed.bnbchain.org",
    // "https://bsc-dataseed1.bnbchain.org",
    // "https://bsc-dataseed2.bnbchain.org",
    // "https://bsc-dataseed3.bnbchain.org",
    // "https://bsc-dataseed4.bnbchain.org",
    "https://rpc.nodeflare.app/bnb/public",
  ],
  Arbitrum: [
    alchemyRpc("arb-mainnet"),
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arbitrum-one.public.blastapi.io",
  ],
  Ethereum: [
    alchemyRpc("eth-mainnet"),
    "https://ethereum-rpc.publicnode.com",
    "https://eth-mainnet.public.blastapi.io",
    "https://eth.llamarpc.com",
  ],
  Optimism: [
    alchemyRpc("opt-mainnet"),
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
    "https://optimism-mainnet.public.blastapi.io",
  ],
  Base: [
    alchemyRpc("base-mainnet"),
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://base-mainnet.public.blastapi.io",
  ],
  Polygon: [
    alchemyRpc("polygon-mainnet"),
    "https://polygon-rpc.com",
    "https://polygon-bor-rpc.publicnode.com",
  ],
  Gnosis: [
    alchemyRpc("gnosis-mainnet"),
    "https://rpc.gnosischain.com",
    "https://gnosis-rpc.publicnode.com",
  ],
  Fantom: [
    alchemyRpc("fantom-mainnet"),
    "https://rpc.ftm.tools",
    "https://fantom-rpc.publicnode.com",
  ],
  Sonic: [
    alchemyRpc("sonic-mainnet"),
    "https://rpc.soniclabs.com",
    "https://sonic-rpc.publicnode.com",
  ],
  XLayer: [
    alchemyRpc("xlayer-mainnet"),
    "https://rpc.xlayer.tech",
  ],
  Metis: [
    alchemyRpc("metis-mainnet"),
    "https://andromeda.metis.io/?owner=1088",
    "https://metis-rpc.publicnode.com",
  ],
  Soneium: [
    alchemyRpc("soneium-mainnet"),
    "https://rpc.soneium.org",
    "https://soneium.drpc.org",
  ],
  Mantle: [
    alchemyRpc("mantle-mainnet"),
    "https://rpc.mantle.xyz",
    "https://mantle-rpc.publicnode.com",
  ],
  Celo: [
    alchemyRpc("celo-mainnet"),
    "https://forno.celo.org",
    "https://celo-rpc.publicnode.com",
  ],
  Linea: [
    alchemyRpc("linea-mainnet"),
    "https://rpc.linea.build",
    "https://linea-rpc.publicnode.com",
  ],
  Scroll: [
    alchemyRpc("scroll-mainnet"),
    "https://rpc.scroll.io",
    "https://scroll-rpc.publicnode.com",
  ],
  zkSyncEra: [
    alchemyRpc("zksync-mainnet"),
    "https://mainnet.era.zksync.io",
    "https://zksync-era-rpc.publicnode.com",
  ],
  Kaia: [
    "https://public-en.node.kaia.io",
    "https://kaia.blockpi.network/v1/rpc/public",
    "https://klaytn.api.onfinality.io/public",
    "https://klaytn.drpc.org",
  ],
  WEMIX: [
    "https://wemix.drpc.org",
    "https://api.wemix.com", //403 forbidden
  ],
  Avalanche: [
    alchemyRpc("avax-mainnet"),
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://api.avax.network/ext/bc/C/rpc",
    "https://ava-mainnet.public.blastapi.io/ext/bc/C/rpc",
  ],
  Solana: [
    alchemyRpc("solana-mainnet"),
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://api.mainnet.solana.com",
    // "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
    // "https://rpc.ankr.com/solana", // neeed key
  ],
};
exports.scanners = {
  Solana: "https://solscan.io",
  Ethereum: "https://etherscan.io",
  BSC: "https://bscscan.com",
  Polygon: "https://polygonscan.com",
  Gnosis: "https://gnosisscan.io",
  Fantom: "https://ftmscan.com",
  Sonic: "https://explorer.soniclabs.com",
  XLayer: "https://www.oklink.com/xlayer",
  Metis: "https://explorer.metis.io",
  Soneium: "https://soneium.blockscout.com",
  Mantle: "https://explorer.mantle.xyz",
  Celo: "https://celoscan.io",
  Arbitrum: "https://arbiscan.io",
  Base: "https://basescan.org",
  Optimism: "https://optimistic.etherscan.io",
  Linea: "https://lineascan.build",
  Scroll: "https://scrollscan.com",
  Kaia: "https://kaiascan.io",
  WEMIX: "https://explorer.wemix.com",
  Avalanche: "https://snowscan.xyz",
  zkSyncEra: "https://explorer.zksync.io",
  Hyperliquid: "https://app.hyperliquid.xyz",
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
