"use client";

import VenusFluxClient from "./flux/Client";
import VenusLendClient from "./lend/Client";

export default function VenusClient({
  flux,
  initialCollapsedTables = [],
  lend,
}) {
  const collapsedTables = new Set(initialCollapsedTables);

  return (
    <>
      <VenusFluxClient
        {...flux}
        initialCollapsed={collapsedTables.has("/d/venus/flux")}
        linkPath="/d/venus"
        titleHref="/d/venus/flux"
      />
      <VenusLendClient
        {...lend}
        initialCollapsed={collapsedTables.has("/d/venus/lend")}
        linkPath="/d/venus"
        titleHref="/d/venus/lend"
      />
    </>
  );
}
