import Logo from "@/components/Logo";
import {
  loadVenusFluxView,
  loadVenusLendingView,
} from "@/app/_shared/venus/view";
import {
  dataTableCollapsedCookie,
  parseDataTableCollapsed,
} from "../tableCollapseState";
import { cookies } from "next/headers";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function VenusPage({ searchParams }) {
  const params = await searchParams;
  const chainsParam = params?.chains || "";
  const [cookieStore, flux, lend] = await Promise.all([
    cookies(),
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
        flux={flux}
        lend={lend}
        initialCollapsedTables={initialCollapsedTables}
      />
    </div>
  );
}
