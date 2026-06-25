export function isCm(symbol) {
  return symbol?.includes("USD_"); // _PERP doens't includes CM delivery
}
export function isDelivery(symbol) {
  return !!symbol.match(/_\d+$/); // return null if no match, arrray if match
}
export function splitSym(sym) {
  let m =
    sym?.match(/^(nil)(.*)$/) ??
    sym?.match(
      /^(.*?)(nil|USDT|USDC|USD1|U|USDF|FDUSD|BFUSD|USDE|BTC|WBETH|ETH|BNSOL|SOL)$/,
    );
  return m ? [m[1], m[2]] : [sym, ""];
}
export function toCoin(sym) {
  return splitSym(sym)?.[0] || sym; //old: return symbol.match(/^(.*)USD/)?.[1] || symbol;
}
export function toQuote(sym) {
  return splitSym(sym)?.[1] || sym; // return this.splitSym(sym)?.[1] || sym;
}
export function quote2Suffix(quote) {
  return quote.replace(/(USDT|USD)/, "").toLowerCase();
}

export function sliceSym1000(sym) {
  if (sym.slice(0, 4) == "1000") sym = sym.slice(4);
  return sym;
}
export function pc(v, pr = {}) {
  return prec(v, pr?.pc ?? 3, { k: 1, floor: 1, ...pr });
}

// export function rg(n, { pc, dollar, k, c, fix } = {}) {
export function rg(n, op = {}) {
  let pc = op.pc || 3,
    d = op.dollar || op.d || 0,
    k = op.k || 1,
    c = op.c || 1,
    fix = op.toFixed ?? op.fixed ?? op.fix,
    type = op.type; // ceil floor undefined(round)
  return (
    <span className={n > 0 ? "green" : n < 0 ? "red" : ""}>
      {fix ? toFixed(n, fix, type) : prec(n, pc, { d, k, c, type })}
    </span>
  );
}
