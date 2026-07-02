"use client";

import {
  TradePickerColumn,
  TradePickerMenu,
  TradePickerSortHeader,
  TradePickerTable,
  sortTradePickerRows,
  toggleTradePickerSort,
} from "../clientShared";

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
