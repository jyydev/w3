import Home from "@/components/Home";
import {
  homeCollapsedCookieM,
  homeSectionOrderCookie,
  homeWalletModeCookie,
  homeWalletFavsCookie,
  homeWalletOrderCookie,
  parseHomeCollapsedKeys,
  parseHomeSectionOrder,
  parseHomeWalletFavKeys,
  parseHomeWalletMode,
  parseHomeWalletOrder,
} from "@/components/homeNavigationState";
import { getNavigationTrees } from "@/components/navigationTreeServer";
import { favAddrCookie, parseFavAddrs } from "@/app/w/favAddrs";
import {
  getWalletHistoryCookie,
  parseWalletHistoryCookie,
} from "@/app/w/walletHistory";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function App() {
  const { walletNavTree, dataNavTree, refNavTree } = await getNavigationTrees();
  const cookieStore = await cookies();
  const initialCollapsedM = Object.fromEntries(
    Object.entries(homeCollapsedCookieM).map(([section, cookieName]) => [
      section,
      parseHomeCollapsedKeys(cookieStore.get(cookieName)?.value),
    ]),
  );
  const initialSectionOrder = parseHomeSectionOrder(
    cookieStore.get(homeSectionOrderCookie)?.value,
  );
  const favAddrs = parseFavAddrs(cookieStore.get(favAddrCookie)?.value);
  const walletHistoryM = Object.fromEntries(
    ["evm", "solana", "tron"].map((walletType) => [
      walletType,
      parseWalletHistoryCookie(
        cookieStore.get(getWalletHistoryCookie(walletType))?.value,
      ),
    ]),
  );
  const initialWalletMode = parseHomeWalletMode(
    cookieStore.get(homeWalletModeCookie)?.value,
  );
  const initialWalletOrderM = parseHomeWalletOrder(
    cookieStore.get(homeWalletOrderCookie)?.value,
  );
  const initialWalletFavKeys = parseHomeWalletFavKeys(
    cookieStore.get(homeWalletFavsCookie)?.value,
  );

  return (
    <main className="homePage">
      <Home
        walletTree={walletNavTree}
        dataTree={dataNavTree}
        refTree={refNavTree}
        initialCollapsedM={initialCollapsedM}
        initialSectionOrder={initialSectionOrder}
        favAddrs={favAddrs}
        walletHistoryM={walletHistoryM}
        initialWalletMode={initialWalletMode}
        initialWalletOrderM={initialWalletOrderM}
        initialWalletFavKeys={initialWalletFavKeys}
      />
    </main>
  );
}
