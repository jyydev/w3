import {
  aaveUmbrellaChains,
  aaveUmbrellaStakeDataProviderM,
} from "./index";
import { getAaveStakingAllMarkets } from "./staking";

const coinPriorityM = {
  USDC: 1,
  USDT: 2,
  WETH: 3,
  GHO: 4,
};

function getPoolMarkets(markets = []) {
  const poolM = new Map();

  for (const market of markets) {
    const key = String(
      market.lendAddress || market.lendCoin || "",
    ).toLowerCase();
    const current = poolM.get(key);
    if (
      !current ||
      market.routeMode == "base" ||
      market.routeMode == "wrapped"
    ) {
      poolM.set(key, market);
    }
  }

  return [...poolM.values()];
}

export function buildAaveStakingView(chainNames = [], results = []) {
  const cacheM = Object.fromEntries(
    results.map((result, index) => [chainNames[index], result.cache || null]),
  );
  const poolsM = {};
  const coinSet = new Set();

  results.forEach((result, index) => {
    const chain = chainNames[index];
    const pools = getPoolMarkets(result.markets);
    poolsM[chain] = Object.fromEntries(
      pools.map((pool) => {
        coinSet.add(pool.underlyingCoin);
        return [pool.underlyingCoin, pool];
      }),
    );
  });

  const coins = [...coinSet].sort(
    (a, b) =>
      (coinPriorityM[a] || 99) - (coinPriorityM[b] || 99) ||
      a.localeCompare(b),
  );

  return { cacheM, coins, poolsM };
}

export async function loadAaveStakingView(chainsParam = "") {
  const requestedChains = String(chainsParam || "")
    .split(",")
    .map((chain) => chain.trim())
    .filter((chain) => aaveUmbrellaChains.includes(chain));
  const chainNames = requestedChains.length
    ? requestedChains
    : aaveUmbrellaChains;
  const results = await Promise.all(
    chainNames.map((chain) => getAaveStakingAllMarkets({ chain })),
  );
  const view = buildAaveStakingView(chainNames, results);
  const chains = Object.fromEntries(
    chainNames.map((chain) => [
      chain,
      { dataProvider: aaveUmbrellaStakeDataProviderM[chain] },
    ]),
  );

  return { ...view, chains };
}
