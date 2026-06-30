import WPage from "../w/WPage";
import Panels from "./Panels";

export const dynamic = "force-dynamic";

async function App({ searchParams }) {
  const { addr, chain, w } = (await searchParams) ?? {};

  return (
    <WPage
      routeBase="/t"
      walletType={chain}
      walletName={w}
      walletAddress={addr}
      afterWallet={<Panels />}
    />
  );
}

export default App;
