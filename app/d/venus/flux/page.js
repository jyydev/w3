import Logo from "@/components/Logo";
import { loadVenusFluxView } from "@/app/_shared/venus/view";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function VenusFluxPage({ searchParams }) {
  const params = await searchParams;
  const view = await loadVenusFluxView(params?.chains);

  return (
    <div>
      <Logo page="home" />
      <Client {...view} />
    </div>
  );
}
