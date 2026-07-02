"use client";

import { pc } from "@/fn/basic";
import {
  fmt,
  getChainCoins,
  getCoinBalanceByAddress,
  getCoinTypeOptions,
  getExplorerAddressUrl,
  getSelectedBalance,
  getTokenAddressKey,
  getTradeModeCookie,
  hasLoadedBalance,
  sameAddressText,
  TradePickerColumn,
  TradePickerMenu,
  TradePickerSortHeader,
  TradePickerTable,
  sortTradePickerRows,
  toggleTradePickerSort,
  toNum,
  useTradeAllMarkets,
  useTradeDirectMarketBalance,
  withClientTimeout,
  yieldOptions,
} from "../clientShared";
import {
  isHyperliquidChainAvailable,
  isHyperliquidCoin,
} from "./hyperliquid/Client";
import {
  isSparkChainAvailable,
  isSparkCoin,
} from "./spark/Client";
import {
  isVenusFluxChainAvailable,
  isVenusFluxCoin,
} from "./venusFlux/Client";

export {
  getCoinTypeOptions,
  getExplorerAddressUrl,
  getSelectedBalance,
  getTokenAddressKey,
  hasLoadedBalance,
  sameAddressText,
  withClientTimeout,
};

export function isYieldProtocolSupportedForWallet(option = {}, walletType = "evm") {
  if (walletType == "solana") return false;
  if (option.value == "spark") return true;
  if (option.value == "venusFlux") return true;
  if (option.value == "hyperliquid") return true;

  return false;
}

export function getProtocolCookie(
  base = "",
  walletType = "evm",
  defi = "",
  chain = "",
) {
  return [getTradeModeCookie(base, walletType), defi || "defi", chain || ""]
    .filter(Boolean)
    .join("_");
}

export function getInitialCookie(initialCookieM = {}, name = "") {
  const value = initialCookieM?.[name];
  return value === undefined ? undefined : String(value);
}

export function getInitialYieldDefi(
  initialCookieM = {},
  walletType = "evm",
  cookieName = "",
) {
  const savedDefi = getInitialCookie(
    initialCookieM,
    getTradeModeCookie(cookieName, walletType),
  );
  const options = yieldOptions.filter((option) =>
    isYieldProtocolSupportedForWallet(option, walletType),
  );

  return options.some((entry) => entry.value == savedDefi)
    ? savedDefi
    : options[0]?.value || "";
}

export function useYieldAllMarkets({
  enabled = false,
  cacheKey = "",
  chain = "",
  protocolLabel = "Yield",
  getAllMarkets,
  timeoutMs = 25000,
} = {}) {
  return useTradeAllMarkets({
    enabled,
    cacheKey,
    chain,
    protocolLabel,
    getAllMarkets,
    timeoutMs,
  });
}

export function useYieldDirectMarketBalance({
  enabled = false,
  cacheKey = "",
  walletAddress = "",
  chain = "",
  marketE = {},
  getMarketBalance,
  protocolLabel = "Yield",
  timeoutMs = 12000,
} = {}) {
  return useTradeDirectMarketBalance({
    enabled,
    cacheKey,
    walletAddress,
    chain,
    marketE,
    getMarketBalance,
    protocolLabel,
    timeoutMs,
  });
}

export function getMarketSupplyApr({
  chainE,
  defi,
  marketE,
  rawMarkets = [],
} = {}) {
  if (defi != "spark" && defi != "venusFlux") return 0;
  if (marketE?.supplyApr) return toNum(marketE.supplyApr);

  const lendAddress =
    marketE?.lendAddress ||
    chainE?.coinInfoM?.[marketE?.lendCoin]?.address ||
    "";
  const underlyingAddress =
    marketE?.underlyingAddress ||
    chainE?.coinInfoM?.[marketE?.underlyingCoin]?.address ||
    "";
  const match = rawMarkets.find(
    (entry) =>
      (lendAddress && sameAddressText(entry.lendAddress, lendAddress)) ||
      (underlyingAddress &&
        sameAddressText(entry.underlyingAddress, underlyingAddress)) ||
      (entry.underlyingCoin == marketE?.underlyingCoin &&
        entry.lendCoin == marketE?.lendCoin),
  );

  return toNum(match?.supplyApr);
}

export function isUsdLikeYieldCoin(coin = "") {
  return /USD/i.test(String(coin || ""));
}

export function isProtocolCoin(protocol, coin, coinE = {}) {
  if (protocol == "hyperliquid") return isHyperliquidCoin(coin, coinE);
  if (protocol == "spark") return isSparkCoin(coin, coinE);
  if (protocol == "venusFlux") return isVenusFluxCoin(coin, coinE);

  return false;
}

export function getYieldMarketChains(chainList = [], chainMarketsM = {}, defi = "") {
  return chainList
    .filter((chainE) => {
      const chainMarkets = chainMarketsM[chainE.chain] || [];
      if (defi == "hyperliquid") {
        return isHyperliquidChainAvailable(chainE.chain, chainMarkets);
      }
      if (defi == "spark") {
        return isSparkChainAvailable(chainE.chain, chainMarkets);
      }

      return isVenusFluxChainAvailable(chainE.chain, chainMarkets);
    })
    .map((chainE) => chainE.chain);
}

export function getUnderlyingCoin(chainE, lendCoin) {
  if (chainE?.chain == "Hyperliquid") return "USDC";

  const coinInfoM = chainE?.coinInfoM || {};
  const lendE = coinInfoM[lendCoin] || {};
  const text = `${lendCoin} ${lendE.name || ""}`.toLowerCase();
  const savingsNameMatch = String(lendE.name || "").match(
    /\bsavings\s+([a-z0-9.]+)/i,
  );
  if (savingsNameMatch?.[1]) return savingsNameMatch[1].toUpperCase();
  if (/^sp[A-Z0-9.]{2,}$/.test(lendCoin)) return lendCoin.slice(2);
  if (/^f[A-Z0-9.]{2,}$/.test(lendCoin)) return lendCoin.slice(1);
  if (/^s[A-Z0-9.]{2,}$/.test(lendCoin)) return lendCoin.slice(1);

  const candidates = getChainCoins(chainE)
    .filter((coin) => coin != lendCoin)
    .filter((coin) => coinInfoM[coin]?.type != "lend")
    .sort((a, b) => b.length - a.length);

  return (
    candidates.find((coin) => text.includes(coin.toLowerCase())) ||
    candidates.find((coin) => ["USDT", "USDC", "DAI"].includes(coin)) ||
    candidates[0] ||
    ""
  );
}

export function getLendingMarkets(chainE, protocol) {
  if (!chainE || !protocol) return [];

  return getChainCoins(chainE)
    .filter((coin) => isProtocolCoin(protocol, coin, chainE.coinInfoM?.[coin]))
    .map((lendCoin) => {
      const lendE = chainE.coinInfoM?.[lendCoin] || {};
      const underlyingCoin = getUnderlyingCoin(chainE, lendCoin);

      return {
        value: lendCoin,
        protocol,
        lendCoin,
        lendName: lendE.name || lendCoin,
        underlyingCoin,
      };
    })
    .filter((entry) => entry.underlyingCoin);
}

export function getMarketLabel(entry = {}) {
  if (entry.protocol == "hyperliquid") return entry.lendCoin || "vault";

  return entry?.underlyingCoin
    ? `${entry.underlyingCoin} (${entry.lendCoin})`
    : "coin";
}

export function formatApr(apr) {
  const value = toNum(apr);
  if (value <= 0) return "";
  if (value < 0.01) return "<0.01%";
  return `${fmt(value, value >= 10 ? 1 : 2)}%`;
}

export function getLockUntilMs(value) {
  const timestamp = Number(value);
  if (!(timestamp > 0)) return 0;

  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

export function formatLockUntil(value) {
  const ms = getLockUntilMs(value);
  if (!ms) return "";

  return new Date(ms).toLocaleString();
}

export function AprText({ apr, label = true }) {
  const text = formatApr(apr);
  return text ? (
    <span className="lendApr">
      {label && <span className="gray">apr: </span>}
      {text}
    </span>
  ) : null;
}

export function LendCoinInfoCard({ coin, name, lockedUntilTimestamp = 0 }) {
  const cleanCoin = String(coin || "").trim();
  const cleanName = String(name || "").trim();
  const lockText = formatLockUntil(lockedUntilTimestamp);
  if ((!cleanName || cleanName == cleanCoin) && !lockText) return null;

  return (
    <span className="infoCard">
      <span className="infoCardTitle">{cleanCoin}</span>
      {cleanName && cleanName != cleanCoin && <span>{cleanName}</span>}
      {lockText && (
        <span>
          locked until <span className="gray">{lockText}</span>
        </span>
      )}
    </span>
  );
}

export function getMarketCoinBalance(chainE, coin = "", address = "", selectedWalletEntry) {
  return getCoinBalanceByAddress(chainE, coin, address, selectedWalletEntry);
}

export function MarketCoinBalance({ balance = {} }) {
  if (!hasLoadedBalance(balance)) return null;

  return <span>{pc(balance.balance)}</span>;
}

export function getBalanceQty(balance = {}) {
  return hasLoadedBalance(balance) ? toNum(balance.balance) : 0;
}

function sortMarketRows(rows = [], key = "") {
  return sortTradePickerRows(
    rows,
    key,
    {
      underlyingCoin: (entry) => entry.underlyingCoin,
      underlyingQty: (entry) => entry.underlyingQty,
      lendCoin: (entry) => entry.lendCoin,
      lendQty: (entry) => entry.lendQty,
      apr: (entry) => entry.aprValue,
    },
    {
      underlyingQty: "desc",
      lendQty: "desc",
      apr: "desc",
    },
  );
}

export function YieldMarketPicker({
  marketPickerRef,
  marketButtonWidth,
  chainName = "",
  defi = "",
  market = "",
  marketE,
  getMarketLabel = () => "",
  showMarketMenu = false,
  setShowMarketMenu = () => {},
  prevMarket = () => {},
  nextMarket = () => {},
  visibleAddedMarkets = [],
  addedRows = [],
  allRows = [],
  allLoading = false,
  allError = "",
  allProtocolLabel = "",
  retryAllMarkets = () => {},
  addedMarketSort = "",
  setAddedMarketSort = () => {},
  allMarketSort = "",
  setAllMarketSort = () => {},
  selectMarket = () => {},
  openProtocolCoinConfirm = () => {},
  addingCoin = false,
  marketSupplyApr = 0,
  getLockedUntil = () => 0,
  MarketCoinBalance,
  AprText,
  LendCoinInfoCard,
}) {
  function toggleMarketSort(section = "added", key = "") {
    const setter = section == "all" ? setAllMarketSort : setAddedMarketSort;
    toggleTradePickerSort(setter, key);
  }

  function SortHeader({ section = "added", sortKey = "", children }) {
    const current = section == "all" ? allMarketSort : addedMarketSort;

    return (
      <TradePickerSortHeader
        activeSort={current}
        sortKey={sortKey}
        onSort={() => toggleMarketSort(section, sortKey)}
      >
        {children}
      </TradePickerSortHeader>
    );
  }

  return (
    <div className="selectCycle walletCycle lendMarketCycle">
      <button
        type="button"
        className="btn small bgGray"
        onClick={prevMarket}
        disabled={visibleAddedMarkets.length < 2}
      >
        {"<"}
      </button>
      <div className="sendWalletPicker" ref={marketPickerRef}>
        <button
          type="button"
          className="sendWalletPickerButton"
          style={{ width: marketButtonWidth }}
          disabled={!chainName}
          onClick={() => setShowMarketMenu((show) => !show)}
        >
          {marketE ? getMarketLabel(marketE) : "no coin"}
        </button>
        {showMarketMenu && (
          <TradePickerMenu className="lendMarketMenu">
            <TradePickerColumn title="added">
              <TradePickerTable
                className="lendMarketAddedTable"
                headers={[
                  <SortHeader sortKey="underlyingCoin">coin</SortHeader>,
                  <SortHeader sortKey="underlyingQty">qty</SortHeader>,
                  <SortHeader sortKey="lendCoin">coin</SortHeader>,
                  <SortHeader sortKey="lendQty">qty</SortHeader>,
                  <SortHeader sortKey="apr">apr</SortHeader>,
                ]}
              >
                <tbody>
                  {visibleAddedMarkets.length ? (
                    sortMarketRows(addedRows, addedMarketSort).map((entry) => (
                      <tr
                        key={`wallet_${entry.value}`}
                        className={
                          entry.value == market
                            ? "lendMarketRow on"
                            : "lendMarketRow"
                        }
                        onClick={() => selectMarket(entry.value)}
                      >
                        <td>
                          <span>{entry.underlyingCoin}</span>
                        </td>
                        <td>
                          <MarketCoinBalance balance={entry.underlyingBalance} />
                        </td>
                        <td>
                          <span className="infoHover hoverOnlyInfo lendMarketCoinHover">
                            <span className="gray">{entry.lendCoin}</span>
                            <LendCoinInfoCard
                              coin={entry.lendCoin}
                              name={entry.lendName}
                              lockedUntilTimestamp={getLockedUntil(entry.lendCoin)}
                            />
                          </span>
                        </td>
                        <td>
                          <MarketCoinBalance balance={entry.lendBalance} />
                        </td>
                        <td>
                          <AprText apr={entry.supplyApr} label={false} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="gray">
                        -
                      </td>
                    </tr>
                  )}
                </tbody>
              </TradePickerTable>
            </TradePickerColumn>
            <TradePickerColumn title="all">
              <TradePickerTable
                className="lendMarketAllTable"
                headers={[
                  <SortHeader section="all" sortKey="underlyingCoin">
                    coin
                  </SortHeader>,
                  <SortHeader section="all" sortKey="underlyingQty">
                    qty
                  </SortHeader>,
                  "add",
                  <SortHeader section="all" sortKey="lendCoin">
                    coin
                  </SortHeader>,
                  <SortHeader section="all" sortKey="lendQty">
                    qty
                  </SortHeader>,
                  "add",
                  <SortHeader section="all" sortKey="apr">
                    apr
                  </SortHeader>,
                ]}
              >
                <tbody>
                  {allLoading && (
                    <tr>
                      <td colSpan={7} className="gray">
                        loading {allProtocolLabel}...
                      </td>
                    </tr>
                  )}
                  {!allLoading && allError && visibleAddedMarkets.length > 0 && (
                    <tr>
                      <td colSpan={7} className="gray">
                        all added
                      </td>
                    </tr>
                  )}
                  {!allLoading && allError && !visibleAddedMarkets.length && (
                    <tr>
                      <td colSpan={6}>
                        <span className="red">{allError}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn small bgGray"
                          onClick={retryAllMarkets}
                        >
                          retry
                        </button>
                      </td>
                    </tr>
                  )}
                  {!allLoading && !allError && !allRows.length && (
                    <tr>
                      <td colSpan={6} className="gray">
                        {visibleAddedMarkets.length ? "all added" : "-"}
                      </td>
                      <td>
                        {!visibleAddedMarkets.length && (
                          <button
                            type="button"
                            className="btn small bgGray"
                            onClick={retryAllMarkets}
                          >
                            retry
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                  {!allLoading &&
                    !allError &&
                    sortMarketRows(allRows, allMarketSort).map((entry) => (
                      <tr
                        key={`${defi}_${entry.value}`}
                        className={
                          entry.addedValue == market
                            ? "lendMarketRow on"
                            : "lendMarketRow"
                        }
                      >
                        <td>
                          <button
                            type="button"
                            className="lendMarketAllSelect"
                            onClick={() =>
                              selectMarket(entry.addedValue || entry.value)
                            }
                            title={entry.underlyingName}
                          >
                            <span>{entry.underlyingCoin}</span>
                          </button>
                        </td>
                        <td>
                          <MarketCoinBalance balance={entry.underlyingBalance} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={
                              entry.addedUnderlying
                                ? "btn small bgGray"
                                : "btn small bgCyan"
                            }
                            onClick={(e) =>
                              openProtocolCoinConfirm(e, entry, "underlying")
                            }
                            disabled={entry.addedUnderlying || addingCoin}
                            title={entry.underlyingName}
                          >
                            {entry.addedUnderlying ? "✓" : "+"}
                          </button>
                        </td>
                        <td>
                          <span className="infoHover hoverOnlyInfo lendMarketCoinHover">
                            <button
                              type="button"
                              className="lendMarketAllSelect lendMarketAllLendSelect"
                              onClick={() =>
                                selectMarket(entry.addedValue || entry.value)
                              }
                            >
                              <span className="gray">{entry.lendCoin}</span>
                            </button>
                            <LendCoinInfoCard
                              coin={entry.lendCoin}
                              name={entry.lendName}
                              lockedUntilTimestamp={getLockedUntil(entry.lendCoin)}
                            />
                          </span>
                        </td>
                        <td>
                          <MarketCoinBalance balance={entry.lendBalance} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className={
                              entry.addedLend
                                ? "btn small bgGray"
                                : "btn small bgCyan"
                            }
                            onClick={(e) => openProtocolCoinConfirm(e, entry)}
                            disabled={entry.addedLend || addingCoin}
                          >
                            {entry.addedLend ? "✓" : "+"}
                          </button>
                        </td>
                        <td>
                          <AprText apr={entry.supplyApr} label={false} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </TradePickerTable>
            </TradePickerColumn>
          </TradePickerMenu>
        )}
      </div>
      <button
        type="button"
        className="btn small bgGray"
        onClick={nextMarket}
        disabled={visibleAddedMarkets.length < 2}
      >
        {">"}
      </button>
      <span className="lendSelectedApr">
        <AprText apr={marketSupplyApr} />
      </span>
    </div>
  );
}
