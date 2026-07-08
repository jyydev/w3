"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { pc } from "@/fn/basic";
import { getHyperliquidSpotBridgeDiscovery } from "./sv";
import {
  emitTradeChainSelect,
  getChainCoins,
  getInitialCookie,
  getTradeModeCookie,
  TradeSelectionPicker,
} from "../../clientShared";

const hyperliquidBridgeCoinM = {
  Arbitrum: new Set(["USDC"]),
};

export const emptyHyperliquidBridgeE = {
  deposit: { chains: [], tokens: [] },
  withdraw: { chains: [], tokens: [] },
  loading: false,
  loaded: false,
  error: "",
};
let hyperliquidBridgeCache = null;
let hyperliquidBridgePromise = null;

export function clearHyperliquidClientRuntimeCache() {
  hyperliquidBridgeCache = null;
  hyperliquidBridgePromise = null;
}

export function isHyperliquidCoin(_coin = "", coinE = {}) {
  return coinE.type == "vault";
}

export function isHyperliquidChainAvailable(chain = "", chainMarkets = []) {
  return chain == "Hyperliquid" && !!chainMarkets.length;
}

function getHyperliquidProtocolCookie(base = "", walletType = "evm") {
  return [getTradeModeCookie(base, walletType), "hyperliquid"]
    .filter(Boolean)
    .join("_");
}

export function getInitialHyperliquidMode(
  initialCookieM = {},
  walletType = "evm",
  base = "",
) {
  const value = getInitialCookie(
    initialCookieM,
    getHyperliquidProtocolCookie(base, walletType),
  );

  return value == "deposit" ? "deposit" : "vault";
}

export function getInitialHyperliquidRouteCookie(
  initialCookieM = {},
  walletType = "evm",
  base = "",
) {
  return (
    getInitialCookie(
      initialCookieM,
      getHyperliquidProtocolCookie(base, walletType),
    ) || ""
  );
}

export function getHyperliquidAgentCookie(
  walletAddress = "",
  agentAddress = "",
) {
  const walletKey = String(walletAddress || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const agentKey = String(agentAddress || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return `w3_hl_agent_${walletKey}_${agentKey}`;
}

function NoopBalance() {
  return null;
}

function getBalanceQty(balance = {}) {
  return Object.prototype.hasOwnProperty.call(balance || {}, "balance")
    ? Number(balance?.balance || 0) || 0
    : -1;
}

export function getHyperliquidRouteText(tokenE = {}) {
  if (!tokenE) return "";
  const parts = [];
  const routeE = tokenE.actionSupported
    ? tokenE.routes?.find(
        (entry) => entry.label == tokenE.chain || entry.route == "arbitrum",
      ) || tokenE.routes?.[0]
    : tokenE.routes?.[0];
  const route = routeE?.label || "";
  if (route && route != tokenE.chain) parts.push(route);

  return parts.join(" ");
}

export function getHyperliquidFeeEtaText(tokenE = {}) {
  if (!tokenE) return "";
  const parts = [];

  if (tokenE.fee !== undefined && tokenE.fee !== null && tokenE.fee !== "") {
    parts.push(`fee:${pc(tokenE.fee)}`);
  }
  if (tokenE.eta) parts.push(`ETA:${tokenE.eta}`);

  return parts.join(" ");
}

function isHyperliquidDepositCoin(chain = "", coin = "", coinE = {}) {
  const supportedCoins = hyperliquidBridgeCoinM[chain];
  if (!supportedCoins?.has(coin)) return false;

  const text = `${coin} ${coinE?.name || ""}`.toUpperCase();

  return coinE?.type == "stable" && text.includes("USDC");
}

function getHyperliquidDepositCoins(chainE) {
  const priority = ["USDC", "USDC.E", "USDT", "USDT.E", "USDE"];
  const coinInfoM = chainE?.coinInfoM || {};
  if (!hyperliquidBridgeCoinM[chainE?.chain]) return [];

  return getChainCoins(chainE)
    .filter((coin) =>
      isHyperliquidDepositCoin(chainE.chain, coin, coinInfoM[coin]),
    )
    .sort((a, b) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai >= 0 || bi >= 0) {
        return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999);
      }

      return a.localeCompare(b);
    });
}

function uniqueText(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function getHyperliquidBridgeTokens(discoveryE = {}, side = "deposit") {
  return Array.isArray(discoveryE?.[side]?.tokens)
    ? discoveryE[side].tokens
    : [];
}

function getHyperliquidBridgeChains(discoveryE = {}, side = "deposit") {
  return Array.isArray(discoveryE?.[side]?.chains)
    ? discoveryE[side].chains
    : [];
}

export function getFallbackHyperliquidChains(chainList = []) {
  return uniqueText(
    chainList
      .filter((chainE) => getHyperliquidDepositCoins(chainE).length)
      .map((chainE) => chainE.chain),
  );
}

export function getHyperliquidAllChains({
  discoveryE = {},
  side = "deposit",
  fallbackChains = [],
} = {}) {
  const chains = getHyperliquidBridgeChains(discoveryE, side).map(
    (entry) => entry.chain,
  );
  const uniqueChains = uniqueText(chains);

  return uniqueChains.length ? uniqueChains : fallbackChains;
}

export function getHyperliquidAddedChains({
  chainList = [],
  discoveryE = {},
  side = "deposit",
  fallbackChains = [],
} = {}) {
  const discoveryChains = new Set(
    getHyperliquidBridgeChains(discoveryE, side).map((entry) => entry.chain),
  );
  const chains = chainList
    .map((chainE) => chainE.chain)
    .filter((chain) => !discoveryChains.size || discoveryChains.has(chain));
  const uniqueChains = uniqueText(chains);

  return uniqueChains.length ? uniqueChains : fallbackChains;
}

export function getFallbackHyperliquidCoinsForChain(chainE) {
  return getHyperliquidDepositCoins(chainE);
}

function getHyperliquidChainEntry({
  discoveryE = {},
  side = "deposit",
  chain = "",
} = {}) {
  return getHyperliquidBridgeChains(discoveryE, side).find(
    (entry) => entry.chain == chain,
  );
}

export function getHyperliquidAllCoinsForChain({
  discoveryE = {},
  side = "deposit",
  chain = "",
  fallbackCoins = [],
} = {}) {
  const chainE = getHyperliquidChainEntry({ discoveryE, side, chain });
  const coins = (chainE?.coins || []).map((entry) => entry.coin);
  const uniqueCoins = uniqueText(coins);

  return uniqueCoins.length ? uniqueCoins : fallbackCoins;
}

export function getHyperliquidAddedCoinsForChain({
  chainE,
  discoveryE = {},
  side = "deposit",
  fallbackCoins = [],
} = {}) {
  const allCoins = new Set(
    getHyperliquidAllCoinsForChain({
      discoveryE,
      side,
      chain: chainE?.chain,
      fallbackCoins: [],
    }),
  );
  const coins = getChainCoins(chainE).filter(
    (coin) => !allCoins.size || allCoins.has(coin),
  );
  const uniqueCoins = uniqueText(coins);

  return uniqueCoins.length ? uniqueCoins : fallbackCoins;
}

export function getNextHyperliquidCoinForSide({
  chainList = [],
  discoveryE = {},
  side = "deposit",
  chainName = "",
  currentCoin = "",
} = {}) {
  const chainEntry = chainList.find((entry) => entry.chain == chainName);
  const fallbackCoins = getFallbackHyperliquidCoinsForChain(chainEntry);
  const coins = getHyperliquidAllCoinsForChain({
    discoveryE,
    side,
    chain: chainName,
    fallbackCoins,
  });
  const addedCoins = getHyperliquidAddedCoinsForChain({
    chainE: chainEntry,
    discoveryE,
    side,
    fallbackCoins,
  });

  return coins.includes(currentCoin)
    ? currentCoin
    : addedCoins[0] || coins[0] || "";
}

export function getHyperliquidCoinTokenEntries({
  discoveryE = {},
  side = "deposit",
  chain = "",
} = {}) {
  const chainE = getHyperliquidChainEntry({ discoveryE, side, chain });
  return Array.isArray(chainE?.coins) ? chainE.coins : [];
}

export function getHyperliquidRouteToken({
  discoveryE = {},
  side = "deposit",
  chain = "",
  coin = "",
} = {}) {
  return getHyperliquidBridgeTokens(discoveryE, side).find(
    (entry) => entry.chain == chain && entry.coin == coin,
  );
}

export function useHyperliquidBridgeDiscovery({ enabled = false } = {}) {
  const [bridgeE, setBridgeE] = useState(
    hyperliquidBridgeCache || emptyHyperliquidBridgeE,
  );
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (hyperliquidBridgeCache && !retryTick) {
      setBridgeE(hyperliquidBridgeCache);
      return;
    }

    let cancelled = false;
    if (!hyperliquidBridgePromise || retryTick) {
      if (retryTick) hyperliquidBridgeCache = null;
      hyperliquidBridgePromise = getHyperliquidSpotBridgeDiscovery()
        .then((res) => ({
          ...(res || {}),
          loading: false,
          loaded: true,
          error: res?.ok ? "" : res?.msg || "Hyperliquid routes failed",
        }))
        .catch((e) => ({
          ...emptyHyperliquidBridgeE,
          loading: false,
          loaded: true,
          error: e?.message || "Hyperliquid routes failed",
        }))
        .then((res) => {
          hyperliquidBridgeCache = res;
          return res;
        })
        .finally(() => {
          hyperliquidBridgePromise = null;
        });
    }

    setBridgeE((entry) => ({
      ...entry,
      loading: true,
      error: "",
    }));
    hyperliquidBridgePromise.then((res) => {
      if (!cancelled) {
        setBridgeE(res);
        setRetryTick(0);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, retryTick]);

  function retryBridge(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    hyperliquidBridgeCache = null;
    hyperliquidBridgePromise = null;
    setBridgeE(emptyHyperliquidBridgeE);
    setRetryTick((tick) => tick + 1);
  }

  return { bridgeE, retryBridge };
}

export function useHyperliquidBridgeSelection({
  chainList = [],
  bridgeE = emptyHyperliquidBridgeE,
  depositChain = "",
  depositCoin = "",
  withdrawChain = "",
  withdrawCoin = "",
} = {}) {
  const fallbackDepositChains = useMemo(
    () => getFallbackHyperliquidChains(chainList),
    [chainList],
  );
  const depositChains = useMemo(
    () =>
      getHyperliquidAllChains({
        discoveryE: bridgeE,
        side: "deposit",
        fallbackChains: fallbackDepositChains,
      }),
    [bridgeE, fallbackDepositChains],
  );
  const depositAddedChains = useMemo(
    () =>
      getHyperliquidAddedChains({
        chainList,
        discoveryE: bridgeE,
        side: "deposit",
        fallbackChains: fallbackDepositChains,
      }),
    [bridgeE, chainList, fallbackDepositChains],
  );
  const activeDepositChain = depositChains.includes(depositChain)
    ? depositChain
    : depositAddedChains[0] || depositChains[0] || "";
  const depositChainE = chainList.find(
    (entry) => entry.chain == activeDepositChain,
  );
  const fallbackDepositCoins = useMemo(
    () => getFallbackHyperliquidCoinsForChain(depositChainE),
    [depositChainE],
  );
  const depositCoins = useMemo(
    () =>
      getHyperliquidAllCoinsForChain({
        discoveryE: bridgeE,
        side: "deposit",
        chain: activeDepositChain,
        fallbackCoins: fallbackDepositCoins,
      }),
    [activeDepositChain, bridgeE, fallbackDepositCoins],
  );
  const depositAddedCoins = useMemo(
    () =>
      getHyperliquidAddedCoinsForChain({
        chainE: depositChainE,
        discoveryE: bridgeE,
        side: "deposit",
        fallbackCoins: fallbackDepositCoins,
      }),
    [bridgeE, depositChainE, fallbackDepositCoins],
  );
  const activeDepositCoin = depositCoins.includes(depositCoin)
    ? depositCoin
    : depositAddedCoins[0] || depositCoins[0] || "";
  const fallbackWithdrawChains = useMemo(
    () => getFallbackHyperliquidChains(chainList),
    [chainList],
  );
  const withdrawChains = useMemo(
    () =>
      getHyperliquidAllChains({
        discoveryE: bridgeE,
        side: "withdraw",
        fallbackChains: fallbackWithdrawChains,
      }),
    [bridgeE, fallbackWithdrawChains],
  );
  const withdrawAddedChains = useMemo(
    () =>
      getHyperliquidAddedChains({
        chainList,
        discoveryE: bridgeE,
        side: "withdraw",
        fallbackChains: fallbackWithdrawChains,
      }),
    [bridgeE, chainList, fallbackWithdrawChains],
  );
  const activeWithdrawChain = withdrawChains.includes(withdrawChain)
    ? withdrawChain
    : withdrawAddedChains[0] || withdrawChains[0] || "";
  const withdrawChainE = chainList.find(
    (entry) => entry.chain == activeWithdrawChain,
  );
  const fallbackWithdrawCoins = useMemo(
    () => getFallbackHyperliquidCoinsForChain(withdrawChainE),
    [withdrawChainE],
  );
  const withdrawCoins = useMemo(
    () =>
      getHyperliquidAllCoinsForChain({
        discoveryE: bridgeE,
        side: "withdraw",
        chain: activeWithdrawChain,
        fallbackCoins: fallbackWithdrawCoins,
      }),
    [activeWithdrawChain, bridgeE, fallbackWithdrawCoins],
  );
  const withdrawAddedCoins = useMemo(
    () =>
      getHyperliquidAddedCoinsForChain({
        chainE: withdrawChainE,
        discoveryE: bridgeE,
        side: "withdraw",
        fallbackCoins: fallbackWithdrawCoins,
      }),
    [bridgeE, fallbackWithdrawCoins, withdrawChainE],
  );
  const activeWithdrawCoin = withdrawCoins.includes(withdrawCoin)
    ? withdrawCoin
    : withdrawAddedCoins[0] || withdrawCoins[0] || "";
  const depositAllCoinEntries = useMemo(
    () =>
      getHyperliquidCoinTokenEntries({
        discoveryE: bridgeE,
        side: "deposit",
        chain: activeDepositChain,
      }),
    [activeDepositChain, bridgeE],
  );
  const withdrawAllCoinEntries = useMemo(
    () =>
      getHyperliquidCoinTokenEntries({
        discoveryE: bridgeE,
        side: "withdraw",
        chain: activeWithdrawChain,
      }),
    [activeWithdrawChain, bridgeE],
  );
  const depositRouteToken = getHyperliquidRouteToken({
    discoveryE: bridgeE,
    side: "deposit",
    chain: activeDepositChain,
    coin: activeDepositCoin,
  });
  const withdrawRouteToken = getHyperliquidRouteToken({
    discoveryE: bridgeE,
    side: "withdraw",
    chain: activeWithdrawChain,
    coin: activeWithdrawCoin,
  });

  return {
    depositChains,
    depositAddedChains,
    activeDepositChain,
    depositChainE,
    depositCoins,
    depositAddedCoins,
    activeDepositCoin,
    depositAllCoinEntries,
    depositRouteToken,
    depositRouteText: getHyperliquidRouteText(depositRouteToken),
    depositFeeEtaText: getHyperliquidFeeEtaText(depositRouteToken),
    withdrawChains,
    withdrawAddedChains,
    activeWithdrawChain,
    withdrawChainE,
    withdrawCoins,
    withdrawAddedCoins,
    activeWithdrawCoin,
    withdrawAllCoinEntries,
    withdrawRouteToken,
    withdrawRouteText: getHyperliquidRouteText(withdrawRouteToken),
    withdrawFeeEtaText: getHyperliquidFeeEtaText(withdrawRouteToken),
  };
}

export function HyperliquidCoinSelect({
  side = "deposit",
  chain = "",
  selectedCoin = "",
  addedCoins = [],
  historyCoins = [],
  allCoins = [],
  allCoinEntries = [],
  bridgeE = {},
  showMenu = false,
  setShowMenu = () => {},
  pickerRef,
  cycleDisabled,
  onSelect = () => {},
  onPrev = () => {},
  onNext = () => {},
  onRetry = () => {},
  onRemoveHistory,
  getBalance = () => ({}),
  MarketCoinBalance = NoopBalance,
}) {
  const entryM = Object.fromEntries(
    allCoinEntries.map((entry) => [entry.coin, entry]),
  );
  const localCoinOption = (coin) => {
    const balance = getBalance(coin);
    const supported = !bridgeE.loaded || allCoins.includes(coin);
    return {
      value: coin,
      label: coin,
      coin,
      balance,
      supported,
    };
  };
  const discoveryCoinOptions = allCoins.map((coin) => {
    const entry = entryM[coin] || {};
    const balance = getBalance(coin);
    return {
      value: coin,
      label: coin,
      coin,
      entry,
      balance,
      added: addedCoins.includes(coin),
      routeText: getHyperliquidRouteText(entry),
    };
  });
  const coinColumns = [
    {
      key: "coin",
      label: "coin",
      getValue: (entry) => entry.coin,
      getSortValue: (entry) => entry.coin,
    },
    {
      key: "qty",
      label: "qty",
      getValue: (entry) => <MarketCoinBalance balance={entry.balance} />,
      getSortValue: (entry) => getBalanceQty(entry.balance),
      sortDirection: "desc",
    },
    {
      key: "on",
      label: "on",
      getValue: (entry) =>
        entry.supported ? "" : <span className="gray">off</span>,
      getSortValue: (entry) => (entry.supported ? 1 : 0),
    },
  ];
  const discoveryCoinColumns = [
    {
      key: "coin",
      label: "coin",
      getValue: (entry) => (
        <span className="tradeCoinAllSelect">
          <span>{entry.coin}</span>
          {entry.routeText && <span className="gray">{entry.routeText}</span>}
        </span>
      ),
      getSortValue: (entry) => entry.coin,
    },
    {
      key: "qty",
      label: "qty",
      getValue: (entry) => <MarketCoinBalance balance={entry.balance} />,
      getSortValue: (entry) => getBalanceQty(entry.balance),
      sortDirection: "desc",
    },
    {
      key: "add",
      label: "add",
      getValue: (entry) => (
        <button
          type="button"
          className={entry.added ? "btn small bgGray" : "btn small bgCyan"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (entry.added) return;
            toast(
              `${
                chain ? `${chain} ` : ""
              }${entry.coin}: add manually; Hyperliquid discovery has no contract address`,
            );
          }}
          disabled={entry.added}
        >
          {entry.added ? "✓" : "+"}
        </button>
      ),
      getSortValue: (entry) => (entry.added ? 1 : 0),
    },
  ];

  return (
    <TradeSelectionPicker
      selectedValue={selectedCoin}
      selectedLabel={selectedCoin || "no coin"}
      historyOptions={historyCoins.map(localCoinOption)}
      allOptions={addedCoins.map(localCoinOption)}
      extraSections={[
        {
          section: "discovery",
          title: "discovery",
          options: discoveryCoinOptions,
          optionColumns: discoveryCoinColumns,
          getOptionValue: (entry) => entry.coin,
          getOptionLabel: (entry) => entry.coin,
          getOptionTitle: (entry) => entry.coin,
          onSelect: (coin) => onSelect(coin),
          renderBody: ({ columns, renderRows }) => {
            if (bridgeE.loading) {
              return (
                <tr>
                  <td colSpan={columns.length} className="gray">
                    loading Hyperliquid...
                  </td>
                </tr>
              );
            }
            if (bridgeE.error) {
              return (
                <tr>
                  <td colSpan={columns.length - 1}>
                    <span className="red">{bridgeE.error}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small bgGray"
                      onClick={onRetry}
                    >
                      retry
                    </button>
                  </td>
                </tr>
              );
            }
            if (!discoveryCoinOptions.length) {
              return (
                <tr>
                  <td colSpan={columns.length - 1} className="gray">
                    -
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small bgGray"
                      onClick={onRetry}
                    >
                      retry
                    </button>
                  </td>
                </tr>
              );
            }
            return renderRows();
          },
        },
      ]}
      showMenu={showMenu}
      setShowMenu={setShowMenu}
      pickerRef={pickerRef}
      sortKeyPrefix={`yieldHyperliquid${side}Coin:${chain || ""}`}
      header="coin"
      className="tradeCoinCycle"
      menuClassName="tradeCoinMenu"
      disabled={!addedCoins.length && !allCoins.length}
      cycleDisabled={cycleDisabled}
      getOptionValue={(entry) => entry.value}
      getOptionLabel={(entry) => entry.label}
      getOptionTitle={(entry) => entry.label}
      optionColumns={coinColumns}
      isOptionDisabled={(entry) => !entry.supported}
      onSelect={onSelect}
      onRemoveHistory={onRemoveHistory}
      onPrev={onPrev}
      onNext={onNext}
    />
  );
}

export function HyperliquidChainSelect({
  side = "deposit",
  selectedChain = "",
  addedChains = [],
  historyChains = [],
  allChains = [],
  bridgeE = {},
  showMenu = false,
  setShowMenu = () => {},
  pickerRef,
  cycleDisabled,
  onSelect = () => {},
  onPrev = () => {},
  onNext = () => {},
  onRetry = () => {},
  onRemoveHistory,
}) {
  const localChainOption = (chain) => {
    const supported = !bridgeE.loaded || allChains.includes(chain);
    return {
      value: chain,
      label: chain,
      chain,
      supported,
    };
  };
  const discoveryChainOptions = allChains.map((chain) => ({
    value: chain,
    label: chain,
    chain,
    added: addedChains.includes(chain),
  }));
  const chainColumns = [
    {
      key: "chain",
      label: "chain",
      getValue: (entry) => entry.chain,
      getSortValue: (entry) => entry.chain,
    },
    {
      key: "on",
      label: "on",
      getValue: (entry) =>
        entry.supported ? "" : <span className="gray">off</span>,
      getSortValue: (entry) => (entry.supported ? 1 : 0),
    },
  ];
  const discoveryChainColumns = [
    {
      key: "chain",
      label: "chain",
      getValue: (entry) => entry.chain,
      getSortValue: (entry) => entry.chain,
    },
    {
      key: "add",
      label: "add",
      getValue: (entry) => (
        <button
          type="button"
          className={entry.added ? "btn small bgGray" : "btn small bgCyan"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (entry.added) return;
            toast(`${entry.chain}: add chain manually before using this route`);
          }}
          disabled={entry.added}
        >
          {entry.added ? "✓" : "+"}
        </button>
      ),
      getSortValue: (entry) => (entry.added ? 1 : 0),
    },
  ];

  return (
    <TradeSelectionPicker
      selectedValue={selectedChain}
      selectedLabel={selectedChain || "no chain"}
      historyOptions={historyChains.map(localChainOption)}
      allOptions={addedChains.map(localChainOption)}
      extraSections={[
        {
          section: "discovery",
          title: "discovery",
          options: discoveryChainOptions,
          optionColumns: discoveryChainColumns,
          getOptionValue: (entry) => entry.chain,
          getOptionLabel: (entry) => entry.chain,
          getOptionTitle: (entry) => entry.chain,
          onSelect: (chain) => onSelect(chain),
          renderBody: ({ columns, renderRows }) => {
            if (bridgeE.loading) {
              return (
                <tr>
                  <td colSpan={columns.length} className="gray">
                    loading Hyperliquid...
                  </td>
                </tr>
              );
            }
            if (bridgeE.error) {
              return (
                <tr>
                  <td>
                    <span className="red">{bridgeE.error}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn small bgGray"
                      onClick={onRetry}
                    >
                      retry
                    </button>
                  </td>
                </tr>
              );
            }
            if (!discoveryChainOptions.length) {
              return (
                <tr>
                  <td className="gray">-</td>
                  <td>
                    <button
                      type="button"
                      className="btn small bgGray"
                      onClick={onRetry}
                    >
                      retry
                    </button>
                  </td>
                </tr>
              );
            }
            return renderRows();
          },
        },
      ]}
      showMenu={showMenu}
      setShowMenu={setShowMenu}
      pickerRef={pickerRef}
      sortKeyPrefix={`yieldHyperliquid${side}Chain`}
      header="chain"
      className="tradeChainCycle"
      menuClassName="tradeChainMenu"
      disabled={!addedChains.length && !allChains.length}
      cycleDisabled={cycleDisabled}
      getOptionValue={(entry) => entry.value}
      getOptionLabel={(entry) => entry.label}
      getOptionTitle={(entry) => entry.label}
      optionColumns={chainColumns}
      isOptionDisabled={(entry) => !entry.supported}
      onSelect={onSelect}
      onRemoveHistory={onRemoveHistory}
      onPrev={onPrev}
      onNext={onNext}
      onOpen={() => selectedChain && emitTradeChainSelect(selectedChain)}
      onFocus={() => selectedChain && emitTradeChainSelect(selectedChain)}
    />
  );
}

export default function HyperliquidClient({ children }) {
  return children;
}
