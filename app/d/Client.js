"use client";

import AaveClient from "./aave/Client";
import SparkClient from "./spark/Client";
import VenusClient from "./venus/Client";

export default function DataClient({ aave, spark, venus }) {
  return (
    <>
      <AaveClient {...aave} />
      <SparkClient
        {...spark}
        linkPath="/d/spark"
        titleHref="/d/spark"
      />
      <VenusClient {...venus} />
    </>
  );
}
