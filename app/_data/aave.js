const sharedPool = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
const sharedPoolAddressesProvider =
  "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const sharedUiPoolDataProvider =
  "0xc851e6147dcE6A469CC33BE3121b6B2D4CaD2763";

export const aaveUmbrellaStakeDataProviderM = {
  Ethereum: "0x6321ba6b41fbddb6b678cd80db067f20a8770879",
};
export const aaveUmbrellaChains = Object.keys(
  aaveUmbrellaStakeDataProviderM,
);

const bnbConfig = {
  pool: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
  poolAddressesProvider: "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D",
  uiPoolDataProvider: "0x68100bD5345eA474D93577127C11F39FF8463e93",
};
const zkSyncConfig = {
  pool: "0x78e30497a3c7527d953c6B1E3541b021A98Ac43c",
  poolAddressesProvider: "0x2A3948BB219D6B2Fa83D64100006391a96bE6cb7",
  uiPoolDataProvider: "0x756Ff6722543F12d25396Ea646B0F2C96dA70c3e",
};

export const aaveV3ConfigM = {
  Ethereum: {
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    poolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
    uiPoolDataProvider: "0x2dAd8162A989cd99D673dE4425Bb2298Db1E1aA2",
    graphChainId: 1,
  },
  EthereumEtherFi: {
    pool: "0x0AA97c284e98396202b6A04024F5E2c65026F3c0",
    graphChainId: 1,
  },
  EthereumLido: {
    pool: "0x4e033931ad43597d96D6bcc25c280717730B58B1",
    graphChainId: 1,
  },
  EthereumHorizon: {
    pool: "0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8",
    graphChainId: 1,
  },
  BSC: bnbConfig,
  BNB: {
    ...bnbConfig,
    graphChainId: 56,
  },
  Arbitrum: {
    pool: sharedPool,
    poolAddressesProvider: sharedPoolAddressesProvider,
    uiPoolDataProvider: "0x91E04cf78e53aEBe609e8a7f2003e7EECD743F2B",
    graphChainId: 42161,
  },
  Avalanche: {
    pool: sharedPool,
    poolAddressesProvider: sharedPoolAddressesProvider,
    uiPoolDataProvider: "0xFBa4Df643205c5400BC3e05a1E67E0dFaEeeb41F",
    graphChainId: 43114,
  },
  Optimism: {
    pool: sharedPool,
    poolAddressesProvider: sharedPoolAddressesProvider,
    uiPoolDataProvider: "0x68100bD5345eA474D93577127C11F39FF8463e93",
    graphChainId: 10,
  },
  Base: {
    pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    poolAddressesProvider: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
    uiPoolDataProvider: "0x0C6BC4a12039788be08F87e87Cff87FEDbd1D386",
    graphChainId: 8453,
  },
  BaseSepolia: {
    pool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
    graphChainId: 84532,
    trade: false,
  },
  Polygon: {
    pool: sharedPool,
    poolAddressesProvider: sharedPoolAddressesProvider,
    uiPoolDataProvider: "0x66E1aBdb06e7363a618D65a910c540dfED23754f",
    graphChainId: 137,
  },
  Celo: {
    pool: "0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402",
    poolAddressesProvider: "0x9F7Cf9417D5251C59fE94fB9147feEe1aAd9Cea5",
    uiPoolDataProvider: sharedUiPoolDataProvider,
    graphChainId: 42220,
  },
  Fantom: {
    pool: sharedPool,
    poolAddressesProvider: sharedPoolAddressesProvider,
    uiPoolDataProvider: "0xddf65434502E459C22263BE2ed7cF0f1FaFD44c0",
  },
  Gnosis: {
    pool: "0xb50201558B00496A145fE76f7424749556E326D8",
    poolAddressesProvider: "0x36616cf17557639614c1cdDb356b1B83fc0B2132",
    uiPoolDataProvider: "0x0C6BC4a12039788be08F87e87Cff87FEDbd1D386",
    graphChainId: 100,
  },
  Harmony: {
    pool: sharedPool,
    poolAddressesProvider: sharedPoolAddressesProvider,
    uiPoolDataProvider: "0xeC6118C69af50660231108059ab98CD0cF9a6eA1",
  },
  Ink: {
    pool: "0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA",
    graphChainId: 57073,
  },
  Linea: {
    pool: "0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac",
    poolAddressesProvider: "0x89502c3731F69DDC95B65753708A07F8Cd0373F4",
    uiPoolDataProvider: sharedUiPoolDataProvider,
    graphChainId: 59144,
  },
  Mantle: {
    pool: "0x458F293454fE0d67EC0655f3672301301DD51422",
    poolAddressesProvider: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
    uiPoolDataProvider: sharedUiPoolDataProvider,
  },
  MegaEth: {
    pool: "0x7e324AbC5De01d112AfC03a584966ff199741C28",
  },
  Metis: {
    pool: "0x90df02551bB792286e8D4f13E0e357b4Bf1D6a57",
    poolAddressesProvider: "0xB9FABd7500B2C6781c35Dd48d54f81fc2299D7AF",
    uiPoolDataProvider: "0x5c5228aC8BC1528482514aF3e27E692495148717",
    graphChainId: 1088,
  },
  Monad: {
    pool: "0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef",
    poolAddressesProvider: "0x34793Fb9935F7bB5E5aE920fb963F39063E7A615",
    uiPoolDataProvider: "0xa7D38785be3422c25677A8aa4a44D3a0853A3a17",
  },
  Plasma: {
    pool: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
    graphChainId: 9745,
  },
  Scroll: {
    pool: "0x11fCfe756c05AD438e312a7fd934381537D3cFfe",
    poolAddressesProvider: "0x69850D0B276776781C063771b161bd8894BCdD04",
    uiPoolDataProvider: "0xE28E2c8d240dd5eBd0adcab86fbD79df7a052034",
    graphChainId: 534352,
  },
  Soneium: {
    pool: "0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B",
    poolAddressesProvider: "0x82405D1a189bd6cE4667809C35B37fBE136A4c5B",
    uiPoolDataProvider: sharedUiPoolDataProvider,
    graphChainId: 1868,
  },
  Sonic: {
    pool: "0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3",
    poolAddressesProvider: "0x5C2e738F6E27bCE0F7558051Bf90605dD6176900",
    uiPoolDataProvider: "0xE28E2c8d240dd5eBd0adcab86fbD79df7a052034",
    graphChainId: 146,
  },
  XLayer: {
    pool: "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116",
    poolAddressesProvider: "0xdFf435BCcf782f11187D3a4454d96702eD78e092",
    uiPoolDataProvider: sharedUiPoolDataProvider,
  },
  ZkSync: {
    ...zkSyncConfig,
    graphChainId: 324,
  },
  zkSyncEra: zkSyncConfig,
};

function getTradeConfigField(field) {
  return Object.fromEntries(
    Object.entries(aaveV3ConfigM)
      .filter(([, config]) => config.trade !== false && config[field])
      .map(([chain, config]) => [chain, config[field]]),
  );
}

export const aaveV3PoolM = getTradeConfigField("pool");
export const aaveV3PoolAddressesProviderM = getTradeConfigField(
  "poolAddressesProvider",
);
export const aaveV3UiPoolDataProviderM = getTradeConfigField(
  "uiPoolDataProvider",
);
export const aaveConfiguredChainSet = new Set(Object.keys(aaveV3PoolM));

const aaveGraphMarketNames = [
  "Ethereum",
  "EthereumEtherFi",
  "EthereumLido",
  "EthereumHorizon",
  "Arbitrum",
  "Avalanche",
  "Base",
  "BaseSepolia",
  "BNB",
  "Celo",
  "Gnosis",
  "Linea",
  "Metis",
  "Optimism",
  "Polygon",
  "Scroll",
  "Soneium",
  "Sonic",
  "ZkSync",
  "Plasma",
  "Ink",
];

export const aaveV3GraphMarketM = Object.fromEntries(
  aaveGraphMarketNames.map((chain) => {
    const config = aaveV3ConfigM[chain];
    return [
      chain,
      {
        id: config.graphChainId,
        address: config.pool,
      },
    ];
  }),
);
