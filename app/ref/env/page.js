import Logo from "@/components/Logo";
import { List, Section, Table } from "../RefParts";
import "../ref.css";

const coreRows = [
  [
    "login",
    "Comma-separated login passwords. Also signs the w3_login session cookie.",
  ],
  [
    "rpc_key_alchemy",
    "Alchemy API key for Alchemy RPC URLs and Portfolio balance requests, including Solana.",
  ],
  [
    "W3_DISABLE_FILE_WRITES",
    "Set to any value to block server project-file writes and force blocked-write responses.",
  ],
  [
    "VERCEL",
    "Provided by Vercel automatically. Also blocks project-file writes.",
  ],
  [
    "NODE_ENV",
    "Provided by Next/Node. Production login cookies use secure mode.",
  ],
];

const swapApiRows = [
  ["RELAY_API_KEY", "Optional Relay.link API key."],
  [
    "ACROSS_API_KEY",
    "Across.to API key. Required for Across requests that need authorization.",
  ],
  [
    "ACROSS_INTEGRATOR_ID",
    "Optional Across integrator id. Defaults to 0xdead when unset.",
  ],
  ["LIFI_API_KEY", "Optional Jumper/LiFi API key."],
  ["LIFI_INTEGRATOR", "Optional Jumper/LiFi integrator label."],
  ["LIFI_API_BASE", "Optional Jumper/LiFi API base URL override."],
  ["JUPITER_API_KEY", "Optional Jupiter API key."],
  ["JUPITER_API_BASE", "Optional Jupiter swap API base URL override."],
  ["JUPITER_TOKEN_API_BASE", "Optional Jupiter token API base URL override."],
];

const protocolApiRows = [
  ["MORPHO_API_BASE", "Optional Morpho API base URL override."],
  ["HYPERLIQUID_API_BASE", "Optional Hyperliquid API base URL override."],
];

const privateKeyRows = [
  [
    "pk_walletName",
    "Optional EVM private key for local/server private-key mode. The walletName must match the wallet entry name.",
  ],
  [
    "pk_sol_walletName",
    "Optional Solana private key for local/server private-key mode. Accepts supported secret-key formats.",
  ],
  [
    "encoding",
    "Stored private-key values are decoded by swapping the 4th and 6th characters back before use.",
  ],
  [
    "scope",
    "Private keys are server-only env values. Do not put them in NEXT_PUBLIC variables or checked-in files.",
  ],
];

const setConfigRows = [
  [
    "onWhitelist",
    "Local set.js boolean. When true, private-key sends and bridge swaps can only send to whitelisted recipient addresses.",
  ],
  [
    "whitelists",
    "Local set.js array of allowed EVM or Solana addresses used when onWhitelist is true.",
  ],
  [
    "connected wallet",
    "Connected browser-wallet transactions are not restricted by the local private-key whitelist setting.",
  ],
  [
    "matching",
    "EVM addresses are checksum-normalized; Solana addresses are normalized to base58 before comparison.",
  ],
];

const coinRows = [
  ["w3Coins", "Optional JSON object merged into coin metadata at runtime."],
  [
    "w3_SYMBOL",
    "Any env var matching w3_<name> with an EVM address adds a simple 18-decimal token entry named <NAME>.",
  ],
];

const localConfigRows = [
  [
    ".env.local",
    "Local-only secrets and API keys. This should stay ignored and should not be committed.",
  ],
  [
    "set.js",
    "Local-only app configuration override for sets.js. Vercel does not have access to it unless you commit it.",
  ],
  [
    "sets.js",
    "Default public app configuration such as chains, RPC lists, protocol options, and scanners.",
  ],
];

const notes = [
  "Use uppercase env names shown here. Some protocol files also accept lowercase aliases for API compatibility.",
  "Do not expose secrets with NEXT_PUBLIC_ unless the value is intended for every browser user.",
  "Private-key mode is intended for local npm run dev or trusted server usage only.",
  "Connected browser wallets do not need pk_ env variables.",
  "For deployed sites, configure env variables in the Vercel project settings.",
  'rpc_key_alchemy_solana is not needed; Solana uses rpc_key_alchemy with alchemyRpc("solana-mainnet").',
];

function EnvRefPage() {
  return (
    <div className="refPage">
      <Logo page="ref" />
      <h1 className="refTitle">Environment variables</h1>
      <p className="refIntro">
        Server-side settings, API keys, private-key naming, and local config
        files used by the app.
      </p>

      <Section title="core">
        <Table rows={coreRows} />
      </Section>

      <Section title="swap api">
        <Table rows={swapApiRows} />
      </Section>

      <Section title="protocol api">
        <Table rows={protocolApiRows} />
      </Section>

      <Section title="private keys">
        <Table rows={privateKeyRows} />
      </Section>

      <Section title="set.js whitelist">
        <Table rows={setConfigRows} />
      </Section>

      <Section title="coin metadata">
        <Table rows={coinRows} />
      </Section>

      <Section title="local config files">
        <Table rows={localConfigRows} />
      </Section>

      <Section title="notes">
        <List items={notes} />
      </Section>
    </div>
  );
}

export default EnvRefPage;
