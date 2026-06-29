"use server";

import { ethers } from "ethers";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import coinM from "@/fn/coinM";
import { rpcs } from "@/sets";
import {
  approveExactIfNeeded,
  assertWalletMatches,
  erc20Abi,
  executeSolanaTx,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getEvmTokenAddress,
  getPrivateKey,
  getSolanaConnection,
  getSolanaInstructionTx,
  getSolanaKeypair,
  getSolanaPublicKey,
  getTradeCoinPrice as getTradeCoinPriceShared,
  getUnsignedTx,
  getUsableChainRpc,
  getWallet,
  relayChainIds,
} from "../sharedServer";

const aaveV3PoolM = {
  Ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  EthereumEtherFi: "0x0AA97c284e98396202b6A04024F5E2c65026F3c0",
  EthereumHorizon: "0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8",
  EthereumLido: "0x4e033931ad43597d96D6bcc25c280717730B58B1",
  BSC: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
  BNB: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
  Arbitrum: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Avalanche: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Optimism: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Polygon: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Base: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  Celo: "0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402",
  Fantom: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Gnosis: "0xb50201558B00496A145fE76f7424749556E326D8",
  Harmony: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Ink: "0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA",
  Linea: "0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac",
  Mantle: "0x458F293454fE0d67EC0655f3672301301DD51422",
  MegaEth: "0x7e324AbC5De01d112AfC03a584966ff199741C28",
  Metis: "0x90df02551bB792286e8D4f13E0e357b4Bf1D6a57",
  Monad: "0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef",
  Plasma: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
  Scroll: "0x11fCfe756c05AD438e312a7fd934381537D3cFfe",
  Soneium: "0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B",
  Sonic: "0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3",
  XLayer: "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116",
  ZkSync: "0x78e30497a3c7527d953c6B1E3541b021A98Ac43c",
  zkSyncEra: "0x78e30497a3c7527d953c6B1E3541b021A98Ac43c",
};
const aavePoolAbi = [
  "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
  "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
  "function getReservesList() view returns (address[])",
  "function getReserveData(address asset) view returns (tuple(uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))",
];
const aTokenAbi = [
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
];
const erc20MetaAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const venusTokenAbi = [
  "function comptroller() view returns (address)",
  "function underlying() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
  "function supplyRatePerBlock() view returns (uint256)",
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function mint(uint256 mintAmount) returns (uint256)",
  "function redeem(uint256 redeemTokens) returns (uint256)",
];
const venusComptrollerAbi = [
  "function getAllMarkets() view returns (address[])",
];
const aavePoolInterface = new ethers.Interface(aavePoolAbi);
const venusTokenInterface = new ethers.Interface(venusTokenAbi);
const aaveMarketFetchTimeoutMs = 20000;
const aaveTokenMetaTimeoutMs = 10000;
const aaveMarketFetchConcurrency = 3;
const venusMarketFetchTimeoutMs = 15000;
const venusTokenMetaTimeoutMs = 8000;
const venusMarketFetchConcurrency = 8;
const venusGoodMarketRatio = 0.8;
const venusBlocksPerYearM = {
  Arbitrum: 126144000,
  BSC: 10512000,
  Ethereum: 2628000,
  Optimism: 15768000,
  zkSyncEra: 31536000,
};
const jupiterLendProgramM = {
  main: {
    lending: new PublicKey("jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9"),
    liquidity: new PublicKey("jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC"),
    rewards: new PublicKey("jup7TthsMgcR9Y3L277b8Eo9uboVSmu1utkuXHNUKar"),
  },
  ethena: {
    lending: new PublicKey("jup97Zx1NixM8UJMQFw8TtKzqTiRT3ETAJR7cVx3PfQ"),
    liquidity: new PublicKey("jup6QF1sNDGpkkcu6F4qaFHcRBmnSS1VgyB4uFbBvNS"),
    rewards: new PublicKey("jupGBUJYXuzz2hVSoqjrxoEwJUB6uuHJsQqkzmYyQ7n"),
  },
};
const jupiterDepositDiscriminator = Buffer.from([
  242, 35, 198, 137, 82, 225, 242, 182,
]);
const jupiterRedeemDiscriminator = Buffer.from([
  184, 12, 86, 149, 70, 196, 97, 225,
]);
const jupiterLendingAccountDiscriminator = Buffer.from([
  135, 199, 82, 16, 249, 131, 182, 241,
]);
const jupiterTokenSearchUrl = "https://lite-api.jup.ag/tokens/v2/search";
const jupiterLendTokenQueries = ["jl", "JUICED"];
const jupiterUnderlyingTokenM = {
  USDC: {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    name: "USD Coin",
  },
  USDT: {
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    name: "Tether USD",
  },
  WSOL: {
    address: "So11111111111111111111111111111111111111112",
    decimals: 9,
    name: "Wrapped SOL",
  },
  USDS: {
    address: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",
    decimals: 6,
    name: "USDS",
  },
  USDG: {
    address: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
    decimals: 6,
    name: "Global Dollar",
  },
  EURC: {
    address: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
    decimals: 6,
    name: "EURC",
  },
  JupUSD: {
    address: "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD",
    decimals: 6,
    name: "Jupiter USD",
  },
};

export async function getTradeCoinPrice(args) {
  return getTradeCoinPriceShared(args);
}

function withTimeout(promise, ms, message) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function cleanMarketSymbol(symbol = "", address = "") {
  const cleanAddress = String(address || "").replace(/^0x/i, "");
  const clean = String(symbol || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");

  return clean || `TOKEN_${cleanAddress.slice(0, 6).toUpperCase()}`;
}

function sameEvmAddress(a = "", b = "") {
  return (
    ethers.isAddress(a) &&
    ethers.isAddress(b) &&
    ethers.getAddress(a) == ethers.getAddress(b)
  );
}

async function mapWithConcurrency(items = [], limit = 3, fn) {
  const results = [];

  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map(fn))));
  }

  return results;
}

function getAaveRateApr(rate = 0n) {
  try {
    const apr = Number(ethers.formatUnits(BigInt(rate || 0), 25));
    return Number.isFinite(apr) ? apr : 0;
  } catch {
    return 0;
  }
}

function getVenusRateApr(rate = 0n, multiplier = 0) {
  try {
    if (!multiplier) return 0;
    const rawRate = Number(ethers.formatUnits(BigInt(rate || 0), 18));
    const apr = rawRate * multiplier * 100;
    return Number.isFinite(apr) ? apr : 0;
  } catch {
    return 0;
  }
}

async function getVenusSupplyApr(vToken, chain = "") {
  const blocksPerYear = venusBlocksPerYearM[chain] || 2628000;
  const blockRate = await withTimeout(
    vToken.supplyRatePerBlock(),
    venusTokenMetaTimeoutMs,
    `${chain} Venus supply APR timeout`,
  ).catch(() => null);
  if (blockRate !== null) return getVenusRateApr(blockRate, blocksPerYear);

  const timestampRate = await withTimeout(
    vToken.supplyRatePerTimestamp(),
    venusTokenMetaTimeoutMs,
    `${chain} Venus supply APR timeout`,
  ).catch(() => null);
  if (timestampRate !== null) return getVenusRateApr(timestampRate, 31536000);

  return 0;
}

function getUsableChainRpcs(chain = "") {
  const chainRpc = rpcs?.[chain];
  const list = Array.isArray(chainRpc)
    ? chainRpc
    : Array.isArray(chainRpc?.rpc)
      ? chainRpc.rpc
      : Array.isArray(chainRpc?.rpcs)
        ? chainRpc.rpcs
        : [chainRpc?.rpc ?? chainRpc?.rpcs ?? chainRpc];

  return list.filter(
    (rpc) =>
      rpc &&
      !String(rpc).includes("undefined") &&
      !String(rpc).includes("YOUR_KEY") &&
      !String(rpc).match(/\/v2\/?$/),
  );
}

async function getSolanaMultipleAccountsInfoFast(pubkeys = [], timeoutMs = 9000) {
  if (!pubkeys.length) return [];

  const rpcList = getUsableChainRpcs("Solana").slice(0, 4);
  if (!rpcList.length) throw new Error("Solana rpc not configured");

  try {
    return await Promise.any(
      rpcList.map((rpc) => {
        const connection = new Connection(rpc, "confirmed");
        return withTimeout(
          connection.getMultipleAccountsInfo(pubkeys, "confirmed"),
          timeoutMs,
          `Solana RPC timeout: ${rpc}`,
        );
      }),
    );
  } catch (e) {
    const errors = Array.isArray(e?.errors) ? e.errors : [e];
    const message =
      errors.find((err) => err?.message)?.message ||
      "Solana Jupiter markets timeout";
    throw new Error(message);
  }
}

function getCoinByAddress(chain = "", address = "") {
  if (!ethers.isAddress(address)) return null;

  return (
    Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
      sameEvmAddress(coinE?.address, address),
    ) || null
  );
}

function isJupiterLendCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE?.name || ""}`.toLowerCase();

  return (
    coinE?.address &&
    (/^jl[A-Z0-9]/.test(coin) ||
      coin == "JUICED" ||
      text.includes("jupusd")) &&
    (coinE.type == "lending" ||
      coinE.type == "yield" ||
      text.includes("jupiter lend"))
  );
}

function getJupiterUnderlyingCoin(lendCoin = "") {
  const stripped = String(lendCoin || "").replace(/^jl/, "");
  const solanaCoins = coinM?.Solana || {};

  if (solanaCoins[stripped] && solanaCoins[stripped]?.address) {
    return stripped;
  }

  const lendText = `${lendCoin} ${solanaCoins[lendCoin]?.name || ""}`.toLowerCase();
  return (
    Object.keys(solanaCoins)
      .filter((coin) => coin != lendCoin && solanaCoins[coin]?.address)
      .sort((a, b) => b.length - a.length)
      .find((coin) => lendText.includes(coin.toLowerCase())) || ""
  );
}

function getJupiterMarketName({ lendCoin = "", coinE = {} } = {}) {
  const configured = coinE?.jupiterMarket || coinE?.lendMarket || coinE?.market;
  if (configured) return String(configured);

  const text = `${lendCoin} ${coinE?.name || ""}`.toLowerCase();
  return text.includes("juiced") || text.includes("jupusd") ? "ethena" : "main";
}

function getJupiterPrograms(market = "main") {
  return jupiterLendProgramM[market] || jupiterLendProgramM.main;
}

function findPda(seeds = [], programId) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function getJupiterFTokenMint(assetMint, market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda(
    [Buffer.from("f_token_mint"), assetMint.toBuffer()],
    programs.lending,
  );
}

function getJupiterMarketFromMints(underlyingAddress = "", lendAddress = "") {
  try {
    const underlyingMint = new PublicKey(underlyingAddress);
    const cleanLendAddress = String(lendAddress || "");

    return (
      Object.keys(jupiterLendProgramM).find(
        (market) =>
          getJupiterFTokenMint(underlyingMint, market).toBase58() ==
          cleanLendAddress,
      ) || ""
    );
  } catch {
    return "";
  }
}

function u64Buffer(value) {
  const n = BigInt(value || 0);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);

  return buf;
}

function getJupiterInstructionData(action = "lend", amountIn = 0n) {
  return Buffer.concat([
    action == "redeem" ? jupiterRedeemDiscriminator : jupiterDepositDiscriminator,
    u64Buffer(amountIn),
  ]);
}

function getJupiterLendingAdmin(market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda([Buffer.from("lending_admin")], programs.lending);
}

function getJupiterLending(assetMint, fTokenMint, market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda(
    [Buffer.from("lending"), assetMint.toBuffer(), fTokenMint.toBuffer()],
    programs.lending,
  );
}

function getJupiterLiquidity(market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda([Buffer.from("liquidity")], programs.liquidity);
}

function getJupiterReserve(assetMint, market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda([Buffer.from("reserve"), assetMint.toBuffer()], programs.liquidity);
}

function getJupiterSupplyPosition(assetMint, lending, market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda(
    [
      Buffer.from("user_supply_position"),
      assetMint.toBuffer(),
      lending.toBuffer(),
    ],
    programs.liquidity,
  );
}

function getJupiterRateModel(assetMint, market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda([Buffer.from("rate_model"), assetMint.toBuffer()], programs.liquidity);
}

function getJupiterRewardsRateModel(assetMint, market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda(
    [Buffer.from("lending_rewards_rate_model"), assetMint.toBuffer()],
    programs.rewards,
  );
}

function getJupiterUserClaim(lendingAdmin, assetMint, market = "main") {
  const programs = getJupiterPrograms(market);

  return findPda(
    [
      Buffer.from("user_claim"),
      lendingAdmin.toBuffer(),
      assetMint.toBuffer(),
    ],
    programs.liquidity,
  );
}

async function getSolanaMintTokenProgram(connection, mint) {
  const account = await connection.getAccountInfo(mint, "confirmed");
  if (!account) throw new Error(`Solana mint not found: ${mint.toBase58()}`);

  return account.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
}

async function getAtaWithCreateIx({
  connection,
  payer,
  owner,
  mint,
  tokenProgram,
} = {}) {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const account = await connection.getAccountInfo(ata, "confirmed");

  return {
    ata,
    createIx: account
      ? null
      : createAssociatedTokenAccountInstruction(
          payer,
          ata,
          owner,
          mint,
          tokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
  };
}

function getSolanaTokenAddress(chain = "", coin = "", label = "Solana token") {
  const coinE = coinM?.[chain]?.[coin];
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (coinE.native) throw new Error(`${label} native token not supported here`);
  if (!coinE.address) throw new Error(`${label} address missing: ${chain} ${coin}`);

  return getSolanaPublicKey(coinE.address, label);
}

function getJupiterAmount({
  chain = "Solana",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  underlyingDecimals,
  lendDecimals,
} = {}) {
  const coin = action == "redeem" ? lendCoin : underlyingCoin;
  const decimals =
    action == "redeem"
      ? lendDecimals
      : underlyingDecimals;
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

function getJupiterMarket({
  chain = "Solana",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  lendAddress = "",
  marketName = "",
} = {}) {
  if (chain != "Solana") throw new Error("Jupiter Lend is Solana-only here");
  const lendE = coinM?.Solana?.[lendCoin] || {};
  const market = marketName || getJupiterMarketName({ lendCoin, coinE: lendE });
  const underlying = underlyingAddress
    ? getSolanaPublicKey(underlyingAddress, "Jupiter underlying")
    : getSolanaTokenAddress(chain, underlyingCoin, "Jupiter underlying");
  const fTokenMint = lendAddress
    ? getSolanaPublicKey(lendAddress, "Jupiter lend token")
    : getSolanaTokenAddress(chain, lendCoin, "Jupiter lend token");

  return {
    market,
    underlying,
    fTokenMint,
  };
}

function getSolanaCoinByAddress(address = "") {
  const cleanAddress = String(address || "").trim();
  if (!cleanAddress) return null;

  return (
    Object.entries(coinM?.Solana || {}).find(
      ([, coinE]) => String(coinE?.address || "").trim() == cleanAddress,
    ) || null
  );
}

async function fetchJupiterTokenSearch(query = "") {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  const res = await withTimeout(
    fetch(`${jupiterTokenSearchUrl}?query=${encodeURIComponent(cleanQuery)}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    }),
    10000,
    `Jupiter token search timeout: ${cleanQuery}`,
  );
  if (!res.ok) throw new Error(`Jupiter token search failed: ${res.status}`);

  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

function getJupiterTokenApy(token = {}) {
  const apr = Number(token?.apy?.jupEarn || 0);
  return Number.isFinite(apr) ? apr : 0;
}

function isJupiterEarnToken(token = {}) {
  return (
    token?.id &&
    token?.symbol &&
    token?.isVerified &&
    Array.isArray(token.tags) &&
    token.tags.includes("jup-lend-earn")
  );
}

function getJupiterUnderlyingSymbol(token = {}) {
  const symbol = String(token?.symbol || "").trim();
  if (symbol == "JUICED") return "JupUSD";
  if (/^jl/i.test(symbol)) return symbol.replace(/^jl/i, "");

  const match = String(token?.name || "").match(/lend\s+(?:ethena\s+)?([A-Z0-9]+)/i);
  return match?.[1] || "";
}

async function getJupiterUnderlyingMeta(symbol = "") {
  const cleanSymbol = String(symbol || "").trim();
  if (!cleanSymbol) return null;

  const fallback = jupiterUnderlyingTokenM[cleanSymbol];
  if (fallback) return { symbol: cleanSymbol, ...fallback };

  const tokens = await fetchJupiterTokenSearch(cleanSymbol).catch(() => []);
  const token =
    tokens.find(
      (entry) =>
        entry?.isVerified &&
        String(entry.symbol || "").toLowerCase() == cleanSymbol.toLowerCase(),
    ) ||
    tokens.find(
      (entry) =>
        String(entry.symbol || "").toLowerCase() == cleanSymbol.toLowerCase(),
    );
  if (!token?.id) return null;

  return {
    symbol: token.symbol || cleanSymbol,
    address: token.id,
    decimals: Number(token.decimals || 0),
    name: token.name || token.symbol || cleanSymbol,
  };
}

async function getJupiterEarnTokens() {
  const results = await Promise.all(
    jupiterLendTokenQueries.map((query) =>
      fetchJupiterTokenSearch(query).catch(() => []),
    ),
  );
  const tokenM = new Map();

  for (const token of results.flat()) {
    if (!isJupiterEarnToken(token)) continue;
    tokenM.set(token.id, token);
  }

  return [...tokenM.values()];
}

async function getJupiterApiMarkets(chain = "Solana") {
  const lendTokens = await getJupiterEarnTokens();
  const markets = [];

  for (const token of lendTokens) {
    const underlyingSymbol = getJupiterUnderlyingSymbol(token);
    const underlying = await getJupiterUnderlyingMeta(underlyingSymbol);
    if (!underlying?.address) continue;

    const [configuredUnderlyingCoin] =
      getSolanaCoinByAddress(underlying.address) || [];
    const [configuredLendCoin] = getSolanaCoinByAddress(token.id) || [];
    const market =
      getJupiterMarketFromMints(underlying.address, token.id) ||
      getJupiterMarketName({
        lendCoin: configuredLendCoin || token.symbol,
        coinE: { name: token.name },
      });
    const lendCoin = configuredLendCoin || token.symbol;
    const underlyingCoin = configuredUnderlyingCoin || underlying.symbol;

    markets.push({
      value: `${market}:${underlyingCoin}:${lendCoin}:${token.id}`,
      chain,
      market,
      underlyingCoin,
      underlyingName: underlying.name || underlyingCoin,
      underlyingAddress: underlying.address,
      underlyingDecimals: underlying.decimals,
      lendCoin,
      lendName: token.name || lendCoin,
      lendAddress: token.id,
      lendDecimals: Number(token.decimals || underlying.decimals || 6),
      addedUnderlying: Boolean(configuredUnderlyingCoin),
      addedLend: Boolean(configuredLendCoin),
      supplyApr: getJupiterTokenApy(token),
      source: "jupiter",
    });
  }

  return markets;
}

function getJupiterDiscoveredCoin({ underlyingCoin = "", market = "main" } = {}) {
  const base = `jl${underlyingCoin}`;
  if (market == "main") return base;
  return `${base}_${market}`;
}

function decodeJupiterLendingAccount(data) {
  if (
    !Buffer.isBuffer(data) ||
    data.length < 75 ||
    !data.subarray(0, 8).equals(jupiterLendingAccountDiscriminator)
  ) {
    return null;
  }

  const underlyingAddress = new PublicKey(data.subarray(8, 40)).toBase58();
  const lendAddress = new PublicKey(data.subarray(40, 72)).toBase58();
  const lendDecimals = Number(data[74]);

  return {
    underlyingAddress,
    lendAddress,
    lendDecimals: Number.isInteger(lendDecimals) ? lendDecimals : undefined,
  };
}

async function getSolanaMintBalance({
  connection,
  owner,
  mint,
  decimals = 0,
} = {}) {
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  const raw = accounts.value.reduce((sum, entry) => {
    const amount = entry.account?.data?.parsed?.info?.tokenAmount?.amount ?? "0";
    return sum + BigInt(amount);
  }, 0n);

  return {
    address: mint.toBase58(),
    raw: raw.toString(),
    balance: ethers.formatUnits(raw, decimals),
    decimals,
  };
}

async function getJupiterInstruction({
  walletAddress = "",
  action = "lend",
  underlyingMint,
  fTokenMint,
  amountIn,
  market = "main",
} = {}) {
  const connection = getSolanaConnection();
  const user = getSolanaPublicKey(walletAddress, "Solana wallet address");
  const programs = getJupiterPrograms(market);
  const tokenProgram = await getSolanaMintTokenProgram(connection, underlyingMint);
  const lendingAdmin = getJupiterLendingAdmin(market);
  const lending = getJupiterLending(underlyingMint, fTokenMint, market);
  const reserve = getJupiterReserve(underlyingMint, market);
  const supplyPosition = getJupiterSupplyPosition(underlyingMint, lending, market);
  const rateModel = getJupiterRateModel(underlyingMint, market);
  const liquidity = getJupiterLiquidity(market);
  const vault = getAssociatedTokenAddressSync(
    underlyingMint,
    liquidity,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const rewardsRateModel = getJupiterRewardsRateModel(underlyingMint, market);
  const { ata: underlyingAta, createIx: createUnderlyingAtaIx } =
    await getAtaWithCreateIx({
      connection,
      payer: user,
      owner: user,
      mint: underlyingMint,
      tokenProgram,
    });
  const { ata: fTokenAta, createIx: createFTokenAtaIx } =
    await getAtaWithCreateIx({
      connection,
      payer: user,
      owner: user,
      mint: fTokenMint,
      tokenProgram,
    });
  const data = getJupiterInstructionData(action, amountIn);
  const commonEnd = [
    { pubkey: reserve, isSigner: false, isWritable: true },
    { pubkey: supplyPosition, isSigner: false, isWritable: true },
    { pubkey: rateModel, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
  ];
  const keys =
    action == "redeem"
      ? [
          { pubkey: user, isSigner: true, isWritable: true },
          { pubkey: fTokenAta, isSigner: false, isWritable: true },
          { pubkey: underlyingAta, isSigner: false, isWritable: true },
          { pubkey: lendingAdmin, isSigner: false, isWritable: false },
          { pubkey: lending, isSigner: false, isWritable: true },
          { pubkey: underlyingMint, isSigner: false, isWritable: false },
          { pubkey: fTokenMint, isSigner: false, isWritable: true },
          ...commonEnd,
          {
            pubkey: getJupiterUserClaim(lendingAdmin, underlyingMint, market),
            isSigner: false,
            isWritable: true,
          },
          { pubkey: liquidity, isSigner: false, isWritable: true },
          { pubkey: programs.liquidity, isSigner: false, isWritable: true },
          { pubkey: rewardsRateModel, isSigner: false, isWritable: false },
          { pubkey: tokenProgram, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ]
      : [
          { pubkey: user, isSigner: true, isWritable: true },
          { pubkey: underlyingAta, isSigner: false, isWritable: true },
          { pubkey: fTokenAta, isSigner: false, isWritable: true },
          { pubkey: underlyingMint, isSigner: false, isWritable: false },
          { pubkey: lendingAdmin, isSigner: false, isWritable: false },
          { pubkey: lending, isSigner: false, isWritable: true },
          { pubkey: fTokenMint, isSigner: false, isWritable: true },
          ...commonEnd,
          { pubkey: liquidity, isSigner: false, isWritable: true },
          { pubkey: programs.liquidity, isSigner: false, isWritable: true },
          { pubkey: rewardsRateModel, isSigner: false, isWritable: false },
          { pubkey: tokenProgram, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];
  const ix = new TransactionInstruction({
    programId: programs.lending,
    keys,
    data,
  });

  return {
    market,
    instructions: [
      action == "redeem" ? createUnderlyingAtaIx : createFTokenAtaIx,
      ix,
    ].filter(Boolean),
  };
}

async function getTokenMeta(
  provider,
  address = "",
  chain = "",
  timeoutMs = aaveTokenMetaTimeoutMs,
) {
  const localCoin = Object.entries(coinM?.[chain] || {}).find(([, coinE]) =>
    sameEvmAddress(coinE?.address, address),
  );
  if (localCoin) {
    const [symbol, coinE] = localCoin;

    return {
      address: ethers.getAddress(address),
      name: coinE.name || symbol,
      symbol,
      decimals: coinE.decimals ?? 18,
      fallback: false,
    };
  }

  const token = new ethers.Contract(address, erc20MetaAbi, provider);
  const [name, symbol, decimals] = await Promise.all([
    withTimeout(token.name(), timeoutMs, "token name timeout").catch(() => ""),
    withTimeout(
      token.symbol(),
      timeoutMs,
      "token symbol timeout",
    ).catch(() => ""),
    withTimeout(
      token.decimals(),
      timeoutMs,
      "token decimals timeout",
    ).catch(() => 18),
  ]);

  return {
    address: ethers.getAddress(address),
    name: String(name || "").trim(),
    symbol: cleanMarketSymbol(symbol, address),
    decimals: Number(decimals),
    fallback: !String(symbol || "").trim(),
  };
}

export async function getAaveAllMarkets({ chain = "" } = {}) {
  if (chain == "Solana") return { ok: true, chain, markets: [] };

  const pool = getAavePool(chain);
  const rpcList = getUsableChainRpcs(chain);
  if (!rpcList.length) throw new Error(`rpc not configured: ${chain}`);
  let bestResult = null;
  let lastError = null;

  async function fetchMarkets(rpc) {
    const provider = new ethers.JsonRpcProvider(rpc);
    const poolContract = new ethers.Contract(pool, aavePoolAbi, provider);

    try {
      const reserves = await withTimeout(
        poolContract.getReservesList(),
        aaveMarketFetchTimeoutMs,
        `${chain} Aave reserves timeout`,
      );
      const markets = (
        await mapWithConcurrency(
          reserves,
          aaveMarketFetchConcurrency,
          async (underlyingAddress) => {
            const reserve = await withTimeout(
              poolContract.getReserveData(underlyingAddress),
              aaveTokenMetaTimeoutMs,
              `${chain} Aave reserve timeout`,
            ).catch(() => null);
            if (!reserve) return null;

            const lendAddress = ethers.getAddress(
              reserve.aTokenAddress || reserve[8],
            );
            const [underlyingMeta, lendMeta] = await Promise.all([
              getTokenMeta(provider, underlyingAddress, chain, venusTokenMetaTimeoutMs),
              getTokenMeta(provider, lendAddress, chain, venusTokenMetaTimeoutMs),
            ]);
            const addedUnderlying = getCoinByAddress(chain, underlyingMeta.address);
            const addedLend = getCoinByAddress(chain, lendMeta.address);
            const metaFallback = !!underlyingMeta.fallback || !!lendMeta.fallback;

            return {
              value: `${underlyingMeta.symbol}:${lendMeta.symbol}:${lendMeta.address}`,
              chain,
              underlyingCoin: addedUnderlying?.[0] || underlyingMeta.symbol,
              underlyingName: underlyingMeta.name || underlyingMeta.symbol,
              underlyingAddress: underlyingMeta.address,
              underlyingDecimals: underlyingMeta.decimals,
              lendCoin: addedLend?.[0] || lendMeta.symbol,
              lendName: lendMeta.name || lendMeta.symbol,
              lendAddress: lendMeta.address,
              lendDecimals: lendMeta.decimals,
              addedUnderlying: !!addedUnderlying,
              addedLend: !!addedLend,
              supplyApr: getAaveRateApr(
                reserve.currentLiquidityRate || reserve[2],
              ),
              variableBorrowApr: getAaveRateApr(
                reserve.currentVariableBorrowRate || reserve[4],
              ),
              metaFallback,
            };
          },
        )
      ).filter(Boolean);

      return {
        rpc,
        reserveCount: reserves.length,
        fallbackCount: markets.filter((entry) => entry.metaFallback).length,
        markets,
      };
    } finally {
      provider.destroy?.();
    }
  }

  for (const rpc of rpcList) {
    try {
      const result = await fetchMarkets(rpc);
      if (
        !bestResult ||
        result.markets.length > bestResult.markets.length ||
        (result.markets.length == bestResult.markets.length &&
          result.fallbackCount < bestResult.fallbackCount)
      ) {
        bestResult = result;
      }
      if (
        result.markets.length >= result.reserveCount &&
        result.fallbackCount == 0
      ) {
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!bestResult) {
    throw new Error(
      lastError?.shortMessage ||
        lastError?.message ||
        `${chain} Aave markets failed`,
    );
  }

  return {
    ok: true,
    chain,
    pool,
    rpc: bestResult.rpc,
    markets: bestResult.markets.sort((a, b) =>
      a.underlyingCoin.localeCompare(b.underlyingCoin),
    ),
  };
}

function getAavePool(chain = "", lendCoin = "") {
  const coinPool = coinM?.[chain]?.[lendCoin]?.aavePool ||
    coinM?.[chain]?.[lendCoin]?.pool;
  const pool = ethers.isAddress(coinPool || "")
    ? coinPool
    : aaveV3PoolM[coinPool] || aaveV3PoolM[chain];
  if (!pool) throw new Error(`Aave not configured: ${coinPool || chain}`);

  return ethers.getAddress(pool);
}

function getAaveAmount({
  chain = "",
  coin = "",
  amount = "",
  decimals,
} = {}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

async function assertAaveMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  lendAddress = "",
} = {}) {
  const underlying = ethers.isAddress(underlyingAddress)
    ? ethers.getAddress(underlyingAddress)
    : getEvmTokenAddress(chain, underlyingCoin, "Aave underlying");
  const aTokenAddress = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress)
    : getEvmTokenAddress(chain, lendCoin, "Aave token");
  const aToken = new ethers.Contract(aTokenAddress, aTokenAbi, provider);
  const actualUnderlying = ethers.getAddress(await aToken.UNDERLYING_ASSET_ADDRESS());

  if (actualUnderlying != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  return { underlying, aTokenAddress };
}

export async function getAaveMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = 18,
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");
  if (!ethers.isAddress(underlyingAddress)) throw new Error("underlying address invalid");
  if (!ethers.isAddress(lendAddress)) throw new Error("Aave token address invalid");

  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const owner = ethers.getAddress(walletAddress);
    const [underlyingRaw, lendRaw] = await Promise.all([
      new ethers.Contract(underlyingAddress, erc20Abi, provider).balanceOf(owner),
      new ethers.Contract(lendAddress, erc20Abi, provider).balanceOf(owner),
    ]);

    return {
      ok: true,
      chain,
      walletAddress: owner,
      underlying: {
        address: ethers.getAddress(underlyingAddress),
        raw: underlyingRaw.toString(),
        balance: ethers.formatUnits(underlyingRaw, underlyingDecimals),
        decimals: underlyingDecimals,
      },
      lend: {
        address: ethers.getAddress(lendAddress),
        raw: lendRaw.toString(),
        balance: ethers.formatUnits(lendRaw, lendDecimals),
        decimals: lendDecimals,
      },
    };
  } finally {
    provider.destroy?.();
  }
}

function getVenusToken(chain = "", lendCoin = "") {
  return getEvmTokenAddress(chain, lendCoin, "Venus token");
}

function getSavedVenusMarkets(chain = "") {
  return Object.entries(coinM?.[chain] || {}).filter(([coin, coinE]) => {
    const text = `${coin} ${coinE?.name || ""}`.toLowerCase();
    return (
      coinE?.type == "lending" &&
      ethers.isAddress(coinE?.address || "") &&
      (/^v[A-Z]/.test(coin) || (text.includes("venus") && !/^f[A-Z]/.test(coin)))
    );
  });
}

export async function getVenusAllMarkets({ chain = "" } = {}) {
  if (chain == "Solana") return { ok: true, chain, markets: [] };

  const rpcList = getUsableChainRpcs(chain);
  if (!rpcList.length) throw new Error(`rpc not configured: ${chain}`);

  const savedMarkets = getSavedVenusMarkets(chain);
  if (!savedMarkets.length) {
    return { ok: true, chain, markets: [] };
  }

  let bestResult = null;
  let lastError = null;

  async function fetchMarkets(rpc) {
    const provider = new ethers.JsonRpcProvider(rpc);

    try {
      const comptrollers = [
        ...new Set(
          (
            await Promise.all(
              savedMarkets.map(async ([, coinE]) =>
                withTimeout(
                  new ethers.Contract(
                    coinE.address,
                    venusTokenAbi,
                    provider,
                  ).comptroller(),
                  venusTokenMetaTimeoutMs,
                  `${chain} Venus comptroller timeout`,
                ).catch(() => ""),
              ),
            )
          )
            .filter((address) => ethers.isAddress(address))
            .map((address) => ethers.getAddress(address)),
        ),
      ];
      const marketAddresses = [
        ...new Set(
          (
            await Promise.all(
              comptrollers.map(async (comptroller) =>
                withTimeout(
                  new ethers.Contract(
                    comptroller,
                    venusComptrollerAbi,
                    provider,
                  ).getAllMarkets(),
                  venusMarketFetchTimeoutMs,
                  `${chain} Venus markets timeout`,
                ).catch(() => []),
              ),
            )
          )
            .flat()
            .filter((address) => ethers.isAddress(address))
            .map((address) => ethers.getAddress(address)),
        ),
      ];
      const markets = (
        await mapWithConcurrency(
          marketAddresses,
          venusMarketFetchConcurrency,
          async (lendAddress) => {
            const vToken = new ethers.Contract(lendAddress, venusTokenAbi, provider);
            const underlyingAddress = await withTimeout(
              vToken.underlying(),
              venusTokenMetaTimeoutMs,
              `${chain} Venus underlying timeout`,
            ).catch(() => "");
            if (!ethers.isAddress(underlyingAddress)) return null;

            const [exchangeRateRaw, supplyApr] = await Promise.all([
              withTimeout(
                vToken.exchangeRateStored(),
                venusTokenMetaTimeoutMs,
                `${chain} Venus exchange rate timeout`,
              ).catch(() => 0n),
              getVenusSupplyApr(vToken, chain),
            ]);
            const [underlyingMeta, lendMeta] = await Promise.all([
              getTokenMeta(provider, underlyingAddress, chain),
              getTokenMeta(provider, lendAddress, chain),
            ]);
            const addedUnderlying = getCoinByAddress(chain, underlyingMeta.address);
            const addedLend = getCoinByAddress(chain, lendMeta.address);
            const underlyingPerReceipt = getVenusExchangeRate({
              rateRaw: BigInt(exchangeRateRaw),
              underlyingDecimals: underlyingMeta.decimals,
              receiptDecimals: lendMeta.decimals,
            });
            const metaFallback = !!underlyingMeta.fallback || !!lendMeta.fallback;

            return {
              value: `${underlyingMeta.symbol}:${lendMeta.symbol}:${lendMeta.address}`,
              chain,
              underlyingCoin: addedUnderlying?.[0] || underlyingMeta.symbol,
              underlyingName: underlyingMeta.name || underlyingMeta.symbol,
              underlyingAddress: underlyingMeta.address,
              underlyingDecimals: underlyingMeta.decimals,
              lendCoin: addedLend?.[0] || lendMeta.symbol,
              lendName: lendMeta.name || lendMeta.symbol,
              lendAddress: lendMeta.address,
              lendDecimals: lendMeta.decimals,
              exchangeRateRaw: BigInt(exchangeRateRaw).toString(),
              underlyingPerReceipt,
              receiptPerUnderlying: underlyingPerReceipt
                ? 1 / underlyingPerReceipt
                : 0,
              addedUnderlying: !!addedUnderlying,
              addedLend: !!addedLend,
              supplyApr,
              metaFallback,
            };
          },
        )
      ).filter(Boolean);

      return {
        rpc,
        marketCount: marketAddresses.length,
        fallbackCount: markets.filter((entry) => entry.metaFallback).length,
        markets,
      };
    } finally {
      provider.destroy?.();
    }
  }

  for (const rpc of rpcList) {
    try {
      const result = await fetchMarkets(rpc);
      if (
        !bestResult ||
        result.markets.length > bestResult.markets.length ||
        (result.markets.length == bestResult.markets.length &&
          result.fallbackCount < bestResult.fallbackCount)
      ) {
        bestResult = result;
      }
      if (
        result.markets.length >=
          Math.max(1, Math.floor(result.marketCount * venusGoodMarketRatio)) &&
        result.fallbackCount == 0
      ) {
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!bestResult) {
    throw new Error(
      lastError?.shortMessage ||
        lastError?.message ||
        `${chain} Venus markets failed`,
    );
  }

  return {
    ok: true,
    chain,
    rpc: bestResult.rpc,
    markets: bestResult.markets.sort((a, b) =>
      a.underlyingCoin.localeCompare(b.underlyingCoin),
    ),
  };
}

export async function getVenusMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = 8,
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");
  if (!ethers.isAddress(underlyingAddress)) throw new Error("underlying address invalid");
  if (!ethers.isAddress(lendAddress)) throw new Error("Venus token address invalid");

  const rpc = getUsableChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const owner = ethers.getAddress(walletAddress);
    const [underlyingRaw, lendRaw] = await Promise.all([
      new ethers.Contract(underlyingAddress, erc20Abi, provider).balanceOf(owner),
      new ethers.Contract(lendAddress, erc20Abi, provider).balanceOf(owner),
    ]);

    return {
      ok: true,
      chain,
      walletAddress: owner,
      underlying: {
        address: ethers.getAddress(underlyingAddress),
        raw: underlyingRaw.toString(),
        balance: ethers.formatUnits(underlyingRaw, underlyingDecimals),
        decimals: underlyingDecimals,
      },
      lend: {
        address: ethers.getAddress(lendAddress),
        raw: lendRaw.toString(),
        balance: ethers.formatUnits(lendRaw, lendDecimals),
        decimals: lendDecimals,
      },
    };
  } finally {
    provider.destroy?.();
  }
}

function getVenusAmount({
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  underlyingDecimals,
  lendDecimals,
} = {}) {
  const coin = action == "redeem" ? lendCoin : underlyingCoin;
  const decimals =
    action == "redeem"
      ? lendDecimals
      : underlyingDecimals;
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    Number.isInteger(decimals) ? decimals : getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

function getVenusExchangeRate({
  rateRaw = 0n,
  underlyingDecimals = 18,
  receiptDecimals = 8,
} = {}) {
  const scaleDecimals = 18 + underlyingDecimals - receiptDecimals;
  if (scaleDecimals < 0) return Number(rateRaw) * 10 ** Math.abs(scaleDecimals);

  return Number(ethers.formatUnits(rateRaw, scaleDecimals));
}

async function assertVenusMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
} = {}) {
  const underlying = ethers.isAddress(underlyingAddress)
    ? ethers.getAddress(underlyingAddress)
    : getEvmTokenAddress(chain, underlyingCoin, "Venus underlying");
  const vTokenAddress = ethers.isAddress(lendAddress)
    ? ethers.getAddress(lendAddress)
    : getVenusToken(chain, lendCoin);
  const vToken = new ethers.Contract(vTokenAddress, venusTokenAbi, provider);
  const [actualUnderlying, exchangeRateRaw] = await Promise.all([
    vToken.underlying(),
    vToken.exchangeRateStored(),
  ]);

  if (ethers.getAddress(actualUnderlying) != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  const underlyingPerReceipt = getVenusExchangeRate({
    rateRaw: BigInt(exchangeRateRaw),
    underlyingDecimals: Number.isInteger(underlyingDecimals)
      ? underlyingDecimals
      : getCoinDecimals(chain, underlyingCoin),
    receiptDecimals: Number.isInteger(lendDecimals)
      ? lendDecimals
      : getCoinDecimals(chain, lendCoin),
  });

  return {
    underlying,
    vTokenAddress,
    exchangeRateRaw: BigInt(exchangeRateRaw),
    underlyingPerReceipt,
    receiptPerUnderlying: underlyingPerReceipt ? 1 / underlyingPerReceipt : 0,
  };
}

export async function getAaveLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({
    chain,
    coin: underlyingCoin,
    amount,
    decimals: underlyingDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
    });
    const allowance = action == "redeem"
      ? amountIn
      : BigInt(
          await new ethers.Contract(underlying, erc20Abi, provider).allowance(
            walletAddress,
            pool,
          ),
        );

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      approvalNeeded: action != "redeem" && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      pool,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildAaveLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({
    chain,
    coin: underlyingCoin,
    amount,
    decimals: underlyingDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
    });
    const txs = [];

    if (action == "redeem") {
      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "redeem",
          txData: {
            to: pool,
            data: aavePoolInterface.encodeFunctionData("withdraw", [
              underlying,
              amountIn,
              ethers.getAddress(walletAddress),
            ]),
            value: "0",
          },
        }),
      );
    } else {
      const allowance = BigInt(
        await new ethers.Contract(underlying, erc20Abi, provider).allowance(
          walletAddress,
          pool,
        ),
      );
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        defaultAmount: amountIn,
        decimals: underlyingDecimals,
      });

      if (allowance < amountIn && approveAmount != null) {
        if (allowance > 0n) {
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: underlying,
              spender: pool,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: underlying,
            spender: pool,
            amount: approveAmount,
          }),
        );
      }

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "lend",
          txData: {
            to: pool,
            data: aavePoolInterface.encodeFunctionData("supply", [
              underlying,
              amountIn,
              ethers.getAddress(walletAddress),
              0,
            ]),
            value: "0",
          },
        }),
      );
    }

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      pool,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeAaveLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({
    chain,
    coin: underlyingCoin,
    amount,
    decimals: underlyingDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      lendAddress,
    });
    const poolContract = new ethers.Contract(pool, aavePoolAbi, wallet);
    const txs = [];

    if (action == "redeem") {
      const redeemTx = await poolContract.withdraw(
        underlying,
        amountIn,
        wallet.address,
      );
      const receipt = await redeemTx.wait();
      txs.push({
        chain,
        type: "redeem",
        hash: redeemTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else {
      const token = new ethers.Contract(underlying, erc20Abi, wallet);
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        decimals: underlyingDecimals,
      });
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: pool,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );

      const lendTx = await poolContract.supply(
        underlying,
        amountIn,
        wallet.address,
        0,
      );
      const receipt = await lendTx.wait();
      txs.push({
        chain,
        type: "lend",
        hash: lendTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    }

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      pool,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function getVenusLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
    });
    const allowance =
      action == "redeem"
        ? amountIn
        : BigInt(
            await new ethers.Contract(
              market.underlying,
              erc20Abi,
              provider,
            ).allowance(walletAddress, market.vTokenAddress),
          );

    return {
      ok: true,
      defi: "Venus",
      chain,
      action,
      approvalNeeded: action != "redeem" && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      underlyingPerReceipt: market.underlyingPerReceipt,
      receiptPerUnderlying: market.receiptPerUnderlying,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildVenusLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
    });
    const txs = [];

    if (action == "redeem") {
      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "redeem",
          txData: {
            to: market.vTokenAddress,
            data: venusTokenInterface.encodeFunctionData("redeem", [amountIn]),
            value: "0",
          },
        }),
      );
    } else {
      const allowance = BigInt(
        await new ethers.Contract(
          market.underlying,
          erc20Abi,
          provider,
        ).allowance(walletAddress, market.vTokenAddress),
      );
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        defaultAmount: amountIn,
        decimals: underlyingDecimals,
      });

      if (allowance < amountIn && approveAmount != null) {
        if (allowance > 0n) {
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: market.underlying,
              spender: market.vTokenAddress,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: market.underlying,
            spender: market.vTokenAddress,
            amount: approveAmount,
          }),
        );
      }

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "lend",
          txData: {
            to: market.vTokenAddress,
            data: venusTokenInterface.encodeFunctionData("mint", [amountIn]),
            value: "0",
          },
        }),
      );
    }

    return {
      ok: true,
      defi: "Venus",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeVenusLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
      underlyingAddress,
      underlyingDecimals,
      lendAddress,
      lendDecimals,
    });
    const vToken = new ethers.Contract(market.vTokenAddress, venusTokenAbi, wallet);
    const txs = [];

    if (action == "redeem") {
      const redeemTx = await vToken.redeem(amountIn);
      const receipt = await redeemTx.wait();
      txs.push({
        chain,
        type: "redeem",
        hash: redeemTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else {
      const token = new ethers.Contract(market.underlying, erc20Abi, wallet);
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        decimals: underlyingDecimals,
      });
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: market.vTokenAddress,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );

      const lendTx = await vToken.mint(amountIn);
      const receipt = await lendTx.wait();
      txs.push({
        chain,
        type: "lend",
        hash: lendTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    }

    return {
      ok: true,
      defi: "Venus",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

async function getJupiterLocalPdaMarkets(chain = "Solana") {
  const candidates = Object.entries(coinM?.Solana || {}).filter(
    ([coin, coinE]) =>
      coinE?.address &&
      !coinE.native &&
      !isJupiterLendCoin(coin, coinE) &&
      coinE.type != "lending" &&
      coinE.type != "yield",
  );
  const candidateMarkets = [];

  for (const [underlyingCoin, underlyingE] of candidates) {
    let underlyingMint;

    try {
      underlyingMint = getSolanaPublicKey(
        underlyingE.address,
        "Jupiter underlying",
      );
    } catch {
      continue;
    }

    for (const market of Object.keys(jupiterLendProgramM)) {
      const lendMint = getJupiterFTokenMint(underlyingMint, market);
      const lending = getJupiterLending(underlyingMint, lendMint, market);

      candidateMarkets.push({
        market,
        underlyingCoin,
        underlyingE,
        underlyingMint,
        lendMint,
        lending,
      });
    }
  }

  const accounts = await getSolanaMultipleAccountsInfoFast(
    candidateMarkets.map((entry) => entry.lending),
  );

  const markets = candidateMarkets
    .map((entry, index) => {
      const decoded = decodeJupiterLendingAccount(accounts[index]?.data);
      if (!decoded) return null;

      const [configuredLendCoin, configuredLendE] =
        getSolanaCoinByAddress(decoded.lendAddress) || [];
      const lendCoin =
        configuredLendCoin ||
        getJupiterDiscoveredCoin({
          underlyingCoin: entry.underlyingCoin,
          market: entry.market,
        });
      const lendName =
        configuredLendE?.name ||
        `Jupiter Lend ${entry.underlyingE.name || entry.underlyingCoin}`;

      return {
        value: `${entry.market}:${entry.underlyingCoin}:${lendCoin}:${decoded.lendAddress}`,
        chain,
        market: entry.market,
        underlyingCoin: entry.underlyingCoin,
        underlyingName: entry.underlyingE.name || entry.underlyingCoin,
        underlyingAddress: decoded.underlyingAddress,
        underlyingDecimals: entry.underlyingE.decimals,
        lendCoin,
        lendName,
        lendAddress: decoded.lendAddress,
        lendDecimals: decoded.lendDecimals ?? entry.underlyingE.decimals,
        addedUnderlying: true,
        addedLend: Boolean(configuredLendCoin),
        supplyApr: 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.underlyingCoin.localeCompare(b.underlyingCoin));

  return markets;
}

function mergeJupiterMarkets(...groups) {
  const marketM = new Map();

  for (const entry of groups.flat()) {
    if (!entry) continue;

    const key = String(entry.lendAddress || entry.value || "").toLowerCase();
    const prev = marketM.get(key);

    marketM.set(key, {
      ...prev,
      ...entry,
      addedUnderlying: Boolean(prev?.addedUnderlying || entry.addedUnderlying),
      addedLend: Boolean(prev?.addedLend || entry.addedLend),
      supplyApr: Number(entry.supplyApr || prev?.supplyApr || 0),
    });
  }

  return [...marketM.values()].sort(
    (a, b) =>
      a.underlyingCoin.localeCompare(b.underlyingCoin) ||
      a.lendCoin.localeCompare(b.lendCoin),
  );
}

export async function getJupiterAllMarkets({ chain = "" } = {}) {
  if (chain != "Solana") return { ok: true, chain, markets: [] };

  const apiMarkets = await getJupiterApiMarkets(chain).catch(() => []);
  const localMarkets = await getJupiterLocalPdaMarkets(chain).catch(() => []);
  const markets = mergeJupiterMarkets(apiMarkets, localMarkets);

  return {
    ok: true,
    chain,
    markets,
  };
}

export async function getJupiterMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 6,
  lendAddress = "",
  lendDecimals = 6,
} = {}) {
  if (chain != "Solana") throw new Error("Jupiter Lend is Solana-only here");
  if (!walletAddress) throw new Error("Solana wallet address required");

  const connection = getSolanaConnection();
  const owner = getSolanaPublicKey(walletAddress, "Solana wallet address");
  const underlyingMint = getSolanaPublicKey(
    underlyingAddress,
    "Jupiter underlying",
  );
  const fTokenMint = getSolanaPublicKey(lendAddress, "Jupiter lend token");
  const [underlying, lend] = await Promise.all([
    getSolanaMintBalance({
      connection,
      owner,
      mint: underlyingMint,
      decimals: underlyingDecimals,
    }),
    getSolanaMintBalance({
      connection,
      owner,
      mint: fTokenMint,
      decimals: lendDecimals,
    }),
  ]);

  return {
    ok: true,
    chain,
    walletAddress: owner.toBase58(),
    underlying,
    lend,
  };
}

export async function getJupiterLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  marketName = "",
  amount = "",
} = {}) {
  if (chain != "Solana") throw new Error("Jupiter Lend is Solana-only here");
  if (!walletAddress) throw new Error("Solana wallet address required");

  const amountIn = getJupiterAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const market = getJupiterMarket({
    chain,
    underlyingCoin,
    lendCoin,
    underlyingAddress,
    lendAddress,
    marketName,
  });

  return {
    ok: true,
    defi: "Jupiter",
    chain,
    action,
    approvalNeeded: false,
    allowance: amountIn.toString(),
    amountIn: amountIn.toString(),
    market: market.market,
    receiptPerUnderlying: 1,
    underlyingPerReceipt: 1,
  };
}

export async function buildJupiterLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  marketName = "",
  amount = "",
} = {}) {
  if (chain != "Solana") throw new Error("Jupiter Lend is Solana-only here");
  if (!walletAddress) throw new Error("Solana wallet address required");

  const amountIn = getJupiterAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
    underlyingDecimals,
    lendDecimals,
  });
  const market = getJupiterMarket({
    chain,
    underlyingCoin,
    lendCoin,
    underlyingAddress,
    lendAddress,
    marketName,
  });
  const { instructions } = await getJupiterInstruction({
    walletAddress,
    action,
    underlyingMint: market.underlying,
    fTokenMint: market.fTokenMint,
    amountIn,
    market: market.market,
  });
  const tx = await getSolanaInstructionTx({
    user: walletAddress,
    instructions,
    type: action,
  });

  return {
    ok: true,
    defi: "Jupiter",
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amountIn: amountIn.toString(),
    market: market.market,
    txs: [tx],
  };
}

export async function executeJupiterLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  underlyingDecimals,
  lendAddress = "",
  lendDecimals,
  marketName = "",
  amount = "",
} = {}) {
  if (chain != "Solana") throw new Error("Jupiter Lend is Solana-only here");
  if (!walletAddress) throw new Error("Solana wallet address required");

  const keypair = getSolanaKeypair(walletName);
  const built = await buildJupiterLendTxs({
    walletAddress,
    chain,
    action,
    underlyingCoin,
    lendCoin,
    underlyingAddress,
    underlyingDecimals,
    lendAddress,
    lendDecimals,
    marketName,
    amount,
  });
  const txs = [];

  for (const tx of built.txs || []) {
    txs.push(
      await executeSolanaTx({
        keypair,
        expectedAddress: walletAddress,
        tx,
      }),
    );
  }

  return {
    ...built,
    txs,
  };
}
