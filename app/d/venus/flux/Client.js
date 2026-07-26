"use client";

import VenusMarketTable from "../MarketTable";

export default function VenusFluxClient(props) {
  return (
    <VenusMarketTable
      {...props}
      linkPath={props.linkPath || "/d/venus/flux"}
      protocol="flux"
    />
  );
}
