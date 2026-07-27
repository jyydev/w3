import Logo from "@/components/Logo";
import { loadAaveLendingView } from "@/app/_shared/aave/lending";
import { loadAaveStakingView } from "@/app/_shared/aave/stakingView";
import {
  dataTableCollapsedCookie,
  parseDataTableCollapsed,
} from "../tableCollapseState";
import { cookies } from "next/headers";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function AavePage({ searchParams }) {
  const params = await searchParams;
  const chainsParam = params?.chains || "";
  const [cookieStore, stake, lend] = await Promise.all([
    cookies(),
    loadAaveStakingView(chainsParam),
    loadAaveLendingView(chainsParam),
  ]);
  const initialCollapsedTables = parseDataTableCollapsed(
    cookieStore.get(dataTableCollapsedCookie)?.value,
  );

  return (
    <div>
      <Logo page="home" />
      <Client
        lend={lend}
        stake={stake}
        initialCollapsedTables={initialCollapsedTables}
      />
    </div>
  );
}
