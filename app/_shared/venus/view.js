import { cleanErrorText } from "@/app/_fn/shared";
import {
  venusFluxChains,
  venusLendingChains,
} from "./index";
import { getVenusFluxAllMarkets } from "./flux";
import { getVenusAllMarkets } from "./lending";

function getRequestedChains(chainsParam = "", supportedChains = []) {
  const requestedChains = String(chainsParam || "")
    .split(",")
    .map((chain) => chain.trim())
    .filter((chain) => supportedChains.includes(chain));

  return requestedChains.length ? [...new Set(requestedChains)] : supportedChains;
}

function getCoinPriority(coin = "") {
  const priority = {
    USDT: 1,
    USDC: 2,
    USDS: 3,
    DAI: 4,
    GHO: 5,
    ETH: 21,
    WETH: 22,
    BTC: 31,
    WBTC: 32,
    BNB: 41,
    WBNB: 42,
  };

  return (
    priority[coin] ||
    (/USD/i.test(coin)
      ? 11
      : /DAI/i.test(coin)
        ? 12
        : /ETH/i.test(coin)
          ? 21
          : /BTC/i.test(coin)
            ? 31
            : /BNB/i.test(coin)
              ? 41
              : 99)
  );
}

async function loadChainMarkets(chain = "", getAllMarkets) {
  try {
    return await getAllMarkets({ chain });
  } catch (error) {
    return {
      ok: false,
      chain,
      markets: [],
      error: cleanErrorText(error?.message || error, "market discovery failed"),
    };
  }
}

export function buildVenusMarketView(chainNames = [], results = []) {
  const cacheM = {};
  const errorsM = {};
  const marketsM = {};
  const coinSet = new Set();

  results.forEach((result, index) => {
    const chain = chainNames[index];
    cacheM[chain] = result?.cache || null;
    if (result?.error) errorsM[chain] = result.error;

    const chainMarkets = {};
    for (const market of result?.markets || []) {
      const coin = String(market?.underlyingCoin || "").trim();
      if (!coin) continue;

      const current = chainMarkets[coin];
      if (
        !current ||
        Number(market.supplyApr || 0) > Number(current.supplyApr || 0)
      ) {
        chainMarkets[coin] = market;
      }
      coinSet.add(coin);
    }
    marketsM[chain] = chainMarkets;
  });

  const coins = [...coinSet].sort(
    (first, second) =>
      getCoinPriority(first) - getCoinPriority(second) ||
      first.localeCompare(second),
  );
  const chains = Object.fromEntries(
    chainNames.map((chain) => [chain, { chain }]),
  );

  return { cacheM, chains, coins, errorsM, marketsM };
}

export async function loadVenusLendingView(chainsParam = "") {
  const chainNames = getRequestedChains(chainsParam, venusLendingChains);
  const results = await Promise.all(
    chainNames.map((chain) => loadChainMarkets(chain, getVenusAllMarkets)),
  );

  return buildVenusMarketView(chainNames, results);
}

export async function loadVenusFluxView(chainsParam = "") {
  const chainNames = getRequestedChains(chainsParam, venusFluxChains);
  const results = await Promise.all(
    chainNames.map((chain) =>
      loadChainMarkets(chain, getVenusFluxAllMarkets),
    ),
  );

  return buildVenusMarketView(chainNames, results);
}
