"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import {
  aaveUmbrellaStakeDataProviderM,
  aaveV3PoolM,
} from "@/app/_data/aave";
import { chainIds } from "@/data/basic";
import {
  clearDiscoveryCacheMap,
  discoveryCacheMs,
  getDiscoveryCacheMapEntry,
  makeDiscoveryCacheMeta,
  setDiscoveryCacheMapEntry,
} from "@/fn/discoveryCache";
import {
  approveExactIfNeeded,
  assertWalletMatches,
  erc20Abi,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getEvmTokenAddress,
  getPrivateKey,
  getUnsignedTx,
  getUsableChainRpc,
  getWallet,
} from "../../sharedServer";
import {
  cleanMarketSymbol,
  createJsonRpcProvider,
  mapWithConcurrency,
  sameEvmAddress,
  withTimeout,
} from "../shared";

const aaveStakingTokenMetaTimeoutMs = 8000;
const aaveStakingFallbackGasLimit = 450000n;
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
const erc4626Abi = [
  "function asset() view returns (address)",
  "function balanceOf(address account) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function deposit(uint256 assets,address receiver) returns (uint256)",
  "function redeem(uint256 shares,address receiver,address owner) returns (uint256)",
  "function cooldown()",
  "function getCooldown() view returns (uint256)",
  "function getStakerCooldown(address staker) view returns (uint256 amount, uint256 cooldownEnd, uint256 unstakeWindow)",
  "function getUnstakeWindow() view returns (uint256)",
  "function REWARDS_CONTROLLER() view returns (address)",
  "function aToken() view returns (address)",
  "function depositATokens(uint256 assets,address receiver) returns (uint256)",
  "function redeemATokens(uint256 shares,address receiver,address owner) returns (uint256)",
];
const erc4626Interface = new ethers.Interface(erc4626Abi);
const rewardsControllerAbi = [
  "function calculateCurrentUserRewards(address asset,address user) view returns (address[] rewards,uint256[] rewardsAccrued)",
  "function claimAllRewards(address asset,address receiver) returns (address[] rewards,uint256[] amounts)",
];
const rewardsControllerInterface = new ethers.Interface(rewardsControllerAbi);

function getCoinByAddress(chain = "", address = "") {
  if (!ethers.isAddress(address)) return null;

  return (
    Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
      sameEvmAddress(coinE?.address, address),
    ) || null
  );
}

export async function clearAaveStakingRuntimeCache() {
  clearDiscoveryCacheMap(aaveStakingMarketCacheM);

  return { ok: true };
}

async function getTokenMeta(
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

async function getAaveStakingExchangeRate({
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

function getAaveStakingToken(chain = "", lendCoin = "") {
  return getEvmTokenAddress(chain, lendCoin, "Aave Staking token");
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

      return [
        ethers.getAddress(entry.tokenAddress).toLowerCase(),
        getAaveUmbrellaRewardApr(entry.rewards) + reserveApr,
      ];
    }),
  );
}

function getAaveStakingAmount({
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  underlyingDecimals,
  lendDecimals,
} = {}) {
  if (action == "cooldown" || action == "claim") return 0n;

  const coin = action == "redeem" ? lendCoin : underlyingCoin;
  const decimals = action == "redeem" ? lendDecimals : underlyingDecimals;
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

async function assertAaveStakingMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  wrapperAddress = "",
  routeMode = "",
} = {}) {
  const stakingAddress = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress)
    : getAaveStakingToken(chain, lendCoin);
  const stakingVault = new ethers.Contract(stakingAddress, erc4626Abi, provider);
  const actualWrapper = ethers.getAddress(
    await withTimeout(
      stakingVault.asset(),
      aaveStakingTokenMetaTimeoutMs,
      "Aave Staking asset timeout",
    ),
  );
  const wrapper = ethers.isAddress(wrapperAddress)
    ? ethers.getAddress(wrapperAddress)
    : actualWrapper;
  if (wrapper != actualWrapper) {
    throw new Error(`${lendCoin} wrapper does not match selected market`);
  }
  const configuredUnderlying = ethers.isAddress(underlyingAddress)
    ? ethers.getAddress(underlyingAddress)
    : getEvmTokenAddress(chain, underlyingCoin, "Aave Staking underlying");
  const wrapperVault = new ethers.Contract(wrapper, erc4626Abi, provider);
  const directRoute =
    configuredUnderlying == wrapper &&
    (!routeMode || routeMode == "wrapped");
  if (routeMode == "wrapped" && !directRoute) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }
  if (directRoute) {
    return {
      underlying: configuredUnderlying,
      wrapper,
      stakingAddress,
      stakingVault,
      wrapperVault,
      routeMode: "wrapped",
      ...(await getAaveStakingExchangeRate({
        stakingVault,
        wrapperVault,
        routeMode: "wrapped",
        underlyingDecimals: Number.isInteger(underlyingDecimals)
          ? underlyingDecimals
          : getCoinDecimals(chain, underlyingCoin),
        lendDecimals: Number.isInteger(lendDecimals)
          ? lendDecimals
          : getCoinDecimals(chain, lendCoin),
      })),
    };
  }

  const [baseAsset, aTokenAsset] = await Promise.all([
    wrapperVault.asset().then((address) => ethers.getAddress(address)),
    wrapperVault.aToken().then((address) => ethers.getAddress(address)),
  ]);
  const actualRouteMode =
    routeMode ||
    (configuredUnderlying == baseAsset
      ? "base"
      : configuredUnderlying == aTokenAsset
        ? "atoken"
        : "");

  if (
    (actualRouteMode == "base" && configuredUnderlying != baseAsset) ||
    (actualRouteMode == "atoken" && configuredUnderlying != aTokenAsset) ||
    !actualRouteMode
  ) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  return {
    underlying: configuredUnderlying,
    wrapper,
    stakingAddress,
    stakingVault,
    wrapperVault,
    routeMode: actualRouteMode,
    ...(await getAaveStakingExchangeRate({
      stakingVault,
      wrapperVault,
      routeMode: actualRouteMode,
      underlyingDecimals: Number.isInteger(underlyingDecimals)
        ? underlyingDecimals
        : getCoinDecimals(chain, underlyingCoin),
      lendDecimals: Number.isInteger(lendDecimals)
        ? lendDecimals
        : getCoinDecimals(chain, lendCoin),
    })),
  };
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
  const stakingVault = new ethers.Contract(lendAddress, erc4626Abi, provider);
  const wrapperVault = isStataToken
    ? new ethers.Contract(wrapperAddress, erc4626Abi, provider)
    : null;
  const stataTokenData = stakeData.stataTokenData || {};
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
  if (
    !ethers.isAddress(aaveUmbrellaStakeDataProviderM[chain] || "")
  ) {
    return returnAaveStakingMarkets({ chain, markets: [], at: now });
  }

  const rpc = getUsableChainRpc(chain);
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
      .map((entry) => ({
        ...entry,
        supplyApr:
          stakingAprM.get(entry.lendAddress.toLowerCase()) ||
          entry.supplyApr ||
          0,
      }));
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

export async function getAaveStakingMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = 18,
} = {}) {
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Aave Staking is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");
  if (!ethers.isAddress(underlyingAddress)) throw new Error("underlying address invalid");
  if (!ethers.isAddress(lendAddress)) throw new Error("Aave Staking token address invalid");

  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave Staking",
  });

  try {
    const owner = ethers.getAddress(walletAddress);
    const [underlyingRaw, lendRaw] = await Promise.all([
      new ethers.Contract(underlyingAddress, erc20Abi, provider).balanceOf(owner),
      new ethers.Contract(lendAddress, erc20Abi, provider).balanceOf(owner),
    ]);

    return {
      ok: true,
      chain,
      walletAddress: owner,
      underlying: {
        address: ethers.getAddress(underlyingAddress),
        raw: underlyingRaw.toString(),
        balance: ethers.formatUnits(underlyingRaw, underlyingDecimals),
        decimals: underlyingDecimals,
      },
      lend: {
        address: ethers.getAddress(lendAddress),
        raw: lendRaw.toString(),
        balance: ethers.formatUnits(lendRaw, lendDecimals),
        decimals: lendDecimals,
      },
    };
  } finally {
    provider.destroy?.();
  }
}

async function getAaveStakingWrappedAmount({
  market,
  action = "lend",
  amountIn = 0n,
} = {}) {
  if (market.routeMode == "wrapped") {
    return action == "redeem"
      ? withTimeout(
          market.stakingVault.convertToAssets(amountIn),
          aaveStakingTokenMetaTimeoutMs,
          "Aave Staking redeem preview timeout",
        )
      : amountIn;
  }

  return action == "redeem"
    ? withTimeout(
        market.stakingVault.convertToAssets(amountIn),
        aaveStakingTokenMetaTimeoutMs,
        "Aave Staking redeem preview timeout",
      )
    : withTimeout(
        market.wrapperVault.convertToShares(amountIn),
        aaveStakingTokenMetaTimeoutMs,
        "Aave Staking wrapper preview timeout",
      );
}

function encodeAaveStakingWrapData({
  routeMode = "base",
  amountIn = 0n,
  receiver = "",
} = {}) {
  if (routeMode == "atoken") {
    return erc4626Interface.encodeFunctionData("depositATokens", [
      amountIn,
      ethers.getAddress(receiver),
    ]);
  }

  return erc4626Interface.encodeFunctionData("deposit", [
    amountIn,
    ethers.getAddress(receiver),
  ]);
}

function encodeAaveStakingUnwrapData({
  routeMode = "base",
  shares = 0n,
  receiver = "",
  owner = "",
} = {}) {
  const args = [
    shares,
    ethers.getAddress(receiver),
    ethers.getAddress(owner),
  ];

  return routeMode == "atoken"
    ? erc4626Interface.encodeFunctionData("redeemATokens", args)
    : erc4626Interface.encodeFunctionData("redeem", args);
}

async function getBufferedGasLimit(provider, txData = {}, from = "") {
  if (!from) return null;

  try {
    const estimated = await provider.estimateGas({
      from: ethers.getAddress(from),
      to: txData.to,
      data: txData.data || "0x",
      value: BigInt(txData.value || 0),
    });

    return (estimated * 13n + 9n) / 10n;
  } catch {
    return null;
  }
}

async function withAaveStakingGasBuffer(
  provider,
  txData = {},
  from = "",
  fallbackGasLimit = aaveStakingFallbackGasLimit,
) {
  const gasLimit = await getBufferedGasLimit(provider, txData, from);

  return gasLimit || fallbackGasLimit
    ? { ...txData, gasLimit: gasLimit || fallbackGasLimit }
    : txData;
}

function getAaveStakingCooldownStatus({
  cooldownStartedAt = 0,
  cooldownEndsAt = 0,
  cooldownSeconds = 0,
  unstakeWindow = 0,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  const rawCooldownStartInput = Number(cooldownStartedAt || 0);
  const rawCooldownEndInput = Number(cooldownEndsAt || 0);
  const nowInput = Number(now || 0);
  const rawCooldownStartedAt =
    rawCooldownStartInput > 1e12
      ? Math.floor(rawCooldownStartInput / 1000)
      : rawCooldownStartInput;
  const rawCooldownEndsAt =
    rawCooldownEndInput > 1e12
      ? Math.floor(rawCooldownEndInput / 1000)
      : rawCooldownEndInput;
  const nowSeconds =
    nowInput > 1e12 ? Math.floor(nowInput / 1000) : nowInput;
  const cooldown = Number(cooldownSeconds || 0);
  const window = Number(unstakeWindow || 0);
  const cooldownEnd =
    rawCooldownEndsAt > 0
      ? rawCooldownEndsAt
      : rawCooldownStartedAt > 0
        ? rawCooldownStartedAt + cooldown
        : 0;
  const startedAt =
    rawCooldownStartedAt > 0
      ? rawCooldownStartedAt
      : rawCooldownEndsAt > 0 && cooldown > 0
        ? Math.max(0, rawCooldownEndsAt - cooldown)
      : 0;
  const windowEnd = cooldownEnd > 0 ? cooldownEnd + window : 0;
  const status =
    cooldownEnd <= 0
      ? "none"
      : nowSeconds < cooldownEnd
        ? "cooldown"
        : nowSeconds <= windowEnd
          ? "ready"
          : "expired";

  return {
    status,
    canUnstake: status == "ready",
    needsCooldown: status == "none" || status == "expired",
    cooldownStartedAt: startedAt,
    cooldownEndsAt: cooldownEnd,
    cooldownSeconds: cooldown,
    unstakeWindow: window,
    cooldownEnd,
    windowEnd,
    now: nowSeconds,
  };
}

function formatAaveStakingTimestamp(value = 0) {
  const timestamp = Number(value || 0);
  if (!(timestamp > 0)) return "";

  return new Date(
    timestamp < 1e12 ? timestamp * 1000 : timestamp,
  ).toLocaleString();
}

async function getAaveStakingCooldownState({
  stakingVault,
  walletAddress = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) return getAaveStakingCooldownStatus();

  const [stakerCooldown, cooldownSeconds, unstakeWindow] = await Promise.all([
    stakingVault
      .getStakerCooldown(ethers.getAddress(walletAddress))
      .catch(() => []),
    stakingVault.getCooldown().catch(() => 0n),
    stakingVault.getUnstakeWindow().catch(() => 0n),
  ]);
  const cooldownEndedAt = Array.isArray(stakerCooldown)
    ? stakerCooldown[1]
    : 0n;
  const stakerUnstakeWindow = Array.isArray(stakerCooldown)
    ? stakerCooldown[2]
    : 0n;

  return getAaveStakingCooldownStatus({
    cooldownEndsAt: Number(cooldownEndedAt || 0n),
    cooldownSeconds: Number(cooldownSeconds),
    unstakeWindow: Number(stakerUnstakeWindow || unstakeWindow || 0n),
  });
}

async function getAaveStakingRewards({
  provider,
  stakingVault,
  stakingAddress = "",
  walletAddress = "",
  chain = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) {
    return { controller: "", rewards: [] };
  }

  const controllerAddress = ethers.getAddress(
    await stakingVault.REWARDS_CONTROLLER(),
  );
  const controller = new ethers.Contract(
    controllerAddress,
    rewardsControllerAbi,
    provider,
  );
  const [rewardAddresses, rewardAmounts] =
    await controller.calculateCurrentUserRewards(
      ethers.getAddress(stakingAddress),
      ethers.getAddress(walletAddress),
    );
  const rewards = await Promise.all(
    rewardAddresses.map(async (address, index) => {
      const meta = await getTokenMeta(provider, address, chain, "reward");
      const amount = BigInt(rewardAmounts[index] || 0n);

      return {
        address: meta.address,
        coin: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        amount: amount.toString(),
        amountFormatted: ethers.formatUnits(amount, meta.decimals),
      };
    }),
  );

  return {
    controller: controllerAddress,
    rewards,
  };
}

function getClaimableAaveStakingRewards(rewards = []) {
  return rewards.filter((reward) => BigInt(reward?.amount || 0n) > 0n);
}

async function getAaveStakingClaimContext({
  provider,
  chain = "",
  stakingAddress = "",
  walletAddress = "",
} = {}) {
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Aave Staking is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("EVM wallet address required");
  }
  if (!ethers.isAddress(stakingAddress)) {
    throw new Error("staking address invalid");
  }

  const stakingVault = new ethers.Contract(
    ethers.getAddress(stakingAddress),
    erc4626Abi,
    provider,
  );
  const rewards = await getAaveStakingRewards({
    provider,
    stakingVault,
    stakingAddress,
    walletAddress,
    chain,
  });
  const claimableRewards = getClaimableAaveStakingRewards(rewards.rewards);
  if (!claimableRewards.length) throw new Error("no claimable rewards");

  return {
    stakingAddress: ethers.getAddress(stakingAddress),
    controller: rewards.controller,
    rewards: rewards.rewards,
    claimableRewards,
  };
}

export async function buildAaveStakingClaimTxs({
  walletAddress = "",
  chain = "",
  stakingAddress = "",
} = {}) {
  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = chainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave Staking",
  });

  try {
    const claim = await getAaveStakingClaimContext({
      provider,
      chain,
      stakingAddress,
      walletAddress,
    });
    const txData = await withAaveStakingGasBuffer(
      provider,
      {
        to: claim.controller,
        data: rewardsControllerInterface.encodeFunctionData("claimAllRewards", [
          claim.stakingAddress,
          ethers.getAddress(walletAddress),
        ]),
        value: "0",
      },
      walletAddress,
    );

    return {
      ok: true,
      chain,
      action: "claim",
      rewards: claim.rewards,
      txs: [
        getUnsignedTx({
          chain,
          chainId,
          type: "claim",
          txData,
        }),
      ],
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeAaveStakingClaim({
  walletName = "",
  walletAddress = "",
  chain = "",
  stakingAddress = "",
} = {}) {
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_raw_${walletName} or pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave Staking",
  });

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);

    const claim = await getAaveStakingClaimContext({
      provider,
      chain,
      stakingAddress,
      walletAddress: wallet.address,
    });
    const claimData = rewardsControllerInterface.encodeFunctionData(
      "claimAllRewards",
      [claim.stakingAddress, wallet.address],
    );
    const controller = new ethers.Contract(
      claim.controller,
      rewardsControllerAbi,
      wallet,
    );
    const gasLimit =
      (await getBufferedGasLimit(
        provider,
        {
          to: claim.controller,
          data: claimData,
          value: "0",
        },
        wallet.address,
      )) || aaveStakingFallbackGasLimit;
    const claimTx = await controller.claimAllRewards(
      claim.stakingAddress,
      wallet.address,
      { gasLimit },
    );
    const receipt = await claimTx.wait();

    return {
      ok: true,
      chain,
      action: "claim",
      rewards: claim.rewards,
      txs: [
        {
          chain,
          type: "claim",
          hash: claimTx.hash,
          blockNumber: receipt?.blockNumber ?? null,
        },
      ],
    };
  } finally {
    provider.destroy?.();
  }
}

export async function getAaveStakingLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  wrapperAddress = "",
  routeMode = "",
  amount = "",
} = {}) {
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Aave Staking is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getAaveStakingAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave Staking",
  });

  try {
    const market = await assertAaveStakingMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
      wrapperAddress,
      routeMode,
    });
    const wrappedAmount =
      amountIn > 0n
        ? await getAaveStakingWrappedAmount({
            market,
            action,
            amountIn,
          })
        : 0n;
    const cooldown = await getAaveStakingCooldownState({
      stakingVault: market.stakingVault,
      walletAddress,
    });
    const rewards = await getAaveStakingRewards({
      provider,
      stakingVault: market.stakingVault,
      stakingAddress: market.stakingAddress,
      walletAddress,
      chain,
    });
    const isNoAmountAction = action == "cooldown" || action == "claim";
    const allowance =
      action == "redeem" || isNoAmountAction
        ? amountIn
        : BigInt(
            await new ethers.Contract(
              market.underlying,
              erc20Abi,
              provider,
            ).allowance(
              walletAddress,
              market.routeMode == "wrapped"
                ? market.stakingAddress
                : market.wrapper,
            ),
          );
    const wrapperAllowance =
      action == "redeem" || isNoAmountAction || market.routeMode == "wrapped"
        ? wrappedAmount
        : BigInt(
            await new ethers.Contract(
              market.wrapper,
              erc20Abi,
              provider,
            ).allowance(walletAddress, market.stakingAddress),
          );
    const underlyingApprovalNeeded =
      action != "redeem" && !isNoAmountAction && allowance < amountIn;
    const wrapperApprovalNeeded =
      action != "redeem" && !isNoAmountAction && wrapperAllowance < wrappedAmount;

    return {
      ok: true,
      defi: "Aave Staking",
      chain,
      action,
      approvalNeeded: underlyingApprovalNeeded || wrapperApprovalNeeded,
      approvalAmountNeeded: underlyingApprovalNeeded,
      underlyingApprovalNeeded,
      wrapperApprovalNeeded,
      allowance: allowance.toString(),
      wrapperAllowance: wrapperAllowance.toString(),
      amountIn: amountIn.toString(),
      wrappedAmount: wrappedAmount.toString(),
      market: market.stakingAddress,
      cooldown,
      rewards,
      underlyingPerReceipt: market.underlyingPerReceipt,
      receiptPerUnderlying: market.receiptPerUnderlying,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildAaveStakingLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  wrapperAddress = "",
  routeMode = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Aave Staking is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = chainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const amountIn = getAaveStakingAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave Staking",
  });

  try {
    const market = await assertAaveStakingMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
      wrapperAddress,
      routeMode,
    });
    const wrappedAmount =
      amountIn > 0n
        ? await getAaveStakingWrappedAmount({
            market,
            action,
            amountIn,
          })
        : 0n;
    const cooldown = await getAaveStakingCooldownState({
      stakingVault: market.stakingVault,
      walletAddress,
    });
    const rewards = await getAaveStakingRewards({
      provider,
      stakingVault: market.stakingVault,
      stakingAddress: market.stakingAddress,
      walletAddress,
      chain,
    });
    const txs = [];

    if (action == "claim") {
      const txData = await withAaveStakingGasBuffer(
        provider,
        {
          to: rewards.controller,
          data: rewardsControllerInterface.encodeFunctionData(
            "claimAllRewards",
            [market.stakingAddress, ethers.getAddress(walletAddress)],
          ),
          value: "0",
        },
        walletAddress,
      );

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "claim",
          txData,
        }),
      );
    } else if (
      action == "cooldown" ||
      (action == "redeem" && cooldown.needsCooldown)
    ) {
      const txData = await withAaveStakingGasBuffer(
        provider,
        {
          to: market.stakingAddress,
          data: erc4626Interface.encodeFunctionData("cooldown"),
          value: "0",
        },
        walletAddress,
      );

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "cooldown",
          txData,
        }),
      );
    } else if (action == "redeem") {
      if (!cooldown.canUnstake) {
        throw new Error(
          `cooldown ends at ${formatAaveStakingTimestamp(cooldown.cooldownEnd)}`,
        );
      }
      const txData = await withAaveStakingGasBuffer(
        provider,
        {
          to: market.stakingAddress,
          data: erc4626Interface.encodeFunctionData("redeem", [
            amountIn,
            ethers.getAddress(walletAddress),
            ethers.getAddress(walletAddress),
          ]),
          value: "0",
        },
        walletAddress,
      );

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "unstake",
          txData,
        }),
      );
      if (market.routeMode != "wrapped") {
        const txData = await withAaveStakingGasBuffer(
          provider,
          {
            to: market.wrapper,
            data: encodeAaveStakingUnwrapData({
              routeMode: market.routeMode,
              shares: wrappedAmount,
              receiver: walletAddress,
              owner: walletAddress,
            }),
            value: "0",
          },
          walletAddress,
        );

        txs.push(
          getUnsignedTx({
            chain,
            chainId,
            type: "unwrap",
            txData,
          }),
        );
      }
    } else {
      const allowance = BigInt(
        await new ethers.Contract(
          market.underlying,
          erc20Abi,
          provider,
        ).allowance(
          walletAddress,
          market.routeMode == "wrapped" ? market.stakingAddress : market.wrapper,
        ),
      );
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        defaultAmount: amountIn,
        decimals: underlyingDecimals,
      });

      if (allowance < amountIn && approveAmount != null) {
        if (allowance > 0n) {
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: market.underlying,
              spender:
                market.routeMode == "wrapped"
                  ? market.stakingAddress
                  : market.wrapper,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: market.underlying,
            spender:
              market.routeMode == "wrapped" ? market.stakingAddress : market.wrapper,
            amount: approveAmount,
          }),
        );
      }

      if (market.routeMode != "wrapped") {
        const txData = await withAaveStakingGasBuffer(
          provider,
          {
            to: market.wrapper,
            data: encodeAaveStakingWrapData({
              routeMode: market.routeMode,
              amountIn,
              receiver: walletAddress,
            }),
            value: "0",
          },
          walletAddress,
        );

        txs.push(
          getUnsignedTx({
            chain,
            chainId,
            type: "wrap",
            txData,
          }),
        );
      }

      const wrapperAllowance =
        market.routeMode == "wrapped"
          ? wrappedAmount
          : BigInt(
              await new ethers.Contract(
                market.wrapper,
                erc20Abi,
                provider,
              ).allowance(walletAddress, market.stakingAddress),
            );
      if (wrapperAllowance < wrappedAmount) {
        if (wrapperAllowance > 0n) {
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: market.wrapper,
              spender: market.stakingAddress,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: market.wrapper,
            spender: market.stakingAddress,
            amount: wrappedAmount,
          }),
        );
      }

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "stake",
          txData: await withAaveStakingGasBuffer(
            provider,
            {
              to: market.stakingAddress,
              data: erc4626Interface.encodeFunctionData("deposit", [
                wrappedAmount,
                ethers.getAddress(walletAddress),
              ]),
              value: "0",
            },
            walletAddress,
          ),
        }),
      );
    }

    return {
      ok: true,
      defi: "Aave Staking",
      chain,
      action:
        action == "claim"
          ? "claim"
          : action == "cooldown" || (action == "redeem" && cooldown.needsCooldown)
          ? "cooldown"
          : action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      wrappedAmount: wrappedAmount.toString(),
      market: market.stakingAddress,
      cooldown,
      rewards,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeAaveStakingLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  wrapperAddress = "",
  routeMode = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana" || chain == "Hyperliquid") {
    throw new Error("Aave Staking is EVM-only here");
  }
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_raw_${walletName} or pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getAaveStakingAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = createJsonRpcProvider(rpc, {
    chain,
    scope: "Aave Staking",
  });

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const market = await assertAaveStakingMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
      wrapperAddress,
      routeMode,
    });
    const stakingVault = new ethers.Contract(
      market.stakingAddress,
      erc4626Abi,
      wallet,
    );
    const wrapperVault = new ethers.Contract(market.wrapper, erc4626Abi, wallet);
    const txs = [];

    const cooldown = await getAaveStakingCooldownState({
      stakingVault,
      walletAddress: wallet.address,
    });
    const rewards = await getAaveStakingRewards({
      provider,
      stakingVault,
      stakingAddress: market.stakingAddress,
      walletAddress: wallet.address,
      chain,
    });

    if (action == "claim") {
      const controller = new ethers.Contract(
        rewards.controller,
        rewardsControllerAbi,
        wallet,
      );
      const claimData = rewardsControllerInterface.encodeFunctionData(
        "claimAllRewards",
        [market.stakingAddress, wallet.address],
      );
      const gasLimit =
        (await getBufferedGasLimit(
          provider,
          {
            to: rewards.controller,
            data: claimData,
            value: "0",
          },
          wallet.address,
        )) || aaveStakingFallbackGasLimit;
      const claimTx = await controller.claimAllRewards(
        market.stakingAddress,
        wallet.address,
        { gasLimit },
      );
      const receipt = await claimTx.wait();
      txs.push({
        chain,
        type: "claim",
        hash: claimTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else if (
      action == "cooldown" ||
      (action == "redeem" && cooldown.needsCooldown)
    ) {
      const txData = erc4626Interface.encodeFunctionData("cooldown");
      const gasLimit =
        (await getBufferedGasLimit(
          provider,
          {
            to: market.stakingAddress,
            data: txData,
            value: "0",
          },
          wallet.address,
        )) || aaveStakingFallbackGasLimit;
      const cooldownTx = await stakingVault.cooldown({ gasLimit });
      const receipt = await cooldownTx.wait();
      txs.push({
        chain,
        type: "cooldown",
        hash: cooldownTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else if (action == "redeem") {
      if (!cooldown.canUnstake) {
        throw new Error(
          `cooldown ends at ${formatAaveStakingTimestamp(cooldown.cooldownEnd)}`,
        );
      }
      const wrapperToken = new ethers.Contract(market.wrapper, erc20Abi, provider);
      const wrapperBefore = await wrapperToken.balanceOf(wallet.address);
      const redeemTx = await stakingVault.redeem(
        amountIn,
        wallet.address,
        wallet.address,
      );
      const receipt = await redeemTx.wait();
      const wrapperAfter = await wrapperToken.balanceOf(wallet.address);
      let wrappedAmount = wrapperAfter - wrapperBefore;
      if (wrappedAmount <= 0n) {
        wrappedAmount = await getAaveStakingWrappedAmount({
          market,
          action,
          amountIn,
        });
      }
      txs.push({
        chain,
        type: "unstake",
        hash: redeemTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
      if (market.routeMode != "wrapped") {
        const unwrapTx =
          market.routeMode == "atoken"
            ? await wrapperVault.redeemATokens(
                wrappedAmount,
                wallet.address,
                wallet.address,
              )
            : await wrapperVault.redeem(
                wrappedAmount,
                wallet.address,
                wallet.address,
              );
        const unwrapReceipt = await unwrapTx.wait();
        txs.push({
          chain,
          type: "unwrap",
          hash: unwrapTx.hash,
          blockNumber: unwrapReceipt?.blockNumber ?? null,
        });
      }
    } else {
      const token = new ethers.Contract(market.underlying, erc20Abi, wallet);
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        decimals: underlyingDecimals,
      });
      const underlyingSpender =
        market.routeMode == "wrapped" ? market.stakingAddress : market.wrapper;
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: underlyingSpender,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );

      let wrappedAmount = amountIn;
      if (market.routeMode != "wrapped") {
        const wrapperToken = new ethers.Contract(
          market.wrapper,
          erc20Abi,
          provider,
        );
        const wrapperBefore = await wrapperToken.balanceOf(wallet.address);
        const wrapData = encodeAaveStakingWrapData({
          routeMode: market.routeMode,
          amountIn,
          receiver: wallet.address,
        });
        const wrapGasLimit =
          (await getBufferedGasLimit(
            provider,
            {
              to: market.wrapper,
              data: wrapData,
              value: "0",
            },
            wallet.address,
          )) || aaveStakingFallbackGasLimit;
        const wrapOverrides = { gasLimit: wrapGasLimit };
        const wrapTx =
          market.routeMode == "atoken"
            ? await wrapperVault.depositATokens(
                amountIn,
                wallet.address,
                wrapOverrides,
              )
            : await wrapperVault.deposit(amountIn, wallet.address, wrapOverrides);
        const wrapReceipt = await wrapTx.wait();
        const wrapperAfter = await wrapperToken.balanceOf(wallet.address);
        wrappedAmount = wrapperAfter - wrapperBefore;
        if (wrappedAmount <= 0n) {
          wrappedAmount = await getAaveStakingWrappedAmount({
            market,
            action,
            amountIn,
          });
        }
        txs.push({
          chain,
          type: "wrap",
          hash: wrapTx.hash,
          blockNumber: wrapReceipt?.blockNumber ?? null,
        });
      }

      if (market.routeMode != "wrapped") {
        const wrapperToken = new ethers.Contract(market.wrapper, erc20Abi, wallet);
        txs.push(
          ...(await approveExactIfNeeded({
            chain,
            token: wrapperToken,
            owner: wallet.address,
            spender: market.stakingAddress,
            amount: wrappedAmount,
            approvalAmount: wrappedAmount,
          })),
        );
      }

      const stakeData = erc4626Interface.encodeFunctionData("deposit", [
        wrappedAmount,
        wallet.address,
      ]);
      const stakeGasLimit =
        (await getBufferedGasLimit(
          provider,
          {
            to: market.stakingAddress,
            data: stakeData,
            value: "0",
          },
          wallet.address,
        )) || aaveStakingFallbackGasLimit;
      const lendTx = await stakingVault.deposit(wrappedAmount, wallet.address, {
        gasLimit: stakeGasLimit,
      });
      const receipt = await lendTx.wait();
      txs.push({
        chain,
        type: "stake",
        hash: lendTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    }

    return {
      ok: true,
      defi: "Aave Staking",
      chain,
      action:
        action == "claim"
          ? "claim"
          : action == "cooldown" || (action == "redeem" && cooldown.needsCooldown)
          ? "cooldown"
          : action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      wrappedAmount:
        amountIn > 0n
          ? (await getAaveStakingWrappedAmount({
              market,
              action,
              amountIn,
            })).toString()
          : "0",
      market: market.stakingAddress,
      cooldown,
      rewards,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}
