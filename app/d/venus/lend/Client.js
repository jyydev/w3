"use client";

import VenusMarketTable from "../MarketTable";

export default function VenusLendClient(props) {
  return (
    <VenusMarketTable
      {...props}
      linkPath={props.linkPath || "/d/venus/lend"}
      protocol="lend"
    />
  );
}
