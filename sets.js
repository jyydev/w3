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
  { value: "aaveStaking", label: "Aave Staking" },
  { value: "venusFlux", label: "Venus Flux" },
  { value: "hyperliquid", label: "Hyperliquid" },
];

exports.walletChainFilterPriority = ["Hyperliquid", "Claim"];

exports.sets = {
  useAlchemy: 1,
  alchemyMinUsd: 0.01,
};

// exports.offChains = ["Fantom", "XLayer", "Soneium", "Metis", "Mantle"];

exports.alchemyNetworks = {
  Ethereum: "eth-mainnet",
  BSC: "bnb-mainnet",
  Arbitrum: "arb-mainnet",
  Optimism: "opt-mainnet",
  Base: "base-mainnet",
  Avalanche: "avax-mainnet",
  Polygon: "polygon-mainnet",
  Gnosis: "gnosis-mainnet",
  Soneium: "soneium-mainnet",
  Celo: "celo-mainnet",
  Linea: "linea-mainnet",
  Scroll: "scroll-mainnet",
  zkSyncEra: "zksync-mainnet",
  Solana: "solana-mainnet",
  // Fantom: "fantom-mainnet", ////Unsupported network
  // Sonic: "sonic-mainnet", //Unsupported network
  // Metis: "metis-mainnet", //Unsupported network
  // Mantle: "mantle-mainnet", //Unsupported network
  // XLayer: "xlayer-mainnet", ////Unsupported network
}; //chk unsupported network log: https://dashboard.alchemy.com/logs/requests

const alchemyKey = process.env.rpc_key_alchemy;

function alchemyRpc(network) {
  return alchemyKey ? `https://${network}.g.alchemy.com/v2/${alchemyKey}` : "";
}

exports.rpcs = {
  Ethereum: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth-mainnet.public.blastapi.io",
    "https://eth.llamarpc.com",
    alchemyRpc("eth-mainnet"),
    "https://eth.api.pocket.network",
  ],
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
    "https://1rpc.io/arb",
    "https://arbitrum.drpc.org",
    "https://arbitrum-one.public.blastapi.io",
    alchemyRpc("arb-mainnet"),
  ],
  Optimism: [
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
    "https://1rpc.io/op",
    "https://optimism.drpc.org",
    "https://optimism-mainnet.public.blastapi.io",
    alchemyRpc("opt-mainnet"),
  ],
  Base: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://1rpc.io/base",
    "https://base.drpc.org",
    "https://base-mainnet.public.blastapi.io",
    alchemyRpc("base-mainnet"),
  ],
  Polygon: [
    "https://polygon.drpc.org",
    "https://polygon-bor-rpc.publicnode.com",
    "https://1rpc.io/matic",
    "https://polygon.meowrpc.com",
    // "https://polygon-rpc.com", //401 Unauthorized
    alchemyRpc("polygon-mainnet"),
  ],
  Gnosis: [
    "https://rpc.gnosischain.com",
    "https://gnosis-rpc.publicnode.com",
    "https://gnosis.drpc.org",
    "https://1rpc.io/gnosis",
    alchemyRpc("gnosis-mainnet"),
  ],
  Fantom: [
    "https://fantom.drpc.org",
    "https://fantom-json-rpc.stakely.io",
    // "https://1rpc.io/ftm", //block timeout
    // "https://fantom-rpc.publicnode.com", //403 Forbidden
  ],
  Sonic: [
    "https://rpc.soniclabs.com",
    "https://sonic-rpc.publicnode.com",
    "https://sonic.drpc.org",
    "https://sonic-json-rpc.stakely.io",
  ],
  XLayer: [
    "https://xlayer.drpc.org",
    "https://rpc.xlayer.tech",
    "https://endpoints.omniatech.io/v1/xlayer/mainnet/public",
  ],
  Metis: [
    "https://andromeda.metis.io/?owner=1088",
    "https://metis-rpc.publicnode.com",
    "https://metis.drpc.org",
  ],
  Soneium: [
    "https://rpc.soneium.org",
    "https://soneium.drpc.org",
    alchemyRpc("soneium-mainnet"),
  ],
  Mantle: [
    "https://rpc.mantle.xyz",
    "https://mantle-rpc.publicnode.com",
    "https://mantle.drpc.org",
    "https://1rpc.io/mantle",
  ],
  Celo: [
    "https://forno.celo.org",
    "https://celo-rpc.publicnode.com",
    "https://celo.drpc.org",
    "https://celo-json-rpc.stakely.io",
    alchemyRpc("celo-mainnet"),
  ],
  Linea: [
    "https://rpc.linea.build",
    "https://linea-rpc.publicnode.com",
    "https://1rpc.io/linea",
    "https://linea.drpc.org",
    alchemyRpc("linea-mainnet"),
  ],
  Scroll: [
    "https://rpc.scroll.io",
    "https://scroll-rpc.publicnode.com",
    "https://1rpc.io/scroll",
    "https://scroll.drpc.org",
    alchemyRpc("scroll-mainnet"),
  ],
  zkSyncEra: [
    "https://mainnet.era.zksync.io",
    "https://zksync-era-rpc.publicnode.com",
    "https://zksync.drpc.org",
    "https://1rpc.io/zksync2-era",
    alchemyRpc("zksync-mainnet"),
  ],
  Kaia: [
    "https://public-en.node.kaia.io",
    "https://kaia.blockpi.network/v1/rpc/public",
    "https://klaytn.api.onfinality.io/public",
    "https://klaytn.drpc.org",
    "https://1rpc.io/klay",
  ],
  WEMIX: [
    "https://wemix.drpc.org",
    "https://api.wemix.com", //403 forbidden
  ],
  Avalanche: [
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://api.avax.network/ext/bc/C/rpc",
    "https://1rpc.io/avax/c",
    "https://avalanche.drpc.org",
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
  Ethereum: "https://etherscan.io",
  BSC: "https://bscscan.com",
  Arbitrum: "https://arbiscan.io",
  Base: "https://basescan.org",
  Optimism: "https://optimistic.etherscan.io",
  Avalanche: "https://snowscan.xyz",
  Polygon: "https://polygonscan.com",
  Gnosis: "https://gnosisscan.io",
  Fantom: "https://ftmscan.com",
  Sonic: "https://explorer.soniclabs.com",
  XLayer: "https://www.oklink.com/xlayer",
  Metis: "https://explorer.metis.io",
  Soneium: "https://soneium.blockscout.com",
  Mantle: "https://explorer.mantle.xyz",
  Celo: "https://celoscan.io",
  Linea: "https://lineascan.build",
  Scroll: "https://scrollscan.com",
  Kaia: "https://kaiascan.io",
  WEMIX: "https://explorer.wemix.com",
  zkSyncEra: "https://explorer.zksync.io",
  Solana: "https://solscan.io",
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
