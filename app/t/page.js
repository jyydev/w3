import WPage from "../w/WPage";
import Panels from "./Panels";
import WalletIndexPage from "@/components/WalletIndexPage";

export const dynamic = "force-dynamic";

async function App({ searchParams }) {
  const { addr, chain, w } = (await searchParams) ?? {};
  const selectedAddress = Array.isArray(addr) ? addr[0] : addr;
  const selectedWalletName = Array.isArray(w) ? w[0] : w;

  if (!selectedAddress && !selectedWalletName) {
    return <WalletIndexPage routeBase="/t" walletType={chain} />;
  }

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
