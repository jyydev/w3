import Logo from "@/components/Logo";
import { loadVenusLendingView } from "@/app/_shared/venus/view";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function VenusLendPage({ searchParams }) {
  const params = await searchParams;
  const view = await loadVenusLendingView(params?.chains);

  return (
    <div>
      <Logo page="home" />
      <Client {...view} />
    </div>
  );
}
