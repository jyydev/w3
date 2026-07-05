"use client";

import {
  getInitialCookie,
  getKnownCoinPrice,
  getTradeModeCookie,
  sameAddress,
  TradePickerSortHeader,
  toggleTradePickerSort,
  walletBalancePatchEvent,
} from "../clientShared";

export { getInitialCookie, walletBalancePatchEvent };

export function getChainCoinCookie(base = "", walletType = "evm", chain = "") {
  return `${getTradeModeCookie(base, walletType)}_${chain}`;
}

export function PickerSortHeader({
  activeSort = "",
  setSort,
  sortKey = "",
  children,
}) {
  return (
    <TradePickerSortHeader
      activeSort={activeSort}
      sortKey={sortKey}
      onSort={() => toggleTradePickerSort(setSort, sortKey)}
    >
      {children}
    </TradePickerSortHeader>
  );
}

export function cycleWalletSelection(list = [], value = "", direction = "next") {
  if (!list.length) return "";
  const index = list.findIndex((entry) => entry.value == value);
  if (index < 0) {
    return direction == "prev"
      ? list[list.length - 1]?.value || ""
      : list[0]?.value || "";
  }
  const nextIndex =
    direction == "prev"
      ? (index - 1 + list.length) % list.length
      : (index + 1) % list.length;

  return list[nextIndex]?.value || "";
}

export function shortTail(address = "") {
  return address ? `..${String(address).slice(-3)}` : "";
}

export function getBalanceKey(
  selectedChain = "",
  selectedCoin = "",
  address = "",
) {
  if (!selectedChain || !selectedCoin || !address) return "";

  return `${selectedChain}:${selectedCoin}:${String(address).toLowerCase()}`;
}

export function findBalanceRow(chainEntry, walletEntry) {
  return chainEntry?.rows?.find(
    (entry) =>
      sameAddress(entry.address, walletEntry?.address) ||
      entry.name == walletEntry?.name,
  );
}

export function hasTableBalance(chainEntry, selectedCoin, walletEntry) {
  const row = findBalanceRow(chainEntry, walletEntry);
  const balance = row?.balances?.[selectedCoin];

  return !!(
    row?.balances &&
    Object.prototype.hasOwnProperty.call(row.balances, selectedCoin) &&
    balance?.balance !== undefined &&
    balance?.balance !== null
  );
}

export function getSendSelectedBalance(
  chainEntry,
  selectedCoin,
  walletEntry,
  fallbackBalanceM = {},
) {
  if (!chainEntry || !selectedCoin || !walletEntry) return {};

  const row = findBalanceRow(chainEntry, walletEntry);
  if (hasTableBalance(chainEntry, selectedCoin, walletEntry)) {
    const balance = row.balances[selectedCoin] || {};
    const price = getKnownCoinPrice(chainEntry, selectedCoin);
    return price > 0 && !(Number(balance.price) > 0)
      ? { ...balance, price }
      : balance;
  }

  const fallback =
    fallbackBalanceM[
      getBalanceKey(chainEntry.chain, selectedCoin, walletEntry.address)
    ] || {};
  if (fallback.balance !== undefined && fallback.balance !== null) return fallback;

  if (
    row?.balances &&
    Object.prototype.hasOwnProperty.call(chainEntry?.coinInfoM || {}, selectedCoin) &&
    !row.errors?.[selectedCoin]
  ) {
    return {
      balance: 0,
      price: getKnownCoinPrice(chainEntry, selectedCoin),
      usd: 0,
    };
  }

  return fallback;
}
