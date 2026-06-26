import fs from "fs/promises";
import path from "path";
import { PublicKey, Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ethers } from "ethers";
import { defaultMulticallAddress, multicalls } from "@/data/basic";
import getCoinM from "@/fn/getCoinM";
import { rpcs, scanners } from "@/sets";
import { getWalletDisableKey } from "./walletSettingData";

const walletRootDir = path.join(process.cwd(), "data", "editor", "wallet");
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
  "WEMIX$",
  "OUSDC",
  "OUSDT",
  "USDT.E",
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
const solanaTokenProgramIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
const reservedWalletNames = new Set(["watch"]);
const erc20Interface = new ethers.Interface([
  "function balanceOf(address account) view returns (uint256)",
]);
const exchangeRateInterface = new ethers.Interface([
  "function exchangeRateStored() view returns (uint256)",
  "function underlying() view returns (address)",
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
]);
const multicallAbi = [
  "function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256)",
];
const multicallInterface = new ethers.Interface(multicallAbi);

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

async function getProvider(chainE) {
  let lastError;

  for (const rpc of getRpcs(chainE)) {
    const provider = new ethers.JsonRpcProvider(rpc);
    try {
      await provider.getBlockNumber();
      return provider;
    } catch (e) {
      lastError = e;
      provider.destroy?.();
    }
  }

  throw new Error(lastError?.shortMessage ?? lastError?.message ?? "all rpcs failed");
}

function getUsdPrice(coin, priceM) {
  if (stableCoins.has(coin)) return 1;

  return Number(priceM[coin] ?? 0);
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

    const r = await fetch(url, { next: { revalidate: 15 } });
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
    const r = await fetch(url, { next: { revalidate: 15 } });
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
  { walletAddress = "", walletName = "" } = {},
) {
  const walletDir = getWalletDir(walletType);
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
        const entryList = await Promise.all(
          files
            .filter(
              (txtFile) => selectedWalletName || !isReservedWalletPath(txtFile),
            )
            .map((txtFile) =>
              readWalletEntries(path.join(selectedPath, txtFile), walletDir),
            ),
        );
        return filterWalletEntries(entryList.flat(), selectedWalletName);
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

function getStableUnderlyingM({ chain, coinEntries, priceM }) {
  const underlyingM = {};

  for (const [coin, coinE] of coinEntries) {
    if (!stableCoins.has(coin)) continue;

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
    for (const fn of [
      "exchangeRateStored",
      "underlying",
      "UNDERLYING_ASSET_ADDRESS",
    ]) {
      calls.push({
        coin,
        coinE,
        fn,
        call: {
          target,
          allowFailure: true,
          callData: exchangeRateInterface.encodeFunctionData(fn),
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
      } else {
        const underlying = underlyingM[normalizePriceAddress(chain, decoded)];
        if (underlying) coinPriceM[callE.coin].underlying = underlying;
      }
    } catch {}
  });

  for (const [coin, e] of Object.entries(coinPriceM)) {
    if (!e.exchangeRateRaw || !e.underlying) continue;

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

async function withSolanaConnection(chainE, fn) {
  let lastError;

  for (const rpc of getRpcs(chainE)) {
    try {
      return await fn(new Connection(rpc, "confirmed"));
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(lastError?.message ?? "all Solana rpcs failed");
}

async function getSolanaTokenAccounts({ connection, owner }) {
  const results = await Promise.allSettled(
    solanaTokenProgramIds.map((programId) =>
      connection.getParsedTokenAccountsByOwner(owner, { programId }),
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

async function getSolanaRowBalancesWithConnection({
  connection,
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
  const [lamports, accounts] = await Promise.all([
    nativeCoin ? connection.getBalance(owner) : Promise.resolve(0),
    getSolanaTokenAccounts({ connection, owner }),
  ]);

  if (nativeCoin && lamports > 0) {
    const [coin, coinE] = nativeCoin;
    balances[coin] = getBalanceE({
      raw: BigInt(lamports),
      coin,
      coinE,
      priceM,
    });
  }

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
  return withSolanaConnection(args.chainE, (connection) =>
    getSolanaRowBalancesWithConnection({ ...args, connection }),
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
  disabledCoins = [],
  disabledWallets = [],
  disabledWalletNames = [],
} = {}) {
  const chain = "Solana";
  const chainE = getChainE(chain);
  const wallets = await loadWallets(walletFile, "solana", {
    walletAddress,
    walletName,
    disabledWallets,
    disabledWalletNames,
  });
  const walletEntries = Object.entries(wallets);
  const coinM = getCoinM(chain);
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

    const balanceCoinEntries = getBalanceCoinEntries({ rows, coinEntries });
    const priceM = await getPriceM({ chain, coinEntries: balanceCoinEntries });
    applyPriceMToRows(validRows, priceM);

    const coins = coinEntries
      .map(([coin]) => coin)
      .filter((coin) => rows.some((row) => row.balances?.[coin]));

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
  disabledCoins = [],
  disabledWallets = [],
  disabledWalletNames = [],
} = {}) {
  const chainE = getChainE(chain);
  const wallets = await loadWallets(walletFile, walletType, {
    walletAddress,
    walletName,
    disabledWallets,
    disabledWalletNames,
  });
  const walletEntries = Object.entries(wallets);
  const coinM = getCoinM(chain);
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
    provider = await getProvider(chainE);
    const multicallAddress = ethers.getAddress(chainE.multicall);
    const rows = walletEntries.map(([name, address]) =>
      ethers.isAddress(address)
        ? { name, address: ethers.getAddress(address), balances: {} }
        : { name, address, balances: {}, error: "invalid address" },
    );
    const validRows = rows.filter((row) => !row.error);
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

    const balanceCoinEntries = getBalanceCoinEntries({ rows, coinEntries });
    let priceM = await getPriceM({ chain, coinEntries: balanceCoinEntries });
    try {
      priceM = {
        ...priceM,
        ...(await getExchangeRatePrices({
          chain,
          provider,
          multicallAddress,
          coinEntries: balanceCoinEntries,
          allCoinEntries: coinEntries,
          priceM,
        })),
      };
    } catch {}
    applyPriceMToRows(validRows, priceM);

    const coins = coinEntries
      .map(([coin]) => coin)
      .filter((coin) => rows.some((row) => row.balances?.[coin]));

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
