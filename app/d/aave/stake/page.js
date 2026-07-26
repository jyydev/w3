import Logo from "@/components/Logo";
import { loadAaveStakingView } from "@/app/_shared/aave/stakingView";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function AaveStakePage({ searchParams }) {
  const params = await searchParams;
  const view = await loadAaveStakingView(params?.chains);

  return (
    <div>
      <Logo page="home" />
      <Client {...view} />
    </div>
  );
}
