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

const cachedRows = [
  [
    "Morpho supported chains",
    "server module memory in app/t/_lend/morpho/sv.js; cached for 5 minutes.",
  ],
  [
    "Spark savings rates",
    "server module memory in app/t/_yield/spark/sv.js; cached for 10 minutes.",
  ],
  [
    "Swap protocol support",
    "client module memory in app/t/_swap/Client.js; cached by DEX while the client module stays loaded.",
  ],
  [
    "Swap token discovery",
    "client module memory in app/t/_swap/Client.js; cached by DEX, chain, and search term.",
  ],
  [
    "Hyperliquid bridge discovery",
    "client module memory in app/t/_yield/hyperliquid/Client.js; cached until retry or page/module reset.",
  ],
  [
    "Trade fallback prices",
    "client module memory in app/t/clientShared.js; cached by price key after first fallback price query.",
  ],
  [
    "Trade all-market lists",
    "component state in app/t/clientShared.js useTradeAllMarkets; cached by cacheKey while the panel stays mounted.",
  ],
  [
    "Trade direct market balances",
    "component state in app/t/clientShared.js useTradeDirectMarketBalance; cached by cacheKey while the panel stays mounted.",
  ],
];

const notCachedRows = [
  [
    "Alchemy Portfolio batch",
    "request scoped in app/w/walletData.js. It batches wallet/network tokens for one wallet page render but is not saved as module cache.",
  ],
  [
    "Alchemy token fetch",
    "uses cache: no-store, so browser/server HTTP cache is not used.",
  ],
  [
    "Normal RPC balances",
    "not cached as balances. RPC failures have a short cooldown/log suppression, but balances are fetched fresh.",
  ],
  [
    "Hyperliquid server API reads",
    "server fetches use no-store for live account, bridge, and vault data.",
  ],
  [
    "Venus Flux API reads",
    "server fetches use no-store for live protocol data.",
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
  "The wallet settings Etc tab can clear ALL, client, or server runtime cache.",
  "client clear affects the current browser tab's loaded client module caches.",
  "server clear calls server actions for warm module caches such as Morpho and Spark.",
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
        What the app caches in memory, what is fetched fresh, and what is
        persistent storage instead of cache.
      </p>

      <Section title="cache types">
        <Table rows={cacheTypeRows} />
      </Section>

      <Section title="cached">
        <Table rows={cachedRows} />
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
