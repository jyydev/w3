import Logo from "@/components/Logo";
import "../ref.css";

const rpcRows = [
  [
    "Alchemy Portfolio",
    "When enabled and supported, wallet balances are loaded through Alchemy Portfolio before RPC fallback.",
  ],
  [
    "Batching",
    "The app batches up to two wallets with all needed Alchemy networks in one Portfolio request.",
  ],
  [
    "Alchemy fallback",
    "If the batched response cannot be safely split by network, the chain falls back to the older per-chain Alchemy request path.",
  ],
  [
    "RPC fallback",
    "Chains not covered by Alchemy Portfolio, or chains where Alchemy fails, use the configured RPC list.",
  ],
  [
    "RPC order",
    "RPC URLs are tried one at a time in the order listed in sets.js.",
  ],
  [
    "RPC failure",
    "If one RPC fails or times out, it is marked failed and the next RPC is tried immediately.",
  ],
  [
    "Cooldown",
    "A failed RPC is skipped for 60 seconds on later page loads or server renders. There is no background retry timer.",
  ],
  [
    "Timeout",
    "Wallet RPC startup checks use getBlockNumber with a timeout before moving to the next RPC.",
  ],
  [
    "Logging",
    "RPC failures are logged once per chain and RPC origin per 60 seconds, with only the domain shown.",
  ],
];

const rpcNotes = [
  "The ethers warning `JsonRpcProvider failed to detect network and cannot start up; retry in 1s` comes from ethers, not from an intentional app retry loop.",
  "The app passes known chain IDs into wallet RPC providers so ethers has less network-detection work to do.",
  "A page refresh is not triggered by wallet RPC failure itself. If refresh loops happen, check cookie, settings, or localStorage update paths.",
  "Alchemy RPC and Alchemy Portfolio are different paths. A chain can show RPC source while still using an Alchemy RPC URL.",
  "WEMIX and Kaia are expected to use RPC unless an Alchemy Portfolio network is configured and supported.",
];

const sourceRows = [
  ["alchemy", "Alchemy Portfolio supplied the chain balances."],
  ["rpc", "The chain used the normal RPC balance path."],
  ["api", "The chain uses a protocol API, such as Hyperliquid."],
];

function Section({ title, children }) {
  return (
    <section className="refSection">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Table({ rows }) {
  return (
    <table className="refTable">
      <tbody>
        {rows.map(([name, detail]) => (
          <tr key={name}>
            <th>{name}</th>
            <td>{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function List({ items }) {
  return (
    <ul className="refDashList">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

const pageMap = {
  rpc: {
    title: "RPC balance loading details",
    description:
      "How wallet balances choose between Alchemy Portfolio, protocol APIs, and normal RPC fallback.",
    body: (
      <>
        <Section title="balance source">
          <Table rows={sourceRows} />
        </Section>

        <Section title="rpc flow">
          <Table rows={rpcRows} />
        </Section>

        <Section title="notes">
          <List items={rpcNotes} />
        </Section>
      </>
    ),
  },
};

async function RefDetailPage({ params = {} }) {
  const resolvedParams = await params;
  const slug = Array.isArray(resolvedParams.page)
    ? resolvedParams.page.join("/")
    : "";
  const page = pageMap[slug];

  return (
    <div className="refPage">
      <Logo page="ref" />
      <nav className="refBreadcrumb">
        <a className="refLink" href="/ref">
          ref
        </a>
        <span>/</span>
        <span>{page?.title || slug || "not found"}</span>
      </nav>

      {page ? (
        <>
          <h1 className="refTitle">{page.title}</h1>
          {page.description && <p className="refIntro">{page.description}</p>}
          {page.body}
        </>
      ) : (
        <Section title="not found">
          <p>Unknown ref page.</p>
        </Section>
      )}
    </div>
  );
}

export default RefDetailPage;
