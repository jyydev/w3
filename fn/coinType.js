const stableSymbols = new Set([
  "BFUSD",
  "BSC-USD",
  "BUSD",
  "DAI",
  "DAI.E",
  "FDUSD",
  "FRAX",
  "KDAI",
  "LUSD",
  "OUSDC",
  "OUSDT",
  "USDC",
  "USDC.E",
  "USDBC",
  "USDD",
  "USDE",
  "USDF",
  "USDS",
  "USDT",
  "USDT.E",
  "USD1",
  "WEMIX$",
]);
const governanceSymbols = new Set([
  "AAVE",
  "ARB",
  "CAKE",
  "COMP",
  "CRV",
  "FXS",
  "GMX",
  "LDO",
  "MKR",
  "PENDLE",
  "UNI",
]);
const wrappedSymbolPatterns = [
  /^W[A-Z0-9]+$/,
  /^BTCB$/,
  /^BTC\.B$/,
  /^WBTC(?:\.E)?$/,
  /^WETH(?:\.E)?$/,
];

function includesAny(value, words) {
  const lower = String(value || "").toLowerCase();
  return words.some((word) => lower.includes(word));
}

function isStableSymbol(symbol) {
  const upper = String(symbol || "").toUpperCase();
  return (
    stableSymbols.has(upper) || /^(?:[A-Z]+)?USD[A-Z0-9.]*$/.test(upper)
  );
}

function isWrappedSymbol(symbol) {
  const upper = String(symbol || "").toUpperCase();
  return wrappedSymbolPatterns.some((pattern) => pattern.test(upper));
}

export function detectCoinTextType({
  name = "",
  symbol = "",
  ref = "",
} = {}) {
  const text = `${name} ${symbol} ${ref}`;
  if (
    includesAny(text, [
      "aave",
      "compound",
      "fluid",
      "jtoken",
      "justlend",
      "venus",
      "lending",
      "ctoken",
      "atoken",
    ])
  ) {
    return "lend";
  }
  if (
    includesAny(text, [
      "vault",
      "savings",
      "yield",
      "staked",
      "staking",
      "receipt",
      "wrapped staked",
    ])
  ) {
    return "yield";
  }
  if (
    isStableSymbol(symbol) ||
    includesAny(`${name} ${ref}`, ["stablecoin", "stable coin"])
  ) {
    return "stable";
  }
  if (
    isWrappedSymbol(symbol) ||
    includesAny(`${name} ${ref}`, ["wrapped", "binance-peg"])
  ) {
    return "wrapped";
  }
  if (governanceSymbols.has(String(symbol || "").toUpperCase())) {
    return "governance";
  }
  if (includesAny(text, ["aster", "perp", "trading"])) return "trading";

  return "token";
}
