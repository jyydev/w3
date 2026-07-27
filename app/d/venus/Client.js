"use client";

import VenusFluxClient from "./flux/Client";
import VenusLendClient from "./lend/Client";

export default function VenusClient({ flux, lend }) {
  return (
    <>
      <VenusFluxClient
        {...flux}
        linkPath="/d/venus"
        titleHref="/d/venus/flux"
      />
      <VenusLendClient
        {...lend}
        linkPath="/d/venus"
        titleHref="/d/venus/lend"
      />
    </>
  );
}
