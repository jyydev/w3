import coinM from "@/fn/coinM";
import { cleanErrorText } from "@/app/_fn/shared";
import {
  getSparkMarketSupplyApr,
  sparkKnownMarketM,
  sparkPsm3AddressM,
  sparkSupportedChainNames,
} from "./index";
import { loadSparkSavingsRates } from "./rates";

function getRequestedChains(chainsParam = "") {
  const requested = String(chainsParam || "")
    .split(",")
    .map((chain) => chain.trim())
    .filter((chain) => sparkSupportedChainNames.includes(chain));

  return requested.length ? [...new Set(requested)] : sparkSupportedChainNames;
}

function getMarketPriority(market = "") {
  const underlying = String(market).split("-")[0];
  const priority = {
    USDT: 1,
    USDC: 2,
    USDS: 3,
    DAI: 4,
    PYUSD: 5,
    ETH: 21,
    WETH: 22,
  };

  return priority[underlying] || (/USD/i.test(underlying) ? 11 : 99);
}

export function buildSparkView({
  chainNames = sparkSupportedChainNames,
  rates = null,
  cacheMeta = null,
  error = "",
} = {}) {
  const marketSet = new Set();
  const marketsM = {};

  for (const chain of chainNames) {
    const chainMarkets = {};
    for (const [lendCoin, knownMarket] of Object.entries(
      sparkKnownMarketM[chain] || {},
    )) {
      const psm3Assets =
        sparkPsm3AddressM[chain] && knownMarket.psm3Assets?.length
          ? [...new Set(knownMarket.psm3Assets)]
          : [knownMarket.underlyingCoin];

      for (const underlyingCoin of psm3Assets) {
        const market = `${underlyingCoin}-${lendCoin}`;
        const configuredUnderlying = coinM?.[chain]?.[underlyingCoin] || {};
        chainMarkets[market] = {
          ...knownMarket,
          chain,
          market,
          underlyingCoin,
          underlyingAddress:
            configuredUnderlying.address ||
            (underlyingCoin == knownMarket.underlyingCoin
              ? knownMarket.underlyingAddress
              : ""),
          underlyingDecimals:
            configuredUnderlying.decimals ??
            knownMarket.underlyingDecimals ??
            18,
          lendCoin,
          lendAddress: knownMarket.address,
          lendDecimals: knownMarket.decimals ?? 18,
          psm3Address: sparkPsm3AddressM[chain] || "",
          supplyApr: rates
            ? getSparkMarketSupplyApr({
                lendCoin,
                underlyingCoin,
                knownMarket,
                rates,
              })
            : null,
        };
        marketSet.add(market);
      }
    }
    marketsM[chain] = chainMarkets;
  }

  const markets = [...marketSet].sort(
    (first, second) =>
      getMarketPriority(first) - getMarketPriority(second) ||
      first.localeCompare(second),
  );
  const chains = Object.fromEntries(
    chainNames.map((chain) => [chain, { chain }]),
  );

  return { cacheMeta, chains, error, markets, marketsM, rates: rates || {} };
}

export async function loadSparkView(
  chainsParam = "",
  { refresh = false } = {},
) {
  const chainNames = getRequestedChains(chainsParam);

  try {
    const { rates, cache } = await loadSparkSavingsRates({ refresh });
    return buildSparkView({
      chainNames,
      rates,
      cacheMeta: cache,
    });
  } catch (error) {
    return buildSparkView({
      chainNames,
      error: cleanErrorText(
        error?.message || error,
        "Spark savings rate failed",
      ),
    });
  }
}
