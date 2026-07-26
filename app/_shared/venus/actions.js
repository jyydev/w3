"use server";

import {
  venusFluxChains,
  venusLendingChains,
} from "./index";
import {
  clearVenusFluxRuntimeCache,
  getVenusFluxAllMarkets,
} from "./flux";
import {
  clearVenusRuntimeCache,
  getVenusAllMarkets,
} from "./lending";
import { buildVenusMarketView } from "./view";

function normalizeChains(chainNames = [], supportedChains = []) {
  const requested = [
    ...new Set(
      (Array.isArray(chainNames) ? chainNames : [])
        .map((chain) => String(chain || "").trim())
        .filter((chain) => supportedChains.includes(chain)),
    ),
  ];

  return requested.length ? requested : supportedChains;
}

async function reloadMarkets({
  chainNames = [],
  supportedChains = [],
  clearCache,
  getAllMarkets,
}) {
  const finalChains = normalizeChains(chainNames, supportedChains);
  await clearCache();
  const results = await Promise.all(
    finalChains.map(async (chain) => {
      try {
        return await getAllMarkets({ chain, refresh: true });
      } catch (error) {
        return {
          ok: false,
          chain,
          markets: [],
          error: error?.message || "market discovery failed",
        };
      }
    }),
  );

  return {
    ok: true,
    chainNames: finalChains,
    ...buildVenusMarketView(finalChains, results),
  };
}

export async function reloadVenusLendingMarkets(chainNames = []) {
  return reloadMarkets({
    chainNames,
    supportedChains: venusLendingChains,
    clearCache: clearVenusRuntimeCache,
    getAllMarkets: getVenusAllMarkets,
  });
}

export async function reloadVenusFluxMarkets(chainNames = []) {
  return reloadMarkets({
    chainNames,
    supportedChains: venusFluxChains,
    clearCache: clearVenusFluxRuntimeCache,
    getAllMarkets: getVenusFluxAllMarkets,
  });
}
