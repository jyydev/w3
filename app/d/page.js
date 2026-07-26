import Logo from "@/components/Logo";
import { loadAaveLendingView } from "@/app/_shared/aave/lending";
import { loadAaveStakingView } from "@/app/_shared/aave/stakingView";
import { loadSparkView } from "@/app/_shared/spark/view";
import {
  loadVenusFluxView,
  loadVenusLendingView,
} from "@/app/_shared/venus/view";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function DataPage({ searchParams }) {
  const params = await searchParams;
  const chainsParam = params?.chains || "";
  const [aaveStake, aaveLend, spark, venusFlux, venusLend] =
    await Promise.all([
      loadAaveStakingView(chainsParam),
      loadAaveLendingView(chainsParam),
      loadSparkView(chainsParam),
      loadVenusFluxView(chainsParam),
      loadVenusLendingView(chainsParam),
    ]);

  return (
    <div>
      <Logo page="home" />
      <Client
        aave={{ lend: aaveLend, stake: aaveStake }}
        spark={spark}
        venus={{ flux: venusFlux, lend: venusLend }}
      />
    </div>
  );
}
