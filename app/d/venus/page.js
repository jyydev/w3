import Logo from "@/components/Logo";
import {
  loadVenusFluxView,
  loadVenusLendingView,
} from "@/app/_shared/venus/view";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function VenusPage({ searchParams }) {
  const params = await searchParams;
  const chainsParam = params?.chains || "";
  const [flux, lend] = await Promise.all([
    loadVenusFluxView(chainsParam),
    loadVenusLendingView(chainsParam),
  ]);

  return (
    <div>
      <Logo page="home" />
      <Client flux={flux} lend={lend} />
    </div>
  );
}
