"use client";

import { useEffect, useState } from "react";
import { pc } from "@/fn/basic";
import { CycleButton } from "@/components/Shared";
import { isAcrossSupportedForChain } from "./across/Client";
import { isJumperSupportedForChain } from "./jumper/Client";
import { isJupiterSwapSupportedForChain } from "./jupiter/Client";
import { isRelaySupportedForChain } from "./relay/Client";
import { isUniswapSupportedForChain } from "./uniswap/Client";
import {
  dexOptions,
  getInitialCookie,
  getTokenAddressKey,
  getTradeModeCookie,
  inputQty,
  tradeSwapDexCookie,
  TradePickerColumn,
  TradePickerMenu,
  TradePickerSortHeader,
  TradePickerTable,
  sortTradePickerRows,
  toNum,
  withClientTimeout,
} from "../clientShared";

const chainDiscoveryDexs = ["relay", "jumper", "across", "uniswap", "jupiter"];
export const emptySwapSupportE = {
  chains: [],
  tokens: [],
  loading: false,
  loaded: false,
  error: "",
};
const swapSupportTimeoutMs = 12000;
const swapSupportCacheM = {};
const swapSupportPromiseM = {};
export const emptyTokenDiscoveryE = {
  tokens: [],
  loading: false,
  loaded: false,
  error: "",
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

export function getDexLabel(value = "") {
  return dexOptions.find((entry) => entry.value == value)?.label || value || "DEX";
}

export function isDexSupportedForChain(option = {}, fromChain = "") {
  if (!fromChain) return true;
  if (option.value == "relay") return isRelaySupportedForChain(fromChain);
  if (option.value == "jumper") return isJumperSupportedForChain(fromChain);
  if (option.value == "across") return isAcrossSupportedForChain(fromChain);
  if (option.value == "jupiter") return isJupiterSwapSupportedForChain(fromChain);
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

export function getDiscoveryTokenKey(entry = {}, index = "") {
  return [
    entry.chain || "",
    getTokenAddressKey(entry.chain, entry.address),
    entry.symbol || "",
    entry.name || "",
    Number.isFinite(Number(entry.decimals)) ? Number(entry.decimals) : "",
    index,
  ].join(":");
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

    if (!force && swapSupportCacheM[value]) {
      setSupportM((currentM) => ({
        ...currentM,
        [value]: swapSupportCacheM[value],
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
        getSupport?.(value) || Promise.resolve(emptySwapSupportE),
        swapSupportTimeoutMs,
        `${getDexLabel(value)} discovery timeout`,
      )
        .then((res) => {
          const nextSupport = normalizeSwapSupport(res);
          swapSupportCacheM[value] = nextSupport;
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
  return hasLoadedBalance(balance) ? toNum(balance.balance) : 0;
}

function getPickerSortKey(defi = "", name = "") {
  return `${defi || "dex"}:${name}`;
}

function PickerSortHeader({
  defi = "",
  picker = "",
  sortKey = "",
  pickerSortM = {},
  setPickerSortM = () => {},
  children,
}) {
  const pickerKey = getPickerSortKey(defi, picker);

  return (
    <TradePickerSortHeader
      activeSort={pickerSortM[pickerKey] || ""}
      sortKey={sortKey}
      onSort={() =>
        setPickerSortM((sortM) => ({
          ...sortM,
          [pickerKey]: sortM[pickerKey] == sortKey ? "" : sortKey,
        }))
      }
    >
      {children}
    </TradePickerSortHeader>
  );
}

function DiscoveryChainMenu({
  side = "from",
  selectedChain = "",
  addedChains = [],
  allChains = [],
  swapSupportE = {},
  defi = "",
  defiLabel = "DEX",
  pickerSortM = {},
  setPickerSortM = () => {},
  selectDiscoveryChain = () => {},
  showUnsupportedChain = () => {},
  showManualChain = () => {},
  retrySwapSupport = () => {},
}) {
  const supportLoaded =
    swapSupportE.loaded && !swapSupportE.loading && !swapSupportE.error;
  const addedPicker = `${side}:chain:added`;
  const allPicker = `${side}:chain:all`;
  const addedSort = pickerSortM[getPickerSortKey(defi, addedPicker)] || "";
  const allSort = pickerSortM[getPickerSortKey(defi, allPicker)] || "";
  const addedChainRows = sortTradePickerRows(
    addedChains.map((chain) => {
      const supported =
        !supportLoaded || allChains.some((entry) => entry.chain == chain);
      return {
        chain,
        label: chain,
        supported,
        on: supported ? 1 : 0,
      };
    }),
    addedSort,
    {
      chain: (entry) => entry.label,
      on: (entry) => entry.on,
    },
    { on: "desc" },
  );
  const allChainRows = sortTradePickerRows(
    allChains.map((entry) => {
      const label = entry.name || entry.chain || entry.chainId;
      const canSelect = !!entry.chain && addedChains.includes(entry.chain);
      return {
        entry,
        label,
        chain: entry.chain || "",
        canSelect,
        add: canSelect ? 1 : 0,
      };
    }),
    allSort,
    {
      chain: (entry) => entry.label,
      add: (entry) => entry.add,
    },
    { add: "desc" },
  );

  return (
    <TradePickerMenu className="tradeChainMenu">
      <TradePickerColumn title="added">
        <TradePickerTable
          className="tradeChainAddedTable"
          headers={[
            <PickerSortHeader
              defi={defi}
              picker={addedPicker}
              sortKey="chain"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              chain
            </PickerSortHeader>,
            <PickerSortHeader
              defi={defi}
              picker={addedPicker}
              sortKey="on"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              on
            </PickerSortHeader>,
          ]}
        >
          <tbody>
            {addedChainRows.length ? (
              addedChainRows.map((row) => {
                const { chain, supported } = row;
                return (
                  <tr
                    key={`${side}_added_${chain}`}
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
                            ? selectDiscoveryChain(
                                { chain, name: chain, added: true },
                                side,
                              )
                            : showUnsupportedChain(chain)
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
          headers={[
            <PickerSortHeader
              defi={defi}
              picker={allPicker}
              sortKey="chain"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              chain
            </PickerSortHeader>,
            <PickerSortHeader
              defi={defi}
              picker={allPicker}
              sortKey="add"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              add
            </PickerSortHeader>,
          ]}
        >
          <tbody>
            {swapSupportE.loading && (
              <tr>
                <td colSpan={2} className="gray">
                  loading {defiLabel || "DEX"}...
                </td>
              </tr>
            )}
            {!swapSupportE.loading && swapSupportE.error && (
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
            )}
            {!swapSupportE.loading &&
              !swapSupportE.error &&
              !allChains.length && (
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
              )}
            {!swapSupportE.loading &&
              !swapSupportE.error &&
              allChainRows.map((row) => {
                const { entry, label, canSelect } = row;
                return (
                  <tr
                    key={`${side}_all_${entry.chainId || label}`}
                    className={
                      entry.chain == selectedChain
                        ? "tradePickerRow on"
                        : "tradePickerRow"
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="tradePickerSelect tradeChainAllSelect"
                        onClick={() => selectDiscoveryChain(entry, side)}
                        disabled={!canSelect}
                      >
                        <span>{label}</span>
                        {entry.chain && entry.chain != label && (
                          <span className="gray">{entry.chain}</span>
                        )}
                      </button>
                    </td>
                    <td>
                      {canSelect ? (
                        <span className="gray">✓</span>
                      ) : (
                        <button
                          type="button"
                          className="btn small bgCyan"
                          onClick={() => showManualChain(entry)}
                        >
                          +
                        </button>
                      )}
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

export function SwapChainSelect({
  side = "from",
  selectedChain = "",
  addedChains = [],
  allChains = [],
  disabled = false,
  buttonWidth = "8ch",
  title = "",
  onSelect = () => {},
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
  showUnsupportedChain = () => {},
  showManualChain = () => {},
  retrySwapSupport = () => {},
}) {
  if (!hasDiscovery) {
    return (
      <span className="selectCycle">
        <CycleButton
          direction="prev"
          onClick={onPrev}
          disabled={disabled || addedChains.length < 2}
        />
        <select
          value={selectedChain}
          onChange={(e) => onSelect(e.target.value)}
          onClick={onFocusChain}
          onFocus={onFocusChain}
          disabled={disabled}
          title={title}
        >
          {addedChains.map((chain) => (
            <option key={chain} value={chain}>
              {chain}
            </option>
          ))}
        </select>
        <CycleButton
          onClick={onNext}
          disabled={disabled || addedChains.length < 2}
        />
      </span>
    );
  }

  return (
    <div className="selectCycle walletCycle swapChainCycle">
      <CycleButton
        direction="prev"
        onClick={onPrev}
        disabled={disabled || addedChains.length < 2}
      />
      <div className="tradePicker" ref={pickerRef}>
        <button
          type="button"
          className="tradePickerButton"
          style={{ width: buttonWidth }}
          disabled={disabled}
          title={title}
          onClick={() => {
            onFocusChain();
            setShowMenu((show) => !show);
          }}
          onFocus={onFocusChain}
        >
          {selectedChain || "no chain"}
        </button>
        {showMenu && (
          <DiscoveryChainMenu
            side={side}
            selectedChain={selectedChain}
            addedChains={addedChains}
            allChains={allChains}
            swapSupportE={swapSupportE}
            defi={defi}
            defiLabel={defiLabel}
            pickerSortM={pickerSortM}
            setPickerSortM={setPickerSortM}
            selectDiscoveryChain={selectDiscoveryChain}
            showUnsupportedChain={showUnsupportedChain}
            showManualChain={showManualChain}
            retrySwapSupport={retrySwapSupport}
          />
        )}
      </div>
      <CycleButton
        onClick={onNext}
        disabled={disabled || addedChains.length < 2}
      />
    </div>
  );
}

function DiscoveryCoinMenu({
  side = "from",
  chain = "",
  selectedCoin = "",
  addedCoins = [],
  allTokens = [],
  tokenDiscoveryE = {},
  strictSupport = true,
  searchTerm = "",
  onSearchChange = () => {},
  onSearchSubmit = () => {},
  onRetryTokens = () => {},
  showSearch = false,
  defi = "",
  defiLabel = "DEX",
  pickerSortM = {},
  setPickerSortM = () => {},
  getSwapCoinBalance = () => ({}),
  isDiscoveryCoinSupported = () => false,
  selectDiscoveryCoin = () => {},
  showUnsupportedCoin = () => {},
  findLocalCoinForDiscovery = () => "",
  getTokenAddressKey = () => "",
  locallyAddedAddressM = {},
  openDiscoveryCoinConfirm = () => {},
  addingCoin = false,
  getDiscoveryTokenKey = () => "",
}) {
  const addedPicker = `${side}:coin:added:${chain}`;
  const allPicker = `${side}:coin:all:${chain}`;
  const addedSort = pickerSortM[getPickerSortKey(defi, addedPicker)] || "";
  const allSort = pickerSortM[getPickerSortKey(defi, allPicker)] || "";
  const supportLoaded =
    strictSupport &&
    tokenDiscoveryE.loaded &&
    !tokenDiscoveryE.loading &&
    !tokenDiscoveryE.error;
  const addedCoinRows = sortTradePickerRows(
    addedCoins.map((coin) => {
      const balance = getSwapCoinBalance(chain, coin);
      const supported =
        !supportLoaded || isDiscoveryCoinSupported(chain, coin, allTokens);
      return {
        coin,
        balance,
        qty: getSwapBalanceQty(balance),
        supported,
        on: supported ? 1 : 0,
      };
    }),
    addedSort,
    {
      coin: (entry) => entry.coin,
      qty: (entry) => entry.qty,
      on: (entry) => entry.on,
    },
    { qty: "desc", on: "desc" },
  );
  const allTokenRows = sortTradePickerRows(
    allTokens.map((entry, index) => {
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
    }),
    allSort,
    {
      coin: (entry) => entry.symbol,
      name: (entry) => entry.name,
      qty: (entry) => entry.qty,
      add: (entry) => entry.add,
    },
    { qty: "desc", add: "desc" },
  );

  return (
    <TradePickerMenu className="tradeCoinMenu">
      <TradePickerColumn title="added">
        <TradePickerTable
          className="tradeCoinAddedTable"
          headers={[
            <PickerSortHeader
              defi={defi}
              picker={addedPicker}
              sortKey="coin"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              coin
            </PickerSortHeader>,
            <PickerSortHeader
              defi={defi}
              picker={addedPicker}
              sortKey="qty"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              qty
            </PickerSortHeader>,
            <PickerSortHeader
              defi={defi}
              picker={addedPicker}
              sortKey="on"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              on
            </PickerSortHeader>,
          ]}
        >
          <tbody>
            {addedCoinRows.length ? (
              addedCoinRows.map((row) => {
                const { coin, balance, supported } = row;
                return (
                  <tr
                    key={`${side}_added_coin_${coin}`}
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
                            ? selectDiscoveryCoin({ symbol: coin }, side)
                            : showUnsupportedCoin(chain, coin)
                        }
                      >
                        <span>{coin}</span>
                      </button>
                    </td>
                    <td>
                      <CoinBalance balance={balance} />
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
      <TradePickerColumn title="discovery">
        {showSearch && (
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
        )}
        <TradePickerTable
          className="tradeCoinAllTable"
          headers={[
            <PickerSortHeader
              defi={defi}
              picker={allPicker}
              sortKey="coin"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              coin
            </PickerSortHeader>,
            <PickerSortHeader
              defi={defi}
              picker={allPicker}
              sortKey="name"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              name
            </PickerSortHeader>,
            <PickerSortHeader
              defi={defi}
              picker={allPicker}
              sortKey="qty"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              qty
            </PickerSortHeader>,
            <PickerSortHeader
              defi={defi}
              picker={allPicker}
              sortKey="add"
              pickerSortM={pickerSortM}
              setPickerSortM={setPickerSortM}
            >
              add
            </PickerSortHeader>,
          ]}
        >
          <tbody>
            {tokenDiscoveryE.loading && (
              <tr>
                <td colSpan={4} className="gray">
                  loading {defiLabel || "DEX"}...
                </td>
              </tr>
            )}
            {!tokenDiscoveryE.loading && tokenDiscoveryE.error && (
              <tr>
                <td colSpan={3}>
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
            )}
            {!tokenDiscoveryE.loading &&
              !tokenDiscoveryE.error &&
              !allTokens.length && (
                <tr>
                  <td colSpan={3} className="gray">
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
              )}
            {!tokenDiscoveryE.loading &&
              !tokenDiscoveryE.error &&
              allTokenRows.map((row) => {
                const {
                  entry,
                  index,
                  localCoin,
                  balance,
                  added,
                  symbol,
                  name,
                } = row;
                return (
                  <tr
                    key={`${side}_all_coin_${getDiscoveryTokenKey(entry, index)}`}
                    className={
                      localCoin == selectedCoin
                        ? "tradePickerRow on"
                        : "tradePickerRow"
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="tradePickerSelect tradeCoinAllSelect"
                        onClick={() =>
                          localCoin
                            ? selectDiscoveryCoin(entry, side)
                            : openDiscoveryCoinConfirm(
                                {
                                  preventDefault() {},
                                  stopPropagation() {},
                                },
                                chain,
                                entry,
                              )
                        }
                      >
                        <span>{symbol}</span>
                      </button>
                    </td>
                    <td className="gray">{name}</td>
                    <td>
                      <CoinBalance balance={balance} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={added ? "btn small bgGray" : "btn small bgCyan"}
                        onClick={(e) => openDiscoveryCoinConfirm(e, chain, entry)}
                        disabled={added || addingCoin}
                        title={entry.name || symbol}
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

export function SwapCoinSelect({
  side = "from",
  chain = "",
  selectedCoin = "",
  addedCoins = [],
  allTokens = [],
  tokenDiscoveryE = {},
  strictSupport = true,
  searchTerm = "",
  onSearchChange = () => {},
  onSearchSubmit = () => {},
  onRetryTokens = () => {},
  onOpen = () => {},
  showSearch = false,
  buttonWidth = "8ch",
  onSelect = () => {},
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
  showUnsupportedCoin = () => {},
  findLocalCoinForDiscovery = () => "",
  getTokenAddressKey = () => "",
  locallyAddedAddressM = {},
  openDiscoveryCoinConfirm = () => {},
  addingCoin = false,
  getDiscoveryTokenKey = () => "",
}) {
  if (!hasDiscovery) {
    return (
      <span className="selectCycle">
        <CycleButton
          direction="prev"
          onClick={onPrev}
          disabled={addedCoins.length < 2}
        />
        <select value={selectedCoin} onChange={(e) => onSelect(e.target.value)}>
          {addedCoins.map((coin) => (
            <option key={coin} value={coin}>
              {coin}
            </option>
          ))}
        </select>
        <CycleButton
          onClick={onNext}
          disabled={addedCoins.length < 2}
        />
      </span>
    );
  }

  return (
    <div className="selectCycle walletCycle swapCoinCycle">
      <CycleButton
        direction="prev"
        onClick={onPrev}
        disabled={addedCoins.length < 2}
      />
      <div className="tradePicker" ref={pickerRef}>
        <button
          type="button"
          className="tradePickerButton"
          style={{ width: buttonWidth }}
          onClick={() => {
            const nextShow = !showMenu;
            setShowMenu(nextShow);
            if (nextShow) onOpen();
          }}
        >
          {selectedCoin || "no coin"}
        </button>
        {showMenu && (
          <DiscoveryCoinMenu
            side={side}
            chain={chain}
            selectedCoin={selectedCoin}
            addedCoins={addedCoins}
            allTokens={allTokens}
            tokenDiscoveryE={tokenDiscoveryE}
            strictSupport={strictSupport}
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            onSearchSubmit={onSearchSubmit}
            onRetryTokens={onRetryTokens}
            showSearch={showSearch}
            defi={defi}
            defiLabel={defiLabel}
            pickerSortM={pickerSortM}
            setPickerSortM={setPickerSortM}
            getSwapCoinBalance={getSwapCoinBalance}
            isDiscoveryCoinSupported={isDiscoveryCoinSupported}
            selectDiscoveryCoin={selectDiscoveryCoin}
            showUnsupportedCoin={showUnsupportedCoin}
            findLocalCoinForDiscovery={findLocalCoinForDiscovery}
            getTokenAddressKey={getTokenAddressKey}
            locallyAddedAddressM={locallyAddedAddressM}
            openDiscoveryCoinConfirm={openDiscoveryCoinConfirm}
            addingCoin={addingCoin}
            getDiscoveryTokenKey={getDiscoveryTokenKey}
          />
        )}
      </div>
      <CycleButton
        onClick={onNext}
        disabled={addedCoins.length < 2}
      />
    </div>
  );
}
