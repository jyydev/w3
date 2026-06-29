"use server";

import coinM from "@/fn/coinM";
import { rpcs, sets } from "@/sets";
import {
  getHyperliquidWalletBalances,
  getSolanaWalletBalances,
  getWalletBalances,
  getWalletType,
} from "./walletData";

function cleanEntry(entry = {}) {
  const name = String(entry.name || "").trim();
  const address = String(entry.address || "").trim();
  if (!name || !address) return null;

  return {
    name,
    address,
    source: String(entry.source || "").trim(),
    label: String(entry.label || entry.name || "").trim(),
  };
}

function cleanChainList(chains = []) {
  const available = new Set(Object.keys(coinM).filter((chain) => rpcs?.[chain]));
  available.add("Hyperliquid");
  return (Array.isArray(chains) ? chains : [])
    .map((chain) => String(chain || "").trim())
    .filter((chain) => available.has(chain));
}

export async function getLocalWalletBalanceData({
  walletType = "evm",
  walletEntries = [],
  chains = [],
  customCoinM = {},
  disabledCoinM = {},
  disabledWallets = [],
  disabledWalletNames = [],
  useAlchemy = null,
  alchemyMinUsd = 0.01,
} = {}) {
  const type = getWalletType(walletType);
  const entries = (Array.isArray(walletEntries) ? walletEntries : [])
    .map(cleanEntry)
    .filter(Boolean);

  if (!entries.length) return [];

  const defaultUseAlchemy = Number(sets?.useAlchemy) == 1;
  const useAlchemyValue = useAlchemy === null ? defaultUseAlchemy : !!useAlchemy;
  const minUsd = Math.max(0, Number(alchemyMinUsd ?? sets?.alchemyMinUsd ?? 0.01));

  if (type == "solana") {
    if (!rpcs?.Solana) return [];
    return [
      await getSolanaWalletBalances({
        walletEntryList: entries,
        customCoinM: customCoinM.Solana ?? {},
        disabledCoins: disabledCoinM.Solana ?? [],
        disabledWallets,
        disabledWalletNames,
        useAlchemy: useAlchemyValue,
        alchemyMinUsd: Number.isFinite(minUsd) ? minUsd : 0.01,
      }),
    ];
  }

  const chainList = cleanChainList(chains).filter((chain) => chain != "Solana");
  return await Promise.all(
    chainList.map((chain) =>
      chain == "Hyperliquid"
        ? getHyperliquidWalletBalances({
            walletType: type,
            walletEntryList: entries,
            customCoinM: customCoinM.Hyperliquid ?? {},
            disabledCoins: disabledCoinM.Hyperliquid ?? [],
            disabledWallets,
            disabledWalletNames,
          })
        : getWalletBalances({
            chain,
            walletType: type,
            walletEntryList: entries,
            customCoinM: customCoinM[chain] ?? {},
            disabledCoins: disabledCoinM[chain] ?? [],
            disabledWallets,
            disabledWalletNames,
            useAlchemy: useAlchemyValue,
            alchemyMinUsd: Number.isFinite(minUsd) ? minUsd : 0.01,
          }),
    ),
  );
}
