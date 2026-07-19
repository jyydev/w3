import arbitrum from "../data/coins/arbitrum.js";
import avalanche from "../data/coins/avalanche.js";
import base from "../data/coins/base.js";
import bsc from "../data/coins/bsc.js";
import celo from "../data/coins/celo.js";
import ethereum from "../data/coins/ethereum.js";
import fantom from "../data/coins/fantom.js";
import gnosis from "../data/coins/gnosis.js";
import kaia from "../data/coins/kaia.js";
import linea from "../data/coins/linea.js";
import mantle from "../data/coins/mantle.js";
import metis from "../data/coins/metis.js";
import optimism from "../data/coins/optimism.js";
import polygon from "../data/coins/polygon.js";
import scroll from "../data/coins/scroll.js";
import sonic from "../data/coins/sonic.js";
import solana from "../data/coins/solana.js";
import tron from "../data/coins/tron.js";
import soneium from "../data/coins/soneium.js";
import wemix from "../data/coins/wemix.js";
import xLayer from "../data/coins/xLayer.js";
import zkSyncEra from "../data/coins/zkSyncEra.js";

function coinListToM(coins = []) {
  return Object.fromEntries(
    (Array.isArray(coins) ? coins : [])
      .filter((entry) => entry && typeof entry == "object" && entry.coin)
      .map(({ coin, ...entry }) => [String(coin).trim(), entry])
      .filter(([coin]) => coin),
  );
}

const coinM = {
  Ethereum: coinListToM(ethereum),
  BSC: coinListToM(bsc),
  Arbitrum: coinListToM(arbitrum),
  Optimism: coinListToM(optimism),
  Base: coinListToM(base),
  Avalanche: coinListToM(avalanche),
  Polygon: coinListToM(polygon),
  Kaia: coinListToM(kaia),
  WEMIX: coinListToM(wemix),
  Gnosis: coinListToM(gnosis),
  Sonic: coinListToM(sonic),
  XLayer: coinListToM(xLayer),
  Metis: coinListToM(metis),
  Soneium: coinListToM(soneium),
  Mantle: coinListToM(mantle),
  Celo: coinListToM(celo),
  Linea: coinListToM(linea),
  Scroll: coinListToM(scroll),
  zkSyncEra: coinListToM(zkSyncEra),
  Fantom: coinListToM(fantom),
  Solana: coinListToM(solana),
  Tron: coinListToM(tron),
};

export default coinM;
