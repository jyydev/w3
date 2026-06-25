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

const coinM = {
  BSC: bsc,
  Ethereum: ethereum,
  Arbitrum: arbitrum,
  Optimism: optimism,
  Base: base,
  zkSyncEra: zkSyncEra,
  Kaia: kaia,
  WEMIX: wemix,
  Avalanche: avalanche,
  Solana: solana,
};

export default coinM;
