import Logo from "@/components/Logo";
import { List, Section, Table } from "./RefParts";
import "./ref.css";

const walletRoutes = [
  ["/w", "default EVM wallet view; loads favorite wallet addresses"],
  ["/w/all", "load all EVM wallet JSON files"],
  ["/w/y", "load data/editor/wallets/evm/y.json, or y/ folder if selected"],
  ["/w/y/", "folder selection; loads all JSON files under y/"],
  ["/w?chain=solana", "Solana wallet view; uses data/editor/wallets/solana"],
  ["/w?w=NAME", "filter to one wallet name from the loaded wallet files"],
  ["/w?addr=ADDRESS", "load only one custom address"],
  ["/t", "wallet viewer plus the trade workspace"],
  ["/t/all", "trade workspace with all wallets"],
];

const walletDataFiles = [
  ["data/editor/wallets/evm", "EVM wallet JSON files and folders"],
  ["data/editor/wallets/solana", "Solana wallet JSON files and folders"],
  ["data/coins/CHAIN.js", "global tracked coin definitions"],
  ["data/editor/coins/CHAIN.json", "custom coin staging area from add coin"],
  ["data/defi/hyperliquid.js", "global Hyperliquid vault definitions"],
  ["data/editor/defi/hyperliquid.json", "custom Hyperliquid vault staging area"],
  ["data/editor/cookie/offChains.txt", "server-side disabled chains"],
  ["data/editor/cookie/offCoins/CHAIN.txt", "server-side disabled coins"],
  ["data/editor/cookie/offAddr.txt", "server-side disabled wallet names"],
];

const walletNotes = [
  "Wallet JSON files use an array of { wallet, address, ref } entries.",
  "The ref field is optional and editable from the address hover card.",
  "The all selection combines JSON files and excludes watch files/folders.",
  "A folder selection loads every JSON file under that folder.",
  "Switching EVM and Solana remembers the last wallet selection for each type.",
  "walletNotes in sets.js is shown in the address hover card and under expanded wallet names.",
];

const coinNotes = [
  "Coin files use an array of { coin, address, decimals, name, type, ref } entries.",
  "Common type values are stable, lend, yield, and vault.",
  "The optional ref field is for short notes such as 1:1, increasing qty, or DeFi: Morpho.",
  "Custom discovery coins are saved to data/editor/coins/CHAIN.json locally, or localStorage on deployed sites.",
];

const tableNotes = [
  "addr shows wallet name/address, DeBank or Solscan profile, scanner links, and copy controls.",
  "asset is the wallet total across visible chains.",
  "Each chain has a sum column followed by coin columns.",
  "The T row totals each chain and coin across all visible wallets.",
  "Click addr, asset, chain sum, or a coin header to sort rows.",
  "Chain groups are sorted by total chain value.",
  "Coin columns are sorted by T row USD value, then non-zero balance, then data/coins sequence.",
  "Collapsed chains show only the configured coin limit; expanding a chain shows all its coins and hides other chains.",
];

const actions = [
  ["Address input", "enter 0x or Solana address; URL becomes /w?addr=ADDRESS"],
  ["Add wallet", "toggle add controls, choose wallet file, enter name/address, then save to wallet JSON"],
  ["Add coin", "choose chain, enter token contract/mint, save metadata to data/editor/coins/CHAIN.json"],
  ["Add vault", "Hyperliquid vault discovery saves custom vault metadata to data/editor/defi/hyperliquid.json"],
  ["Editor store globally", "append staged custom coins to data/coins/CHAIN.js and remove successful entries from JSON"],
  ["Address settings", "disable wallets by browser cookie or server offAddr.txt; delete wallet entries with confirmation"],
  ["Chain settings", "disable chains by browser cookie or server offChains.txt"],
  ["Coin settings", "click a chain name to disable coins by browser cookie or server offCoins/CHAIN.txt"],
];

const balanceNotes = [
  "When Alchemy Portfolio is enabled and supports the chain, wallet balances use Alchemy instead of the normal per-token RPC balance loop.",
  "Chains not covered by Alchemy, such as WEMIX, still fall back to RPC and may stay loading longer if that RPC is laggy.",
  "EVM balances use ethers and multicall aggregate3.",
  "Native EVM balances use multicall getEthBalance.",
  "ERC-20 balances use balanceOf(address).",
  "Solana balances use @solana/web3.js and @solana/spl-token.",
  "Hyperliquid balances use public Hyperliquid API calls for spot balances and vault equity.",
  "Prices use DefiLlama first, DexScreener fallback, then RPC exchange-rate fallback for supported lending/yield tokens.",
  "Stablecoin price querying is optional in settings; when disabled, common USD stablecoins use $1 fallback pricing.",
  "Disabled server chains are skipped before RPC calls.",
  "Coins with no balance across wallets are hidden while the chain is collapsed.",
  "Runtime cache behavior is documented in /ref/cache.",
];

const tradePanels = [
  ["Swap", "Relay, Jumper, Across.to, Uniswap, and Jupiter where supported by chain type"],
  ["Send", "single-chain wallet-to-wallet transfers with address whitelist support for local private-key mode"],
  ["Lend", "Aave, Venus, Morpho, and Jupiter lending markets"],
  ["Yield", "Spark, Venus Flux, and Hyperliquid vault/spot flows"],
];

const tradeNotes = [
  "Trade panel, protocol, chain, coin, right-pane visibility, and approval preferences are remembered in cookies.",
  "Focusing or changing a Trade chain selection also opens the matching Wallet chain and saves that active chain cookie.",
  "Connected browser wallets sign in the extension; local private-key mode is intended only for npm run dev.",
  "Loop wallets can run the same action across selected wallets after confirmation.",
  "Transaction receipts are shown per wallet when looping.",
  "Protocol API and discovery sources are documented in /ref/api.",
];

const hyperliquidNotes = [
  "The Hyperliquid chain displays spot balances and vault positions as wallet table columns.",
  "Known vault names come from data/defi/hyperliquid.js and data/editor/defi/hyperliquid.json.",
  "Yield > Hyperliquid has vault deposit/withdraw plus spot deposit/withdraw modes.",
  "HyperUnit deposit and withdrawal discovery is normalized into chain and coin selectors, similar to Relay.",
];

const deployedNotes = [
  "Local development reads and writes data/editor files.",
  "Vercel and normal public domains use localStorage because project files are read-only at runtime.",
  "The localStorage structure mimics data/editor folders for wallets, coins, cookie files, and defi entries.",
  "localStorage data is per browser profile and domain, not shared across devices.",
  "Editor data storage details are documented in /ref/editor-data.",
];

const settingsNotes = [
  "The logo settings card controls Alchemy usage, Alchemy minimum USD filters, gas auto label display, and optional stablecoin USD price querying.",
  "Clear cookies removes browser cookie preferences such as panes, selections, favorites, and toggles.",
  "Clear data removes editable data under data/editor locally, or matching localStorage data remotely.",
  "Clear cache removes runtime memory cache for current client and/or warm server instance.",
  "Environment variable details are documented in /ref/env.",
  "Cookie and sorting details are documented in /ref/cookie.",
  "Login uses the app-specific w3_login cookie.",
];

function Page() {
  return (
    <div className="refPage">
      <Logo page="ref" />

      <Section title="wallet">
        <p>
          `/w` is the wallet viewer. It loads wallet addresses from
          `data/editor/wallets`, fetches balances by chain, prices assets, and
          shows totals in one sortable table.
        </p>
      </Section>

      <Section title="routes">
        <Table rows={walletRoutes} />
      </Section>

      <Section title="data files">
        <Table rows={walletDataFiles} />
      </Section>

      <Section title="wallet files">
        <List items={walletNotes} />
      </Section>

      <Section title="coin files">
        <List items={coinNotes} />
      </Section>

      <Section title="table">
        <List items={tableNotes} />
      </Section>

      <Section title="actions">
        <Table rows={actions} />
      </Section>

      <Section title="balances and prices">
        <p>
          <a className="refLink" href="/ref/rpc">
            RPC and Alchemy loading details
          </a>
        </p>
        <p>
          <a className="refLink" href="/ref/cache">
            Runtime cache details
          </a>
        </p>
        <List items={balanceNotes} />
      </Section>

      <Section title="trade">
        <p>
          <a className="refLink" href="/ref/api">
            API and discovery source details
          </a>
        </p>
        <Table rows={tradePanels} />
        <List items={tradeNotes} />
      </Section>

      <Section title="hyperliquid">
        <List items={hyperliquidNotes} />
      </Section>

      <Section title="deployed mode">
        <p>
          <a className="refLink" href="/ref/editor-data">
            Editor data storage details
          </a>
        </p>
        <List items={deployedNotes} />
      </Section>

      <Section title="settings">
        <p>
          <a className="refLink" href="/ref/env">
            Environment variable details
          </a>
        </p>
        <p>
          <a className="refLink" href="/ref/cookie">
            Cookie and sorting details
          </a>
        </p>
        <List items={settingsNotes} />
      </Section>
    </div>
  );
}

export default Page;
