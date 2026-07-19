"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import { chainIds } from "@/data/basic";
import {
  clearJustLendMarketDataCache,
  getJustLendMarketData,
} from "@/fn/justLendMarketData";
import {
  executeTronTx,
  getApprovalAmount,
  getTronAddress,
  getTronPrivateKey,
  runTronRpc,
} from "../../sharedServer";

const justLendNativeTrx = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
const justLendReceiptDecimals = 8;
const justLendFeeLimit = 1_000_000_000;
const justLendTokenAbi = [
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];
const justLendReceiptAbi = [
  ...justLendTokenAbi.slice(0, 1),
  {
    constant: true,
    inputs: [],
    name: "exchangeRateStored",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

function sameTronAddress(left = "", right = "") {
  try {
    return getTronAddress(left) == getTronAddress(right);
  } catch {
    return false;
  }
}

function getLocalTronCoin(address = "") {
  if (sameTronAddress(address, justLendNativeTrx)) {
    return ["TRX", coinM?.Tron?.TRX || {}];
  }

  return (
    Object.entries(coinM?.Tron || {}).find(([, coinE]) =>
      sameTronAddress(coinE?.address, address),
    ) || null
  );
}

function getJustLendTriggerError(
  result = {},
  fallback = "JustLend transaction unavailable",
) {
  const message = result?.result?.message;
  if (!message) return fallback;

  try {
    return Buffer.from(message, "base64").toString("utf8") || fallback;
  } catch {
    return String(message) || fallback;
  }
}

function getJustLendExchangeRate({
  rateRaw = 0n,
  underlyingDecimals = 18,
  lendDecimals = justLendReceiptDecimals,
} = {}) {
  const scaleDecimals = 18 + underlyingDecimals - lendDecimals;
  if (scaleDecimals < 0) {
    return Number(rateRaw) * 10 ** Math.abs(scaleDecimals);
  }

  return Number(ethers.formatUnits(rateRaw, scaleDecimals));
}

function mapJustLendMarket(entry = {}) {
  const lendCoin = String(entry.symbol || "").trim();
  if (!lendCoin) return null;

  const lendAddress = getTronAddress(
    entry.address,
    `${lendCoin} JustLend market`,
  );
  const native = sameTronAddress(entry.underlyingAddress, justLendNativeTrx);
  const underlyingAddress = native
    ? justLendNativeTrx
    : getTronAddress(
        entry.underlyingAddress,
        `${lendCoin} underlying token`,
      );
  const localUnderlying = getLocalTronCoin(underlyingAddress);
  const localLend = getLocalTronCoin(lendAddress);
  const underlyingCoin =
    localUnderlying?.[0] || String(entry.underlyingSymbol || "").trim();
  const finalLendCoin = localLend?.[0] || lendCoin;
  const underlyingDecimals = Number(entry.underlyingDecimal);
  const underlyingPerReceipt = Number(entry.exchangeRate || 0);
  const supplyRate = Number(entry.supplyRate || 0);

  if (
    !underlyingCoin ||
    !Number.isInteger(underlyingDecimals) ||
    underlyingDecimals < 0 ||
    underlyingDecimals > 255 ||
    !Number.isFinite(underlyingPerReceipt) ||
    underlyingPerReceipt <= 0
  ) {
    return null;
  }

  return {
    value: `${underlyingCoin}:${finalLendCoin}:${lendAddress}`,
    chain: "Tron",
    market: lendCoin,
    underlyingCoin,
    underlyingName: localUnderlying?.[1]?.name || underlyingCoin,
    underlyingAddress,
    underlyingDecimals,
    underlyingNative: native,
    underlyingPriceInTrx: Number(entry.underlyingPriceInTrx || 0),
    lendCoin: finalLendCoin,
    lendName: localLend?.[1]?.name || `JustLend ${lendCoin}`,
    lendAddress,
    lendDecimals: justLendReceiptDecimals,
    exchangeRate: String(entry.exchangeRate || ""),
    underlyingPerReceipt,
    receiptPerUnderlying: 1 / underlyingPerReceipt,
    addedUnderlying: !!localUnderlying,
    addedLend: !!localLend,
    supplyApr: Number.isFinite(supplyRate) ? supplyRate * 100 : 0,
  };
}

async function resolveJustLendMarket({
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  underlyingAddress = "",
  lendAddress = "",
} = {}) {
  if (chain != "Tron") throw new Error(`JustLend chain unsupported: ${chain}`);

  const res = await getJustLendAllMarkets({ chain });
  const markets = Array.isArray(res?.markets) ? res.markets : [];
  const market =
    markets.find(
      (entry) =>
        lendAddress && sameTronAddress(entry.lendAddress, lendAddress),
    ) ||
    markets.find(
      (entry) =>
        entry.lendCoin == lendCoin &&
        (!underlyingCoin || entry.underlyingCoin == underlyingCoin),
    );

  if (!market) {
    throw new Error(
      `Tron JustLend market not found: ${underlyingCoin}-${lendCoin}`,
    );
  }
  if (
    underlyingAddress &&
    !sameTronAddress(market.underlyingAddress, underlyingAddress)
  ) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  return market;
}

function getJustLendAmount({
  action = "lend",
  amount = "",
  underlyingDecimals = 18,
  lendDecimals = justLendReceiptDecimals,
} = {}) {
  if (action != "lend" && action != "redeem") {
    throw new Error(`JustLend action unsupported: ${action}`);
  }
  const decimals = action == "redeem" ? lendDecimals : underlyingDecimals;
  const amountIn = ethers.parseUnits(String(amount || "0"), decimals);
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

async function getJustLendApprovalTx({
  owner = "",
  token = "",
  spender = "",
  amount = 0n,
} = {}) {
  const result = await runTronRpc({
    scope: "JustLend approval build",
    action: (tronWeb) =>
      tronWeb.transactionBuilder.triggerSmartContract(
        getTronAddress(token, "JustLend approval token"),
        "approve(address,uint256)",
        { feeLimit: justLendFeeLimit, callValue: 0 },
        [
          {
            type: "address",
            value: getTronAddress(spender, "JustLend market"),
          },
          { type: "uint256", value: amount.toString() },
        ],
        getTronAddress(owner, "JustLend sender"),
      ),
  });
  if (!result?.result?.result || !result?.transaction) {
    throw new Error(
      getJustLendTriggerError(result, "JustLend approval unavailable"),
    );
  }

  return {
    chain: "Tron",
    chainId: chainIds.Tron,
    type: "approve",
    transaction: result.transaction,
    format: "tron:transaction",
    refreshBlockRef: true,
  };
}

async function getJustLendActionTx({
  owner = "",
  action = "lend",
  market = {},
  amountIn = 0n,
} = {}) {
  if (
    action == "lend" &&
    market.underlyingNative &&
    amountIn > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error("JustLend TRX amount exceeds the transaction builder limit");
  }

  const selector =
    action == "redeem"
      ? "redeem(uint256)"
      : market.underlyingNative
        ? "mint()"
        : "mint(uint256)";
  const parameters =
    action == "redeem" || !market.underlyingNative
      ? [{ type: "uint256", value: amountIn.toString() }]
      : [];
  const result = await runTronRpc({
    scope: `JustLend ${action} build`,
    action: (tronWeb) =>
      tronWeb.transactionBuilder.triggerSmartContract(
        getTronAddress(market.lendAddress, "JustLend market"),
        selector,
        {
          feeLimit: justLendFeeLimit,
          callValue:
            action == "lend" && market.underlyingNative
              ? Number(amountIn)
              : 0,
        },
        parameters,
        getTronAddress(owner, "JustLend sender"),
      ),
  });
  if (!result?.result?.result || !result?.transaction) {
    throw new Error(
      getJustLendTriggerError(
        result,
        `JustLend ${action} transaction unavailable`,
      ),
    );
  }

  return {
    chain: "Tron",
    chainId: chainIds.Tron,
    type: action,
    transaction: result.transaction,
    format: "tron:transaction",
    refreshBlockRef: true,
  };
}

export async function clearJustLendRuntimeCache() {
  clearJustLendMarketDataCache();

  return { ok: true };
}

export async function getJustLendAllMarkets({
  chain = "",
  refresh = false,
} = {}) {
  if (chain != "Tron") return { ok: true, chain, markets: [] };

  const marketData = await getJustLendMarketData({ refresh });
  const markets = marketData.entries
    .map((entry) => {
      try {
        return mapJustLendMarket(entry);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.underlyingCoin.localeCompare(right.underlyingCoin),
    );
  if (!markets.length) throw new Error("JustLend returned no active markets");

  return {
    ok: true,
    chain,
    markets,
    cache: marketData.cache,
  };
}

export async function getJustLendMarketBalance({
  walletAddress = "",
  chain = "",
  underlyingAddress = "",
  underlyingDecimals = 18,
  lendAddress = "",
  lendDecimals = justLendReceiptDecimals,
} = {}) {
  if (chain != "Tron") throw new Error(`JustLend chain unsupported: ${chain}`);

  const owner = getTronAddress(walletAddress, "JustLend wallet");
  const marketAddress = getTronAddress(lendAddress, "JustLend market");
  const native = sameTronAddress(underlyingAddress, justLendNativeTrx);
  const tokenAddress = native
    ? justLendNativeTrx
    : getTronAddress(underlyingAddress, "JustLend underlying token");
  const balances = await runTronRpc({
    scope: "JustLend balance",
    action: async (tronWeb) => {
      tronWeb.setAddress(owner);
      const receipt = tronWeb.contract(justLendReceiptAbi, marketAddress);
      const [underlyingRaw, lendRaw] = await Promise.all([
        native
          ? tronWeb.trx.getBalance(owner)
          : tronWeb
              .contract(justLendTokenAbi, tokenAddress)
              .balanceOf(owner)
              .call({ from: owner }),
        receipt.balanceOf(owner).call({ from: owner }),
      ]);

      return {
        underlyingRaw: BigInt(String(underlyingRaw)),
        lendRaw: BigInt(String(lendRaw)),
      };
    },
  });

  return {
    ok: true,
    chain,
    walletAddress: owner,
    underlying: {
      address: tokenAddress,
      raw: balances.underlyingRaw.toString(),
      balance: ethers.formatUnits(
        balances.underlyingRaw,
        underlyingDecimals,
      ),
      decimals: underlyingDecimals,
    },
    lend: {
      address: marketAddress,
      raw: balances.lendRaw.toString(),
      balance: ethers.formatUnits(balances.lendRaw, lendDecimals),
      decimals: lendDecimals,
    },
  };
}

export async function getJustLendPreview({
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
  const owner = getTronAddress(walletAddress, "JustLend wallet");
  const market = await resolveJustLendMarket({
    chain,
    underlyingCoin,
    lendCoin,
    underlyingAddress,
    lendAddress,
  });
  const amountIn = getJustLendAmount({
    action,
    amount,
    underlyingDecimals: market.underlyingDecimals,
    lendDecimals: market.lendDecimals,
  });
  const state = await runTronRpc({
    scope: "JustLend preview",
    action: async (tronWeb) => {
      tronWeb.setAddress(owner);
      const receipt = tronWeb.contract(
        justLendReceiptAbi,
        market.lendAddress,
      );
      const [exchangeRateRaw, allowance] = await Promise.all([
        receipt.exchangeRateStored().call({ from: owner }),
        action == "redeem" || market.underlyingNative
          ? amountIn
          : tronWeb
              .contract(justLendTokenAbi, market.underlyingAddress)
              .allowance(owner, market.lendAddress)
              .call({ from: owner }),
      ]);

      return {
        exchangeRateRaw: BigInt(String(exchangeRateRaw)),
        allowance: BigInt(String(allowance)),
      };
    },
  });
  const underlyingPerReceipt = getJustLendExchangeRate({
    rateRaw: state.exchangeRateRaw,
    underlyingDecimals: market.underlyingDecimals,
    lendDecimals: market.lendDecimals,
  });

  return {
    ok: true,
    defi: "JustLend",
    chain,
    action,
    approvalNeeded:
      action != "redeem" &&
      !market.underlyingNative &&
      state.allowance < amountIn,
    allowance: state.allowance.toString(),
    amountIn: amountIn.toString(),
    market: market.lendAddress,
    exchangeRateRaw: state.exchangeRateRaw.toString(),
    underlyingPerReceipt,
    receiptPerUnderlying: underlyingPerReceipt
      ? 1 / underlyingPerReceipt
      : 0,
  };
}

export async function buildJustLendTxs({
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
  const owner = getTronAddress(walletAddress, "JustLend wallet");
  const market = await resolveJustLendMarket({
    chain,
    underlyingCoin,
    lendCoin,
    underlyingAddress,
    lendAddress,
  });
  const amountIn = getJustLendAmount({
    action,
    amount,
    underlyingDecimals: market.underlyingDecimals,
    lendDecimals: market.lendDecimals,
  });
  let allowance = amountIn;
  if (action != "redeem" && !market.underlyingNative) {
    allowance = await runTronRpc({
      scope: "JustLend allowance",
      action: async (tronWeb) => {
        tronWeb.setAddress(owner);
        const token = tronWeb.contract(
          justLendTokenAbi,
          market.underlyingAddress,
        );
        return BigInt(
          String(
            await token
              .allowance(owner, market.lendAddress)
              .call({ from: owner }),
          ),
        );
      },
    });
  }

  const txs = [];
  if (action != "redeem" && !market.underlyingNative && allowance < amountIn) {
    const approveAmount = getApprovalAmount({
      chain,
      fromCoin: underlyingCoin,
      approvalAmount,
      amountIn,
      defaultAmount: amountIn,
      decimals: market.underlyingDecimals,
    });
    if (allowance > 0n) {
      txs.push(
        await getJustLendApprovalTx({
          owner,
          token: market.underlyingAddress,
          spender: market.lendAddress,
          amount: 0n,
        }),
      );
    }
    txs.push(
      await getJustLendApprovalTx({
        owner,
        token: market.underlyingAddress,
        spender: market.lendAddress,
        amount: approveAmount,
      }),
    );
  }
  txs.push(
    await getJustLendActionTx({
      owner,
      action,
      market,
      amountIn,
    }),
  );

  return {
    ok: true,
    defi: "JustLend",
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amountIn: amountIn.toString(),
    market: market.lendAddress,
    txs,
  };
}

export async function executeJustLend({
  walletName = "",
  walletAddress = "",
  ...options
} = {}) {
  const privateKey = getTronPrivateKey(walletName);
  if (!privateKey) {
    throw new Error(
      `private key missing: pk_tron_raw_${walletName} or pk_tron_${walletName}`,
    );
  }

  const built = await buildJustLendTxs({
    ...options,
    walletAddress,
  });
  const txs = [];
  const builtTxs = built.txs || [];
  for (const [index, tx] of builtTxs.entries()) {
    txs.push(
      await executeTronTx({
        privateKey,
        expectedAddress: walletAddress,
        tx,
        waitForConfirmation: index < builtTxs.length - 1,
      }),
    );
  }

  return { ...built, txs };
}
