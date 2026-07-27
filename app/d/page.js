import Logo from "@/components/Logo";
import { loadAaveLendingView } from "@/app/_shared/aave/lending";
import { loadAaveStakingView } from "@/app/_shared/aave/stakingView";
import { loadSparkView } from "@/app/_shared/spark/view";
import {
  loadVenusFluxView,
  loadVenusLendingView,
} from "@/app/_shared/venus/view";
import {
  dataTableCollapsedCookie,
  parseDataTableCollapsed,
} from "./tableCollapseState";
import { cookies } from "next/headers";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function DataPage({ searchParams }) {
  const params = await searchParams;
  const chainsParam = params?.chains || "";
  const [
    cookieStore,
    aaveStake,
    aaveLend,
    spark,
    venusFlux,
    venusLend,
  ] =
    await Promise.all([
      cookies(),
      loadAaveStakingView(chainsParam),
      loadAaveLendingView(chainsParam),
      loadSparkView(chainsParam),
      loadVenusFluxView(chainsParam),
      loadVenusLendingView(chainsParam),
    ]);
  const initialCollapsedTables = parseDataTableCollapsed(
    cookieStore.get(dataTableCollapsedCookie)?.value,
  );

  return (
    <div>
      <Logo page="home" />
      <Client
        aave={{ lend: aaveLend, stake: aaveStake }}
        spark={spark}
        venus={{ flux: venusFlux, lend: venusLend }}
        initialCollapsedTables={initialCollapsedTables}
      />
    </div>
  );
}
