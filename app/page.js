// import getAccs, { ac0, ac1 } from "@/fn/accs";
// import get from "@/fn/get";
// import Fr from "@/components/Fr";
// import toFrW from "@/fn/toFrW";
// import toM from "@/fn/toM";
import Logo from "@/components/Logo";

async function App() {
  console.log("render");
  // let ck = await getNxCookies();

  // let umFrSym = [
  //   "BTCUSDT",
  //   "BTCUSD1",
  //   "BTCU",
  //   "ETHUSDT",
  //   "ETHUSD1",
  //   "ETHU",
  //   "SOLUSDT",
  //   "SOLUSD1",
  //   ...(ck["getUmFrSyms"]?.toUpperCase()?.split(" ") ?? []), //from cookie
  // ];

  // let umFrP = [];
  // umFrP = umFrSym.map((symbol) => get("/fapi/v3/fundingRate", { symbol }, ac0));
  // let [
  //   tickR,
  //   umTick24R,
  //   umTickR,
  //   umFrR,
  // ] = await Promise.all([
  //   get("/api/v3/ticker/24hr"), // get("/api/v3/ticker/24hr", { symbols: sify(tickSyms) }, ac0),
  //   get("/fapi/v3/ticker/24hr"),
  //   get("/fapi/v3/premiumIndex"),
  //   Promise.all(umFrP),
  // ]);

  // let bfusdApy, bfusdApyFR;
  // if (ck["getBfusdWeb"]) {
  //   let bfusd$ = cheerio.load(bfusdHtml);
  //   bfusdApy =
  //     bfusd$('div:contains("Base APY") > span.text-TextBuy').html()?.slice(0, -1) ??
  //     Infinity;
  //   bfusdApyFR = pc(bfusdApy / 1095, 2);
  // } //backup

  return (
    <div>
      {console.log("return")}
      <div className="flex mb-1">
        <Logo />
      </div>
    </div>
  );
}

export default App;
