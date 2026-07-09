"use server";

import { clearAaveRuntimeCache } from "../t/_lend/aave/sv";
import { clearMorphoRuntimeCache } from "../t/_lend/morpho/sv";
import { clearVenusRuntimeCache } from "../t/_lend/venus/sv";
import { clearJupiterRuntimeCache } from "../t/_lend/jupiter/sv";
import { clearRelayRuntimeCache } from "../t/_swap/relay/sv";
import { clearJumperRuntimeCache } from "../t/_swap/jumper/sv";
import { clearAcrossRuntimeCache } from "../t/_swap/across/sv";
import { clearJupiterSwapRuntimeCache } from "../t/_swap/jupiter/sv";
import { clearAaveStakingRuntimeCache } from "../t/_yield/aaveStaking/sv";
import { clearSparkRuntimeCache } from "../t/_yield/spark/sv";
import { clearVenusFluxRuntimeCache } from "../t/_yield/venusFlux/sv";
import { clearHyperliquidServerRuntimeCache } from "../t/_yield/hyperliquid/sv";

export async function clearServerRuntimeCache() {
  await Promise.all([
    clearAaveRuntimeCache(),
    clearMorphoRuntimeCache(),
    clearVenusRuntimeCache(),
    clearJupiterRuntimeCache(),
    clearRelayRuntimeCache(),
    clearJumperRuntimeCache(),
    clearAcrossRuntimeCache(),
    clearJupiterSwapRuntimeCache(),
    clearAaveStakingRuntimeCache(),
    clearSparkRuntimeCache(),
    clearVenusFluxRuntimeCache(),
    clearHyperliquidServerRuntimeCache(),
  ]);

  return { ok: true };
}
