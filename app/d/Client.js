"use client";

import AaveClient from "./aave/Client";
import SparkClient from "./spark/Client";
import VenusClient from "./venus/Client";

export default function DataClient({
  aave,
  initialCollapsedTables = [],
  spark,
  venus,
}) {
  const collapsedTables = new Set(initialCollapsedTables);

  return (
    <>
      <AaveClient
        {...aave}
        initialCollapsedTables={initialCollapsedTables}
      />
      <SparkClient
        {...spark}
        initialCollapsed={collapsedTables.has("/d/spark")}
        linkPath="/d/spark"
        titleHref="/d/spark"
      />
      <VenusClient
        {...venus}
        initialCollapsedTables={initialCollapsedTables}
      />
    </>
  );
}
