"use server";

import { clearMorphoRuntimeCache } from "../t/_lend/morpho/sv";
import { clearSparkRuntimeCache } from "../t/_yield/spark/sv";

export async function clearServerRuntimeCache() {
  await Promise.all([
    clearMorphoRuntimeCache(),
    clearSparkRuntimeCache(),
  ]);

  return { ok: true };
}
