"use server";

import {
  confirmSolanaTransaction as confirmSolanaTransactionShared,
  getTradeCoinBalance as getTradeCoinBalanceShared,
  getTradeCoinPrice as getTradeCoinPriceShared,
  sendSolanaRawTransaction as sendSolanaRawTransactionShared,
} from "./sharedServer";

export async function getTradeCoinPrice(args) {
  return getTradeCoinPriceShared(args);
}

export async function getTradeCoinBalance(args) {
  return getTradeCoinBalanceShared(args);
}

export async function sendSolanaRawTransaction(args) {
  return sendSolanaRawTransactionShared(args);
}

export async function confirmSolanaTransaction(args) {
  return confirmSolanaTransactionShared(args);
}
