import Logo from "@/components/Logo";
import { List, Section, Table } from "../RefParts";
import "../ref.css";

const sourceRows = [
  [
    "external API",
    "Protocol or third-party HTTP/GraphQL endpoint. Can be cached in module memory when the data is small and stable.",
  ],
  [
    "local/static config",
    "Data defined in app code, sets.js, data/basic.js, data/coins, or data/editor. No external API request is needed.",
  ],
  [
    "on-chain RPC",
    "Contract calls through configured chain RPCs. This is used for live reserves, balances, metadata, and transaction validation.",
  ],
];

const lendRows = [
  [
    "Aave chains",
    "local/static config from aaveV3PoolM and chainIds. Not queried from an Aave API.",
  ],
  [
    "Aave markets",
    "on-chain RPC through Pool.getReservesList() and Pool.getReserveData().",
  ],
  [
    "Venus chains",
    "local/static config from venusBlocksPerYearM plus saved Venus markets in coinM. Not queried from a Venus API.",
  ],
  [
    "Venus markets",
    "on-chain RPC from saved vToken bootstrap data: vToken.comptroller(), then comptroller.getAllMarkets().",
  ],
  [
    "Morpho chains",
    "external Morpho GraphQL API. Listed vault chains are cached in server module memory for 1 day.",
  ],
  [
    "Morpho markets",
    "external Morpho GraphQL API for listed vaults and metadata, with RPC metadata fallback when available.",
  ],
  [
    "Jupiter Lend",
    "Jupiter API and Solana RPC are used for Solana lending market discovery and execution data.",
  ],
];

const yieldRows = [
  [
    "Spark markets",
    "local/static known market config plus on-chain RPC metadata. Savings-rate API is cached for 10 minutes.",
  ],
  [
    "Venus Flux markets",
    "Fluid API at api.fluid.instadapp.io plus local/on-chain merging.",
  ],
  [
    "Hyperliquid account/vault",
    "Hyperliquid public API for spot balances, vault equity, and actions.",
  ],
  [
    "Hyperliquid bridge routes",
    "HyperUnit API for deposit/withdraw route, fee, and ETA discovery.",
  ],
];

const swapRows = [
  ["Relay", "Relay.link API for supported routes, token discovery, quotes, and steps."],
  ["Jumper", "LiFi/Jumper API for supported chains, tokens, quotes, and transactions."],
  ["Across.to", "Across API for supported bridge chains/tokens and quote data."],
  ["Jupiter Swap", "Jupiter APIs for Solana token discovery, quotes, and swap transactions."],
  [
    "Uniswap",
    "local/static supported chain/token config plus on-chain/router execution paths. No general public token-list API is used here.",
  ],
];

const notes = [
  "Chain discovery and market discovery are separate. A protocol can use local chains but RPC-discovered markets.",
  "Aave and Venus Lend chain discovery is cheap because it is local/static.",
  "Morpho chain discovery is cached because it uses an external API and changes rarely.",
  "Market discovery that includes APR is usually kept fresher than chain discovery because APR changes.",
  "Runtime cache details are documented in /ref/cache.",
  "RPC and Alchemy balance-loading details are documented in /ref/rpc.",
];

function ApiRefPage() {
  return (
    <div className="refPage">
      <Logo page="ref" />
      <h1 className="refTitle">API and discovery sources</h1>
      <p className="refIntro">
        Which protocol selectors use external APIs, local/static config, or
        on-chain RPC calls.
      </p>

      <Section title="source types">
        <Table rows={sourceRows} />
      </Section>

      <Section title="lend">
        <Table rows={lendRows} />
      </Section>

      <Section title="yield">
        <Table rows={yieldRows} />
      </Section>

      <Section title="swap">
        <Table rows={swapRows} />
      </Section>

      <Section title="notes">
        <List items={notes} />
      </Section>
    </div>
  );
}

export default ApiRefPage;
