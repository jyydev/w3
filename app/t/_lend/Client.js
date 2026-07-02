"use client";

import { pc } from "@/fn/basic";
import {
  fmt,
  getCoinTypeOptions,
  getCoinBalanceByAddress,
  getChainCoins,
  getExplorerAddressUrl,
  getSelectedBalance,
  getTradeModeCookie,
  getTokenAddressKey,
  hasLoadedBalance,
  lendingOptions,
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
} from "../clientShared";
import {
  getAaveUnderlyingCoin,
  isAaveChainAvailable,
  isAaveCoin,
} from "./aave/Client";
import {
  getJupiterUnderlyingCoin,
  isJupiterChainAvailable,
  isJupiterCoin,
} from "./jupiter/Client";
import {
  isMorphoChainAvailable,
  isMorphoCoin,
} from "./morpho/Client";
import {
  isVenusChainAvailable,
  isVenusCoin,
} from "./venus/Client";

export {
  getCoinTypeOptions,
  getExplorerAddressUrl,
  getSelectedBalance,
  getTokenAddressKey,
  hasLoadedBalance,
  sameAddressText,
  withClientTimeout,
};

export function formatApr(apr) {
  const value = toNum(apr);
  if (value <= 0) return "";
  if (value < 0.01) return "<0.01%";
  return `${fmt(value, value >= 10 ? 1 : 2)}%`;
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

export function LendCoinInfoCard({ coin, name }) {
  const cleanCoin = String(coin || "").trim();
  const cleanName = String(name || "").trim();
  if (!cleanName || cleanName == cleanCoin) return null;

  return (
    <span className="infoCard">
      <span className="infoCardTitle">{cleanCoin}</span>
      <span>{cleanName}</span>
    </span>
  );
}

export function getUnderlyingCoin(chainE, lendCoin, protocol = "") {
  const coinInfoM = chainE?.coinInfoM || {};
  const lendE = coinInfoM[lendCoin] || {};
  const text = `${lendCoin} ${lendE.name || ""}`.toLowerCase();
  const protocolUnderlying =
    protocol == "aave" ? getAaveUnderlyingCoin(lendCoin) : "";
  if (protocolUnderlying) return protocolUnderlying;

  const candidates = getChainCoins(chainE)
    .filter((coin) => coin != lendCoin)
    .filter((coin) => coinInfoM[coin]?.type != "lend")
    .sort((a, b) => b.length - a.length);

  return (
    candidates.find((coin) => text.includes(coin.toLowerCase())) ||
    candidates.find((coin) =>
      ["USDT", "USDC", "USDS", "EURC", "DAI", "USD1"].includes(coin),
    ) ||
    ""
  );
}

export function isProtocolCoin(protocol, coin, coinE = {}) {
  if (protocol == "aave") return isAaveCoin(coin, coinE);
  if (protocol == "venus") return isVenusCoin(coin, coinE);
  if (protocol == "jupiter") return isJupiterCoin(coin, coinE);
  if (protocol == "morpho") return isMorphoCoin(coin, coinE);

  return false;
}

export function getLendingMarkets(chainE, protocol) {
  if (!chainE || !protocol) return [];

  return getChainCoins(chainE)
    .filter((coin) => isProtocolCoin(protocol, coin, chainE.coinInfoM?.[coin]))
    .map((lendCoin) => {
      const lendE = chainE.coinInfoM?.[lendCoin] || {};
      const underlyingCoin =
        protocol == "jupiter"
          ? getJupiterUnderlyingCoin(chainE, lendCoin) ||
            getUnderlyingCoin(chainE, lendCoin, protocol)
          : getUnderlyingCoin(chainE, lendCoin, protocol);

      return {
        value: lendCoin,
        lendCoin,
        lendName: lendE.name || lendCoin,
        lendAddress: lendE.address || "",
        lendDecimals: lendE.decimals,
        underlyingCoin,
        underlyingAddress: chainE.coinInfoM?.[underlyingCoin]?.address || "",
        underlyingDecimals: chainE.coinInfoM?.[underlyingCoin]?.decimals,
      };
    })
    .filter((entry) => protocol == "jupiter" || entry.underlyingCoin);
}

export function getMarketLabel(entry = {}) {
  return entry?.underlyingCoin
    ? `${entry.underlyingCoin} (${entry.lendCoin})`
    : "coin";
}

export function getProtocolCookie(base = "", walletType = "evm", defi = "", chain = "") {
  return [
    getTradeModeCookie(base, walletType),
    defi || "defi",
    chain || "",
  ]
    .filter(Boolean)
    .join("_");
}

export function getInitialCookie(initialCookieM = {}, name = "") {
  const value = initialCookieM?.[name];
  return value === undefined ? undefined : String(value);
}

export function getInitialLendDefi(
  initialCookieM = {},
  walletType = "evm",
  cookieName = "",
) {
  const savedDefi = getInitialCookie(
    initialCookieM,
    getTradeModeCookie(cookieName, walletType),
  );
  const options = lendingOptions.filter((option) =>
    isLendingProtocolSupportedForWallet(option, walletType),
  );

  return options.some((entry) => entry.value == savedDefi)
    ? savedDefi
    : options[0]?.value || "";
}

export function getMarketSupplyApr({ chainE, defi, marketE, rawMarkets = [] } = {}) {
  if (defi != "aave" && defi != "venus" && defi != "jupiter") return 0;
  if (marketE?.supplyApr) return toNum(marketE.supplyApr);

  const lendAddress =
    marketE?.lendAddress || chainE?.coinInfoM?.[marketE?.lendCoin]?.address || "";
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

export function useLendAllMarkets({
  enabled = false,
  cacheKey = "",
  chain = "",
  protocolLabel = "Lend",
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

export function useLendDirectMarketBalance({
  enabled = false,
  cacheKey = "",
  walletAddress = "",
  chain = "",
  marketE = {},
  getMarketBalance,
  protocolLabel = "Lend",
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

export function isLendingProtocolSupportedForWallet(option = {}, walletType = "evm") {
  if (walletType == "solana") return option.value == "jupiter";
  if (option.value == "jupiter") return false;

  return true;
}

export function getLendMarketChains(chainList = [], chainMarketsM = {}, defi = "") {
  return chainList
    .filter((chainE) => {
      const chainMarkets = chainMarketsM[chainE.chain] || [];
      if (defi == "aave") {
        return isAaveChainAvailable(chainE.chain, chainMarkets);
      }
      if (defi == "jupiter") return isJupiterChainAvailable(chainE.chain);
      if (defi == "morpho") {
        return isMorphoChainAvailable(chainE.chain, chainMarkets);
      }

      return isVenusChainAvailable(chainE.chain, chainMarkets);
    })
    .map((chainE) => chainE.chain);
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

function getAllMarketSelectValue(entry = {}) {
  return entry.addedUnderlying && entry.addedLend && entry.addedValue
    ? entry.addedValue
    : entry.value;
}

export function LendMarketPicker({
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
  rawAllMarkets = [],
  allLoading = false,
  allError = "",
  allProtocolLabel = "",
  retryAllMarkets = () => {},
  jupiterAllKey = "",
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
                            <span>
                              <span className="gray">{entry.lendCoin}</span>
                            </span>
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
                  {!allLoading && allError && (
                    <tr>
                      <td colSpan={7}>
                        <span className="red">{allError}</span>{" "}
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
                      <td colSpan={7}>
                        <span className="gray">
                          {defi == "jupiter" && !jupiterAllKey
                            ? "Solana not loaded"
                            : rawAllMarkets.length
                              ? "all added"
                              : "-"}
                        </span>
                        {!rawAllMarkets.length &&
                        (defi != "jupiter" || jupiterAllKey) ? (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="btn small bgGray"
                              onClick={retryAllMarkets}
                            >
                              retry
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  )}
                  {!allLoading &&
                    !allError &&
                    sortMarketRows(allRows, allMarketSort).map((entry) => (
                      <tr
                        key={`${defi}_${entry.value}`}
                        className={
                          getAllMarketSelectValue(entry) == market
                            ? "lendMarketRow on"
                            : "lendMarketRow"
                        }
                      >
                        <td>
                          <button
                            type="button"
                            className="lendMarketAllSelect"
                            onClick={() =>
                              selectMarket(getAllMarketSelectValue(entry))
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
                                selectMarket(getAllMarketSelectValue(entry))
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
