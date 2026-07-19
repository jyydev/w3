"use server";

import {
  confirmSolanaTransaction as confirmSolanaTransactionShared,
  confirmTronTransaction as confirmTronTransactionShared,
  getTradeCoinBalance as getTradeCoinBalanceShared,
  getTradeCoinPrice as getTradeCoinPriceShared,
  refreshBrowserTronTransaction as refreshBrowserTronTransactionShared,
  sendSolanaRawTransaction as sendSolanaRawTransactionShared,
  sendTronRawTransaction as sendTronRawTransactionShared,
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

export async function confirmTronTransaction(args) {
  return confirmTronTransactionShared(args);
}

export async function sendTronRawTransaction(args) {
  return sendTronRawTransactionShared(args);
}

export async function refreshBrowserTronTransaction(args) {
  return refreshBrowserTronTransactionShared(args);
}
