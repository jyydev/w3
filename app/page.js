import { cookies } from "next/headers";
import Home from "@/components/Home";
import {
  homeNavigationCollapsedCookie,
  homeNavigationFavsCookie,
  homeNavigationHistoryCookie,
  homeNavigationOrderCookie,
  homeWalletModeCookie,
  parseHomeCollapsedKeys,
  parseHomeNavigationHistory,
  parseHomeWalletFavKeys,
  parseHomeWalletMode,
  parseHomeWalletOrder,
} from "@/components/homeNavigationState";
import { getNavigationTrees } from "@/components/navigationTreeServer";

export const dynamic = "force-dynamic";

export default async function App() {
  const [
    {
      walletNavTree,
      dataNavTree,
      refNavTree,
      editorFiles,
      editorEmptyFolders,
    },
    cookieStore,
  ] = await Promise.all([getNavigationTrees(), cookies()]);

  return (
    <main className="homePage">
      <Home
        walletTree={walletNavTree}
        dataTree={dataNavTree}
        refTree={refNavTree}
        editorFiles={editorFiles}
        editorEmptyFolders={editorEmptyFolders}
        initialCollapsedKeys={parseHomeCollapsedKeys(
          cookieStore.get(homeNavigationCollapsedCookie)?.value,
        )}
        initialOrderM={parseHomeWalletOrder(
          cookieStore.get(homeNavigationOrderCookie)?.value,
        )}
        initialFavoriteKeys={parseHomeWalletFavKeys(
          cookieStore.get(homeNavigationFavsCookie)?.value,
        )}
        initialHistory={parseHomeNavigationHistory(
          cookieStore.get(homeNavigationHistoryCookie)?.value,
        )}
        initialWalletMode={parseHomeWalletMode(
          cookieStore.get(homeWalletModeCookie)?.value,
        )}
      />
    </main>
  );
}
