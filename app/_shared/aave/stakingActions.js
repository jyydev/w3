"use server";

import { aaveUmbrellaChains } from "./index";
import {
  clearAaveStakingDiscoveryCache,
  getAaveStakingAllMarkets,
} from "./staking";
import { buildAaveStakingView } from "./stakingView";

export async function clearAaveStakingRuntimeCache() {
  clearAaveStakingDiscoveryCache();

  return { ok: true };
}

export async function reloadAaveStakingMarkets(chainNames = []) {
  const requestedChains = [
    ...new Set(
      (Array.isArray(chainNames) ? chainNames : [])
        .map((chain) => String(chain || "").trim())
        .filter((chain) => aaveUmbrellaChains.includes(chain)),
    ),
  ];
  const finalChains = requestedChains.length
    ? requestedChains
    : aaveUmbrellaChains;

  clearAaveStakingDiscoveryCache();
  const results = await Promise.all(
    finalChains.map((chain) =>
      getAaveStakingAllMarkets({ chain, refresh: true }),
    ),
  );

  return {
    ok: true,
    chainNames: finalChains,
    ...buildAaveStakingView(finalChains, results),
  };
}
