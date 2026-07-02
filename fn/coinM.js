import arbitrum from "../data/coins/arbitrum.js";
import avalanche from "../data/coins/avalanche.js";
import base from "../data/coins/base.js";
import bsc from "../data/coins/bsc.js";
import ethereum from "../data/coins/ethereum.js";
import kaia from "../data/coins/kaia.js";
import optimism from "../data/coins/optimism.js";
import solana from "../data/coins/solana.js";
import wemix from "../data/coins/wemix.js";
import zkSyncEra from "../data/coins/zkSyncEra.js";

function coinListToM(coins = []) {
  if (!Array.isArray(coins)) return coins || {};

  return Object.fromEntries(
    coins
      .filter((entry) => entry && typeof entry == "object" && entry.coin)
      .map(({ coin, ...entry }) => [String(coin).trim(), entry])
      .filter(([coin]) => coin),
  );
}

const coinM = {
  BSC: coinListToM(bsc),
  Ethereum: coinListToM(ethereum),
  Arbitrum: coinListToM(arbitrum),
  Optimism: coinListToM(optimism),
  Base: coinListToM(base),
  zkSyncEra: coinListToM(zkSyncEra),
  Kaia: coinListToM(kaia),
  WEMIX: coinListToM(wemix),
  Avalanche: coinListToM(avalanche),
  Solana: coinListToM(solana),
};

export default coinM;
