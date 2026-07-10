import Logo from "@/components/Logo";
import { List, Section, Table } from "../RefParts";
import "../ref.css";

const cacheTypeRows = [
  [
    "server module memory",
    "A top-level variable in a server module. Shared by requests that hit the same warm Node/Next runtime instance.",
  ],
  [
    "client module memory",
    "A top-level variable in a client bundle. Lives in the current browser tab/session until reload or module reset.",
  ],
  [
    "component state",
    "React state cache inside one mounted page/panel. Cleared when the component unmounts or retry clears it.",
  ],
  [
    "request scoped",
    "Computed for one server render/action and passed down. Not reused as a long-lived cache.",
  ],
  [
    "no-store fetch",
    "Fetch calls marked cache: no-store. They deliberately avoid the Next/fetch HTTP cache.",
  ],
];

const serverCacheRows = [
  [
    "Discovery cache maps",
    "Server module memory registered through fn/discoveryCache.js. TTL is 1 hour and the shared global limit is 100 entries across wired server discovery maps.",
  ],
  [
    "Aave markets",
    "server discovery cache map in app/t/_lend/aave/sv.js; keyed by chain. One chain is one cache entry, regardless of how many markets it returns.",
  ],
  [
    "Venus markets",
    "server discovery cache map in app/t/_lend/venus/sv.js; keyed by chain.",
  ],
  [
    "Morpho markets",
    "server discovery cache map in app/t/_lend/morpho/sv.js; keyed by chain.",
  ],
  [
    "Jupiter Lend markets",
    "server discovery cache map in app/t/_lend/jupiter/sv.js; keyed by chain.",
  ],
  [
    "Aave Staking markets",
    "server discovery cache map in app/t/_yield/aaveStaking/sv.js; keyed by chain.",
  ],
  [
    "Spark markets",
    "server discovery cache map in app/t/_yield/spark/sv.js; keyed by chain. Spark savings-rate data is also cached server-side for 10 minutes.",
  ],
  [
    "Venus Flux markets",
    "server discovery cache map in app/t/_yield/venusFlux/sv.js; keyed by chain.",
  ],
  [
    "Relay/Jumper/Across discovery",
    "server discovery cache maps for supported chains and default token lists. Search-term token discovery is client cache only.",
  ],
  [
    "Jupiter Swap default tokens",
    "server discovery cache map for the default Solana token list. Search-term token discovery is client cache only.",
  ],
  [
    "Morpho supported chains",
    "single server module cache in app/t/_lend/morpho/sv.js; cached for 1 hour. It is one value, so it is not part of the 100-entry map limit.",
  ],
  [
    "Hyperliquid bridge discovery",
    "single server module cache in app/t/_yield/hyperliquid/sv.js; cached for 1 hour.",
  ],
];

const clientCacheRows = [
  [
    "Wallet balance rows",
    "client module memory in app/w/walletBalanceClientCache.js; cached by wallet type and wallet address, with chain balances nested under that address while the browser tab stays loaded. A browser refresh clears it.",
  ],
  [
    "Trade all-market lists",
    "client module memory in app/t/clientShared.js; keeps a browser-tab copy of fetched market lists by cacheKey for 1 hour. Server-cached protocols still return server cache metadata.",
  ],
  [
    "Swap protocol support",
    "client module memory in app/t/_swap/Client.js; cached by DEX for 1 hour while the client module stays loaded.",
  ],
  [
    "Swap token discovery",
    "client module memory in app/t/_swap/Client.js and app/t/_swap/Swap.js; cached by DEX, chain, and search term for 1 hour.",
  ],
  [
    "Hyperliquid bridge discovery",
    "client module memory in app/t/_yield/hyperliquid/Client.js; caches the bridge discovery wrapper for 1 hour.",
  ],
  [
    "Trade fallback prices",
    "client module memory in app/t/clientShared.js; cached by price key after the first fallback price query until clear/reload.",
  ],
];

const temporaryRows = [
  [
    "Wallet balances",
    "held in page/component state after load so the UI can render them, but not saved as shared server runtime cache.",
  ],
  [
    "Trade direct market balances",
    "component state in app/t/clientShared.js useTradeDirectMarketBalance; cached by cacheKey only while the panel stays mounted.",
  ],
  [
    "Alchemy Portfolio batch",
    "request scoped in app/w/walletData.js. It batches wallet/network tokens for one wallet page render but is not saved as module cache.",
  ],
];

const notCachedRows = [
  [
    "Alchemy token fetch",
    "uses cache: no-store, so browser/server HTTP cache is not used.",
  ],
  [
    "Normal RPC balances",
    "not cached as balances. RPC failures have a short cooldown/log suppression, but balances are fetched fresh.",
  ],
  [
    "Transaction previews",
    "not saved in server runtime cache. Preview actions may remain in component/client state while the current panel stays mounted, but submit-time checks are fresh.",
  ],
  [
    "Transaction execution",
    "not cached. Swap, lend, yield, send, approve, claim, and staking execution paths run fresh.",
  ],
  [
    "Live account/API reads",
    "Hyperliquid account, vault, wallet balance, and similar live reads are fetched fresh unless listed above as discovery/rate cache.",
  ],
  [
    "Cookies",
    "persistent browser preferences. They are storage, not runtime cache.",
  ],
  [
    "localStorage editor data",
    "persistent deployed editor data. It mimics data/editor files and is not runtime cache.",
  ],
  [
    "data/editor files",
    "local project files. They are editable storage, not cache.",
  ],
];

const cacheNotes = [
  "Module memory cache is created by declaring a variable at the top level of a module, outside the exported function.",
  "The cache key names and object fields are normal JavaScript. A key named at is only a timestamp convention, not special behavior.",
  "The server discovery cache map limit is global across registered server discovery maps, not per protocol.",
  "The global limit counts cache entries such as Aave Ethereum or Relay support. It does not count each market/token inside one cached result.",
  "When the global server discovery cache exceeds 100 entries, expired entries are removed first, then the oldest remaining entries are removed.",
  "The wallet settings Etc tab can clear ALL, client, or server runtime cache.",
  "client clear affects the current browser tab's loaded client module caches, including wallet balance rows.",
  "server clear calls server actions for warm module caches such as Aave, Venus, Morpho, Aave Staking, Spark, Relay, Jumper, Across, Jupiter, Venus Flux, and Hyperliquid discovery.",
  "Local npm run dev cache resets on server restart and may reset on hot reload.",
  "On Vercel, memory cache is per warm runtime instance. Cold starts, different instances, and deployments start empty.",
  "Runtime cache should be treated as a speed helper. It must be safe for the app to refetch when empty.",
  "Use retry buttons to clear relevant client-side discovery caches where the UI exposes retry.",
];

function CacheRefPage() {
  return (
    <div className="refPage">
      <Logo page="ref" />
      <h1 className="refTitle">Runtime cache</h1>
      <p className="refIntro">
        What the app caches in server memory, what it caches in the browser
        tab, what is temporary state, and what is fetched fresh.
      </p>

      <Section title="cache types">
        <Table rows={cacheTypeRows} />
      </Section>

      <Section title="server cache">
        <Table rows={serverCacheRows} />
      </Section>

      <Section title="client cache">
        <Table rows={clientCacheRows} />
      </Section>

      <Section title="temporary state">
        <Table rows={temporaryRows} />
      </Section>

      <Section title="not cached">
        <Table rows={notCachedRows} />
      </Section>

      <Section title="notes">
        <List items={cacheNotes} />
      </Section>
    </div>
  );
}

export default CacheRefPage;
