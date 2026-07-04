import Logo from "@/components/Logo";
import { List, Section, Table } from "../RefParts";
import "../ref.css";

const cookieRows = [
  [
    "exact selections",
    "Cookies such as active chain, selected pane, selected protocol, selected chain, and selected coin decide what opens on load.",
  ],
  [
    "sorting cookies",
    "Order cookies only change option order. They do not override the exact selected-value cookies.",
  ],
  [
    "Wallet chain order",
    "chainSort remembers the last used Wallet chains and is capped at 10 chains.",
  ],
  [
    "Trade order",
    "Trade pane, protocol, chain, coin, market, and Hyperliquid mode order cookies are capped at 5 items.",
  ],
  [
    "encoding",
    "Simple order cookies use value|value. Grouped cookies use group:item,item|group:item,item.",
  ],
  [
    "localStorage",
    "Deployed editor data is stored in localStorage and is separate from browser cookies.",
  ],
];

const exactCookieRows = [
  ["Wallet", "activeChain, lastWallet_* and related wallet display preferences."],
  ["Swap", "selected DEX plus from/to chain and coin selections."],
  ["Lend", "selected DeFi, chain, and market."],
  [
    "Yield",
    "selected DeFi, chain, market, and Hyperliquid mode/chain/coin selections.",
  ],
  ["Send", "selected chain, coin, and destination wallet."],
  [
    "Trade panes",
    "left pane, right pane, right pane visibility, and current pane selection.",
  ],
];

const sortingCookieRows = [
  ["Wallet", "assetSort, rowSort, and chainSort. chainSort is capped at 10."],
  ["Trade pane", "w3_trade_pane_order, capped at 5."],
  [
    "Swap",
    "DEX order, per-DEX from/to chain order, and grouped from/to coin order, capped at 5.",
  ],
  [
    "Lend",
    "DeFi order, per-DeFi chain order, and grouped market order, capped at 5.",
  ],
  [
    "Yield",
    "Yield DeFi order, per-DeFi chain/market order, and Hyperliquid mode/chain/coin order, capped at 5.",
  ],
  ["Send", "chain order and grouped coin order, capped at 5."],
];

const cookieSettingRows = [
  ["clear cookies: ALL", "Deletes every visible browser cookie for the current site."],
  [
    "clear cookies: app",
    "Deletes cookies with the app prefix when ckPrefix is configured.",
  ],
  [
    "clear cookies: sorting",
    "Deletes Wallet sort cookies and Trade order cookies only.",
  ],
  [
    "clear data",
    "Deletes data/editor style data. Locally this is server project files; deployed mode uses localStorage editor data.",
  ],
  [
    "sorting: default/cookie",
    "Stores the preferred sorting mode setting. Cookie sorting state itself is still managed by the order cookies above.",
  ],
];

const cookieNotes = [
  "Exact selected-value cookies are intentionally separate from ordering cookies, so a saved selection can load even when it is not first in the order.",
  "Cycle buttons use the sorted option list but do not keep shrinking the list to only the cycled values.",
  "The sorting clear option is the replacement for the old chain-sorting hover-card delete action.",
  "Clearing cookies does not clear localStorage editor files. Use clear data for that.",
  "The login session uses the app-specific w3_login cookie.",
];

function CookieRefPage() {
  return (
    <div className="refPage">
      <Logo page="ref" />
      <h1 className="refTitle">Cookie and sorting details</h1>
      <p className="refIntro">
        How browser cookies remember selections, order selectors, and interact
        with settings.
      </p>

      <Section title="overview">
        <Table rows={cookieRows} />
      </Section>

      <Section title="selected values">
        <Table rows={exactCookieRows} />
      </Section>

      <Section title="sorting cookies">
        <Table rows={sortingCookieRows} />
      </Section>

      <Section title="settings">
        <Table rows={cookieSettingRows} />
      </Section>

      <Section title="notes">
        <List items={cookieNotes} />
      </Section>
    </div>
  );
}

export default CookieRefPage;
