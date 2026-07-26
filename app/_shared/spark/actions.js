"use server";

import { sparkSupportedChainNames } from "./index";
import { loadSparkView } from "./view";

function normalizeChains(chainNames = []) {
  const requested = [
    ...new Set(
      (Array.isArray(chainNames) ? chainNames : [])
        .map((chain) => String(chain || "").trim())
        .filter((chain) => sparkSupportedChainNames.includes(chain)),
    ),
  ];

  return requested.length ? requested : sparkSupportedChainNames;
}

export async function reloadSparkMarkets(chainNames = []) {
  const finalChains = normalizeChains(chainNames);
  const view = await loadSparkView(finalChains.join(","), { refresh: true });

  return {
    ok: true,
    chainNames: finalChains,
    ...view,
  };
}
