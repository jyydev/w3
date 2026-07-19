import Logo from "@/components/Logo";
import { List, Section, Table } from "../RefParts";
import "../ref.css";

const slippageRows = [
  [
    "Uniswap",
    "Fixed at 0.5% (50 basis points). The transaction uses 99.5% of the quoted output as amountOutMinimum.",
  ],
  [
    "SUN",
    "Fixed at 0.5% (50 basis points). The SUN Smart Router transaction includes the calculated amountOutMin.",
  ],
  [
    "Jumper",
    "Fixed at 0.5%. The LiFi quote returns toAmountMin as the minimum protected output.",
  ],
  [
    "Jupiter",
    "The quote starts at 0.5%, then the swap request enables Jupiter dynamic slippage. Jupiter can adjust the final threshold, and the transaction uses its otherAmountThreshold minimum output.",
  ],
  [
    "Relay",
    "Automatic. The app does not send slippageTolerance, so Relay calculates it for the route and returns protected transaction steps.",
  ],
  [
    "Across.to",
    "Automatic. The app sends slippage=auto, and the Across quote returns minOutputAmount for the route.",
  ],
];

const protectionRows = [
  [
    "Fixed slippage",
    "Uniswap, SUN, and Jumper currently enforce a numeric 0.5% tolerance selected by this app.",
  ],
  [
    "Provider-managed slippage",
    "Relay, Across.to, and Jupiter dynamic mode choose the final tolerance. The app does not add a separate numeric maximum around their generated transaction.",
  ],
  [
    "Minimum output",
    "Swap transactions or provider quotes include a minimum accepted output. If execution cannot satisfy it, the swap should revert, fail, or follow the provider's cross-chain refund behavior.",
  ],
  [
    "Exact input",
    "The current swap flow starts from the selected sell quantity and quotes the expected buy quantity.",
  ],
  [
    "User setting",
    "There is currently no shared user-adjustable slippage control in the Trade panel.",
  ],
];

const notes = [
  "Slippage tolerance limits movement after the quote; it does not remove normal protocol, bridge, gas, or liquidity-provider fees.",
  "Price impact is the effect of the trade size on the quoted market price and is separate from slippage tolerance.",
  "Provider quotes can expire. Transaction previews and execution data are fetched fresh rather than stored in the discovery cache.",
  "Automatic slippage is not unlimited, but its numeric limit is chosen by the provider instead of this app.",
];

function SwapRefPage() {
  return (
    <div className="refPage">
      <Logo page="ref" />
      <h1 className="refTitle">Swap execution</h1>
      <p className="refIntro">
        Current slippage limits and minimum-output protection used by each Swap
        provider.
      </p>

      <Section title="slippage">
        <Table rows={slippageRows} />
      </Section>

      <Section title="protection">
        <Table rows={protectionRows} />
      </Section>

      <Section title="notes">
        <List items={notes} />
      </Section>
    </div>
  );
}

export default SwapRefPage;
