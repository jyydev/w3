import fs from "fs/promises";
import path from "path";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ethers } from "ethers";
import { defaultMulticallAddress, multicalls } from "@/data/basic";
import getCoinM from "@/fn/getCoinM";
import { alchemyNetworks, rpcs, scanners, sets } from "@/sets";
import { getWalletDisableKey } from "./walletSettingData";

const walletRootDir = path.join(process.cwd(), "data", "editor", "wallet");
const customCoinRootDir = path.join(process.cwd(), "data", "editor", "coins");
export const defaultWalletType = "evm";
export const walletTypes = ["evm", "solana"];
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
const solanaTokenProgramIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
const reservedWalletNames = new Set(["watch"]);
const erc20Interface = new ethers.Interface([
  "function balanceOf(address account) view returns (uint256)",
]);
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

function withTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
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
      rpc: chainRpc,
      multicall: multicalls?.[chain] ?? defaultMulticallAddress,
    };
  }

  return {
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
    .filter(Boolean);
}

async function readCustomCoins(chain = "") {
  const cleanChain = String(chain || "").trim();
  if (!cleanChain) return {};

  try {
    const parsed = JSON.parse(
      await fs.readFile(path.join(customCoinRootDir, `${cleanChain}.json`), "utf8"),
    );
    return parsed && typeof parsed == "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (e) {
    if (e.code == "ENOENT") return {};
    return {};
  }
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
      reservedWalletNames.has(part.replace(/\.txt$/i, "").toLowerCase()),
    );
}

async function getProvider(chainE, { timeoutMs = 0 } = {}) {
  let lastError;

  for (const rpc of getRpcs(chainE)) {
    const provider = new ethers.JsonRpcProvider(rpc);
    try {
      const blockPromise = provider.getBlockNumber();
      if (timeoutMs) {
        await withTimeout(blockPromise, timeoutMs, "rpc block timeout");
      } else {
        await blockPromise;
      }
      return provider;
    } catch (e) {
      lastError = e;
      provider.destroy?.();
    }
  }

  throw new Error(lastError?.shortMessage ?? lastError?.message ?? "all rpcs failed");
}

function getUsdPrice(coin, priceM) {
  if (stableCoins.has(String(coin || "").toUpperCase())) return 1;

  return Number(priceM[coin] ?? 0);
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
  return coinE.address ?? nativePriceTokenM[chain]?.[coin];
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

function getPriceAddressCoins({ chain, coinEntries, excludeCoins = new Set() }) {
  return coinEntries
    .filter(([coin]) => !stableCoins.has(coin) && !excludeCoins.has(coin))
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

async function getDexScreenerPrices({ chain, coinEntries }) {
  const chainId = dexChainM[chain];
  if (!chainId) return {};

  const addressCoins = getPriceAddressCoins({ chain, coinEntries });

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

async function getDefiLlamaPrices({ chain, coinEntries, excludeCoins }) {
  const chainId = llamaChainM[chain];
  if (!chainId) return {};

  const addressCoins = getPriceAddressCoins({ chain, coinEntries, excludeCoins });
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

async function getPriceM({ chain, coinEntries }) {
  let priceM = {};

  try {
    priceM = await getDefiLlamaPrices({
      chain,
      coinEntries,
      excludeCoins: new Set(),
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
      })),
    };
  } catch {
    return priceM;
  }
}

export async function getCoinUsdPrice({ chain = "", coin = "" } = {}) {
  const coinM = getCoinM(chain);
  const coinE = coinM?.[coin];
  if (!coinE) return 0;

  const coinEntries = [[coin, coinE]];
  let priceM = await getPriceM({ chain, coinEntries });
  let price = getUsdPrice(coin, priceM);
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
        allCoinEntries: Object.entries(coinM),
        priceM,
      }),
      priceFetchTimeoutMs,
      "price rpc timeout",
    );

    priceM = { ...priceM, ...exchangePriceM };
    price = getUsdPrice(coin, priceM);
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

export function parseWallets(txt = "") {
  return Object.fromEntries(
    parseWalletEntries(txt).map((entry) => [entry.name, entry.address]),
  );
}

export function parseWalletEntries(txt = "", source = "") {
  return txt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => {
      const [, name, address] = line.match(/^([^:=\s]+)\s*[:=]\s*(\S+)$/) || [];
      if (!name || !address) return null;

      return {
        name,
        address,
        source,
        label: source ? `${source}/${name}` : name,
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
    ? [{ name: "addr", address, source: "", label: "addr" }]
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
    .replace(/\.txt$/i, "");
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
    const files = await listTxtFiles(walletDir);
    const folders = new Set(
      files
        .map((file) => path.dirname(file))
        .filter((dir) => dir != ".")
        .map((dir) => `${dir.split(path.sep).join("/")}/`),
    );

    return [
      ...folders,
      ...files.map((file) => file.split(path.sep).join("/").replace(/\.txt$/i, "")),
    ].sort();
  } catch (e) {
    if (e.code == "ENOENT") return [];
    throw e;
  }
}

async function listTxtFiles(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTxtFiles(fullPath, baseDir)));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() == ".txt") {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files.sort();
}

function resolveWalletPath(file, walletType = defaultWalletType) {
  if (!file) return "";
  const walletDir = getWalletDir(walletType);
  const name = decodeURIComponent(file).trim().replace(/\/+$/, "");
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
        const files = await listTxtFiles(selectedPath);
        const siblingFile = `${selectedPath}.txt`;
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

      const selectedFile = stat?.isFile() ? selectedPath : `${selectedPath}.txt`;
      return filterWalletEntries(
        await readWalletEntries(selectedFile, walletDir),
        selectedWalletName,
      );
    }

    const files = await listTxtFiles(walletDir);
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

function getBalanceE({ raw, coin, coinE, priceM = {} }) {
  const decimals = coinE.decimals ?? 18;
  const balance = ethers.formatUnits(raw, decimals);
  const price = getUsdPrice(coin, priceM);

  return {
    coin,
    raw: raw.toString(),
    balance,
    decimals,
    price,
    usd: price ? Number(balance) * price : 0,
  };
}

function applyPriceMToBalance(balance, priceM) {
  const price = getUsdPrice(balance.coin, priceM);
  balance.price = price;
  balance.usd = price ? Number(balance.balance) * price : 0;
}

function applyPriceMToRows(rows, priceM) {
  for (const row of rows) {
    for (const balance of Object.values(row.balances || {})) {
      applyPriceMToBalance(balance, priceM);
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
    if (address) addressM[address] = [coin, coinE];
  }

  return { addressM, nativeEntries };
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
        ? "stablecoin"
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

function getAlchemyBalanceE({ chain, token, coin, coinE }) {
  const decimals = getAlchemyDecimals(token, coinE);
  const raw = parseAlchemyRawBalance(token.tokenBalance, decimals);
  const balance = ethers.formatUnits(raw, decimals);
  const price = getAlchemyUsdPrice(token) || getUsdPrice(coin, {});

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

async function fetchAlchemyTokens({ chain, rows }) {
  const apiKey = getAlchemyApiKey();
  const network = getAlchemyNetwork(chain);
  const tokens = [];

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
            networks: [network],
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

async function getAlchemyBalances({
  chain,
  rows,
  coinEntries,
  allCoinEntries,
  disabledCoins = [],
  useAlchemy = null,
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
  const tokens = await fetchAlchemyTokens({ chain, rows });

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

    const balance = getAlchemyBalanceE({ chain, token, coin, coinE });
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
}) {
  let nextPriceM = { ...priceM };
  const balanceCoinEntries = getBalanceCoinEntries({ rows, coinEntries });
  const missingPriceCoinEntries = balanceCoinEntries.filter(
    ([coin]) => !getUsdPrice(coin, nextPriceM),
  );

  if (missingPriceCoinEntries.length) {
    nextPriceM = {
      ...nextPriceM,
      ...(await getPriceM({ chain, coinEntries: missingPriceCoinEntries })),
    };
  }

  if (chain != "Solana" && provider && multicallAddress) {
    const missingExchangeCoinEntries = balanceCoinEntries.filter(
      ([coin]) => !getUsdPrice(coin, nextPriceM),
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
          })),
        };
      } catch {}
    }
  }

  applyPriceMToRows(rows, nextPriceM);
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
}) {
  const alchemy = await getAlchemyBalances({
    chain,
    rows,
    coinEntries,
    allCoinEntries,
    disabledCoins,
    useAlchemy,
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

function getStableUnderlyingM({ chain, coinEntries, priceM }) {
  const underlyingM = {};

  for (const [coin, coinE] of coinEntries) {
    if (!stableCoins.has(String(coin || "").toUpperCase())) continue;

    const address = getTokenAddress({ chain, coin, coinE });
    if (!isTokenAddress(chain, address)) continue;

    const price = getUsdPrice(coin, priceM);
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
}) {
  const underlyingM = getStableUnderlyingM({
    chain,
    coinEntries: allCoinEntries,
    priceM,
  });
  if (!Object.keys(underlyingM).length) return {};

  const calls = [];

  for (const [coin, coinE] of coinEntries) {
    if (getUsdPrice(coin, priceM)) continue;
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

  throw new Error(lastError?.message ?? "all Solana rpcs failed");
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
    throw new Error(results[0].reason?.message ?? "SPL balance error");
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
    });
  }

  return { balances, errors };
}

async function getSolanaRowBalances(args) {
  return withSolanaRpc(args.chainE, (rpc) =>
    getSolanaRowBalancesWithRpc({ ...args, rpc }),
  );
}

async function getSolanaBalances({ chainE, rows, coinEntries, priceM }) {
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
  const allCoinEntries = Object.entries(coinM);
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

  const rpcList = getRpcs(chainE);
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
    }).catch(() => null);

    if (alchemyResult) return { ...alchemyResult, rows };

    const { balancesM, errorsM } = await getSolanaBalances({
      chainE,
      rows: validRows,
      coinEntries,
      priceM: {},
    });

    for (const row of validRows) {
      row.balances = balancesM[row.name] ?? {};
      row.errors = errorsM[row.name] ?? {};
      if (Object.keys(row.errors).length == coinEntries.length) {
        row.error = Object.values(row.errors)[0];
      }
    }

    await applyFallbackPrices({ chain, rows: validRows, coinEntries });
    const coins = getReturnedCoins({ rows, coinEntries });

    return { chain, coins, allCoins, coinInfoM, scanner, rows };
  } catch (e) {
    return {
      chain,
      coins: [],
      allCoins,
      coinInfoM,
      scanner,
      rows: walletEntries.map(([name, address]) => ({ name, address, balances: {} })),
      error: e?.message ?? "Solana wallet balance error",
    };
  }
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
  const allCoinEntries = Object.entries(coinM);
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

  const rpcList = getRpcs(chainE);
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
    });
    const coins = getReturnedCoins({ rows, coinEntries });

    return { chain, coins, allCoins, coinInfoM, scanner, rows };
  } catch (e) {
    return {
      chain,
      coins: [],
      allCoins,
      coinInfoM,
      scanner,
      rows: walletEntries.map(([name, address]) => ({ name, address, balances: {} })),
      error: e?.shortMessage ?? e?.message ?? "wallet balance error",
    };
  } finally {
    provider?.destroy?.();
  }
}
