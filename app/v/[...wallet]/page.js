import WPage from "../WPage";

export const dynamic = "force-dynamic";

async function App({ params, searchParams }) {
  const { wallet = [] } = await params;
  const { addr, chain, w } = (await searchParams) ?? {};
  const walletFile = Array.isArray(wallet) ? wallet.join("/") : wallet;

  return (
    <WPage
      walletFile={walletFile}
      walletType={chain}
      walletName={w}
      walletAddress={addr}
    />
  );
}

export default App;
