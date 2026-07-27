"use client";

import AaveLendClient from "./lend/Client";
import AaveStakeClient from "./stake/Client";

export default function AaveClient({
  initialCollapsedTables = [],
  lend,
  stake,
}) {
  const collapsedTables = new Set(initialCollapsedTables);

  return (
    <>
      <AaveStakeClient
        {...stake}
        initialCollapsed={collapsedTables.has("/d/aave/stake")}
        linkPath="/d/aave"
        titleHref="/d/aave/stake"
      />
      <AaveLendClient
        {...lend}
        initialCollapsed={collapsedTables.has("/d/aave/lend")}
        linkPath="/d/aave"
        titleHref="/d/aave/lend"
      />
    </>
  );
}
