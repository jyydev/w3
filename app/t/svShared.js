"use server";

import { getCleanErrorMessage } from "@/app/_fn/shared";
import {
  confirmSolanaTransaction as confirmSolanaTransactionShared,
  confirmTronTransaction as confirmTronTransactionShared,
  getTradeCoinBalance as getTradeCoinBalanceShared,
  getTradeCoinPrice as getTradeCoinPriceShared,
  refreshBrowserTronTransaction as refreshBrowserTronTransactionShared,
  sendSolanaRawTransaction as sendSolanaRawTransactionShared,
  sendTronRawTransaction as sendTronRawTransactionShared,
} from "./sharedServer";

async function runBrowserAction(action, fallback) {
  try {
    return await action();
  } catch (error) {
    const message = getCleanErrorMessage(error, fallback);
    console.error(`[${fallback}]`, error);

    return {
      __w3ActionError: true,
      error: message || fallback,
    };
  }
}

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
  return runBrowserAction(
    () => confirmTronTransactionShared(args),
    "Tron confirmation failed",
  );
}

export async function sendTronRawTransaction(args) {
  return runBrowserAction(
    () => sendTronRawTransactionShared(args),
    "Tron broadcast failed",
  );
}

export async function refreshBrowserTronTransaction(args) {
  return runBrowserAction(
    () => refreshBrowserTronTransactionShared(args),
    "Tron transaction refresh failed",
  );
}
