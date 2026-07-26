import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import {
  aaveUmbrellaStakeDataProviderM,
  aaveV3PoolM,
} from "@/app/_shared/aave/index";
import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";
import { createJsonRpcProvider, toCleanError } from "@/app/_fn/shared";

export const aaveStakingTokenMetaTimeoutMs = 8000;

const aaveStakingMarketCacheM = {};
const aaveUmbrellaStakeDataProviderAbi = [
  "function getStakeData() view returns ((address tokenAddress,string name,string symbol,uint256 price,uint256 totalAssets,uint256 targetLiquidity,address underlyingTokenAddress,string underlyingTokenName,string underlyingTokenSymbol,uint8 underlyingTokenDecimals,uint256 cooldownSeconds,uint256 unstakeWindowSeconds,bool underlyingIsStataToken,(address asset,string assetName,string assetSymbol,address aToken,string aTokenName,string aTokenSymbol) stataTokenData,(address rewardAddress,string rewardName,string rewardSymbol,uint256 price,uint8 decimals,uint256 index,uint256 maxEmissionPerSecond,uint256 distributionEnd,uint256 currentEmissionPerSecond,uint256 apy)[] rewards)[])",
];
const aavePoolReserveDataAbi = [
  "function getReserveData(address asset) view returns (tuple(uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))",
];
const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const erc4626ReadAbi = [
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
];

function withTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ])
    .catch((error) => {
      throw toCleanError(error, message);
    })
    .finally(() => clearTimeout(timer));
}

async function mapWithConcurrency(items = [], limit = 3, fn) {
  const results = [];

  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }

  return results;
}

function cleanMarketSymbol(symbol = "", address = "") {
  const cleanAddress = String(address || "").replace(/^0x/i, "");
  const clean = String(symbol || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");

  return clean || `TOKEN_${cleanAddress.slice(0, 6).toUpperCase()}`;
}

function sameEvmAddress(a = "", b = "") {
  return (
    ethers.isAddress(a) &&
    ethers.isAddress(b) &&
    ethers.getAddress(a) == ethers.getAddress(b)
  );
}

function getConfiguredChainRpcs(chain = "") {
  const chainRpc = rpcs?.[chain];
  const list = Array.isArray(chainRpc)
    ? chainRpc
    : Array.isArray(chainRpc?.rpc)
      ? chainRpc.rpc
      : Array.isArray(chainRpc?.rpcs)
        ? chainRpc.rpcs
        : [chainRpc?.rpc ?? chainRpc?.rpcs ?? chainRpc];

  return list.filter(
    (rpc) =>
      rpc &&
      !String(rpc).includes("undefined") &&
      !String(rpc).includes("YOUR_KEY") &&
      !String(rpc).match(/\/v2\/?$/),
  );
}

function getAaveChainRpc(chain = "") {
  return getConfiguredChainRpcs(chain)[0];
}

function getCoinByAddress(chain = "", address = "") {
  if (!ethers.isAddress(address)) return null;

  return (
    Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
      sameEvmAddress(coinE?.address, address),
    ) || null
  );
}

export async function getAaveStakingTokenMeta(
  provider,
  address = "",
  chain = "",
  fallbackCoin = "",
) {
  const localCoin = getCoinByAddress(chain, address);
  if (localCoin) {
    const [symbol, coinE] = localCoin;

    return {
      address: ethers.getAddress(address),
      name: coinE.name || symbol,
      symbol,
      decimals: coinE.decimals ?? 18,
      fallback: false,
    };
  }

  const token = new ethers.Contract(address, erc20MetaAbi, provider);
  const [name, symbol, decimals] = await Promise.all([
    withTimeout(
      token.name(),
      aaveStakingTokenMetaTimeoutMs,
      "token name timeout",
    ).catch(() => ""),
    withTimeout(
      token.symbol(),
      aaveStakingTokenMetaTimeoutMs,
      "token symbol timeout",
    ).catch(() => fallbackCoin),
    withTimeout(
      token.decimals(),
      aaveStakingTokenMetaTimeoutMs,
      "token decimals timeout",
    ).catch(() => 18),
  ]);

  return {
    address: ethers.getAddress(address),
    name: String(name || "").trim() || fallbackCoin,
    symbol: cleanMarketSymbol(symbol || fallbackCoin, address),
    decimals: Number(decimals),
    fallback: !String(symbol || "").trim(),
  };
}

function getProvidedTokenMeta({
  chain = "",
  address = "",
  name = "",
  symbol = "",
  decimals,
} = {}) {
  const normalizedAddress = ethers.getAddress(address);
  const localCoin = getCoinByAddress(chain, normalizedAddress);
  const providedSymbol =
    cleanMarketSymbol(symbol || "asset", normalizedAddress) || "asset";
  const providedDecimals = Number(decimals);

  return {
    address: normalizedAddress,
    name:
      localCoin?.[1]?.name ||
      String(name || "").trim() ||
      localCoin?.[0] ||
      providedSymbol,
    symbol: localCoin?.[0] || providedSymbol,
    decimals: Number.isInteger(localCoin?.[1]?.decimals)
      ? localCoin[1].decimals
      : Number.isInteger(providedDecimals)
        ? providedDecimals
        : undefined,
    fallback: false,
  };
}

async function getAaveUmbrellaStakeRows(provider, chain = "") {
  const dataProviderAddress = aaveUmbrellaStakeDataProviderM[chain];
  if (!ethers.isAddress(dataProviderAddress || "")) return [];

  const stakeDataProvider = new ethers.Contract(
    dataProviderAddress,
    aaveUmbrellaStakeDataProviderAbi,
    provider,
  );

  return Array.from(
    await withTimeout(
      stakeDataProvider.getStakeData(),
      aaveStakingTokenMetaTimeoutMs,
      `${chain} Aave Staking discovery timeout`,
    ),
  );
}

export async function getAaveStakingExchangeRate({
  stakingVault,
  wrapperVault,
  routeMode = "base",
  underlyingDecimals = 18,
  lendDecimals = 18,
} = {}) {
  const oneReceipt = ethers.parseUnits("1", lendDecimals);
  const oneUnderlying = ethers.parseUnits("1", underlyingDecimals);
  const [wrappedAssets, wrappedShares] = await Promise.all([
    withTimeout(
      stakingVault.convertToAssets(oneReceipt),
      aaveStakingTokenMetaTimeoutMs,
      "Aave Staking convertToAssets timeout",
    ).catch(() => 0n),
    withTimeout(
      routeMode == "wrapped"
        ? stakingVault.convertToShares(oneUnderlying)
        : wrapperVault.convertToShares(oneUnderlying).then((wrapped) =>
            stakingVault.convertToShares(wrapped),
          ),
      aaveStakingTokenMetaTimeoutMs,
      "Aave Staking convertToShares timeout",
    ).catch(() => 0n),
  ]);
  const underlyingAssets =
    routeMode == "wrapped"
      ? wrappedAssets
      : wrappedAssets
        ? await withTimeout(
            wrapperVault.convertToAssets(wrappedAssets),
            aaveStakingTokenMetaTimeoutMs,
            "Aave wrapper convertToAssets timeout",
          ).catch(() => 0n)
        : 0n;
  const underlyingPerReceipt = underlyingAssets
    ? Number(ethers.formatUnits(underlyingAssets, underlyingDecimals))
    : 1;
  const receiptPerUnderlying = wrappedShares
    ? Number(ethers.formatUnits(wrappedShares, lendDecimals))
    : underlyingPerReceipt
      ? 1 / underlyingPerReceipt
      : 1;

  return {
    underlyingPerReceipt,
    receiptPerUnderlying,
  };
}

function getAaveRateApr(rate = 0n) {
  try {
    const apr = Number(ethers.formatUnits(BigInt(rate || 0), 25));
    return Number.isFinite(apr) ? apr : 0;
  } catch {
    return 0;
  }
}

function getAaveUmbrellaRewardApr(rewards = []) {
  return rewards.reduce((sum, reward) => {
    const rawApy = Number(reward.apy ?? reward[9] ?? 0);
    return sum + (Number.isFinite(rawApy) ? rawApy / 100 : 0);
  }, 0);
}

function getAaveStakingRawValue(value = 0n) {
  try {
    return BigInt(value || 0).toString();
  } catch {
    return "0";
  }
}

function getAaveStakingPoolData(stakeData = {}) {
  return {
    stakePriceRaw: getAaveStakingRawValue(stakeData.price),
    totalAssetsRaw: getAaveStakingRawValue(stakeData.totalAssets),
    targetLiquidityRaw: getAaveStakingRawValue(stakeData.targetLiquidity),
    cooldownSeconds: Number(stakeData.cooldownSeconds || 0),
    unstakeWindowSeconds: Number(stakeData.unstakeWindowSeconds || 0),
    stakingRewards: Array.from(stakeData.rewards || []).map((reward) => ({
      rewardAddress: ethers.isAddress(reward.rewardAddress || "")
        ? ethers.getAddress(reward.rewardAddress)
        : String(reward.rewardAddress || ""),
      rewardName: String(reward.rewardName || ""),
      rewardSymbol: String(reward.rewardSymbol || ""),
      priceRaw: getAaveStakingRawValue(reward.price),
      decimals: Number(reward.decimals || 0),
      indexRaw: getAaveStakingRawValue(reward.index),
      maxEmissionPerSecondRaw: getAaveStakingRawValue(
        reward.maxEmissionPerSecond,
      ),
      distributionEnd: Number(reward.distributionEnd || 0),
      currentEmissionPerSecondRaw: getAaveStakingRawValue(
        reward.currentEmissionPerSecond,
      ),
      apy: Number(reward.apy || 0) / 100,
    })),
  };
}

async function getAaveStakingAprM(provider, chain = "", stakeRows = []) {
  const poolAddress = aaveV3PoolM[chain];
  const pool = ethers.isAddress(poolAddress || "")
    ? new ethers.Contract(poolAddress, aavePoolReserveDataAbi, provider)
    : null;
  const assetAddresses = [
    ...new Set(
      stakeRows
        .filter((entry) => entry.underlyingIsStataToken)
        .map((entry) => entry.stataTokenData?.asset)
        .filter((address) => ethers.isAddress(address || ""))
        .map((address) => ethers.getAddress(address)),
    ),
  ];
  const reserveAprM = new Map(
    await mapWithConcurrency(assetAddresses, 4, async (address) => {
      if (!pool) return [address.toLowerCase(), 0];
      const reserve = await withTimeout(
        pool.getReserveData(address),
        aaveStakingTokenMetaTimeoutMs,
        `${chain} Aave reserve APR timeout`,
      ).catch(() => null);

      return [
        address.toLowerCase(),
        getAaveRateApr(reserve?.currentLiquidityRate ?? reserve?.[2] ?? 0n),
      ];
    }),
  );

  return new Map(
    stakeRows.map((entry) => {
      const assetAddress = entry.stataTokenData?.asset;
      const reserveApr =
        entry.underlyingIsStataToken && ethers.isAddress(assetAddress || "")
          ? reserveAprM.get(ethers.getAddress(assetAddress).toLowerCase()) || 0
          : 0;
      const rewardApr = getAaveUmbrellaRewardApr(entry.rewards);

      return [
        ethers.getAddress(entry.tokenAddress).toLowerCase(),
        {
          baseApr: reserveApr,
          rewardApr,
          totalApr: reserveApr + rewardApr,
        },
      ];
    }),
  );
}

async function buildAaveStakingMarketEntries({
  provider,
  chain = "",
  stakeData,
} = {}) {
  const lendAddress = ethers.getAddress(stakeData.tokenAddress);
  const wrapperAddress = ethers.getAddress(stakeData.underlyingTokenAddress);
  const wrapperDecimals = Number(stakeData.underlyingTokenDecimals);
  const isStataToken = !!stakeData.underlyingIsStataToken;
  const wrapperMeta = getProvidedTokenMeta({
    chain,
    address: wrapperAddress,
    name: stakeData.underlyingTokenName,
    symbol: stakeData.underlyingTokenSymbol,
    decimals: wrapperDecimals,
  });
  const lendMeta = getProvidedTokenMeta({
    chain,
    address: lendAddress,
    name: stakeData.name,
    symbol: stakeData.symbol,
    decimals: wrapperDecimals,
  });
  const stakingVault = new ethers.Contract(
    lendAddress,
    erc4626ReadAbi,
    provider,
  );
  const wrapperVault = isStataToken
    ? new ethers.Contract(wrapperAddress, erc4626ReadAbi, provider)
    : null;
  const stataTokenData = stakeData.stataTokenData || {};
  const poolData = getAaveStakingPoolData(stakeData);
  const underlyingEntries = isStataToken
    ? [
        {
          routeMode: "base",
          meta: getProvidedTokenMeta({
            chain,
            address: stataTokenData.asset,
            name: stataTokenData.assetName,
            symbol: stataTokenData.assetSymbol,
            decimals: wrapperDecimals,
          }),
        },
        {
          routeMode: "atoken",
          meta: getProvidedTokenMeta({
            chain,
            address: stataTokenData.aToken,
            name: stataTokenData.aTokenName,
            symbol: stataTokenData.aTokenSymbol,
            decimals: wrapperDecimals,
          }),
        },
      ]
    : [{ routeMode: "wrapped", meta: wrapperMeta }];
  const addedLend = getCoinByAddress(chain, lendMeta.address);

  return Promise.all(
    underlyingEntries.map(async ({ routeMode, meta }) => {
      const addedUnderlying = getCoinByAddress(chain, meta.address);
      const rate = await getAaveStakingExchangeRate({
        stakingVault,
        wrapperVault,
        routeMode,
        underlyingDecimals: meta.decimals,
        lendDecimals: lendMeta.decimals,
      });

      return {
        value: `${meta.symbol}:${lendMeta.symbol}:${lendMeta.address}:${routeMode}`,
        chain,
        protocol: "aaveStaking",
        routeMode,
        underlyingIsStataToken: isStataToken,
        wrapperAddress: wrapperMeta.address,
        wrapperCoin: wrapperMeta.symbol,
        wrapperName: wrapperMeta.name || wrapperMeta.symbol,
        wrapperDecimals: wrapperMeta.decimals,
        underlyingCoin: addedUnderlying?.[0] || meta.symbol,
        underlyingName: meta.name || meta.symbol,
        underlyingAddress: meta.address,
        underlyingDecimals: meta.decimals,
        lendCoin: addedLend?.[0] || lendMeta.symbol,
        lendName: lendMeta.name || lendMeta.symbol,
        lendAddress: lendMeta.address,
        lendDecimals: lendMeta.decimals,
        underlyingPerReceipt: rate.underlyingPerReceipt,
        receiptPerUnderlying: rate.receiptPerUnderlying,
        addedUnderlying: !!addedUnderlying,
        addedLend: !!addedLend,
        ...poolData,
        baseApr: 0,
        rewardApr: 0,
        supplyApr: 0,
      };
    }),
  );
}

function returnAaveStakingMarkets({
  chain = "",
  markets = [],
  at = Date.now(),
} = {}) {
  const sortedMarkets = [...markets].sort((a, b) =>
    a.underlyingCoin.localeCompare(b.underlyingCoin),
  );
  setDiscoveryCacheMapEntry(aaveStakingMarketCacheM, String(chain || ""), {
    at,
    markets: sortedMarkets,
  });

  return {
    ok: true,
    chain,
    markets: sortedMarkets,
    cache: makeDiscoveryCacheMeta({
      source: "api",
      at,
      ttlMs: discoveryCacheMs,
    }),
  };
}

export function clearAaveStakingDiscoveryCache() {
  clearDiscoveryCacheMap(aaveStakingMarketCacheM);
}

export async function getAaveStakingAllMarkets({
  chain = "",
  refresh = false,
} = {}) {
  if (chain == "Solana" || chain == "Hyperliquid") {
    return { ok: true, chain, markets: [] };
  }

  const cacheKey = String(chain || "");
  const cached = !refresh
    ? getDiscoveryCacheMapEntry(aaveStakingMarketCacheM, cacheKey)
    : null;
  if (cached?.markets) {
    return {
      ok: true,
      chain,
      markets: cached.markets,
      cache: makeDiscoveryCacheMeta({
        source: "cache",
        at: cached.at,
        ttlMs: discoveryCacheMs,
      }),
    };
  }

  const now = Date.now();
  if (!ethers.isAddress(aaveUmbrellaStakeDataProviderM[chain] || "")) {
    return returnAaveStakingMarkets({ chain, markets: [], at: now });
  }

  const rpc = getAaveChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave Staking",
  });

  try {
    const stakeRows = await getAaveUmbrellaStakeRows(provider, chain);
    const [marketGroups, stakingAprM] = await Promise.all([
      mapWithConcurrency(stakeRows, 4, (stakeData) =>
        buildAaveStakingMarketEntries({ provider, chain, stakeData }).catch(
          () => null,
        ),
      ),
      getAaveStakingAprM(provider, chain, stakeRows).catch(() => new Map()),
    ]);
    const markets = marketGroups
      .flat()
      .filter(Boolean)
      .map((entry) => {
        const aprE = stakingAprM.get(entry.lendAddress.toLowerCase());

        return {
          ...entry,
          baseApr: aprE?.baseApr || entry.baseApr || 0,
          rewardApr: aprE?.rewardApr || entry.rewardApr || 0,
          supplyApr: aprE?.totalApr || entry.supplyApr || 0,
        };
      });
    const marketM = new Map();
    for (const entry of markets) {
      if (!ethers.isAddress(entry.lendAddress)) continue;
      marketM.set(
        `${ethers.getAddress(entry.lendAddress)}:${ethers.getAddress(entry.underlyingAddress)}`,
        entry,
      );
    }

    return returnAaveStakingMarkets({
      chain,
      markets: [...marketM.values()],
      at: now,
    });
  } finally {
    provider.destroy?.();
  }
}
