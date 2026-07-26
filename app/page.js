import Logo from "@/components/Logo";
import Home from "@/components/Home";
import {
  homeCollapsedCookieM,
  homeWalletModeCookie,
  homeWalletFavsCookie,
  homeWalletOrderCookie,
  homeWalletSortModeCookie,
  parseHomeCollapsedKeys,
  parseHomeWalletFavKeys,
  parseHomeWalletMode,
  parseHomeWalletOrder,
  parseHomeWalletSortMode,
} from "@/components/homeNavigationState";
import { getNavigationTrees } from "@/components/navigationTreeServer";
import {
  favAddrCookie,
  parseFavAddrs,
} from "@/app/w/favAddrs";
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
  const favAddrs = parseFavAddrs(cookieStore.get(favAddrCookie)?.value);
  const walletHistoryM = Object.fromEntries(
    ["evm", "solana", "tron"].map((walletType) => [
      walletType,
      parseWalletHistoryCookie(
        cookieStore.get(getWalletHistoryCookie(walletType))?.value,
      ),
    ]),
  );
  const initialWalletSortMode = parseHomeWalletSortMode(
    cookieStore.get(homeWalletSortModeCookie)?.value,
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
      <Logo page="Home" />
      <Home
        walletTree={walletNavTree}
        dataTree={dataNavTree}
        refTree={refNavTree}
        initialCollapsedM={initialCollapsedM}
        favAddrs={favAddrs}
        walletHistoryM={walletHistoryM}
        initialWalletMode={initialWalletMode}
        initialWalletSortMode={initialWalletSortMode}
        initialWalletOrderM={initialWalletOrderM}
        initialWalletFavKeys={initialWalletFavKeys}
      />
    </main>
  );
}
