"use server";

import { ethers } from "ethers";
import {
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
import {
  executeSolanaTx,
  getCoinDecimals,
  getSolanaConnection,
  getSolanaInstructionTx,
  getSolanaKeypair,
  getSolanaPublicKey,
} from "../../sharedServer";
import {
  getSolanaMultipleAccountsInfoFast,
  withTimeout,
} from "../shared";

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

function isJupiterLendCoin(coin = "", coinE = {}) {
  const text = `${coin} ${coinE?.name || ""}`.toLowerCase();

  return (
    coinE?.address &&
    (/^jl[A-Z0-9]/.test(coin) ||
      coin == "JUICED" ||
      text.includes("jupusd")) &&
    (coinE.type == "lend" ||
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

async function getJupiterLocalPdaMarkets(chain = "Solana") {
  const candidates = Object.entries(coinM?.Solana || {}).filter(
    ([coin, coinE]) =>
      coinE?.address &&
      !coinE.native &&
      !isJupiterLendCoin(coin, coinE) &&
      coinE.type != "lend" &&
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
