import WPage from "../w/WPage";
import TradePanels from "./TradePanels";

export const dynamic = "force-dynamic";

async function App({ searchParams }) {
  const { addr, chain, w } = (await searchParams) ?? {};

  return (
    <WPage
      routeBase="/t"
      walletType={chain}
      walletName={w}
      walletAddress={addr}
      afterWallet={<TradePanels />}
    />
  );
}

export default App;
