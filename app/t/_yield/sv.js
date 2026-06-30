"use server";

import { getTradeCoinPrice as getTradeCoinPriceShared } from "../sharedServer";

export async function getTradeCoinPrice(args) {
  return getTradeCoinPriceShared(args);
}
