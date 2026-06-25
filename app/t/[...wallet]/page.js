import WPage from "../../w/WPage";
import TradePanels from "../TradePanels";

export const dynamic = "force-dynamic";

async function App({ params, searchParams }) {
  const { wallet = [] } = await params;
  const { addr, chain, w } = (await searchParams) ?? {};
  const walletFile = Array.isArray(wallet) ? wallet.join("/") : wallet;

  return (
    <WPage
      routeBase="/t"
      walletFile={walletFile}
      walletType={chain}
      walletName={w}
      walletAddress={addr}
      afterWallet={<TradePanels />}
    />
  );
}

export default App;
