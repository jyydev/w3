"use client";

import toast from "react-hot-toast";
import { pc } from "@/fn/basic";
import {
  emitTradeChainSelect,
  TradePickerColumn,
  TradePickerMenu,
  TradePickerTable,
} from "../../clientShared";

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
    <TradePickerMenu className="swapCoinMenu">
      <TradePickerColumn title="added">
        <TradePickerTable
          className="swapCoinAddedTable"
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
                      "lendMarketRow",
                      coin == selectedCoin ? "on" : "",
                      supported ? "" : "unsupported",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      <button
                        type="button"
                        className="lendMarketAllSelect swapCoinAllSelect"
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
          className="swapCoinAllTable"
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
                        ? "lendMarketRow on"
                        : "lendMarketRow"
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="lendMarketAllSelect swapCoinAllSelect"
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
    <TradePickerMenu className="swapChainMenu">
      <TradePickerColumn title="added">
        <TradePickerTable
          className="swapChainAddedTable"
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
                      "lendMarketRow",
                      chain == selectedChain ? "on" : "",
                      supported ? "" : "unsupported",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      <button
                        type="button"
                        className="lendMarketAllSelect swapChainAllSelect"
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
          className="swapChainAllTable"
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
                        ? "lendMarketRow on"
                        : "lendMarketRow"
                    }
                  >
                    <td>
                      <button
                        type="button"
                        className="lendMarketAllSelect swapChainAllSelect"
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
    <div className="selectCycle walletCycle swapCoinCycle">
      <div className="sendWalletPicker" ref={pickerRef}>
        <button
          type="button"
          className="sendWalletPickerButton"
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
      <button
        type="button"
        className="btn small bgGray"
        onClick={onNext}
        disabled={addedCoins.length < 2 && allCoins.length < 2}
      >
        {">"}
      </button>
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
    <div className="selectCycle walletCycle swapChainCycle">
      <div className="sendWalletPicker" ref={pickerRef}>
        <button
          type="button"
          className="sendWalletPickerButton"
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
      <button
        type="button"
        className="btn small bgGray"
        onClick={onNext}
        disabled={addedChains.length < 2 && allChains.length < 2}
      >
        {">"}
      </button>
    </div>
  );
}

export default function HyperliquidClient({ children }) {
  return children;
}
