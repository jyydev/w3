"use server";

import { getTradeCoinPrice as getTradeCoinPriceShared } from "../sharedServer";
import { getTradeCoinBalance as getTradeCoinBalanceShared } from "../sharedServer";

export async function getTradeCoinPrice(args) {
  return getTradeCoinPriceShared(args);
}

export async function getTradeCoinBalance(args) {
  return getTradeCoinBalanceShared(args);
}
