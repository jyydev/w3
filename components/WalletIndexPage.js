import { cookies } from "next/headers";
import {
  favAddrCookie,
  parseFavAddrs,
} from "@/app/w/favAddrs";
import {
  homeCollapsedCookieM,
  homeWalletFavsCookie,
  homeWalletOrderCookie,
  homeNavigationHistoryCookie,
  parseHomeCollapsedKeys,
  parseHomeNavigationHistory,
  parseHomeWalletFavKeys,
  parseHomeWalletOrder,
} from "./homeNavigationState";
import { getWalletNavTree } from "./navigationTreeServer";
import WalletIndex from "./WalletIndex";

export default async function WalletIndexPage({
  routeBase = "/w",
  walletType = "",
}) {
  const [walletTree, cookieStore] = await Promise.all([
    getWalletNavTree(),
    cookies(),
  ]);

  return (
    <WalletIndex
      favAddrs={parseFavAddrs(cookieStore.get(favAddrCookie)?.value)}
      initialCollapsedKeys={parseHomeCollapsedKeys(
        cookieStore.get(homeCollapsedCookieM.wallet)?.value,
      )}
      initialFavoriteKeys={parseHomeWalletFavKeys(
        cookieStore.get(homeWalletFavsCookie)?.value,
      )}
      initialHistory={parseHomeNavigationHistory(
        cookieStore.get(homeNavigationHistoryCookie)?.value,
      )}
      initialOrderM={parseHomeWalletOrder(
        cookieStore.get(homeWalletOrderCookie)?.value,
      )}
      routeBase={routeBase}
      walletTree={walletTree}
      walletType={walletType}
    />
  );
}
