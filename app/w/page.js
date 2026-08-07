import WPage from "./WPage";
import WalletIndexPage from "@/components/WalletIndexPage";

export const dynamic = "force-dynamic";

async function App({ searchParams }) {
  const { addr, chain, w } = (await searchParams) ?? {};
  const selectedAddress = Array.isArray(addr) ? addr[0] : addr;
  const selectedWalletName = Array.isArray(w) ? w[0] : w;

  if (!selectedAddress && !selectedWalletName) {
    return <WalletIndexPage walletType={chain} />;
  }

  return <WPage walletType={chain} walletName={w} walletAddress={addr} />;
}

export default App;
