import WPage from "./WPage";

export const dynamic = "force-dynamic";

async function App({ searchParams }) {
  const { addr, chain, w } = (await searchParams) ?? {};
  return <WPage walletType={chain} walletName={w} walletAddress={addr} />;
}

export default App;
