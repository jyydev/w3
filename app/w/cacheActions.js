"use server";

import { clearAaveRuntimeCache } from "../t/_lend/aave/sv";
import { clearMorphoRuntimeCache } from "../t/_lend/morpho/sv";
import { clearVenusRuntimeCache } from "../_shared/venus/lending";
import { clearJupiterRuntimeCache } from "../t/_lend/jupiter/sv";
import { clearJustLendRuntimeCache } from "../t/_lend/justlend/sv";
import { clearRelayRuntimeCache } from "../t/_swap/relay/sv";
import { clearJumperRuntimeCache } from "../t/_swap/jumper/sv";
import { clearAcrossRuntimeCache } from "../t/_swap/across/sv";
import { clearJupiterSwapRuntimeCache } from "../t/_swap/jupiter/sv";
import { clearPancakeRuntimeCache } from "../t/_swap/pancake/sv";
import { clearAaveStakingRuntimeCache } from "../_shared/aave/stakingActions";
import { clearSparkRuntimeCache } from "../t/_yield/spark/sv";
import { clearVenusFluxRuntimeCache } from "../_shared/venus/flux";
import { clearHyperliquidServerRuntimeCache } from "../t/_yield/hyperliquid/sv";

export async function clearServerRuntimeCache() {
  await Promise.all([
    clearAaveRuntimeCache(),
    clearMorphoRuntimeCache(),
    clearVenusRuntimeCache(),
    clearJupiterRuntimeCache(),
    clearJustLendRuntimeCache(),
    clearRelayRuntimeCache(),
    clearJumperRuntimeCache(),
    clearAcrossRuntimeCache(),
    clearJupiterSwapRuntimeCache(),
    clearPancakeRuntimeCache(),
    clearAaveStakingRuntimeCache(),
    clearSparkRuntimeCache(),
    clearVenusFluxRuntimeCache(),
    clearHyperliquidServerRuntimeCache(),
  ]);

  return { ok: true };
}
