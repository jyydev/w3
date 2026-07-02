import Logo from "@/components/Logo";
import "./ref.css";

const walletRoutes = [
  ["/w", "default EVM wallet view; loads all wallet JSON files"],
  ["/w/y", "load data/editor/wallets/evm/y.json, or y/ folder if selected"],
  ["/w/y/", "folder selection; loads all JSON files under y/"],
  ["/w?chain=solana", "Solana wallet view; uses data/editor/wallets/solana"],
  ["/w?w=NAME", "filter to one wallet name from the loaded wallet files"],
  ["/w?addr=ADDRESS", "load only one custom address"],
];

const walletDataFiles = [
  ["data/editor/wallets/evm", "EVM wallet JSON files and folders"],
  ["data/editor/wallets/solana", "Solana wallet JSON files and folders"],
  ["data/coins/CHAIN.js", "global tracked coin definitions"],
  ["data/editor/coins/CHAIN.json", "custom coin staging area from add coin"],
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
  ["Editor store globally", "append staged custom coins to data/coins/CHAIN.js and remove successful entries from JSON"],
  ["Address settings", "disable wallets by browser cookie or server offAddr.txt; delete wallet entries with confirmation"],
  ["Chain settings", "disable chains by browser cookie or server offChains.txt"],
  ["Coin settings", "click a chain name to disable coins by browser cookie or server offCoins/CHAIN.txt"],
];

const balanceNotes = [
  "EVM balances use ethers and multicall aggregate3.",
  "Native EVM balances use multicall getEthBalance.",
  "ERC-20 balances use balanceOf(address).",
  "Solana balances use @solana/web3.js and @solana/spl-token.",
  "Prices use DefiLlama first, DexScreener fallback, then RPC exchange-rate fallback for supported lending/yield tokens.",
  "Disabled server chains are skipped before RPC calls.",
  "Coins with no balance across wallets are hidden while the chain is collapsed.",
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
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

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

      <Section title="table">
        <List items={tableNotes} />
      </Section>

      <Section title="actions">
        <Table rows={actions} />
      </Section>

      <Section title="balances and prices">
        <List items={balanceNotes} />
      </Section>
    </div>
  );
}

export default Page;
