"use client";

import AaveLendClient from "./lend/Client";
import AaveStakeClient from "./stake/Client";

export default function AaveClient({ lend, stake }) {
  return (
    <>
      <AaveStakeClient {...stake} linkPath="/d/aave" />
      <AaveLendClient {...lend} linkPath="/d/aave" />
    </>
  );
}
