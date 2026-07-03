"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { pc } from "@/fn/basic";
import { CycleButton } from "@/components/Shared";
import { getHyperliquidSpotBridgeDiscovery } from "./sv";
import {
  emitTradeChainSelect,
  getChainCoins,
  getInitialCookie,
  getTradeModeCookie,
  TradePickerColumn,
  TradePickerMenu,
  TradePickerTable,
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

function getHyperliquidPickerWidth(values = [], selected = "", max = 18) {
  const length = Math.max(
    5,
    String(selected || "").length,
    ...values.map((value) => String(value || "").length),
  );

  return `${Math.min(length + 2, max)}ch`;
}

export function HyperliquidCoinMenu({
  side = "deposit",
  chain = "",
  selectedCoin = "",
  addedCoins = [],
  allCoins = [],
  allCoinEntries = [],
  bridgeE = {},
  onSelect = () => {},
  onRetry = () => {},
  getBalance = () => ({}),
  MarketCoinBalance = NoopBalance,
}) {
  const entryM = Object.fromEntries(
    allCoinEntries.map((entry) => [entry.coin, entry]),
  );

  return (
    <TradePickerMenu className="tradeCoinMenu">
      <TradePickerColumn title="added">
        <TradePickerTable
          className="tradeCoinAddedTable"
          headers={["coin", "qty", "on"]}
        >
          <tbody>
            {addedCoins.length ? (
              addedCoins.map((coin) => {
                const balance = getBalance(coin);
                const supported = !bridgeE.loaded || allCoins.includes(coin);
                return (
                  <tr
                    key={`hl_${side}_added_coin_${coin}`}
                    className={[
                      "tradePickerRow",
                      coin == selectedCoin ? "on" : "",
                      supported ? "" : "unsupported",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      <button
                        type="button"
                        className="tradePickerSelect tradeCoinAllSelect"
                        onClick={() =>
                          supported
                            ? onSelect(coin)
                            : toast(`${coin} is not supported by Hyperliquid`)
                        }
                      >
                        <span>{coin}</span>
                      </button>
                    </td>
                    <td>
                      <MarketCoinBalance balance={balance} />
                    </td>
                    <td>{!supported && <span className="gray">off</span>}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={3} className="gray">
                  -
                </td>
              </tr>
            )}
          </tbody>
        </TradePickerTable>
      </TradePickerColumn>
      <TradePickerColumn title="all">
        <TradePickerTable
          className="tradeCoinAllTable"
          headers={["coin", "qty", "add"]}
        >
          <tbody>
            {bridgeE.loading && (
              <tr>
                <td colSpan={3} className="gray">
                  loading Hyperliquid...
                </td>
              </tr>
            )}
            {!bridgeE.loading && bridgeE.error && (
              <tr>
                <td colSpan={2}>
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
            )}
            {!bridgeE.loading && !bridgeE.error && !allCoins.length && (
              <tr>
                <td colSpan={2} className="gray">
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
            )}
            {!bridgeE.loading &&
              !bridgeE.error &&
              allCoins.map((coin) => {
                const added = addedCoins.includes(coin);
                const entry = entryM[coin] || {};
                const balance = getBalance(coin);
                const routeText = getHyperliquidRouteText(entry);
                return (
                  <tr
                    key={`hl_${side}_all_coin_${coin}`}
                    className={
                      coin == selectedCoin
                        ? "tradePickerRow on"
                        : "tradePickerRow"
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="tradePickerSelect tradeCoinAllSelect"
                        onClick={() => onSelect(coin)}
                      >
                        <span>{coin}</span>
                        {routeText && <span className="gray">{routeText}</span>}
                      </button>
                    </td>
                    <td>
                      <MarketCoinBalance balance={balance} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={added ? "btn small bgGray" : "btn small bgCyan"}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (added) return;
                          toast(
                            `${
                              chain ? `${chain} ` : ""
                            }${coin}: add manually; Hyperliquid discovery has no contract address`,
                          );
                        }}
                        disabled={added}
                      >
                        {added ? "✓" : "+"}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </TradePickerTable>
      </TradePickerColumn>
    </TradePickerMenu>
  );
}

export function HyperliquidChainMenu({
  side = "deposit",
  selectedChain = "",
  addedChains = [],
  allChains = [],
  bridgeE = {},
  onSelect = () => {},
  onRetry = () => {},
}) {
  return (
    <TradePickerMenu className="tradeChainMenu">
      <TradePickerColumn title="added">
        <TradePickerTable
          className="tradeChainAddedTable"
          headers={["chain", "on"]}
        >
          <tbody>
            {addedChains.length ? (
              addedChains.map((chain) => {
                const supported = !bridgeE.loaded || allChains.includes(chain);
                return (
                  <tr
                    key={`hl_${side}_added_chain_${chain}`}
                    className={[
                      "tradePickerRow",
                      chain == selectedChain ? "on" : "",
                      supported ? "" : "unsupported",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      <button
                        type="button"
                        className="tradePickerSelect tradeChainAllSelect"
                        onClick={() =>
                          supported
                            ? onSelect(chain)
                            : toast(`${chain} is not supported by Hyperliquid`)
                        }
                      >
                        <span>{chain}</span>
                      </button>
                    </td>
                    <td>{!supported && <span className="gray">off</span>}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={2} className="gray">
                  -
                </td>
              </tr>
            )}
          </tbody>
        </TradePickerTable>
      </TradePickerColumn>
      <TradePickerColumn title="all">
        <TradePickerTable
          className="tradeChainAllTable"
          headers={["chain", "add"]}
        >
          <tbody>
            {bridgeE.loading && (
              <tr>
                <td colSpan={2} className="gray">
                  loading Hyperliquid...
                </td>
              </tr>
            )}
            {!bridgeE.loading && bridgeE.error && (
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
            )}
            {!bridgeE.loading && !bridgeE.error && !allChains.length && (
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
            )}
            {!bridgeE.loading &&
              !bridgeE.error &&
              allChains.map((chain) => {
                const added = addedChains.includes(chain);
                return (
                  <tr
                    key={`hl_${side}_all_chain_${chain}`}
                    className={
                      chain == selectedChain
                        ? "tradePickerRow on"
                        : "tradePickerRow"
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="tradePickerSelect tradeChainAllSelect"
                        onClick={() => onSelect(chain)}
                      >
                        <span>{chain}</span>
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={added ? "btn small bgGray" : "btn small bgCyan"}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (added) return;
                          toast(`${chain}: add chain manually before using this route`);
                        }}
                        disabled={added}
                      >
                        {added ? "✓" : "+"}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </TradePickerTable>
      </TradePickerColumn>
    </TradePickerMenu>
  );
}

export function HyperliquidCoinSelect({
  side = "deposit",
  chain = "",
  selectedCoin = "",
  addedCoins = [],
  allCoins = [],
  allCoinEntries = [],
  bridgeE = {},
  showMenu = false,
  setShowMenu = () => {},
  pickerRef,
  onSelect = () => {},
  onNext = () => {},
  onRetry = () => {},
  getBalance = () => ({}),
  MarketCoinBalance = NoopBalance,
}) {
  return (
    <div className="selectCycle walletCycle tradeCoinCycle">
      <div className="tradePicker" ref={pickerRef}>
        <button
          type="button"
          className="tradePickerButton"
          style={{
            width: getHyperliquidPickerWidth(
              [...addedCoins, ...allCoins],
              selectedCoin,
            ),
          }}
          disabled={!allCoins.length}
          onClick={() => setShowMenu((show) => !show)}
        >
          {selectedCoin || "no coin"}
        </button>
        {showMenu && (
          <HyperliquidCoinMenu
            side={side}
            chain={chain}
            selectedCoin={selectedCoin}
            addedCoins={addedCoins}
            allCoins={allCoins}
            allCoinEntries={allCoinEntries}
            bridgeE={bridgeE}
            onSelect={onSelect}
            onRetry={onRetry}
            getBalance={getBalance}
            MarketCoinBalance={MarketCoinBalance}
          />
        )}
      </div>
      <CycleButton
        onClick={onNext}
        disabled={addedCoins.length < 2 && allCoins.length < 2}
      />
    </div>
  );
}

export function HyperliquidChainSelect({
  side = "deposit",
  selectedChain = "",
  addedChains = [],
  allChains = [],
  bridgeE = {},
  showMenu = false,
  setShowMenu = () => {},
  pickerRef,
  onSelect = () => {},
  onNext = () => {},
  onRetry = () => {},
}) {
  return (
    <div className="selectCycle walletCycle tradeChainCycle">
      <div className="tradePicker" ref={pickerRef}>
        <button
          type="button"
          className="tradePickerButton"
          style={{
            width: getHyperliquidPickerWidth(
              [...addedChains, ...allChains],
              selectedChain,
            ),
          }}
          disabled={!allChains.length}
          onClick={() => {
            if (selectedChain) emitTradeChainSelect(selectedChain);
            setShowMenu((show) => !show);
          }}
          onFocus={() => selectedChain && emitTradeChainSelect(selectedChain)}
        >
          {selectedChain || "no chain"}
        </button>
        {showMenu && (
          <HyperliquidChainMenu
            side={side}
            selectedChain={selectedChain}
            addedChains={addedChains}
            allChains={allChains}
            bridgeE={bridgeE}
            onSelect={onSelect}
            onRetry={onRetry}
          />
        )}
      </div>
      <CycleButton
        onClick={onNext}
        disabled={addedChains.length < 2 && allChains.length < 2}
      />
    </div>
  );
}

export default function HyperliquidClient({ children }) {
  return children;
}
