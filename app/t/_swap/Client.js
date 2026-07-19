"use client";

import { useEffect, useState } from "react";
import { pc } from "@/fn/basic";
import {
  discoveryCacheMs,
  isDiscoveryCacheFresh,
  makeDiscoveryCacheMeta,
} from "@/fn/discoveryCache";
import { DiscoveryCacheInfo } from "@/components/Shared";
import { isAcrossSupportedForChain } from "./across/Client";
import { isJumperSupportedForChain } from "./jumper/Client";
import { isJupiterSwapSupportedForChain } from "./jupiter/Client";
import { isRelaySupportedForChain } from "./relay/Client";
import { isSunSupportedForChain } from "./sun/Client";
import { isUniswapSupportedForChain } from "./uniswap/Client";
import {
  dexOptions,
  getInitialCookie,
  getHistoryCycleValues,
  getTokenAddressKey,
  getTradeModeCookie,
  inputQty,
  tradeSwapDexCookie,
  TradeSelectionPicker,
  toNum,
  withClientTimeout,
} from "../clientShared";

const chainDiscoveryDexs = ["relay", "jumper", "across"];
export const emptySwapSupportE = {
  chains: [],
  tokens: [],
  loading: false,
  loaded: false,
  error: "",
  cache: null,
};
const swapSupportTimeoutMs = 12000;
const swapSupportCacheM = {};
const swapSupportPromiseM = {};
export const emptyTokenDiscoveryE = {
  tokens: [],
  loading: false,
  loaded: false,
  error: "",
  cache: null,
};
export const tokenDiscoveryCacheM = {};
export const tokenDiscoveryPromiseM = {};

function clearObject(object = {}) {
  for (const key of Object.keys(object)) delete object[key];
}

export function clearSwapClientRuntimeCache() {
  clearObject(swapSupportCacheM);
  clearObject(swapSupportPromiseM);
  clearObject(tokenDiscoveryCacheM);
  clearObject(tokenDiscoveryPromiseM);
}

export function hasChainDiscovery(defi = "") {
  return chainDiscoveryDexs.includes(defi);
}

export function hasCoinDiscovery(defi = "") {
  return hasChainDiscovery(defi) || defi == "jupiter" || defi == "sun";
}

export function getSwapLocalChainOptions(defi = "", chainNames = []) {
  if (defi == "jupiter") return chainNames.filter(isJupiterSwapSupportedForChain);
  if (defi == "sun") return chainNames.filter(isSunSupportedForChain);
  if (defi == "uniswap") return chainNames.filter(isUniswapSupportedForChain);

  return chainNames;
}

export function getDexLabel(value = "") {
  return dexOptions.find((entry) => entry.value == value)?.label || value || "DEX";
}

export function isDexSupportedForChain(option = {}, fromChain = "") {
  if (!fromChain) return true;
  if (fromChain == "Tron") {
    return ["relay", "jumper", "sun"].includes(option.value);
  }
  if (option.value == "relay") return isRelaySupportedForChain(fromChain);
  if (option.value == "jumper") return isJumperSupportedForChain(fromChain);
  if (option.value == "across") return isAcrossSupportedForChain(fromChain);
  if (option.value == "jupiter") return isJupiterSwapSupportedForChain(fromChain);
  if (option.value == "sun") return isSunSupportedForChain(fromChain);
  if (option.value == "uniswap") return isUniswapSupportedForChain(fromChain);

  return true;
}

export function getSwapRouteCookie(
  base = "",
  walletType = "evm",
  defi = "",
  chain = "",
) {
  return [
    getTradeModeCookie(base, walletType),
    defi || "dex",
    chain || "",
  ]
    .filter(Boolean)
    .join("_");
}

export function getInitialSwapDex(initialCookieM = {}, walletType = "evm") {
  const savedDefi = getInitialCookie(
    initialCookieM,
    getTradeModeCookie(tradeSwapDexCookie, walletType),
  );

  return dexOptions.some((entry) => entry.value == savedDefi)
    ? savedDefi
    : dexOptions[0]?.value || "";
}

export function getTokenSearchKey(chain = "", term = "") {
  return `${chain}:${String(term || "").trim().toLowerCase()}`;
}

export function getTokenDiscoveryKey(defi = "", chain = "", term = "") {
  return `${defi}:${getTokenSearchKey(chain, term)}`;
}

export function getDiscoveryTokenDedupeKey(entry = {}) {
  return [
    entry.chain || "",
    getTokenAddressKey(entry.chain, entry.address),
    entry.symbol || "",
    entry.name || "",
    Number.isFinite(Number(entry.decimals)) ? Number(entry.decimals) : "",
  ].join(":");
}

export function trimQtyToDecimals(value = "", decimals = 18) {
  const text = String(value ?? "");
  if (!text || !Number.isInteger(decimals) || decimals < 0) return text;
  if (/e/i.test(text)) return trimQtyToDecimals(inputQty(Number(text)), decimals);

  const parts = text.split(".");
  if (parts.length < 2) return text;
  if (decimals == 0) return parts[0] || "0";

  return `${parts[0] || "0"}.${parts.slice(1).join("").slice(0, decimals)}`;
}

function normalizeSwapSupport(res = {}) {
  return {
    chains: Array.isArray(res?.chains) ? res.chains : [],
    tokens: Array.isArray(res?.tokens) ? res.tokens : [],
    loading: false,
    loaded: true,
    error: "",
    cache:
      res?.cache || makeDiscoveryCacheMeta({ source: "api", location: "client" }),
  };
}

export function useSwapSupport({
  defi = "",
  getSupport,
} = {}) {
  const [supportM, setSupportM] = useState({});
  const support = supportM[defi] || emptySwapSupportE;
  const hasDiscovery = hasChainDiscovery(defi);

  function request(value = "", { force = false } = {}) {
    if (!hasChainDiscovery(value)) return;
    const current = supportM[value] || emptySwapSupportE;
    if (!force && (current.loading || current.loaded)) return;

    if (!force && isDiscoveryCacheFresh(swapSupportCacheM[value], discoveryCacheMs)) {
      setSupportM((currentM) => ({
        ...currentM,
        [value]: {
          ...swapSupportCacheM[value],
          cache: makeDiscoveryCacheMeta({
            ...(swapSupportCacheM[value].cache || {}),
            source: "cache",
            location: "client",
          }),
        },
      }));
      return;
    }

    setSupportM((currentM) => ({
      ...currentM,
      [value]: {
        ...current,
        loading: true,
        loaded: false,
        error: "",
      },
    }));

    if (!swapSupportPromiseM[value] || force) {
      swapSupportPromiseM[value] = withClientTimeout(
        getSupport?.(value, { refresh: force }) || Promise.resolve(emptySwapSupportE),
        swapSupportTimeoutMs,
        `${getDexLabel(value)} discovery timeout`,
      )
        .then((res) => {
          const nextSupport = normalizeSwapSupport(res);
          swapSupportCacheM[value] = {
            ...nextSupport,
            at: Number(nextSupport.cache?.at || Date.now()),
          };
          return nextSupport;
        })
        .catch((e) => {
          delete swapSupportPromiseM[value];
          throw e;
        });
    }

    swapSupportPromiseM[value]
      .then((nextSupport) => {
        setSupportM((currentM) => ({
          ...currentM,
          [value]: nextSupport,
        }));
      })
      .catch((e) => {
        setSupportM((currentM) => ({
          ...currentM,
          [value]: {
            ...(currentM[value] || emptySwapSupportE),
            loading: false,
            loaded: true,
            error: e?.message || `${getDexLabel(value)} discovery failed`,
          },
        }));
      });
  }

  useEffect(() => {
    request(defi);
  }, [defi, supportM]);

  function retry(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!defi) return;
    delete swapSupportCacheM[defi];
    delete swapSupportPromiseM[defi];
    setSupportM((currentM) => ({
      ...currentM,
      [defi]: emptySwapSupportE,
    }));
    request(defi, { force: true });
  }

  return { support, hasDiscovery, retry };
}

function hasLoadedBalance(balance = {}) {
  return Object.prototype.hasOwnProperty.call(balance || {}, "balance");
}

function CoinBalance({ balance = {} }) {
  if (!hasLoadedBalance(balance)) return null;

  return <span>{pc(balance.balance)}</span>;
}

function getSwapBalanceQty(balance = {}) {
  return hasLoadedBalance(balance) ? toNum(balance.balance) : -1;
}

export function SwapChainSelect({
  side = "from",
  selectedChain = "",
  addedChains = [],
  historyChains = [],
  allChainOptions = [],
  allChains = [],
  disabled = false,
  title = "",
  onSelect = () => {},
  onRemoveHistory,
  onPrev = () => {},
  onNext = () => {},
  onFocusChain = () => {},
  showMenu = false,
  setShowMenu = () => {},
  pickerRef,
  hasDiscovery = false,
  swapSupportE = {},
  defi = "",
  defiLabel = "DEX",
  pickerSortM = {},
  setPickerSortM = () => {},
  selectDiscoveryChain = () => {},
  showManualChain = () => {},
  retrySwapSupport = () => {},
}) {
  const supportLoaded =
    swapSupportE.loaded && !swapSupportE.loading && !swapSupportE.error;
  const chainValue = (entry) =>
    typeof entry == "string"
      ? entry
      : entry?.chain || entry?.value || entry?.label || "";
  const localChainOption = (entry) => {
    const chain = chainValue(entry);
    return {
      value: chain,
      label: chain,
      supported:
        !hasDiscovery ||
        !supportLoaded ||
        allChains.some((supportEntry) => supportEntry.chain == chain),
    };
  };
  const localAllChains = allChainOptions.length ? allChainOptions : addedChains;
  const historyChainOptions = historyChains.map(localChainOption);
  const allChainPickerOptions = localAllChains.map(localChainOption);
  const discoveryChainOptions = allChains.map((entry) => {
    const label = entry.name || entry.chain || entry.chainId || "";
    const canSelect = !!entry.chain && addedChains.includes(entry.chain);
    return {
      ...entry,
      value: entry.chain || label,
      label,
      canSelect,
      add: canSelect ? 1 : 0,
    };
  });
  const chainColumns = [
    {
      key: "chain",
      label: "chain",
      getValue: (entry) => entry.label,
      getSortValue: (entry) => entry.label,
    },
  ];
  const discoveryChainColumns = [
    {
      key: "chain",
      label: "chain",
      getValue: (entry) => (
        <span className="tradeChainAllSelect">
          <span>{entry.label}</span>
          {entry.chain && entry.chain != entry.label && (
            <span className="gray">{entry.chain}</span>
          )}
        </span>
      ),
      getSortValue: (entry) => entry.label,
    },
    {
      key: "add",
      label: "add",
      getValue: (entry) =>
        entry.canSelect ? (
          <span className="gray">✓</span>
        ) : (
          <button
            type="button"
            className="btn small bgCyan"
            onClick={(e) => {
              e.stopPropagation();
              showManualChain(entry);
            }}
          >
            +
          </button>
        ),
      getSortValue: (entry) => entry.add,
    },
  ];
  const chainCycleValues = getHistoryCycleValues(
    hasDiscovery ? historyChainOptions : historyChains,
    hasDiscovery ? allChainPickerOptions : localAllChains,
    hasDiscovery ? (entry) => entry.value : undefined,
    hasDiscovery ? (entry) => entry.supported === false : undefined,
  );

  return (
    <TradeSelectionPicker
      selectedValue={selectedChain}
      selectedLabel={selectedChain || "no chain"}
      historyOptions={hasDiscovery ? historyChainOptions : historyChains}
      allOptions={hasDiscovery ? allChainPickerOptions : localAllChains}
      extraSections={
        hasDiscovery
          ? [
              {
                section: "discovery",
                title: "discovery",
                options: discoveryChainOptions,
                emptyText: "-",
                info: (
                  <DiscoveryCacheInfo
                    cacheMeta={swapSupportE.cache}
                    onReload={retrySwapSupport}
                  />
                ),
                optionColumns: discoveryChainColumns,
                getOptionValue: (entry) => entry.value,
                getOptionLabel: (entry) => entry.label,
                getOptionTitle: (entry) => entry.label,
                onSelect: (_, entry) =>
                  entry.canSelect
                    ? selectDiscoveryChain(entry, side)
                    : showManualChain(entry),
                renderBody: ({ columns, renderRows }) => {
                  if (swapSupportE.loading) {
                    return (
                      <tr>
                        <td colSpan={columns.length} className="gray">
                          loading {defiLabel || "DEX"}...
                        </td>
                      </tr>
                    );
                  }
                  if (swapSupportE.error) {
                    return (
                      <tr>
                        <td>
                          <span className="red">{swapSupportE.error}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn small bgGray"
                            onClick={retrySwapSupport}
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
                            onClick={retrySwapSupport}
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
            ]
          : []
      }
      showMenu={showMenu}
      setShowMenu={setShowMenu}
      pickerRef={pickerRef}
      pickerSortM={pickerSortM}
      setPickerSortM={setPickerSortM}
      sortKeyPrefix={`swap${side}Chain:${defi || "dex"}`}
      header="chain"
      className="swapChainCycle"
      menuClassName="tradeChainMenu"
      disabled={disabled}
      cycleDisabled={disabled || chainCycleValues.length < 2}
      getOptionValue={hasDiscovery ? (entry) => entry.value : undefined}
      getOptionLabel={hasDiscovery ? (entry) => entry.label : undefined}
      getOptionTitle={hasDiscovery ? (entry) => entry.label : undefined}
      optionColumns={hasDiscovery ? chainColumns : undefined}
      isOptionDisabled={
        hasDiscovery ? (entry) => entry.supported === false : undefined
      }
      onSelect={onSelect}
      onRemoveHistory={onRemoveHistory}
      onPrev={onPrev}
      onNext={onNext}
      onOpen={onFocusChain}
      onFocus={onFocusChain}
    />
  );
}

export function SwapCoinSelect({
  side = "from",
  chain = "",
  selectedCoin = "",
  addedCoins = [],
  historyCoins = [],
  allCoinOptions = [],
  allTokens = [],
  tokenDiscoveryE = {},
  strictSupport = true,
  searchTerm = "",
  onSearchChange = () => {},
  onSearchSubmit = () => {},
  onRetryTokens = () => {},
  onOpen = () => {},
  showSearch = false,
  onSelect = () => {},
  onRemoveHistory,
  onPrev = () => {},
  onNext = () => {},
  showMenu = false,
  setShowMenu = () => {},
  pickerRef,
  hasDiscovery = false,
  defi = "",
  defiLabel = "DEX",
  pickerSortM = {},
  setPickerSortM = () => {},
  getSwapCoinBalance = () => ({}),
  isDiscoveryCoinSupported = () => false,
  selectDiscoveryCoin = () => {},
  findLocalCoinForDiscovery = () => "",
  getTokenAddressKey = () => "",
  locallyAddedAddressM = {},
  openDiscoveryCoinConfirm = () => {},
  addingCoin = false,
}) {
  const supportLoaded =
    strictSupport &&
    tokenDiscoveryE.loaded &&
    !tokenDiscoveryE.loading &&
    !tokenDiscoveryE.error;
  const localCoinOption = (coin) => {
    const balance = getSwapCoinBalance(chain, coin);
    return {
      value: coin,
      label: coin,
      coin,
      balance,
      qty: getSwapBalanceQty(balance),
      supported:
        !hasDiscovery ||
        !supportLoaded ||
        isDiscoveryCoinSupported(chain, coin, allTokens),
    };
  };
  const localAllCoins = allCoinOptions.length ? allCoinOptions : addedCoins;
  const historyCoinOptions = historyCoins.map(localCoinOption);
  const allCoinPickerOptions = localAllCoins.map(localCoinOption);
  const discoveryCoinOptions = allTokens.map((entry, index) => {
    const localCoin = findLocalCoinForDiscovery(chain, entry);
    const balance = getSwapCoinBalance(
      chain,
      localCoin || entry.symbol,
      entry.address,
    );
    const addressKey = getTokenAddressKey(chain, entry.address);
    const added =
      !!localCoin ||
      !!(addressKey && locallyAddedAddressM[`${chain}:${addressKey}`]);
    const symbol = entry.symbol || "token";
    const name = entry.name && entry.name != symbol ? entry.name : "";
    return {
      value: localCoin || symbol,
      label: localCoin || symbol,
      entry,
      index,
      localCoin,
      balance,
      qty: getSwapBalanceQty(balance),
      added,
      add: added ? 1 : 0,
      symbol,
      name,
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
      getValue: (entry) => <CoinBalance balance={entry.balance} />,
      getSortValue: (entry) => entry.qty,
      sortDirection: "desc",
    },
    {
      key: "on",
      label: "on",
      getValue: (entry) =>
        entry.supported === false ? <span className="gray">off</span> : "",
      getSortValue: (entry) => (entry.supported === false ? 0 : 1),
    },
  ];
  const discoveryCoinColumns = [
    {
      key: "coin",
      label: "coin",
      getValue: (entry) => entry.symbol,
      getSortValue: (entry) => entry.symbol,
    },
    {
      key: "name",
      label: "name",
      className: "gray",
      getValue: (entry) => entry.name,
      getSortValue: (entry) => entry.name,
    },
    {
      key: "qty",
      label: "qty",
      getValue: (entry) => <CoinBalance balance={entry.balance} />,
      getSortValue: (entry) => entry.qty,
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
            e.stopPropagation();
            openDiscoveryCoinConfirm(e, chain, entry.entry);
          }}
          disabled={entry.added || addingCoin}
          title={entry.entry.name || entry.symbol}
        >
          {entry.added ? "✓" : "+"}
        </button>
      ),
      getSortValue: (entry) => entry.add,
    },
  ];
  const coinCycleValues = getHistoryCycleValues(
    hasDiscovery ? historyCoinOptions : historyCoins,
    hasDiscovery ? allCoinPickerOptions : localAllCoins,
    hasDiscovery ? (entry) => entry.value : undefined,
    hasDiscovery ? (entry) => entry.supported === false : undefined,
  );

  return (
    <TradeSelectionPicker
      selectedValue={selectedCoin}
      selectedLabel={selectedCoin || "no coin"}
      historyOptions={hasDiscovery ? historyCoinOptions : historyCoins}
      allOptions={hasDiscovery ? allCoinPickerOptions : localAllCoins}
      extraSections={
        hasDiscovery
          ? [
              {
                section: "discovery",
                title: "discovery",
                options: discoveryCoinOptions,
                emptyText: "-",
                info: (
                  <DiscoveryCacheInfo
                    cacheMeta={tokenDiscoveryE.cache}
                    onReload={onRetryTokens}
                  />
                ),
                optionColumns: discoveryCoinColumns,
                getOptionValue: (entry) => entry.value,
                getOptionLabel: (entry) => entry.label,
                getOptionTitle: (entry) => entry.entry?.name || entry.symbol,
                onSelect: (_, entry) => selectDiscoveryCoin(entry.entry, side),
                beforeTable: showSearch ? (
                  <form className="swapCoinSearch" onSubmit={onSearchSubmit}>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder="search"
                    />
                    <button type="submit" className="btn small bgGray">
                      go
                    </button>
                  </form>
                ) : null,
                renderBody: ({ columns, renderRows }) => {
                  if (tokenDiscoveryE.loading) {
                    return (
                      <tr>
                        <td colSpan={columns.length} className="gray">
                          loading {defiLabel || "DEX"}...
                        </td>
                      </tr>
                    );
                  }
                  if (tokenDiscoveryE.error) {
                    return (
                      <tr>
                        <td colSpan={columns.length - 1}>
                          <span className="red">{tokenDiscoveryE.error}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn small bgGray"
                            onClick={onRetryTokens}
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
                            onClick={onRetryTokens}
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
            ]
          : []
      }
      showMenu={showMenu}
      setShowMenu={setShowMenu}
      pickerRef={pickerRef}
      pickerSortM={pickerSortM}
      setPickerSortM={setPickerSortM}
      sortKeyPrefix={`swap${side}Coin:${defi || "dex"}:${chain || ""}`}
      header="coin"
      className="swapCoinCycle selectedCompact"
      menuClassName="tradeCoinMenu"
      cycleDisabled={coinCycleValues.length < 2}
      getOptionValue={hasDiscovery ? (entry) => entry.value : undefined}
      getOptionLabel={hasDiscovery ? (entry) => entry.label : undefined}
      getOptionTitle={hasDiscovery ? (entry) => entry.label : undefined}
      optionColumns={hasDiscovery ? coinColumns : undefined}
      isOptionDisabled={
        hasDiscovery ? (entry) => entry.supported === false : undefined
      }
      onSelect={onSelect}
      onRemoveHistory={onRemoveHistory}
      onPrev={onPrev}
      onNext={onNext}
      onOpen={onOpen}
    />
  );
}
