import fs from "fs/promises";
import path from "path";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ethers } from "ethers";
import baseHyperliquidVaults from "@/data/defi/hyperliquid";
import { chainIds, defaultMulticallAddress, multicalls } from "@/data/basic";
import getCoinM from "@/fn/getCoinM";
import { alchemyNetworks, rpcs, scanners, sets } from "@/sets";
import {
  cleanErrorText,
  createJsonRpcProvider,
  logRpcFailure,
  toCleanError,
} from "../_fn/shared";
import { getWalletDisableKey } from "./walletSettingData";

const walletRootDir = path.join(process.cwd(), "data", "editor", "wallets");
const customCoinRootDir = path.join(process.cwd(), "data", "editor", "coins");
const customDefiRootDir = path.join(process.cwd(), "data", "editor", "defi");
export const defaultWalletType = "evm";
export const walletTypes = ["evm", "solana"];
const walletFileExt = ".json";
const dexChainM = {
  BSC: "bsc",
  Ethereum: "ethereum",
  Arbitrum: "arbitrum",
  Optimism: "optimism",
  Base: "base",
  zkSyncEra: "zksync",
  Kaia: "kaia",
  WEMIX: "wemix",
  Avalanche: "avalanche",
  Solana: "solana",
};
const llamaChainM = {
  BSC: "bsc",
  Ethereum: "ethereum",
  Arbitrum: "arbitrum",
  Optimism: "optimism",
  Base: "base",
  zkSyncEra: "era",
  Kaia: "klaytn",
  WEMIX: "wemix",
  Avalanche: "avax",
  Solana: "solana",
};
const nativePriceTokenM = {
  BSC: {
    BNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  },
  Ethereum: {
    ETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  Arbitrum: {
    ETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  },
  Optimism: {
    ETH: "0x4200000000000000000000000000000000000006",
  },
  Base: {
    ETH: "0x4200000000000000000000000000000000000006",
  },
  zkSyncEra: {
    ETH: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91",
  },
  Kaia: {
    KAIA: "0x19aac5f612f524b754ca7e7c41cbfa2e981a4432",
  },
  WEMIX: {
    WEMIX: "0x7d72b22a74a216af4a002a1095c8c707d6ec1c5f",
  },
  Avalanche: {
    AVAX: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  },
  Solana: {
    SOL: "So11111111111111111111111111111111111111112",
  },
};
const stableCoins = new Set([
  "USDT",
  "USDC",
  "USDC.E",
  "USDbC",
  "USDBC",
  "WEMIX$",
  "OUSDC",
  "OUSDT",
  "USDT.E",
  "USDE",
  "USDS",
  "DAI.E",
  "KDAI",
  "FDUSD",
  "BFUSD",
  "BUSD",
  "USD1",
  "USDF",
  "DAI",
]);
const multicallChunkSize = 200;
const solanaWalletChunkSize = 10;
const solanaRpcTimeoutMs = 7000;
const priceFetchTimeoutMs = 3500;
const alchemyFetchTimeoutMs = 10000;
const alchemyWalletChunkSize = 2;
const alchemyPortfolioBaseUrl = "https://api.g.alchemy.com/data/v1";
const failedRpcCooldownMs = 60_000;
const failedRpcM = globalThis.__w3FailedRpcM || new Map();
globalThis.__w3FailedRpcM = failedRpcM;
const hyperliquidApiBase =
  process.env.HYPERLIQUID_API_BASE ||
  process.env.hyperliquid_api_base ||
  "https://api.hyperliquid.xyz";
const hyperliquidFetchTimeoutMs = 5000;
const solanaTokenProgramIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
const reservedWalletNames = new Set(["watch"]);
const claimChain = "Claim";
const aaveStakingRewardTimeoutMs = 8000;
const erc20Interface = new ethers.Interface([
  "function balanceOf(address account) view returns (uint256)",
]);
const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const exchangeRateInterface = new ethers.Interface([
  "function exchangeRateStored() view returns (uint256)",
  "function underlying() view returns (address)",
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
  "function asset() view returns (address)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);
const multicallAbi = [
  "function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256)",
];
const multicallInterface = new ethers.Interface(multicallAbi);
const aaveStakingVaultInterface = new ethers.Interface([
  "function REWARDS_CONTROLLER() view returns (address)",
]);
const aaveRewardsControllerInterface = new ethers.Interface([
  "function calculateCurrentUserRewards(address asset,address user) view returns (address[] rewards,uint256[] rewardsAccrued)",
]);
const wemixWonderStakeCoin = "WEMIX-W41";
const wemixWonderStakeContract = "0x6Af09e1A3c886dd8560bf4Cabd65dB16Ea2724D8";
const wemixWonderStakeCoinE = {
  address: wemixWonderStakeContract,
  decimals: 18,
  name: "WEMIX WONDER 41 Staked",
  synthetic: true,
  syntheticInfo: "Derived from WEMIX WONDER staking contract balance",
  type: "yield",
  ref: "WEMIX Stake: WONDER 41",
};
const wemixWonderStakePid = 41n;
const wemixWonderStakeInterface = new ethers.Interface([
  "function getUserInfo(uint256 pid,address user) view returns (uint256 amount,uint256 rewardDebt,uint256 rewardDebtAtBlock,uint256 rewardDebtMP,uint256 lastRewardBlock)",
  "function pendingReward(uint256 pid,address user) view returns (uint256)",
]);

function withTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ])
    .catch((error) => {
      throw toCleanError(error, message);
    })
    .finally(() => clearTimeout(timer));
}

async function fetchWithTimeout(url, options = {}, ms = priceFetchTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getChainE(chain) {
  const chainRpc = rpcs?.[chain];
  if (!chainRpc) return null;
  if (Array.isArray(chainRpc) || typeof chainRpc == "string") {
    return {
      chain,
      rpc: chainRpc,
      multicall: multicalls?.[chain] ?? defaultMulticallAddress,
    };
  }

  return {
    chain,
    rpc: chainRpc.rpc ?? chainRpc.rpcs ?? chainRpc.urls,
    multicall:
      chainRpc.multicall ??
      chainRpc.multicallAddress ??
      multicalls?.[chain] ??
      defaultMulticallAddress,
  };
}

function getRpcs(chainE) {
  const rpcs = Array.isArray(chainE.rpc) ? chainE.rpc : [chainE.rpc];
  return rpcs
    .map((rpc) => (typeof rpc == "string" ? rpc : rpc?.rpc))
    .map((rpc) => String(rpc || "").trim())
    .filter((rpc) => /^https?:\/\//i.test(rpc));
}

function getLiveRpcs(chainE) {
  const now = Date.now();
  return getRpcs(chainE).filter((rpc) => {
    const failedAt = failedRpcM.get(rpc) || 0;
    if (!failedAt || now - failedAt > failedRpcCooldownMs) {
      if (failedAt) failedRpcM.delete(rpc);
      return true;
    }

    return false;
  });
}

function getChainNetwork(chainE) {
  const chainId = chainIds?.[chainE?.chain];
  return Number.isInteger(chainId) ? { chainId, name: chainE.chain } : undefined;
}

function normalizeCustomCoinM(input = []) {
  return Object.fromEntries(
    (Array.isArray(input) ? input : [])
      .filter((entry) => entry && typeof entry == "object" && entry.coin)
      .map(({ coin, ...entry }) => [String(coin).trim(), entry])
      .filter(([coin]) => coin),
  );
}

async function readCustomCoins(chain = "") {
  const cleanChain = String(chain || "").trim();
  if (!cleanChain) return {};
  if (cleanChain == "Hyperliquid") {
    return readCustomHyperliquidVaultM();
  }

  try {
    const parsed = JSON.parse(
      await fs.readFile(path.join(customCoinRootDir, `${cleanChain}.json`), "utf8"),
    );
    return normalizeCustomCoinM(parsed);
  } catch (e) {
    if (e.code == "ENOENT") return {};
    return {};
  }
}

function cleanHyperliquidVaultCoin(value = "", address = "") {
  const clean = String(value || "")
    .trim()
    .replace(/\(([^)]{1,20})\)\s*$/, "$1")
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");
  const cleanAddress = String(address || "").replace(/^0x/i, "");
  const fallback = cleanAddress
    ? `HL_${cleanAddress.slice(0, 3)}..${cleanAddress.slice(-3)}`
    : "";

  return clean || fallback || "HL_VAULT";
}

function getHyperliquidVaultEntryCoin(entry = {}, fallbackAddress = "") {
  const name = String(entry.name || "").trim();
  const paren = name.match(/\(([^)]{1,20})\)\s*$/)?.[1] || "";

  return cleanHyperliquidVaultCoin(
    entry.coin || entry.symbol || paren || name,
    entry.address || fallbackAddress,
  );
}

function normalizeHyperliquidVaultEntries(input = [], { source = "hyperliquid" } = {}) {
  const rows = Array.isArray(input) ? input : [];
  const vaultM = {};
  const usedCoins = new Set();

  for (const entry of rows) {
    const address = String(entry?.address || entry?.vaultAddress || "").trim();
    if (!ethers.isAddress(address)) continue;

    const cleanAddress = ethers.getAddress(address);
    const baseCoin = getHyperliquidVaultEntryCoin(entry, cleanAddress);
    let coin = baseCoin;
    let i = 2;
    while (usedCoins.has(coin)) {
      coin = `${baseCoin}_${i}`;
      i += 1;
    }
    usedCoins.add(coin);

    vaultM[coin] = {
      address: cleanAddress,
      decimals: Number.isInteger(entry.decimals) ? entry.decimals : 6,
      name: String(entry.name || coin).trim() || coin,
      type: "vault",
      source: entry.source || source,
    };
  }

  return vaultM;
}

async function readCustomHyperliquidVaultM() {
  try {
    const parsed = JSON.parse(
      await fs.readFile(
        path.join(customDefiRootDir, "hyperliquid.json"),
        "utf8",
      ),
    );
    return normalizeHyperliquidVaultEntries(parsed, { source: "editor" });
  } catch (e) {
    if (e.code == "ENOENT") return {};
    return {};
  }
}

function getHyperliquidBaseVaultM() {
  return normalizeHyperliquidVaultEntries(baseHyperliquidVaults);
}

export async function readCustomCoinM(chains = []) {
  return Object.fromEntries(
    (
      await Promise.all(
        (Array.isArray(chains) ? chains : []).map(async (chain) => [
          chain,
          await readCustomCoins(chain),
        ]),
      )
    ).filter(([, coins]) => Object.keys(coins).length),
  );
}

export function getWalletType(walletType = defaultWalletType) {
  const type = String(walletType || defaultWalletType).toLowerCase();
  return walletTypes.includes(type) ? type : defaultWalletType;
}

function getWalletDir(walletType) {
  return path.join(walletRootDir, getWalletType(walletType));
}

function isReservedWalletPath(file) {
  return file
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((part) =>
      reservedWalletNames.has(part.replace(/\.(txt|json)$/i, "").toLowerCase()),
    );
}

async function getProvider(chainE, { timeoutMs = 0 } = {}) {
  let lastError;
  const network = getChainNetwork(chainE);

  for (const rpc of getLiveRpcs(chainE)) {
    const provider = createJsonRpcProvider(rpc, {
      chain: chainE?.chain,
      network,
      staticNetwork: !!network,
      scope: "wallet",
    });
    try {
      const blockPromise = provider.getBlockNumber();
      if (timeoutMs) {
        await withTimeout(blockPromise, timeoutMs, "rpc block timeout");
      } else {
        await withTimeout(blockPromise, 6000, "rpc block timeout");
      }
      return provider;
    } catch (e) {
      lastError = e;
      failedRpcM.set(rpc, Date.now());
      logRpcFailure({ scope: "wallet", chain: chainE?.chain, rpc, error: e });
      provider.destroy?.();
    }
  }

  throw new Error(
    cleanErrorText(lastError?.shortMessage ?? lastError?.message) ||
      "all rpcs failed",
  );
}

function getUsdPrice(coin, priceM, { usdPriceQuery = false } = {}) {
  const isStable = stableCoins.has(String(coin || "").toUpperCase());
  const queriedPrice = Number(priceM[coin] ?? 0);
  if (isStable) return usdPriceQuery && queriedPrice > 0 ? queriedPrice : 1;

  return queriedPrice;
}

function hasUsdPrice(coin, priceM, { usdPriceQuery = false } = {}) {
  const isStable = stableCoins.has(String(coin || "").toUpperCase());
  if (isStable && usdPriceQuery) return Number(priceM[coin] ?? 0) > 0;

  return getUsdPrice(coin, priceM, { usdPriceQuery }) > 0;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isUsdLikeCoin(coin, coinE = {}) {
  const text = `${coin} ${coinE.name || ""}`.toUpperCase();
  return /\bUSD[A-Z0-9.]*\b/.test(text) || /[A-Z]USD[A-Z0-9.]*/.test(text);
}

function getTokenAddress({ chain, coin, coinE }) {
  const address = String(coinE.address || "").trim();
  if (address) return address;
  return coinE.native ? nativePriceTokenM[chain]?.[coin] : "";
}

function getSolanaPublicKey(address) {
  try {
    return new PublicKey(String(address || "").trim());
  } catch {
    return null;
  }
}

function isSolanaAddress(address) {
  return !!getSolanaPublicKey(address);
}

function isTokenAddress(chain, address) {
  return chain == "Solana" ? isSolanaAddress(address) : ethers.isAddress(address);
}

function normalizePriceAddress(chain, address) {
  return chain == "Solana" ? address : address.toLowerCase();
}

function getPriceAddressCoins({
  chain,
  coinEntries,
  excludeCoins = new Set(),
  usdPriceQuery = false,
}) {
  return coinEntries
    .filter(
      ([coin]) =>
        (usdPriceQuery || !stableCoins.has(String(coin || "").toUpperCase())) &&
        !excludeCoins.has(coin),
    )
    .map(([coin, coinE]) => [coin, getTokenAddress({ chain, coin, coinE })])
    .filter(([, address]) => isTokenAddress(chain, address));
}

function getPairTokenPrice(pair, address) {
  const baseAddress = pair.baseToken?.address?.toLowerCase();
  const quoteAddress = pair.quoteToken?.address?.toLowerCase();
  const tokenAddress = address.toLowerCase();
  const priceUsd = Number(pair.priceUsd);

  if (baseAddress == tokenAddress) return priceUsd;

  const priceNative = Number(pair.priceNative);
  if (quoteAddress == tokenAddress && priceUsd > 0 && priceNative > 0) {
    return priceUsd / priceNative;
  }

  return 0;
}

async function getDexScreenerPrices({ chain, coinEntries, usdPriceQuery = false }) {
  const chainId = dexChainM[chain];
  if (!chainId) return {};

  const addressCoins = getPriceAddressCoins({ chain, coinEntries, usdPriceQuery });

  const priceM = {};

  for (let i = 0; i < addressCoins.length; i += 30) {
    const batch = addressCoins.slice(i, i + 30);
    const addressCoinM = {};
    for (const [coin, address] of batch) {
      const key = normalizePriceAddress(chain, address);
      addressCoinM[key] ??= [];
      addressCoinM[key].push(coin);
    }
    const url = `https://api.dexscreener.com/tokens/v1/${chainId}/${batch
      .map(([, address]) => address)
      .join(",")}`;

    const r = await fetchWithTimeout(url, { next: { revalidate: 15 } });
    if (!r.ok) continue;

    const pairs = await r.json();
    for (const pair of pairs || []) {
      const addresses = [
        pair.baseToken?.address,
        pair.quoteToken?.address,
      ]
        .filter(Boolean)
        .map((address) => normalizePriceAddress(chain, address));

      for (const address of addresses) {
        const coins = addressCoinM[address];
        if (!coins?.length) continue;

        const price = getPairTokenPrice(pair, address);
        const liquidity = Number(pair.liquidity?.usd ?? 0);
        for (const coin of coins) {
          if (price > 0 && liquidity >= (priceM[coin]?.liquidity ?? -1)) {
            priceM[coin] = { price, liquidity };
          }
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(priceM).map(([coin, e]) => [coin, e.price]),
  );
}

async function getDefiLlamaPrices({
  chain,
  coinEntries,
  excludeCoins,
  usdPriceQuery = false,
}) {
  const chainId = llamaChainM[chain];
  if (!chainId) return {};

  const addressCoins = getPriceAddressCoins({
    chain,
    coinEntries,
    excludeCoins,
    usdPriceQuery,
  });
  const priceM = {};

  for (let i = 0; i < addressCoins.length; i += 100) {
    const batch = addressCoins.slice(i, i + 100);
    const coinIdM = {};

    for (const [coin, address] of batch) {
      const coinId = `${chainId}:${normalizePriceAddress(chain, address)}`;
      coinIdM[coinId] ??= [];
      coinIdM[coinId].push(coin);
    }

    const url = `https://coins.llama.fi/prices/current/${Object.keys(coinIdM).join(
      ",",
    )}`;
    const r = await fetchWithTimeout(url, { next: { revalidate: 15 } });
    if (!r.ok) continue;

    const data = await r.json();
    for (const [coinId, coins] of Object.entries(coinIdM)) {
      const price = Number(data.coins?.[coinId]?.price);
      if (!Number.isFinite(price) || price <= 0) continue;

      for (const coin of coins) priceM[coin] = price;
    }
  }

  return priceM;
}

async function getPriceM({ chain, coinEntries, usdPriceQuery = false }) {
  let priceM = {};

  try {
    priceM = await getDefiLlamaPrices({
      chain,
      coinEntries,
      excludeCoins: new Set(),
      usdPriceQuery,
    });
  } catch {
    priceM = {};
  }

  const excludeCoins = new Set(Object.keys(priceM));
  try {
    return {
      ...priceM,
      ...(await getDexScreenerPrices({
        chain,
        coinEntries: coinEntries.filter(([coin]) => !excludeCoins.has(coin)),
        usdPriceQuery,
      })),
    };
  } catch {
    return priceM;
  }
}

export async function getCoinUsdPrice({
  chain = "",
  coin = "",
  coinE: dynamicCoinE = null,
  usdPriceQuery = false,
} = {}) {
  const coinM = getCoinM(chain);
  const suppliedCoinE =
    dynamicCoinE && typeof dynamicCoinE == "object" ? dynamicCoinE : null;
  const coinE = suppliedCoinE
    ? { ...(coinM?.[coin] || {}), ...suppliedCoinE }
    : coinM?.[coin];
  if (!coinE) return 0;

  const coinEntries = [[coin, coinE]];
  const allCoinEntries = [
    [coin, coinE],
    ...Object.entries(coinM || {}).filter(([entryCoin]) => entryCoin != coin),
  ];
  let priceM = await getPriceM({ chain, coinEntries, usdPriceQuery });
  let price = getUsdPrice(coin, priceM, { usdPriceQuery });
  if (price > 0) return price;
  if (chain == "Solana") return 0;

  const chainE = getChainE(chain);
  if (!chainE) return 0;

  let provider;
  try {
    provider = await getProvider(chainE, { timeoutMs: priceFetchTimeoutMs });
    const exchangePriceM = await withTimeout(
      getExchangeRatePrices({
        chain,
        provider,
        multicallAddress: ethers.getAddress(chainE.multicall),
        coinEntries,
        allCoinEntries,
        priceM,
        usdPriceQuery,
      }),
      priceFetchTimeoutMs,
      "price rpc timeout",
    );

    priceM = { ...priceM, ...exchangePriceM };
    price = getUsdPrice(coin, priceM, { usdPriceQuery });
    return price > 0 ? price : 0;
  } catch {
    return 0;
  } finally {
    provider?.destroy?.();
  }
}

function chunkList(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

export function parseWallets(input = "") {
  return Object.fromEntries(
    parseWalletEntries(input).map((entry) => [entry.name, entry.address]),
  );
}

export function parseWalletEntries(input = "", source = "") {
  let rows = input;

  if (typeof input == "string") {
    const txt = String(input || "").trim();
    try {
      rows = txt ? JSON.parse(txt) : [];
    } catch {
      rows = [];
    }
  }

  return (Array.isArray(rows) ? rows : [])
    .map((entry) => {
      const wallet = String(entry?.wallet ?? entry?.name ?? "").trim();
      const address = String(entry?.address ?? "").trim();
      if (!wallet || !address) return null;

      return {
        wallet,
        name: wallet,
        address,
        ref: String(entry?.ref ?? "").trim(),
        source,
        label: source ? `${source}/${wallet}` : wallet,
      };
    })
    .filter(Boolean);
}

function normalizeWalletName(walletName = "") {
  return String(walletName || "").trim();
}

function normalizeWalletAddress(walletAddress = "") {
  return String(walletAddress || "").trim();
}

function filterWallets(wallets, walletName = "") {
  const name = normalizeWalletName(walletName);
  if (!name) return wallets;
  return wallets[name] ? { [name]: wallets[name] } : {};
}

function filterWalletEntries(entries, walletName = "") {
  const name = normalizeWalletName(walletName);
  if (!name) return entries;
  return entries.filter((entry) => entry.name == name);
}

function getCustomWallets(walletAddress = "") {
  const address = normalizeWalletAddress(walletAddress);
  return address ? { addr: address } : null;
}

function getCustomWalletEntries(walletAddress = "") {
  const address = normalizeWalletAddress(walletAddress);
  return address
    ? [{ wallet: "addr", name: "addr", address, ref: "", source: "", label: "addr" }]
    : null;
}

function getWalletNameDisableKey(name = "") {
  return String(name || "").trim().toLowerCase();
}

function getWalletSource(filePath, walletDir) {
  return path
    .relative(walletDir, filePath)
    .split(path.sep)
    .join("/")
    .replace(/\.(txt|json)$/i, "");
}

async function readWalletEntries(filePath, walletDir) {
  return parseWalletEntries(
    await fs.readFile(filePath, "utf8"),
    getWalletSource(filePath, walletDir),
  );
}

export async function listWalletFiles(walletType = defaultWalletType) {
  const walletDir = getWalletDir(walletType);

  try {
    const files = await listWalletJsonFiles(walletDir);
    const folders = new Set(
      files
        .map((file) => path.dirname(file))
        .filter((dir) => dir != ".")
        .map((dir) => `${dir.split(path.sep).join("/")}/`),
    );

    return [
      ...folders,
      ...files.map((file) => file.split(path.sep).join("/").replace(/\.(txt|json)$/i, "")),
    ].sort();
  } catch (e) {
    if (e.code == "ENOENT") return [];
    throw e;
  }
}

async function listWalletJsonFiles(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listWalletJsonFiles(fullPath, baseDir)));
    } else if (
      entry.isFile() &&
      path.extname(entry.name).toLowerCase() == walletFileExt
    ) {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files.sort();
}

function resolveWalletPath(file, walletType = defaultWalletType) {
  if (!file) return "";
  const walletDir = getWalletDir(walletType);
  const name = decodeURIComponent(file)
    .trim()
    .replace(/\.(txt|json)$/i, "")
    .replace(/\/+$/, "");
  if (!name || name.includes("\0") || path.isAbsolute(name)) return "";

  const fullPath = path.resolve(walletDir, name);
  const relative = path.relative(walletDir, fullPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";

  return fullPath;
}

export async function loadWalletEntries(
  file,
  walletType = defaultWalletType,
  { walletAddress = "", walletName = "", walletEntryList = null } = {},
) {
  const walletDir = getWalletDir(walletType);
  if (Array.isArray(walletEntryList)) {
    return filterWalletEntries(walletEntryList, walletName);
  }

  const customWallets = getCustomWalletEntries(walletAddress);
  if (customWallets) return customWallets;

  const selectedWalletName = normalizeWalletName(walletName);

  try {
    const selectedPath = resolveWalletPath(file, walletType);
    if (selectedPath) {
      const stat = await fs.stat(selectedPath).catch((e) => {
        if (e.code != "ENOENT") throw e;
        return null;
      });

      if (stat?.isDirectory()) {
        const files = await listWalletJsonFiles(selectedPath);
        const siblingFile = `${selectedPath}${walletFileExt}`;
        const siblingStat = await fs.stat(siblingFile).catch((e) => {
          if (e.code != "ENOENT") throw e;
          return null;
        });
        const siblingEntries = siblingStat?.isFile()
          ? [await readWalletEntries(siblingFile, walletDir)]
          : [];
        const entryList = await Promise.all(
          files
            .filter(
              (txtFile) => selectedWalletName || !isReservedWalletPath(txtFile),
            )
            .map((txtFile) =>
              readWalletEntries(path.join(selectedPath, txtFile), walletDir),
            ),
        );
        return filterWalletEntries(
          [...siblingEntries, ...entryList].flat(),
          selectedWalletName,
        );
      }

      const selectedFile = stat?.isFile() ? selectedPath : `${selectedPath}${walletFileExt}`;
      return filterWalletEntries(
        await readWalletEntries(selectedFile, walletDir),
        selectedWalletName,
      );
    }

    const files = await listWalletJsonFiles(walletDir);
    const entryList = await Promise.all(
      files
        .filter((file) => selectedWalletName || !isReservedWalletPath(file))
        .map((file) => readWalletEntries(path.join(walletDir, file), walletDir)),
    );
    return filterWalletEntries(entryList.flat(), selectedWalletName);
  } catch (e) {
    if (e.code == "ENOENT") return [];
    throw e;
  }
}

export async function loadWallets(
  file,
  walletType = defaultWalletType,
  {
    walletAddress = "",
    walletName = "",
    walletEntryList = null,
    disabledWallets = [],
    disabledWalletNames = [],
  } = {},
) {
  const disabled = new Set(disabledWallets.map(getWalletDisableKey));
  const disabledNames = new Set(
    disabledWalletNames.map(getWalletNameDisableKey),
  );
  const entries = await loadWalletEntries(file, walletType, {
    walletAddress,
    walletName,
    walletEntryList,
  });

  return Object.fromEntries(
    entries
      .filter((entry) => !disabled.has(getWalletDisableKey(entry.address)))
      .filter(
        (entry) =>
          !disabledNames.has(getWalletNameDisableKey(entry.name)) &&
          !disabledNames.has(getWalletNameDisableKey(entry.label)),
      )
      .map((entry) => [entry.name, entry.address]),
  );
}

function getBalanceE({ raw, coin, coinE, priceM = {}, usdPriceQuery = false }) {
  const decimals = coinE.decimals ?? 18;
  const balance = ethers.formatUnits(raw, decimals);
  const price = getUsdPrice(coin, priceM, { usdPriceQuery });

  return {
    coin,
    raw: raw.toString(),
    balance,
    decimals,
    price,
    usd: price ? Number(balance) * price : 0,
  };
}

function applyPriceMToBalance(balance, priceM, { usdPriceQuery = false } = {}) {
  const price = getUsdPrice(balance.coin, priceM, { usdPriceQuery });
  balance.price = price;
  balance.usd = price ? Number(balance.balance) * price : 0;
}

function applyPriceMToRows(rows, priceM, { usdPriceQuery = false } = {}) {
  for (const row of rows) {
    for (const balance of Object.values(row.balances || {})) {
      applyPriceMToBalance(balance, priceM, { usdPriceQuery });
    }
  }
}

function getBalanceCoinEntries({ rows, coinEntries }) {
  const coinSet = new Set();

  for (const row of rows) {
    for (const coin of Object.keys(row.balances || {})) coinSet.add(coin);
  }

  return coinEntries.filter(([coin]) => coinSet.has(coin));
}

function getActiveCoinEntries(coinEntries, disabledCoins = []) {
  const disabled = new Set(disabledCoins);
  return coinEntries.filter(([coin]) => !disabled.has(coin));
}

function getAlchemyApiKey() {
  return String(process.env.rpc_key_alchemy || "").trim();
}

function getAlchemyNetwork(chain) {
  return alchemyNetworks?.[chain] || "";
}

function getAlchemyEnabledNetworkEntries(chains = [], useAlchemy = null) {
  return [...new Set(chains)]
    .filter((chain) => isAlchemyEnabled(chain, useAlchemy))
    .map((chain) => [chain, getAlchemyNetwork(chain)])
    .filter(([, network]) => network);
}

function isAlchemyEnabled(chain, useAlchemy = null) {
  const enabled =
    useAlchemy === null || useAlchemy === undefined
      ? Number(sets?.useAlchemy) == 1
      : !!useAlchemy;

  return enabled && !!getAlchemyApiKey() && !!getAlchemyNetwork(chain);
}

function getAddressKey(chain, address) {
  const text = String(address || "").trim();
  return chain == "Solana" ? text : text.toLowerCase();
}

function normalizeAlchemyTokenAddress(chain, address) {
  const text = String(address || "").trim();
  if (
    !text ||
    text == "0x0000000000000000000000000000000000000000" ||
    text.toLowerCase() == "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  ) {
    return "";
  }
  if (!isTokenAddress(chain, text)) return "";

  return chain == "Solana" ? text : text.toLowerCase();
}

function getAlchemyLocalLookup({ chain, coinEntries }) {
  const addressM = {};
  const nativeEntries = [];

  for (const [coin, coinE] of coinEntries) {
    if (coinE.native) {
      nativeEntries.push([coin, coinE]);
      continue;
    }

    const address = normalizeAlchemyTokenAddress(chain, coinE.address);
    if (address && !addressM[address]) addressM[address] = [coin, coinE];
  }

  return { addressM, nativeEntries };
}

function dedupeCoinEntriesByAddress(chain, coinEntries = []) {
  const seenAddressM = {};
  const result = [];

  for (const [coin, coinE] of coinEntries) {
    const address = normalizeAlchemyTokenAddress(chain, coinE?.address);
    if (address) {
      if (seenAddressM[address]) continue;
      seenAddressM[address] = coin;
    }

    result.push([coin, coinE]);
  }

  return result;
}

function getCoinEntryByAddress(chain = "", address = "") {
  if (!ethers.isAddress(address)) return null;
  const addressKey = normalizeAlchemyTokenAddress(chain, address);
  if (!addressKey) return null;

  return (
    Object.entries(getCoinM(chain) || {}).find(([, coinE]) => {
      const coinAddress = normalizeAlchemyTokenAddress(chain, coinE?.address);
      return coinAddress && coinAddress == addressKey;
    }) || null
  );
}

function isAaveUmbrellaStakingCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE?.name || ""}`.toLowerCase();

  return (
    ethers.isAddress(coinE?.address || "") &&
    /^stk/i.test(coin) &&
    (text.includes("umbrella") ||
      text.includes("stake wrapped aave") ||
      text.includes("aave"))
  );
}

function getAaveStakingSourceCoin(coin = "") {
  return String(coin || "").replace(/\.v\d+$/i, "");
}

function cleanClaimRewardCoin(symbol = "", address = "") {
  const clean = String(symbol || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\w.$-]/g, "")
    .slice(0, 24);
  const cleanAddress = String(address || "").replace(/^0x/i, "");

  return (
    clean ||
    (cleanAddress ? `REWARD_${cleanAddress.slice(-4)}` : "REWARD")
  );
}

function sameEvmAddress(a = "", b = "") {
  return (
    ethers.isAddress(a) &&
    ethers.isAddress(b) &&
    ethers.getAddress(a) == ethers.getAddress(b)
  );
}

function getClaimCoinKey({
  coinInfoM = {},
  rewardCoin = "",
  rewardAddress = "",
  sourceChain = "",
  sourceCoin = "",
} = {}) {
  const base = `${rewardCoin}<-${getAaveStakingSourceCoin(sourceCoin)}`;
  const existing = coinInfoM[base];
  if (
    !existing ||
    (existing.sourceChain == sourceChain &&
      (sameEvmAddress(existing.rewardAddress, rewardAddress) ||
        (!ethers.isAddress(existing.rewardAddress || "") &&
          !ethers.isAddress(rewardAddress || "") &&
          existing.rewardCoin == rewardCoin)))
  ) {
    return base;
  }

  return `${base}@${sourceChain}`;
}

function getPositiveRaw(value) {
  try {
    const raw = BigInt(value || 0);
    return raw > 0n ? raw : 0n;
  } catch {
    return 0n;
  }
}

function ensureClaimRow(rowM, row = {}) {
  const key = `${row.name || ""}:${String(row.address || "").toLowerCase()}`;
  if (!rowM.has(key)) {
    rowM.set(key, {
      name: row.name,
      address: row.address,
      balances: {},
    });
  }

  return rowM.get(key);
}

async function getAaveRewardTokenMeta({
  provider,
  chain = "",
  address = "",
} = {}) {
  const rewardAddress = ethers.getAddress(address);
  const localEntry = getCoinEntryByAddress(chain, rewardAddress);
  if (localEntry) {
    const [coin, coinE] = localEntry;

    return {
      address: rewardAddress,
      localCoin: coin,
      symbol: coin,
      name: coinE.name || coin,
      decimals: coinE.decimals ?? 18,
    };
  }

  const token = new ethers.Contract(rewardAddress, erc20MetaAbi, provider);
  const [name, symbol, decimals] = await Promise.all([
    withTimeout(
      token.name(),
      aaveStakingRewardTimeoutMs,
      "reward name timeout",
    ).catch(() => ""),
    withTimeout(
      token.symbol(),
      aaveStakingRewardTimeoutMs,
      "reward symbol timeout",
    ).catch(() => ""),
    withTimeout(
      token.decimals(),
      aaveStakingRewardTimeoutMs,
      "reward decimals timeout",
    ).catch(() => 18),
  ]);
  const rewardCoin = cleanClaimRewardCoin(symbol, rewardAddress);

  return {
    address: rewardAddress,
    localCoin: "",
    symbol: rewardCoin,
    name: String(name || "").trim() || rewardCoin,
    decimals: Number(decimals),
  };
}

function getAlchemyNativeCoinEntry({ token, lookup }) {
  const symbol = String(token.tokenMetadata?.symbol || "").toUpperCase();
  return (
    lookup.nativeEntries.find(([coin]) => coin.toUpperCase() == symbol) ??
    lookup.nativeEntries[0] ??
    null
  );
}

function getAlchemyLocalCoinEntry({ chain, token, lookup }) {
  const tokenAddress = normalizeAlchemyTokenAddress(chain, token.tokenAddress);
  if (tokenAddress && lookup.addressM[tokenAddress]) return lookup.addressM[tokenAddress];
  if (!tokenAddress) return getAlchemyNativeCoinEntry({ token, lookup });

  return null;
}

function sanitizeAlchemySymbol(symbol = "") {
  const clean = String(symbol || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "")
    .slice(0, 24);

  return clean || "TOKEN";
}

function makeDiscoveredCoinKey({
  chain,
  token,
  coinInfoM,
  discoveredAddressM,
}) {
  const tokenAddress = normalizeAlchemyTokenAddress(chain, token.tokenAddress);
  const addressKey = tokenAddress || `native:${token.tokenMetadata?.symbol || ""}`;
  if (discoveredAddressM[addressKey]) return discoveredAddressM[addressKey];

  const symbol = sanitizeAlchemySymbol(token.tokenMetadata?.symbol || token.tokenMetadata?.name);
  let coin = symbol;
  if (coinInfoM[coin]) {
    const suffix = tokenAddress
      ? tokenAddress.slice(-4)
      : String(token.tokenMetadata?.name || "").replace(/\W+/g, "").slice(0, 4);
    coin = `${symbol}_${suffix || "ALC"}`;
  }

  let i = 2;
  const baseCoin = coin;
  while (coinInfoM[coin]) {
    coin = `${baseCoin}_${i}`;
    i += 1;
  }

  discoveredAddressM[addressKey] = coin;
  return coin;
}

function getAlchemyDiscoveredCoinE({ chain, coin, token }) {
  const decimals = Number(token.tokenMetadata?.decimals);
  const name = String(token.tokenMetadata?.name || coin).trim();
  const address = normalizeAlchemyTokenAddress(chain, token.tokenAddress);
  const coinE = {
    decimals: Number.isFinite(decimals) ? decimals : 18,
    name,
    type:
      stableCoins.has(String(coin || "").toUpperCase()) || isUsdLikeCoin(coin, { name })
        ? "stable"
        : "token",
    source: "alchemy",
  };

  if (address) coinE.address = token.tokenAddress;
  else coinE.native = true;

  return coinE;
}

function parseAlchemyRawBalance(balance, decimals) {
  const text = String(balance ?? "0").trim();
  if (!text || text == "0") return 0n;
  if (/^0x/i.test(text)) return BigInt(text);

  const clean = text.replace(/,/g, "");
  if (!Number.isFinite(Number(clean)) || Number(clean) <= 0) return 0n;

  if (!clean.includes(".") && clean.length > decimals + 8) {
    return BigInt(clean);
  }

  const [wholeRaw, fractionRaw = ""] = clean.split(".");
  const whole = wholeRaw.replace(/[^\d]/g, "") || "0";
  const fraction = fractionRaw.replace(/[^\d]/g, "").slice(0, decimals);
  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);
}

function getAlchemyUsdPrice(token) {
  const price = token.tokenPrices?.find(
    (e) => String(e.currency || "").toLowerCase() == "usd",
  );
  const value = Number(price?.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getAlchemyDecimals(token, coinE = {}) {
  const decimals = Number(coinE.decimals ?? token.tokenMetadata?.decimals);
  return Number.isFinite(decimals) ? decimals : 18;
}

function getAlchemyBalanceE({
  chain,
  token,
  coin,
  coinE,
  usdPriceQuery = false,
}) {
  const decimals = getAlchemyDecimals(token, coinE);
  const raw = parseAlchemyRawBalance(token.tokenBalance, decimals);
  const balance = ethers.formatUnits(raw, decimals);
  const alchemyPrice = getAlchemyUsdPrice(token);
  const price =
    (!stableCoins.has(String(coin || "").toUpperCase()) || usdPriceQuery) &&
    alchemyPrice > 0
      ? alchemyPrice
      : getUsdPrice(coin, {}, { usdPriceQuery });

  return {
    coin,
    raw: raw.toString(),
    balance,
    decimals,
    price,
    usd: price ? Number(balance) * price : 0,
    source: "alchemy",
  };
}

function getAlchemyTokenNetwork(token = {}) {
  return String(
    token.network ||
      token.networkId ||
      token.blockchain ||
      token.chain ||
      token.chainId ||
      "",
  ).trim();
}

async function fetchAlchemyTokensByNetworks({ networks = [], rows }) {
  const apiKey = getAlchemyApiKey();
  const tokens = [];
  const networkList = [...new Set(networks.filter(Boolean))];
  if (!apiKey || !networkList.length || !rows.length) return tokens;

  for (const batch of chunkList(rows, alchemyWalletChunkSize)) {
    const res = await fetchWithTimeout(
      `${alchemyPortfolioBaseUrl}/${encodeURIComponent(apiKey)}/assets/tokens/by-address`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          addresses: batch.map((row) => ({
            address: row.address,
            networks: networkList,
          })),
          withMetadata: true,
          withPrices: true,
          includeNativeTokens: true,
          includeErc20Tokens: true,
        }),
      },
      alchemyFetchTimeoutMs,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `${res.status} ${res.statusText}`);
    }
    tokens.push(...(data.data?.tokens || []));
  }

  return tokens;
}

async function fetchAlchemyTokens({ chain, rows }) {
  return fetchAlchemyTokensByNetworks({
    networks: [getAlchemyNetwork(chain)],
    rows,
  });
}

function getAlchemyCachedTokens({ chain, rows, alchemyTokenCache = null }) {
  const network = getAlchemyNetwork(chain);
  if (!network || !alchemyTokenCache?.networkSet?.has(network)) return null;

  const tokens = alchemyTokenCache.tokensByNetwork?.[network] || [];
  const rowKeys = new Set(rows.map((row) => getAddressKey(chain, row.address)));
  return tokens.filter((token) =>
    rowKeys.has(getAddressKey(chain, token.address)),
  );
}

export async function getAlchemyWalletTokenCache({
  chains = [],
  walletFile = "",
  walletType = defaultWalletType,
  walletAddress = "",
  walletName = "",
  walletEntryList = null,
  disabledWallets = [],
  disabledWalletNames = [],
  useAlchemy = null,
} = {}) {
  const networkEntries = getAlchemyEnabledNetworkEntries(chains, useAlchemy);
  const networks = [...new Set(networkEntries.map(([, network]) => network))];
  if (!networks.length) return null;

  const wallets = await loadWallets(walletFile, walletType, {
    walletAddress,
    walletName,
    walletEntryList,
    disabledWallets,
    disabledWalletNames,
  });
  const rows = Object.entries(wallets)
    .map(([name, address]) =>
      walletType == "solana"
        ? isSolanaAddress(address)
          ? { name, address }
          : null
        : ethers.isAddress(address)
          ? { name, address: ethers.getAddress(address) }
          : null,
    )
    .filter(Boolean);
  if (!rows.length) return null;

  const tokens = await fetchAlchemyTokensByNetworks({ networks, rows });
  const tokensByNetwork = Object.fromEntries(
    networks.map((network) => [network, []]),
  );
  let unscopedTokenCount = 0;

  for (const token of tokens) {
    const network = getAlchemyTokenNetwork(token);
    if (!network || !tokensByNetwork[network]) {
      if (networks.length == 1) {
        tokensByNetwork[networks[0]].push(token);
        continue;
      }

      unscopedTokenCount += 1;
      continue;
    }

    tokensByNetwork[network].push(token);
  }

  if (unscopedTokenCount && networks.length > 1) return null;

  return {
    networkSet: new Set(networks),
    tokensByNetwork,
  };
}

async function getAlchemyBalances({
  chain,
  rows,
  coinEntries,
  allCoinEntries,
  disabledCoins = [],
  useAlchemy = null,
  usdPriceQuery = false,
  alchemyTokenCache = null,
}) {
  if (!isAlchemyEnabled(chain, useAlchemy) || !rows.length) return null;

  const disabled = new Set(disabledCoins);
  const lookup = getAlchemyLocalLookup({ chain, coinEntries: allCoinEntries });
  const baseCoinInfoM = Object.fromEntries(allCoinEntries);
  const coinInfoM = { ...baseCoinInfoM };
  const coinOrder = coinEntries.map(([coin]) => coin);
  const coinSet = new Set(coinOrder);
  const discoveredCoins = new Set();
  const discoveredAddressM = {};
  const balancesM = Object.fromEntries(rows.map((row) => [row.name, {}]));
  const errorsM = Object.fromEntries(rows.map((row) => [row.name, {}]));
  const rowM = Object.fromEntries(
    rows.map((row) => [getAddressKey(chain, row.address), row]),
  );
  const priceM = {};
  const cachedTokens = getAlchemyCachedTokens({
    chain,
    rows,
    alchemyTokenCache,
  });
  const tokens = cachedTokens ?? (await fetchAlchemyTokens({ chain, rows }));

  for (const token of tokens) {
    const row = rowM[getAddressKey(chain, token.address)];
    if (!row) continue;
    if (token.error) {
      addError(errorsM[row.name], "Alchemy", token.error);
      continue;
    }

    const localEntry = getAlchemyLocalCoinEntry({ chain, token, lookup });
    let coin;
    let coinE;

    if (localEntry) {
      [coin, coinE] = localEntry;
    } else {
      coin = makeDiscoveredCoinKey({
        chain,
        token,
        coinInfoM,
        discoveredAddressM,
      });
      coinE = getAlchemyDiscoveredCoinE({ chain, coin, token });
      coinInfoM[coin] = coinE;
      discoveredCoins.add(coin);
    }

    if (disabled.has(coin)) continue;

    const balance = getAlchemyBalanceE({
      chain,
      token,
      coin,
      coinE,
      usdPriceQuery,
    });
    if (BigInt(balance.raw) <= 0n) continue;

    balancesM[row.name][coin] = balance;
    if (!coinSet.has(coin)) {
      coinSet.add(coin);
      coinOrder.push(coin);
    }

    if (balance.price > 0) priceM[coin] = balance.price;
  }

  return {
    balancesM,
    errorsM,
    coinInfoM,
    coinEntries: coinOrder.map((coin) => [coin, coinInfoM[coin]]),
    discoveredCoins,
    priceM,
  };
}

async function applyFallbackPrices({
  chain,
  rows,
  coinEntries,
  priceM = {},
  provider = null,
  multicallAddress = "",
  usdPriceQuery = false,
}) {
  let nextPriceM = { ...priceM };
  const balanceCoinEntries = getBalanceCoinEntries({ rows, coinEntries });
  const missingPriceCoinEntries = balanceCoinEntries.filter(
    ([coin]) => !hasUsdPrice(coin, nextPriceM, { usdPriceQuery }),
  );

  if (missingPriceCoinEntries.length) {
    nextPriceM = {
      ...nextPriceM,
      ...(await getPriceM({
        chain,
        coinEntries: missingPriceCoinEntries,
        usdPriceQuery,
      })),
    };
  }

  if (chain != "Solana" && provider && multicallAddress) {
    const missingExchangeCoinEntries = balanceCoinEntries.filter(
      ([coin]) => !hasUsdPrice(coin, nextPriceM, { usdPriceQuery }),
    );

    if (missingExchangeCoinEntries.length) {
      try {
        nextPriceM = {
          ...nextPriceM,
          ...(await getExchangeRatePrices({
            chain,
            provider,
            multicallAddress,
            coinEntries: missingExchangeCoinEntries,
            allCoinEntries: coinEntries,
            priceM: nextPriceM,
            usdPriceQuery,
          })),
        };
      } catch {}
    }
  }

  applyPriceMToRows(rows, nextPriceM, { usdPriceQuery });
  return nextPriceM;
}

function getReturnedCoins({ rows, coinEntries }) {
  return coinEntries
    .map(([coin]) => coin)
    .filter((coin) => rows.some((row) => row.balances?.[coin]));
}

function hasMissingBalancePrices(rows) {
  return rows.some((row) =>
    Object.values(row.balances || {}).some(
      (balance) => Number(balance.balance) > 0 && !(Number(balance.price) > 0),
    ),
  );
}

function filterLowUsdAlchemyCoins({
  rows,
  coinEntries,
  coinInfoM,
  discoveredCoins,
  minUsd = 0.01,
}) {
  const threshold = Math.max(0, Number(minUsd ?? 0));
  if (!threshold || !discoveredCoins?.size) {
    return { coinEntries, coinInfoM, discoveredCoins };
  }

  const usdM = {};
  for (const row of rows) {
    for (const coin of discoveredCoins) {
      usdM[coin] =
        (usdM[coin] || 0) + toFiniteNumber(row.balances?.[coin]?.usd);
    }
  }

  const filteredCoinInfoM = { ...coinInfoM };
  const hidden = new Set(
    [...discoveredCoins].filter((coin) => (usdM[coin] || 0) < threshold),
  );
  if (!hidden.size) return { coinEntries, coinInfoM, discoveredCoins };

  for (const row of rows) {
    for (const coin of hidden) delete row.balances?.[coin];
  }
  for (const coin of hidden) delete filteredCoinInfoM[coin];

  return {
    coinEntries: coinEntries.filter(([coin]) => !hidden.has(coin)),
    coinInfoM: filteredCoinInfoM,
    discoveredCoins: new Set(
      [...discoveredCoins].filter((coin) => !hidden.has(coin)),
    ),
  };
}

async function buildAlchemyWalletResult({
  chain,
  chainE = null,
  rows,
  coinEntries,
  allCoinEntries,
  disabledCoins,
  scanner,
  useAlchemy = null,
  alchemyMinUsd = 0.01,
  usdPriceQuery = false,
  alchemyTokenCache = null,
}) {
  const alchemy = await getAlchemyBalances({
    chain,
    rows,
    coinEntries,
    allCoinEntries,
    disabledCoins,
    useAlchemy,
    usdPriceQuery,
    alchemyTokenCache,
  });
  if (!alchemy) return null;

  for (const row of rows) {
    row.balances = alchemy.balancesM[row.name] ?? {};
    row.errors = alchemy.errorsM[row.name] ?? {};
  }

  let priceM = await applyFallbackPrices({
    chain,
    rows,
    coinEntries: alchemy.coinEntries,
    priceM: alchemy.priceM,
    usdPriceQuery,
  });

  if (chain != "Solana" && chainE && hasMissingBalancePrices(rows)) {
    let provider;
    try {
      provider = await getProvider(chainE, { timeoutMs: priceFetchTimeoutMs });
      priceM = await applyFallbackPrices({
        chain,
        rows,
        coinEntries: alchemy.coinEntries,
        priceM,
        provider,
        multicallAddress: ethers.getAddress(chainE.multicall),
        usdPriceQuery,
      });
    } catch {
    } finally {
      provider?.destroy?.();
    }
  }

  const filtered = filterLowUsdAlchemyCoins({
    rows,
    coinEntries: alchemy.coinEntries,
    coinInfoM: alchemy.coinInfoM,
    discoveredCoins: alchemy.discoveredCoins,
    minUsd: alchemyMinUsd,
  });

  return {
    chain,
    coins: getReturnedCoins({ rows, coinEntries: filtered.coinEntries }),
    allCoins: filtered.coinEntries.map(([coin]) => coin),
    coinInfoM: filtered.coinInfoM,
    discoveredCoins: [...(filtered.discoveredCoins || [])],
    scanner,
    rows,
    source: "alchemy",
  };
}

function addError(errors, coin, message) {
  errors[coin] = message;
}

async function applyWemixWonderStakeBalances({
  chain,
  provider,
  rows,
  usdPriceQuery = false,
} = {}) {
  if (chain != "WEMIX" || !provider) return false;

  const queryRows = rows.filter(
    (row) =>
      ethers.isAddress(row.address) &&
      getPositiveRaw(row.balances?.WEMIX?.raw),
  );
  if (!queryRows.length) return false;

  const contract = new ethers.Contract(
    wemixWonderStakeContract,
    wemixWonderStakeInterface,
    provider,
  );
  let added = false;

  for (const row of queryRows) {
    try {
      const [userInfoResult, pendingRewardResult] = await Promise.allSettled([
        withTimeout(
          contract.getUserInfo(wemixWonderStakePid, row.address),
          8000,
          "WEMIX WONDER staking balance timeout",
        ),
        withTimeout(
          contract.pendingReward(wemixWonderStakePid, row.address),
          8000,
          "WEMIX WONDER pending reward timeout",
        ),
      ]);
      if (userInfoResult.status != "fulfilled") throw userInfoResult.reason;

      const userInfo = userInfoResult.value;
      const pendingRewardRaw =
        pendingRewardResult.status == "fulfilled"
          ? getPositiveRaw(pendingRewardResult.value)
          : 0n;
      if (pendingRewardRaw) {
        row.wemixWonderStakePendingRewardRaw = pendingRewardRaw.toString();
      }

      const raw = getPositiveRaw(userInfo?.[0]);
      if (!raw) continue;

      const nativePrice = Number(row.balances?.WEMIX?.price || 0);
      const balance = getBalanceE({
        raw,
        coin: wemixWonderStakeCoin,
        coinE: wemixWonderStakeCoinE,
        priceM: nativePrice ? { [wemixWonderStakeCoin]: nativePrice } : {},
        usdPriceQuery,
      });

      if (pendingRewardRaw) {
        balance.pendingRewardRaw = pendingRewardRaw.toString();
        balance.pendingRewardCoin = "WEMIX";
        balance.pendingRewardDecimals = 18;
        balance.pendingRewardSource = "WEMIX Stake";
      }

      row.balances[wemixWonderStakeCoin] = balance;
      added = true;
    } catch (e) {
      row.errors ??= {};
      addError(
        row.errors,
        wemixWonderStakeCoin,
        e?.shortMessage ?? e?.message ?? "WEMIX WONDER staking balance error",
      );
    }
  }

  return added;
}

function addWemixWonderClaimBalances({
  data = [],
  claimRowM,
  coinInfoM,
  claimCoins,
} = {}) {
  const chainE = (Array.isArray(data) ? data : []).find(
    (entry) => entry?.chain == "WEMIX",
  );
  if (!chainE) return;

  const rewardCoin = "WEMIX";
  const sourceCoin = wemixWonderStakeCoin;
  const claimCoin = getClaimCoinKey({
    coinInfoM,
    rewardCoin,
    sourceChain: "WEMIX",
    sourceCoin,
  });

  for (const row of chainE.rows || []) {
    const stakeBalance = row.balances?.[sourceCoin];
    const amount = getPositiveRaw(
      stakeBalance?.pendingRewardRaw || row.wemixWonderStakePendingRewardRaw,
    );
    if (!amount) continue;

    if (!coinInfoM[claimCoin]) {
      coinInfoM[claimCoin] = {
        decimals: 18,
        name: `${rewardCoin} claim from ${sourceCoin}`,
        type: "claim",
        source: "WEMIX Stake",
        sourceChain: "WEMIX",
        sourceCoin,
        sourceName: wemixWonderStakeCoinE.name,
        sourceDecimals: wemixWonderStakeCoinE.decimals,
        sourceType: wemixWonderStakeCoinE.type,
        sourceAddress: wemixWonderStakeContract,
        rewardCoin,
      };
      claimCoins.push(claimCoin);
    }

    const balance = ethers.formatUnits(amount, 18);
    const price = Number(row.balances?.WEMIX?.price || stakeBalance?.price || 0);
    const claimRow = ensureClaimRow(claimRowM, row);
    claimRow.balances[claimCoin] = {
      coin: claimCoin,
      raw: amount.toString(),
      balance,
      decimals: 18,
      price,
      usd: price ? Number(balance) * price : 0,
      source: "WEMIX Stake",
      sourceChain: "WEMIX",
      sourceCoin,
      sourceAddress: wemixWonderStakeContract,
      rewardCoin,
    };
  }
}

function getHyperliquidVaultCoin(address = "", usedCoins = null) {
  const cleanAddress = String(address || "").replace(/^0x/i, "");
  const base = cleanAddress
    ? `HL_${cleanAddress.slice(0, 3)}..${cleanAddress.slice(-3)}`
    : "HL_VAULT";
  let coin = base || "HL_VAULT";
  let i = 2;

  if (!usedCoins) return coin;

  while (usedCoins.has(coin)) {
    coin = `${base}_${i}`;
    i += 1;
  }
  usedCoins.add(coin);

  return coin;
}

function normalizeHyperliquidVault(entry = {}) {
  const address = String(entry.vaultAddress || "").trim();
  const equity = Number(entry.equity);
  if (!ethers.isAddress(address) || !(equity > 0)) return null;

  const lockedUntilTimestamp = Number(entry.lockedUntilTimestamp);

  return {
    address: ethers.getAddress(address),
    equity,
    usd: equity,
    lockedUntilTimestamp: Number.isFinite(lockedUntilTimestamp)
      ? lockedUntilTimestamp
      : 0,
  };
}

async function hyperliquidInfo(body = {}) {
  const res = await fetchWithTimeout(
    `${hyperliquidApiBase.replace(/\/+$/, "")}/info`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    },
    hyperliquidFetchTimeoutMs,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `${res.status} ${res.statusText}`);
  }

  return data;
}

async function getHyperliquidVaultEquities(address = "") {
  if (!ethers.isAddress(address)) return [];

  const data = await hyperliquidInfo({
    type: "userVaultEquities",
    user: ethers.getAddress(address),
  });

  return (Array.isArray(data) ? data : [])
    .map(normalizeHyperliquidVault)
    .filter(Boolean);
}

function getHyperliquidSpotPrice(ctx = {}) {
  for (const key of ["midPx", "markPx", "prevDayPx"]) {
    const value = Number(ctx?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return 0;
}

function cleanHyperliquidSpotCoin(value = "", token = "") {
  const clean = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");
  return clean || `SPOT_${token}`;
}

function getUniqueHyperliquidSpotCoin({ coin = "", token = "", usedCoins }) {
  const base = cleanHyperliquidSpotCoin(coin, token);
  if (!usedCoins.has(base)) {
    usedCoins.add(base);
    return base;
  }

  const tokenCoin = cleanHyperliquidSpotCoin(`${base}_${token}`, token);
  if (!usedCoins.has(tokenCoin)) {
    usedCoins.add(tokenCoin);
    return tokenCoin;
  }

  let i = 2;
  let next = `${tokenCoin}_${i}`;
  while (usedCoins.has(next)) {
    i += 1;
    next = `${tokenCoin}_${i}`;
  }
  usedCoins.add(next);
  return next;
}

async function getHyperliquidSpotMeta() {
  const data = await hyperliquidInfo({ type: "spotMetaAndAssetCtxs" });
  const meta = Array.isArray(data) ? data[0] : {};
  const contexts = Array.isArray(data) ? data[1] || [] : [];
  const contextM = Object.fromEntries(
    contexts
      .filter((ctx) => ctx?.coin)
      .map((ctx) => [String(ctx.coin), ctx]),
  );
  const tokenM = {};
  const priceM = { USDC: 1 };

  for (const token of meta?.tokens || []) {
    if (!Number.isFinite(Number(token.index))) continue;
    tokenM[Number(token.index)] = token;
    if (String(token.name || "").toUpperCase() == "USDC") {
      priceM[Number(token.index)] = 1;
    }
  }

  (meta?.universe || []).forEach((market) => {
    const [baseToken, quoteToken] = market?.tokens || [];
    const base = tokenM[baseToken];
    const quote = tokenM[quoteToken];
    const ctx =
      contextM[String(market?.name || "")] ||
      contextM[`@${market?.index}`];
    const price = getHyperliquidSpotPrice(ctx);
    if (!base || !quote || !(price > 0)) return;

    const quoteName = String(quote.name || "").toUpperCase();
    const baseName = String(base.name || "").toUpperCase();
    if (quoteName == "USDC") {
      priceM[Number(baseToken)] = price;
      priceM[base.name] = price;
    } else if (baseName == "USDC") {
      priceM[Number(quoteToken)] = 1 / price;
      priceM[quote.name] = 1 / price;
    }
  });

  return { tokenM, priceM };
}

function normalizeHyperliquidSpotBalance(balance = {}, spotMeta = {}) {
  const tokenIndex = Number(balance.token);
  const tokenMeta = spotMeta.tokenM?.[tokenIndex] || {};
  const coin = cleanHyperliquidSpotCoin(balance.coin || tokenMeta.name, tokenIndex);
  const qty = Number(balance.total);
  if (!(qty > 0)) return null;
  const decimals = Number(tokenMeta.weiDecimals);

  const price =
    Number(spotMeta.priceM?.[tokenIndex]) ||
    Number(spotMeta.priceM?.[coin]) ||
    (String(coin).toUpperCase() == "USDC" ? 1 : 0);

  return {
    token: tokenIndex,
    coin,
    balance: String(balance.total),
    hold: String(balance.hold ?? "0"),
    entryNtl: String(balance.entryNtl ?? "0"),
    decimals: Number.isInteger(decimals) ? decimals : 8,
    price: Number.isFinite(price) && price > 0 ? price : 0,
    usd: price > 0 ? qty * price : 0,
    name: tokenMeta.fullName || tokenMeta.name || coin,
  };
}

async function getHyperliquidSpotBalances(address = "", spotMeta = {}) {
  if (!ethers.isAddress(address)) return [];

  const data = await hyperliquidInfo({
    type: "spotClearinghouseState",
    user: ethers.getAddress(address),
  });

  return (Array.isArray(data?.balances) ? data.balances : [])
    .map((balance) => normalizeHyperliquidSpotBalance(balance, spotMeta))
    .filter(Boolean);
}

function getMulticallResultE(result) {
  return {
    success: result.success ?? result[0],
    returnData: result.returnData ?? result[1],
  };
}

async function runMulticallBatch({ multicall, batch }) {
  try {
    return await multicall.aggregate3.staticCall(batch.map(({ call }) => call));
  } catch (e) {
    if (batch.length == 1) {
      return [
        {
          success: false,
          returnData: "0x",
          error: e?.shortMessage ?? e?.message ?? "multicall error",
        },
      ];
    }

    const mid = Math.ceil(batch.length / 2);
    return [
      ...(await runMulticallBatch({ multicall, batch: batch.slice(0, mid) })),
      ...(await runMulticallBatch({ multicall, batch: batch.slice(mid) })),
    ];
  }
}

function getExchangeRateScaleDecimals({ coinE, underlyingE }) {
  const tokenDecimals = coinE.decimals ?? 8;
  const underlyingDecimals = underlyingE?.decimals ?? 18;
  return 18 + underlyingDecimals - tokenDecimals;
}

function getOneTokenRaw(coinE) {
  return 10n ** BigInt(coinE.decimals ?? 18);
}

function getStableUnderlyingM({
  chain,
  coinEntries,
  priceM,
  usdPriceQuery = false,
}) {
  const underlyingM = {};

  for (const [coin, coinE] of coinEntries) {
    if (!stableCoins.has(String(coin || "").toUpperCase())) continue;

    const address = getTokenAddress({ chain, coin, coinE });
    if (!isTokenAddress(chain, address)) continue;

    const price = getUsdPrice(coin, priceM, { usdPriceQuery });
    if (!price) continue;

    underlyingM[normalizePriceAddress(chain, address)] = {
      coin,
      coinE,
      price,
    };
  }

  return underlyingM;
}

async function getExchangeRatePrices({
  chain,
  provider,
  multicallAddress,
  coinEntries,
  allCoinEntries = coinEntries,
  priceM,
  usdPriceQuery = false,
}) {
  const underlyingM = getStableUnderlyingM({
    chain,
    coinEntries: allCoinEntries,
    priceM,
    usdPriceQuery,
  });
  if (!Object.keys(underlyingM).length) return {};

  const calls = [];

  for (const [coin, coinE] of coinEntries) {
    if (hasUsdPrice(coin, priceM, { usdPriceQuery })) continue;
    if (!ethers.isAddress(coinE.address)) continue;

    const target = ethers.getAddress(coinE.address);
    const callEntries = [
      ["exchangeRateStored"],
      ["underlying"],
      ["UNDERLYING_ASSET_ADDRESS"],
      ["asset"],
      ["convertToAssets", [getOneTokenRaw(coinE)]],
    ];

    for (const [fn, args = []] of callEntries) {
      calls.push({
        coin,
        coinE,
        fn,
        call: {
          target,
          allowFailure: true,
          callData: exchangeRateInterface.encodeFunctionData(fn, args),
        },
      });
    }
  }

  if (!calls.length) return {};

  const coinPriceM = {};
  const priceM2 = {};
  const multicall = new ethers.Contract(multicallAddress, multicallAbi, provider);
  const results = await runMulticallBatch({ multicall, batch: calls });

  results.forEach((result, i) => {
    const { success, returnData } = getMulticallResultE(result);
    if (!success || !returnData || returnData == "0x") return;

    try {
      const callE = calls[i];
      coinPriceM[callE.coin] ??= { coinE: callE.coinE };
      const decoded = exchangeRateInterface.decodeFunctionResult(
        callE.fn,
        returnData,
      )[0];

      if (callE.fn == "exchangeRateStored") {
        coinPriceM[callE.coin].exchangeRateRaw = decoded;
      } else if (callE.fn == "convertToAssets") {
        coinPriceM[callE.coin].assetsPerShareRaw = decoded;
      } else {
        const underlying =
          underlyingM[normalizePriceAddress(chain, decoded)] ??
          (isUsdLikeCoin(callE.coin, callE.coinE)
            ? { coin: "USD", coinE: callE.coinE, price: 1 }
            : null);
        if (underlying) coinPriceM[callE.coin].underlying = underlying;
      }
    } catch {}
  });

  for (const [coin, e] of Object.entries(coinPriceM)) {
    if (!e.underlying) continue;

    if (e.assetsPerShareRaw) {
      const assetsPerShare = Number(
        ethers.formatUnits(
          e.assetsPerShareRaw,
          e.underlying.coinE.decimals ?? 18,
        ),
      );
      if (Number.isFinite(assetsPerShare) && assetsPerShare > 0) {
        priceM2[coin] = assetsPerShare * e.underlying.price;
        continue;
      }
    }

    if (!e.exchangeRateRaw) {
      priceM2[coin] = e.underlying.price;
      continue;
    }

    const scaleDecimals = getExchangeRateScaleDecimals({
      coinE: e.coinE,
      underlyingE: e.underlying.coinE,
    });
    const exchangeRate = Number(
      ethers.formatUnits(e.exchangeRateRaw, scaleDecimals),
    );
    if (Number.isFinite(exchangeRate) && exchangeRate > 0) {
      priceM2[coin] = exchangeRate * e.underlying.price;
    }
  }

  return priceM2;
}

async function getMulticallBalances({
  provider,
  multicallAddress,
  rows,
  coinEntries,
  priceM,
  usdPriceQuery = false,
}) {
  const balancesM = Object.fromEntries(rows.map((row) => [row.name, {}]));
  const errorsM = Object.fromEntries(rows.map((row) => [row.name, {}]));
  const calls = [];

  for (const row of rows) {
    for (const [coin, coinE] of coinEntries) {
      const callE = {
        row,
        coin,
        coinE,
        decodeFn: coinE.native ? "getEthBalance" : "balanceOf",
      };

      if (coinE.native) {
        calls.push({
          ...callE,
          call: {
            target: multicallAddress,
            allowFailure: true,
            callData: multicallInterface.encodeFunctionData("getEthBalance", [
              row.address,
            ]),
          },
        });
        continue;
      }

      if (!ethers.isAddress(coinE.address)) {
        addError(errorsM[row.name], coin, "invalid token address");
        continue;
      }

      calls.push({
        ...callE,
        call: {
          target: ethers.getAddress(coinE.address),
          allowFailure: true,
          callData: erc20Interface.encodeFunctionData("balanceOf", [row.address]),
        },
      });
    }
  }

  const multicall = new ethers.Contract(multicallAddress, multicallAbi, provider);
  for (const batch of chunkList(calls, multicallChunkSize)) {
    const results = await runMulticallBatch({ multicall, batch });
    results.forEach((result, i) => {
      const callE = batch[i];
      const { success, returnData } = getMulticallResultE(result);
      if (!success || !returnData || returnData == "0x") {
        addError(
          errorsM[callE.row.name],
          callE.coin,
          result.error ?? "balance error",
        );
        return;
      }

      try {
        const iface = callE.coinE.native ? multicallInterface : erc20Interface;
        const raw = iface.decodeFunctionResult(callE.decodeFn, returnData)[0];
        if (BigInt(raw) > 0n) {
          balancesM[callE.row.name][callE.coin] = getBalanceE({
            raw,
            coin: callE.coin,
            coinE: callE.coinE,
            priceM,
            usdPriceQuery,
          });
        }
      } catch (e) {
        addError(
          errorsM[callE.row.name],
          callE.coin,
          e?.shortMessage ?? e?.message ?? "decode balance error",
        );
      }
    });
  }

  return { balancesM, errorsM };
}

function getAaveStakingRewardRequests(data = []) {
  const requestsByChain = new Map();
  const claimRowM = new Map();

  for (const chainE of Array.isArray(data) ? data : []) {
    const chain = chainE?.chain;
    if (
      !chain ||
      chain == "Solana" ||
      chain == "Hyperliquid" ||
      chain == claimChain
    ) {
      continue;
    }

    for (const row of chainE.rows || []) {
      ensureClaimRow(claimRowM, row);
    }

    const stakingEntries = Object.entries(chainE.coinInfoM || {}).filter(
      ([coin, coinE]) => isAaveUmbrellaStakingCoin(coin, coinE),
    );
    if (!stakingEntries.length) continue;

    for (const row of chainE.rows || []) {
      if (!ethers.isAddress(row.address)) continue;

      for (const [sourceCoin, sourceCoinE] of stakingEntries) {
        const balance = row.balances?.[sourceCoin];
        if (!getPositiveRaw(balance?.raw)) continue;

        const list = requestsByChain.get(chain) || [];
        list.push({
          row,
          wallet: ethers.getAddress(row.address),
          sourceChain: chain,
          sourceCoin,
          sourceCoinE,
          stakingAddress: ethers.getAddress(sourceCoinE.address),
        });
        requestsByChain.set(chain, list);
      }
    }
  }

  return { requestsByChain, claimRowM };
}

async function getAaveStakingRewardControllers({
  provider,
  multicallAddress = "",
  requests = [],
} = {}) {
  const stakingAddresses = [
    ...new Set(requests.map((request) => request.stakingAddress.toLowerCase())),
  ];
  if (!stakingAddresses.length) return new Map();

  const calls = stakingAddresses.map((stakingAddress) => ({
    stakingAddress,
    call: {
      target: ethers.getAddress(stakingAddress),
      allowFailure: true,
      callData: aaveStakingVaultInterface.encodeFunctionData(
        "REWARDS_CONTROLLER",
      ),
    },
  }));
  const multicall = new ethers.Contract(multicallAddress, multicallAbi, provider);
  const results = await runMulticallBatch({ multicall, batch: calls });
  const controllerM = new Map();

  results.forEach((result, index) => {
    const { success, returnData } = getMulticallResultE(result);
    if (!success || !returnData || returnData == "0x") return;

    try {
      const controller = aaveStakingVaultInterface.decodeFunctionResult(
        "REWARDS_CONTROLLER",
        returnData,
      )[0];
      if (ethers.isAddress(controller)) {
        controllerM.set(
          calls[index].stakingAddress,
          ethers.getAddress(controller),
        );
      }
    } catch {}
  });

  return controllerM;
}

async function getAaveStakingRewardResults({
  provider,
  multicallAddress = "",
  requests = [],
  controllerM = new Map(),
} = {}) {
  const calls = requests
    .map((request) => {
      const controller = controllerM.get(request.stakingAddress.toLowerCase());
      if (!ethers.isAddress(controller)) return null;

      return {
        request,
        call: {
          target: ethers.getAddress(controller),
          allowFailure: true,
          callData: aaveRewardsControllerInterface.encodeFunctionData(
            "calculateCurrentUserRewards",
            [request.stakingAddress, request.wallet],
          ),
        },
      };
    })
    .filter(Boolean);
  if (!calls.length) return [];

  const multicall = new ethers.Contract(multicallAddress, multicallAbi, provider);
  const results = await runMulticallBatch({ multicall, batch: calls });

  return results.flatMap((result, index) => {
    const { success, returnData } = getMulticallResultE(result);
    if (!success || !returnData || returnData == "0x") return [];

    try {
      const [rewardAddresses, rewardAmounts] =
        aaveRewardsControllerInterface.decodeFunctionResult(
          "calculateCurrentUserRewards",
          returnData,
        );

      return rewardAddresses
        .map((address, rewardIndex) => {
          const amount = getPositiveRaw(rewardAmounts[rewardIndex]);
          if (!amount || !ethers.isAddress(address)) return null;

          return {
            ...calls[index].request,
            rewardAddress: ethers.getAddress(address),
            amount,
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  });
}

export async function getClaimBalances({
  data = [],
  usdPriceQuery = false,
} = {}) {
  const { requestsByChain, claimRowM } = getAaveStakingRewardRequests(data);

  const coinInfoM = {};
  const claimCoins = [];
  const metaM = new Map();
  const priceM = new Map();

  for (const [chain, requests] of requestsByChain) {
    const chainE = getChainE(chain);
    if (!chainE?.multicall) continue;

    let provider;
    try {
      provider = await getProvider(chainE, {
        timeoutMs: aaveStakingRewardTimeoutMs,
      });
      const multicallAddress = ethers.getAddress(chainE.multicall);
      const controllerM = await getAaveStakingRewardControllers({
        provider,
        multicallAddress,
        requests,
      });
      const rewards = await getAaveStakingRewardResults({
        provider,
        multicallAddress,
        requests,
        controllerM,
      });

      for (const reward of rewards) {
        const metaKey = `${chain}:${reward.rewardAddress.toLowerCase()}`;
        let meta = metaM.get(metaKey);
        if (!meta) {
          meta = await getAaveRewardTokenMeta({
            provider,
            chain,
            address: reward.rewardAddress,
          });
          metaM.set(metaKey, meta);
        }

        const rewardCoin = cleanClaimRewardCoin(meta.symbol, meta.address);
        const claimCoin = getClaimCoinKey({
          coinInfoM,
          rewardCoin,
          rewardAddress: meta.address,
          sourceChain: reward.sourceChain,
          sourceCoin: reward.sourceCoin,
        });
        if (!coinInfoM[claimCoin]) {
          coinInfoM[claimCoin] = {
            address: meta.address,
            decimals: meta.decimals,
            name: `${meta.name} claim from ${reward.sourceCoin}`,
            type: "claim",
            source: "Aave Staking",
            sourceChain: reward.sourceChain,
            sourceCoin: reward.sourceCoin,
            sourceName: reward.sourceCoinE?.name || reward.sourceCoin,
            sourceDecimals: reward.sourceCoinE?.decimals,
            sourceType: reward.sourceCoinE?.type,
            sourceAddress: reward.stakingAddress,
            rewardCoin,
            rewardAddress: meta.address,
          };
          claimCoins.push(claimCoin);
        }

        const priceKey = `${chain}:${meta.address.toLowerCase()}`;
        let price = priceM.get(priceKey);
        if (price == null) {
          price = await getCoinUsdPrice({
            chain,
            coin: meta.localCoin || rewardCoin,
            coinE: {
              address: meta.address,
              decimals: meta.decimals,
              name: meta.name,
            },
            usdPriceQuery,
          }).catch(() => 0);
          priceM.set(priceKey, price);
        }

        const balance = ethers.formatUnits(reward.amount, meta.decimals);
        const row = ensureClaimRow(claimRowM, reward.row);
        row.balances[claimCoin] = {
          coin: claimCoin,
          raw: reward.amount.toString(),
          balance,
          decimals: meta.decimals,
          price,
          usd: price ? Number(balance) * price : 0,
          source: "Aave Staking",
          sourceChain: reward.sourceChain,
          sourceCoin: reward.sourceCoin,
          rewardCoin,
          rewardAddress: meta.address,
        };
      }
    } catch {
    } finally {
      provider?.destroy?.();
    }
  }

  addWemixWonderClaimBalances({
    data,
    claimRowM,
    coinInfoM,
    claimCoins,
  });

  const rows = [...claimRowM.values()];
  const coins = getReturnedCoins({
    rows,
    coinEntries: claimCoins.map((coin) => [coin, coinInfoM[coin]]),
  });
  if (!rows.length) return null;

  return {
    chain: claimChain,
    coins,
    allCoins: claimCoins,
    coinInfoM,
    scanner: "",
    rows,
    source: "claim",
  };
}

async function solanaRpc(rpc, method, params) {
  const res = await fetchWithTimeout(
    rpc,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    },
    solanaRpcTimeoutMs,
  );
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    const message = data.error?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(message);
  }

  return data.result;
}

async function withSolanaRpc(chainE, fn) {
  let lastError;

  for (const rpc of getRpcs(chainE)) {
    try {
      return await fn(rpc);
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(cleanErrorText(lastError?.message) || "all Solana rpcs failed");
}

async function getSolanaTokenAccountsFromRpc({ rpc, owner }) {
  const results = await Promise.allSettled(
    solanaTokenProgramIds.map((programId) =>
      solanaRpc(rpc, "getTokenAccountsByOwner", [
        owner.toBase58(),
        { programId: programId.toBase58() },
        { encoding: "jsonParsed" },
      ]),
    ),
  );
  const accounts = results.flatMap((result) =>
    result.status == "fulfilled" ? result.value?.value ?? [] : [],
  );

  if (results[0]?.status == "rejected") {
    throw toCleanError(results[0].reason, "SPL balance error");
  }

  return accounts;
}

async function getSolanaTokenAccounts({ chainE, owner }) {
  let lastError;

  for (const rpc of getRpcs(chainE)) {
    try {
      return {
        accounts: await getSolanaTokenAccountsFromRpc({ rpc, owner }),
      };
    } catch (e) {
      lastError = e;
    }
  }

  return {
    accounts: [],
    error: lastError?.message ?? "Solana SPL balance error",
  };
}

function getSolanaCoinLookup(coinEntries) {
  const mintCoinM = {};
  const invalidCoins = [];

  for (const [coin, coinE] of coinEntries) {
    if (coinE.native) continue;

    const mint = getSolanaPublicKey(coinE.address);
    if (mint) {
      mintCoinM[mint.toBase58()] = [coin, coinE];
    } else {
      invalidCoins.push(coin);
    }
  }

  return { mintCoinM, invalidCoins };
}

function addRawBalance(rawM, coin, coinE, raw, decimals) {
  if (raw <= 0n) return;

  rawM[coin] ??= {
    raw: 0n,
    coinE: {
      ...coinE,
      decimals: coinE.decimals ?? decimals,
    },
  };
  rawM[coin].raw += raw;
}

async function getSolanaRowBalancesWithRpc({
  rpc,
  chainE,
  row,
  coinEntries,
  priceM,
  usdPriceQuery = false,
  mintCoinM,
  invalidCoins,
}) {
  const balances = {};
  const errors = {};
  const rawM = {};
  const owner = getSolanaPublicKey(row.address);

  if (!owner) return { balances, errors: { address: "invalid address" } };

  for (const coin of invalidCoins) addError(errors, coin, "invalid token mint");

  const nativeCoin = coinEntries.find(([, coinE]) => coinE.native);
  const lamports = nativeCoin
    ? Number(
        (await solanaRpc(rpc, "getBalance", [owner.toBase58()]))?.value ?? 0,
      )
    : 0;

  if (nativeCoin && lamports > 0) {
    const [coin, coinE] = nativeCoin;
    balances[coin] = getBalanceE({
      raw: BigInt(lamports),
      coin,
      coinE,
      priceM,
      usdPriceQuery,
    });
  }

  const { accounts, error } = await getSolanaTokenAccounts({ chainE, owner });
  if (error) addError(errors, "SPL", error);

  for (const account of accounts) {
    const info = account.account?.data?.parsed?.info;
    const mint = info?.mint;
    const coinEntry = mintCoinM[mint];
    if (!coinEntry) continue;

    const [coin, coinE] = coinEntry;
    const raw = info?.tokenAmount?.amount ?? "0";
    addRawBalance(
      rawM,
      coin,
      coinE,
      BigInt(raw),
      info?.tokenAmount?.decimals,
    );
  }

  for (const [coin, e] of Object.entries(rawM)) {
    balances[coin] = getBalanceE({
      raw: e.raw,
      coin,
      coinE: e.coinE,
      priceM,
      usdPriceQuery,
    });
  }

  return { balances, errors };
}

async function getSolanaRowBalances(args) {
  return withSolanaRpc(args.chainE, (rpc) =>
    getSolanaRowBalancesWithRpc({ ...args, rpc }),
  );
}

async function getSolanaBalances({
  chainE,
  rows,
  coinEntries,
  priceM,
  usdPriceQuery = false,
}) {
  const balancesM = Object.fromEntries(rows.map((row) => [row.name, {}]));
  const errorsM = Object.fromEntries(rows.map((row) => [row.name, {}]));
  const coinLookup = getSolanaCoinLookup(coinEntries);

  for (const batch of chunkList(rows, solanaWalletChunkSize)) {
    const results = await Promise.all(
      batch.map((row) =>
        getSolanaRowBalances({
          chainE,
          row,
          coinEntries,
          priceM,
          usdPriceQuery,
          ...coinLookup,
        }).catch((e) => ({
          balances: {},
          errors: { Solana: e?.message ?? "Solana balance error" },
        })),
      ),
    );

    results.forEach((result, i) => {
      const row = batch[i];
      balancesM[row.name] = result.balances;
      errorsM[row.name] = result.errors;
    });
  }

  return { balancesM, errorsM };
}

export async function getSolanaWalletBalances({
  walletFile = "",
  walletAddress = "",
  walletName = "",
  walletEntryList = null,
  customCoinM = {},
  disabledCoins = [],
  disabledWallets = [],
  disabledWalletNames = [],
  useAlchemy = null,
  alchemyMinUsd = 0.01,
  usdPriceQuery = false,
  alchemyTokenCache = null,
} = {}) {
  const chain = "Solana";
  const chainE = getChainE(chain);
  const wallets = await loadWallets(walletFile, "solana", {
    walletAddress,
    walletName,
    walletEntryList,
    disabledWallets,
    disabledWalletNames,
  });
  const walletEntries = Object.entries(wallets);
  const coinM = {
    ...getCoinM(chain),
    ...(customCoinM && typeof customCoinM == "object" && !Array.isArray(customCoinM)
      ? customCoinM
      : {}),
  };
  const allCoinEntries = dedupeCoinEntriesByAddress(chain, Object.entries(coinM));
  const coinEntries = getActiveCoinEntries(allCoinEntries, disabledCoins);
  const allCoins = coinEntries.map(([coin]) => coin);
  const coinInfoM = Object.fromEntries(allCoinEntries);
  const scanner = scanners?.[chain] ?? "";

  if (!chainE) {
    return {
      chain,
      coins: [],
      allCoins,
      coinInfoM,
      scanner,
      rows: [],
      error: `unknown chain: ${chain}`,
    };
  }
  if (!walletEntries.length) return { chain, coins: [], allCoins, coinInfoM, scanner, rows: [] };

  const rpcList = getLiveRpcs(chainE);
  if (!rpcList.length) {
    return {
      chain,
      coins: [],
      allCoins,
      coinInfoM,
      scanner,
      rows: [],
      error: `missing rpc: ${chain}`,
    };
  }

  try {
    const rows = walletEntries.map(([name, address]) =>
      isSolanaAddress(address)
        ? { name, address, balances: {} }
        : { name, address, balances: {}, error: "invalid address" },
    );
    const validRows = rows.filter((row) => !row.error);

    const alchemyResult = await buildAlchemyWalletResult({
      chain,
      chainE,
      rows: validRows,
      coinEntries,
      allCoinEntries,
      disabledCoins,
      scanner,
      useAlchemy,
      alchemyMinUsd,
      usdPriceQuery,
      alchemyTokenCache,
    }).catch(() => null);

    if (alchemyResult) return { ...alchemyResult, rows };

    const { balancesM, errorsM } = await getSolanaBalances({
      chainE,
      rows: validRows,
      coinEntries,
      priceM: {},
      usdPriceQuery,
    });

    for (const row of validRows) {
      row.balances = balancesM[row.name] ?? {};
      row.errors = errorsM[row.name] ?? {};
      if (Object.keys(row.errors).length == coinEntries.length) {
        row.error = Object.values(row.errors)[0];
      }
    }

    await applyFallbackPrices({
      chain,
      rows: validRows,
      coinEntries,
      usdPriceQuery,
    });
    const coins = getReturnedCoins({ rows, coinEntries });

    return { chain, coins, allCoins, coinInfoM, scanner, rows, source: "rpc" };
  } catch (e) {
    return {
      chain,
      coins: [],
      allCoins,
      coinInfoM,
      scanner,
      rows: walletEntries.map(([name, address]) => ({ name, address, balances: {} })),
      source: "rpc",
      error: e?.message ?? "Solana wallet balance error",
    };
  }
}

export async function getHyperliquidWalletBalances({
  walletFile = "",
  walletType = defaultWalletType,
  walletAddress = "",
  walletName = "",
  walletEntryList = null,
  customCoinM = {},
  disabledCoins = [],
  disabledWallets = [],
  disabledWalletNames = [],
} = {}) {
  const chain = "Hyperliquid";
  const scanner = "https://app.hyperliquid.xyz";
  const wallets = await loadWallets(walletFile, walletType, {
    walletAddress,
    walletName,
    walletEntryList,
    disabledWallets,
    disabledWalletNames,
  });
  const walletEntries = Object.entries(wallets);

  if (!walletEntries.length) {
    return { chain, coins: [], allCoins: [], coinInfoM: {}, scanner, rows: [], source: "api" };
  }

  const rows = walletEntries.map(([name, address]) =>
    ethers.isAddress(address)
      ? { name, address: ethers.getAddress(address), balances: {} }
      : { name, address, balances: {}, error: "invalid address" },
  );
  const validRows = rows.filter((row) => !row.error);
  const [vaultResults, spotMetaResult] = await Promise.allSettled([
    Promise.allSettled(
      validRows.map((row) => getHyperliquidVaultEquities(row.address)),
    ),
    getHyperliquidSpotMeta(),
  ]);
  const results = vaultResults.status == "fulfilled" ? vaultResults.value : [];
  const spotMeta = spotMetaResult.status == "fulfilled" ? spotMetaResult.value : null;
  const addressCoinM = {};
  const spotTokenCoinM = {};
  const usedCoins = new Set();
  const coinInfoM = {};
  const allCoins = [];
  const discoveredCoins = new Set();
  const baseVaultM = getHyperliquidBaseVaultM();
  const editorVaultM = {
    ...(await readCustomHyperliquidVaultM()),
    ...(customCoinM && typeof customCoinM == "object" && !Array.isArray(customCoinM)
      ? customCoinM
      : {}),
  };
  const vaultMetaM = { ...baseVaultM, ...editorVaultM };
  const vaultAddressMetaM = Object.fromEntries(
    Object.entries(vaultMetaM)
      .filter(([, entry]) => ethers.isAddress(entry?.address))
      .map(([coin, entry]) => [ethers.getAddress(entry.address).toLowerCase(), [coin, entry]]),
  );
  const disabled = new Set(disabledCoins);

  for (const [addressKey, [coin, entry]] of Object.entries(vaultAddressMetaM)) {
    if (disabled.has(coin) || addressCoinM[addressKey]) continue;

    usedCoins.add(coin);
    addressCoinM[addressKey] = coin;
    allCoins.push(coin);
    coinInfoM[coin] = {
      ...entry,
      address: ethers.getAddress(entry.address),
      decimals: Number.isInteger(entry.decimals) ? entry.decimals : 6,
      name: entry.name || coin,
      type: "vault",
      source: entry.source || "hyperliquid",
    };
  }

  results.forEach((result, index) => {
    const row = validRows[index];
    if (result.status != "fulfilled") {
      row.error = result.reason?.message || "Hyperliquid vault error";
      return;
    }

    for (const vault of result.value || []) {
      const addressKey = vault.address.toLowerCase();
      if (!addressCoinM[addressKey]) {
        const meta = vaultAddressMetaM[addressKey];
        const baseCoin = meta?.[0] || getHyperliquidVaultCoin(vault.address);
        let coin = baseCoin;
        let i = 2;
        while (usedCoins.has(coin)) {
          coin = `${baseCoin}_${i}`;
          i += 1;
        }
        usedCoins.add(coin);
        addressCoinM[addressKey] = coin;
        allCoins.push(coin);
        if (!meta) discoveredCoins.add(coin);
        coinInfoM[coin] = {
          ...(meta?.[1] || {}),
          address: vault.address,
          decimals: meta?.[1]?.decimals ?? 6,
          name: meta?.[1]?.name || `Hyperliquid vault ${vault.address}`,
          type: "vault",
          source: meta?.[1]?.source || "hyperliquid",
          lockedUntilTimestamp: vault.lockedUntilTimestamp,
        };
      }

      const coin = addressCoinM[addressKey];
      if (disabled.has(coin)) continue;
      if (coinInfoM[coin]) {
        coinInfoM[coin] = {
          ...coinInfoM[coin],
          lockedUntilTimestamp: vault.lockedUntilTimestamp,
        };
      }

      row.balances[coin] = {
        coin,
        balance: String(vault.equity),
        decimals: 6,
        price: 1,
        usd: vault.usd,
        source: "hyperliquid",
        lockedUntilTimestamp: vault.lockedUntilTimestamp,
      };
    }
  });

  if (spotMeta) {
    const spotResults = await Promise.allSettled(
      validRows.map((row) => getHyperliquidSpotBalances(row.address, spotMeta)),
    );

    spotResults.forEach((result, index) => {
      const row = validRows[index];
      if (result.status != "fulfilled") {
        row.errors = {
          ...(row.errors || {}),
          Spot: result.reason?.message || "Hyperliquid spot error",
        };
        return;
      }

      for (const spot of result.value || []) {
        if (!spotTokenCoinM[spot.token]) {
          const coin = getUniqueHyperliquidSpotCoin({
            coin: spot.coin,
            token: spot.token,
            usedCoins,
          });
          spotTokenCoinM[spot.token] = coin;
          allCoins.push(coin);
          coinInfoM[coin] = {
            decimals: spot.decimals,
            name: spot.name || spot.coin,
            type: "spot",
            source: "hyperliquid",
            token: spot.token,
          };
        }

        const coin = spotTokenCoinM[spot.token];
        if (disabled.has(coin)) continue;

        row.balances[coin] = {
          coin,
          balance: spot.balance,
          decimals: spot.decimals,
          price: spot.price,
          usd: spot.usd,
          source: "hyperliquid",
          hold: spot.hold,
          entryNtl: spot.entryNtl,
          token: spot.token,
        };
      }
    });
  } else if (spotMetaResult.status == "rejected") {
    for (const row of validRows) {
      row.errors = {
        ...(row.errors || {}),
        Spot: spotMetaResult.reason?.message || "Hyperliquid spot meta error",
      };
    }
  }

  const coins = getReturnedCoins({
    rows,
    coinEntries: allCoins.map((coin) => [coin, coinInfoM[coin]]),
  });

  return {
    chain,
    coins,
    allCoins,
    coinInfoM,
    discoveredCoins: [...discoveredCoins],
    scanner,
    rows,
    source: "api",
  };
}

export async function getWalletBalances({
  chain = "BSC",
  walletFile = "",
  walletType = defaultWalletType,
  walletAddress = "",
  walletName = "",
  walletEntryList = null,
  customCoinM = {},
  disabledCoins = [],
  disabledWallets = [],
  disabledWalletNames = [],
  useAlchemy = null,
  alchemyMinUsd = 0.01,
  usdPriceQuery = false,
  alchemyTokenCache = null,
} = {}) {
  const chainE = getChainE(chain);
  const wallets = await loadWallets(walletFile, walletType, {
    walletAddress,
    walletName,
    walletEntryList,
    disabledWallets,
    disabledWalletNames,
  });
  const walletEntries = Object.entries(wallets);
  const coinM = {
    ...getCoinM(chain),
    ...(customCoinM && typeof customCoinM == "object" && !Array.isArray(customCoinM)
      ? customCoinM
      : {}),
  };
  const allCoinEntries = dedupeCoinEntriesByAddress(chain, Object.entries(coinM));
  const coinEntries = getActiveCoinEntries(allCoinEntries, disabledCoins);
  const allCoins = coinEntries.map(([coin]) => coin);
  const coinInfoM = Object.fromEntries(allCoinEntries);
  const scanner = scanners?.[chain] ?? "";

  if (!chainE) {
    return {
      chain,
      coins: [],
      allCoins,
      coinInfoM,
      scanner,
      rows: [],
      error: `unknown chain: ${chain}`,
    };
  }
  if (!walletEntries.length) {
    return { chain, coins: [], allCoins, coinInfoM, scanner, rows: [] };
  }

  const rpcList = getLiveRpcs(chainE);
  if (!rpcList.length) {
    return {
      chain,
      coins: [],
      allCoins,
      coinInfoM,
      scanner,
      rows: [],
      error: `missing rpc: ${chain}`,
    };
  }

  let provider;

  try {
    const rows = walletEntries.map(([name, address]) =>
      ethers.isAddress(address)
        ? { name, address: ethers.getAddress(address), balances: {} }
        : { name, address, balances: {}, error: "invalid address" },
    );
    const validRows = rows.filter((row) => !row.error);

    const alchemyResult = await buildAlchemyWalletResult({
      chain,
      chainE,
      rows: validRows,
      coinEntries,
      allCoinEntries,
      disabledCoins,
      scanner,
      useAlchemy,
      alchemyMinUsd,
      usdPriceQuery,
      alchemyTokenCache,
    }).catch(() => null);

    if (alchemyResult) return { ...alchemyResult, rows };

    provider = await getProvider(chainE);
    const multicallAddress = ethers.getAddress(chainE.multicall);
    const { balancesM, errorsM } = await getMulticallBalances({
      provider,
      multicallAddress,
      rows: validRows,
      coinEntries,
      priceM: {},
      usdPriceQuery,
    });

    for (const row of validRows) {
      row.balances = balancesM[row.name] ?? {};
      row.errors = errorsM[row.name] ?? {};

      const errorValues = Object.values(row.errors);
      if (errorValues.length == coinEntries.length) row.error = errorValues[0];
    }

    await applyFallbackPrices({
      chain,
      rows: validRows,
      coinEntries,
      provider,
      multicallAddress,
      usdPriceQuery,
    });
    const addedWemixWonderStake =
      !disabledCoins.includes(wemixWonderStakeCoin) &&
      (await applyWemixWonderStakeBalances({
        chain,
        provider,
        rows: validRows,
        usdPriceQuery,
      }));
    const returnedCoinEntries = addedWemixWonderStake
      ? [...coinEntries, [wemixWonderStakeCoin, wemixWonderStakeCoinE]]
      : coinEntries;
    const returnedAllCoins = addedWemixWonderStake
      ? [...new Set([...allCoins, wemixWonderStakeCoin])]
      : allCoins;
    const returnedCoinInfoM = addedWemixWonderStake
      ? { ...coinInfoM, [wemixWonderStakeCoin]: wemixWonderStakeCoinE }
      : coinInfoM;
    const coins = getReturnedCoins({ rows, coinEntries: returnedCoinEntries });

    return {
      chain,
      coins,
      allCoins: returnedAllCoins,
      coinInfoM: returnedCoinInfoM,
      scanner,
      rows,
      source: "rpc",
    };
  } catch (e) {
    return {
      chain,
      coins: [],
      allCoins,
      coinInfoM,
      scanner,
      rows: walletEntries.map(([name, address]) => ({ name, address, balances: {} })),
      source: "rpc",
      error: e?.shortMessage ?? e?.message ?? "wallet balance error",
    };
  } finally {
    provider?.destroy?.();
  }
}
