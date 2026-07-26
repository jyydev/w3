import Logo from "@/components/Logo";
import { loadAaveLendingView } from "@/app/_shared/aave/lending";
import { loadAaveStakingView } from "@/app/_shared/aave/stakingView";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function AavePage({ searchParams }) {
  const params = await searchParams;
  const chainsParam = params?.chains || "";
  const [stake, lend] = await Promise.all([
    loadAaveStakingView(chainsParam),
    loadAaveLendingView(chainsParam),
  ]);

  return (
    <div>
      <Logo page="home" />
      <Client lend={lend} stake={stake} />
    </div>
  );
}
