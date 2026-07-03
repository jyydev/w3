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

// exports.offChains = ["Fantom", "XLayer", "Soneium", "Metis", "Mantle"];

exports.alchemyNetworks = {
  Ethereum: "eth-mainnet",
  BSC: "bnb-mainnet",
  Polygon: "polygon-mainnet",
  Gnosis: "gnosis-mainnet",
  // Fantom: "fantom-mainnet",
  Sonic: "sonic-mainnet",
  // XLayer: "xlayer-mainnet",
  // Metis: "metis-mainnet",
  // Soneium: "soneium-mainnet",
  Mantle: "mantle-mainnet",
  Celo: "celo-mainnet",
  Arbitrum: "arb-mainnet",
  Optimism: "opt-mainnet",
  Base: "base-mainnet",
  // Linea: "linea-mainnet",
  // Scroll: "scroll-mainnet",
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
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-rpc.publicnode.com",
    "https://bsc-mainnet.public.blastapi.io",
    "https://bsc.meowrpc.com",
    "https://bsc-dataseed1.bnbchain.org",
    "https://bsc-dataseed2.bnbchain.org",
    "https://bsc-dataseed3.bnbchain.org",
    "https://bsc-dataseed4.bnbchain.org",
    "https://rpc.nodeflare.app/bnb/public",
    alchemyRpc("bnb-mainnet"),
  ],
  Arbitrum: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arbitrum-one.public.blastapi.io",
    alchemyRpc("arb-mainnet"),
  ],
  Ethereum: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth-mainnet.public.blastapi.io",
    "https://eth.llamarpc.com",
    alchemyRpc("eth-mainnet"),
  ],
  Optimism: [
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
    "https://optimism-mainnet.public.blastapi.io",
    alchemyRpc("opt-mainnet"),
  ],
  Base: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://base-mainnet.public.blastapi.io",
    alchemyRpc("base-mainnet"),
  ],
  Polygon: [
    "https://polygon.drpc.org",
    "https://polygon-bor-rpc.publicnode.com",
    // "https://polygon-rpc.com", //401 Unauthorized
    alchemyRpc("polygon-mainnet"),
  ],
  Gnosis: [
    "https://rpc.gnosischain.com",
    "https://gnosis-rpc.publicnode.com",
    alchemyRpc("gnosis-mainnet"),
  ],
  // Fantom: [
  //   "https://rpc.ftm.tools",
  //   "https://fantom-rpc.publicnode.com",
  //   // alchemyRpc("fantom-mainnet"),
  // ],
  Sonic: [
    "https://rpc.soniclabs.com",
    "https://sonic-rpc.publicnode.com",
    alchemyRpc("sonic-mainnet"),
  ],
  XLayer: [
    "https://xlayer.drpc.org",
    "https://rpc.xlayer.tech",
    alchemyRpc("xlayer-mainnet"),
  ],
  Metis: [
    "https://andromeda.metis.io/?owner=1088",
    "https://metis-rpc.publicnode.com",
    alchemyRpc("metis-mainnet"),
  ],
  Soneium: [
    "https://rpc.soneium.org",
    "https://soneium.drpc.org",
    alchemyRpc("soneium-mainnet"),
  ],
  Mantle: [
    "https://rpc.mantle.xyz",
    "https://mantle-rpc.publicnode.com",
    alchemyRpc("mantle-mainnet"),
  ],
  Celo: [
    "https://forno.celo.org",
    "https://celo-rpc.publicnode.com",
    alchemyRpc("celo-mainnet"),
  ],
  Linea: [
    "https://rpc.linea.build",
    "https://linea-rpc.publicnode.com",
    alchemyRpc("linea-mainnet"),
  ],
  Scroll: [
    "https://rpc.scroll.io",
    "https://scroll-rpc.publicnode.com",
    alchemyRpc("scroll-mainnet"),
  ],
  zkSyncEra: [
    "https://mainnet.era.zksync.io",
    "https://zksync-era-rpc.publicnode.com",
    alchemyRpc("zksync-mainnet"),
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
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://api.avax.network/ext/bc/C/rpc",
    "https://ava-mainnet.public.blastapi.io/ext/bc/C/rpc",
    alchemyRpc("avax-mainnet"),
  ],
  Solana: [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://api.mainnet.solana.com",
    // "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
    // "https://rpc.ankr.com/solana", // neeed key
    alchemyRpc("solana-mainnet"),
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
