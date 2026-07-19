import Logo from "@/components/Logo";
import { List, Section, Table } from "../RefParts";
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
    "TronGrid",
    "Tron is a separate wallet type. Each wallet uses one TronGrid account API request for native TRX and configured TRC-20 balances; an optional rpc_key_trongrid raises request limits.",
  ],
  ["RPC order", "RPC URLs are tried one at a time in the order listed in sets.js."],
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

const extraRpcRows = [
  [
    "Aave Staking rewards",
    "If a wallet has a positive Aave Umbrella staking token balance, read the rewards controller for pending claimable rewards.",
  ],
  [
    "WEMIX staking",
    "If a wallet has native WEMIX, read WONDER 41 (WEMADE) staking balance and pending reward. Other WONDER pools are not included yet.",
  ],
];

const sourceRows = [
  ["alchemy", "Alchemy Portfolio supplied the chain balances."],
  ["rpc", "The chain used the normal RPC balance path."],
  ["api", "The chain uses a protocol API, such as Hyperliquid."],
  ["Tron api", "The Tron chain source is api because wallet balances come from TronGrid rather than the EVM RPC path."],
];

function RpcRefPage() {
  return (
    <div className="refPage">
      <Logo page="ref" />
      <h1 className="refTitle">RPC balance loading details</h1>
      <p className="refIntro">
        How wallet balances choose between Alchemy Portfolio, protocol APIs,
        and normal RPC fallback.
      </p>

      <Section title="balance source">
        <Table rows={sourceRows} />
      </Section>

      <Section title="rpc flow">
        <Table rows={rpcRows} />
      </Section>

      <Section title="extra rpc queries">
        <Table rows={extraRpcRows} />
      </Section>

      <Section title="notes">
        <List items={rpcNotes} />
      </Section>
    </div>
  );
}

export default RpcRefPage;
