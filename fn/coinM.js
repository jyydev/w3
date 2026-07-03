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
  BSC: coinListToM(bsc),
  Ethereum: coinListToM(ethereum),
  Polygon: coinListToM(polygon),
  Gnosis: coinListToM(gnosis),
  Fantom: coinListToM(fantom),
  Sonic: coinListToM(sonic),
  XLayer: coinListToM(xLayer),
  Metis: coinListToM(metis),
  Soneium: coinListToM(soneium),
  Mantle: coinListToM(mantle),
  Celo: coinListToM(celo),
  Arbitrum: coinListToM(arbitrum),
  Optimism: coinListToM(optimism),
  Base: coinListToM(base),
  Linea: coinListToM(linea),
  Scroll: coinListToM(scroll),
  zkSyncEra: coinListToM(zkSyncEra),
  Kaia: coinListToM(kaia),
  WEMIX: coinListToM(wemix),
  Avalanche: coinListToM(avalanche),
  Solana: coinListToM(solana),
};

export default coinM;
