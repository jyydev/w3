"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import {
  approveExactIfNeeded,
  assertWalletMatches,
  erc20Abi,
  executeRawEvmTx,
  executeSolanaTx,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getPrivateKey,
  getSolanaKeypair,
  getSolanaPublicKey,
  getUnsignedTx,
  getWallet,
  nativeEvmAddress,
  relayChainById,
  relayChainIds,
} from "../../sharedServer";
import { getArrayPayload, getTimeoutSignal, parseJson } from "../shared";

const acrossApiBase = "https://app.across.to/api";const nativeSolanaAddress = "11111111111111111111111111111111";
const acrossChainIds = {
  Ethereum: 1,
  Optimism: 10,
  BSC: 56,
  zkSyncEra: 324,
  Base: 8453,
  Arbitrum: 42161,
  Avalanche: 43114,
  Solana: 34268394551451,
};
const acrossChainById = Object.fromEntries(
  Object.entries(acrossChainIds).map(([chain, id]) => [id, chain]),
);
const acrossChainNameM = {
  "arbitrum one": "Arbitrum",
  arbitrum: "Arbitrum",
  avalanche: "Avalanche",
  "avalanche c-chain": "Avalanche",
  base: "Base",
  bnb: "BSC",
  "bnb smart chain": "BSC",
  bsc: "BSC",
  ethereum: "Ethereum",
  optimism: "Optimism",
  "op mainnet": "Optimism",
  solana: "Solana",
  zksync: "zkSyncEra",
  "zksync era": "zkSyncEra",
};

function getAcrossToken(chain = "", coin = "") {
  const coinE = coinM?.[chain]?.[coin];
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (chain == "Solana" && coinE.native) return nativeSolanaAddress;
  if (coinE.native) return nativeEvmAddress;
  if (chain == "Solana") {
    return getSolanaPublicKey(coinE.address, "Solana token mint").toBase58();
  }
  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`EVM token address missing: ${chain} ${coin}`);
  }

  return ethers.getAddress(coinE.address);
}

function getAcrossHeaders({ required = true } = {}) {
  const apiKey = process.env.ACROSS_API_KEY || process.env.across_api_key;
  if (!apiKey) {
    if (required) throw new Error("Across API key missing: ACROSS_API_KEY");
    return {};
  }

  return { Authorization: `Bearer ${apiKey}` };
}

function getAcrossIntegratorId() {
  return (
    process.env.ACROSS_INTEGRATOR_ID ||
    process.env.across_integrator_id ||
    "0xdead"
  );
}

async function acrossFetch(endpoint, params = {}, options = {}) {
  const url = new URL(`${acrossApiBase}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = getTimeoutSignal(options.timeoutMs || 0);
  try {
    const res = await fetch(url, {
      headers: getAcrossHeaders({
        required: options.requireApiKey !== false,
      }),
      ...(timeout.signal ? { signal: timeout.signal } : {}),
    });
    const text = await res.text();
    const data = parseJson(text);

    if (!res.ok) {
      const message =
        data?.message ||
        data?.error ||
        data?.description ||
        `Across request failed: ${res.status}`;
      throw new Error(message);
    }

    return data;
  } catch (e) {
    if (e?.name == "AbortError") {
      throw new Error(options.timeoutMessage || "Across request timeout");
    }
    throw e;
  } finally {
    timeout.clear?.();
  }
}

function getAcrossLocalChain(entry = {}) {
  const chainId = Number(entry.chainId ?? entry.chainID ?? entry.id);
  if (Number.isFinite(chainId) && acrossChainById[chainId]) {
    return acrossChainById[chainId];
  }

  const name = String(entry.name || entry.chainName || "").trim().toLowerCase();
  return acrossChainNameM[name] || "";
}

function getAcrossChainRows(data = {}) {
  return getArrayPayload(data, ["chains", "data", "result"]);
}

function getAcrossTokenRows(data = {}) {
  const rows = getArrayPayload(data, ["tokens", "data", "result"]);
  if (rows.length) return rows;

  if (!data || typeof data != "object") return [];

  return Object.entries(data).flatMap(([chainId, tokens]) =>
    Array.isArray(tokens)
      ? tokens.map((token) => ({
          ...token,
          chainId: token.chainId ?? chainId,
        }))
      : [],
  );
}

function normalizeAcrossChain(entry = {}) {
  const chainId = Number(entry.chainId ?? entry.chainID ?? entry.id);
  const chain = getAcrossLocalChain(entry);
  const name = String(entry.name || entry.chainName || chain || chainId || "")
    .trim();

  return {
    chain,
    chainId: Number.isFinite(chainId) ? chainId : "",
    name,
    added: !!(chain && coinM?.[chain]),
    explorerUrl: entry.explorerUrl || "",
    logoUrl: entry.logoUrl || "",
    publicRpcUrl: entry.publicRpcUrl || "",
  };
}

function normalizeAcrossToken(entry = {}, chainByIdM = {}) {
  const chainId = Number(entry.chainId ?? entry.chainID ?? entry.id);
  const chain = chainByIdM[chainId] || acrossChainById[chainId] || "";
  const symbol = String(entry.symbol || entry.tokenSymbol || "").trim();
  const coinInfoM = coinM?.[chain] || {};
  const added =
    !!(symbol && coinInfoM[symbol]) ||
    Object.values(coinInfoM).some(
      (coinE) =>
        entry.address &&
        coinE?.address &&
        String(coinE.address).toLowerCase() ==
          String(entry.address).toLowerCase(),
    );

  return {
    chain,
    chainId: Number.isFinite(chainId) ? chainId : "",
    address: entry.address || "",
    symbol,
    name: entry.name || "",
    decimals: Number(entry.decimals),
    priceUsd: Number(entry.priceUsd || 0),
    added,
  };
}

export async function getAcrossSupportedBridge() {
  const chainsData = await acrossFetch("/swap/chains", {}, {
    requireApiKey: false,
    timeoutMs: 10000,
    timeoutMessage: "Across chain discovery timeout",
  });
  let tokensData = {};
  try {
    tokensData = await acrossFetch("/swap/tokens", {}, {
      requireApiKey: false,
      timeoutMs: 8000,
      timeoutMessage: "Across token discovery timeout",
    });
  } catch {
    tokensData = {};
  }
  const chains = getAcrossChainRows(chainsData)
    .map(normalizeAcrossChain)
    .filter((entry) => entry.chainId || entry.name);
  const chainByIdM = Object.fromEntries(
    chains
      .filter((entry) => entry.chainId && entry.chain)
      .map((entry) => [entry.chainId, entry.chain]),
  );
  const tokens = getAcrossTokenRows(tokensData)
    .map((entry) => normalizeAcrossToken(entry, chainByIdM))
    .filter((entry) => entry.chainId || entry.symbol || entry.address);

  return { chains, tokens };
}

function getAcrossAmountIn({ chain, fromCoin, amount }) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, fromCoin),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

function getJupiterAmountIn({ fromCoin, amount }) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals("Solana", fromCoin),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

function getAcrossChainId(chain = "") {
  const chainId = acrossChainIds[chain];
  if (!chainId) throw new Error(`Across chain unsupported: ${chain}`);

  return chainId;
}

function getAcrossAddress(chain = "", address = "", label = "Across address") {
  if (chain == "Solana") {
    return getSolanaPublicKey(address, label).toBase58();
  }
  if (!ethers.isAddress(address)) throw new Error(`${label} must be EVM`);

  return ethers.getAddress(address);
}

function isAcrossSolanaTx(txData = {}) {
  return (
    txData.ecosystem == "svm" ||
    Number(txData.chainId) == acrossChainIds.Solana
  );
}

function getAcrossUnsignedTx({ txData = {}, type = "tx" } = {}) {
  const chainId = Number(txData.chainId);
  const chain = acrossChainById[chainId] || relayChainById[chainId];
  if (!chain) throw new Error(`Across chainId unsupported: ${chainId}`);

  if (isAcrossSolanaTx(txData)) {
    if (!txData.data) throw new Error("Across Solana transaction missing data");

    return {
      chain: "Solana",
      chainId,
      type,
      transaction: txData.data,
      format: "solana:serialized",
    };
  }

  return getUnsignedTx({
    chain,
    chainId,
    type,
    txData,
  });
}

async function executeAcrossTx({
  privateKey = "",
  solanaKeypair = null,
  expectedAddress = "",
  txData = {},
  type = "tx",
} = {}) {
  const tx = getAcrossUnsignedTx({ txData, type });

  if (tx.chain == "Solana") {
    if (!solanaKeypair) throw new Error("Solana private key missing");

    return executeSolanaTx({
      keypair: solanaKeypair,
      expectedAddress,
      tx,
    });
  }

  return executeRawEvmTx({
    privateKey,
    expectedAddress,
    chainId: tx.chainId,
    txData,
    type: tx.type,
  });
}

function getAcrossApprovalInfo(quote = {}) {
  const allowance = quote.checks?.allowance || {};
  const expected = BigInt(allowance.expected || 0);
  const actual = BigInt(allowance.actual || 0);
  const approvalTxns = Array.isArray(quote.approvalTxns)
    ? quote.approvalTxns
    : [];

  return {
    needed: approvalTxns.length > 0 || (expected > 0n && actual < expected),
    token: allowance.token,
    spender: allowance.spender,
    actual,
    expected,
    approvalTxns,
  };
}

async function getAcrossQuote({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
} = {}) {
  if (fromChain == toChain) {
    throw new Error("Across is for cross-chain swaps; choose a different buy chain");
  }

  const depositor = getAcrossAddress(
    fromChain,
    walletAddress,
    "Across depositor",
  );
  const recipientAddress = getAcrossAddress(
    toChain,
    recipient || walletAddress,
    "Across recipient",
  );
  const amountIn = getAcrossAmountIn({ chain: fromChain, fromCoin, amount });

  return {
    amountIn,
    quote: await acrossFetch("/swap/approval", {
      tradeType: "exactInput",
      amount: amountIn.toString(),
      inputToken: getAcrossToken(fromChain, fromCoin),
      outputToken: getAcrossToken(toChain, toCoin),
      originChainId: getAcrossChainId(fromChain),
      destinationChainId: getAcrossChainId(toChain),
      depositor,
      recipient: recipientAddress,
      refundAddress: depositor,
      integratorId: getAcrossIntegratorId(),
      slippage: "auto",
    }),
  };
}

export async function getAcrossSwapPreview({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
} = {}) {
  const { amountIn, quote } = await getAcrossQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
    recipient,
  });
  const approval = getAcrossApprovalInfo(quote);

  return {
    ok: true,
    fromChain,
    toChain,
    approvalNeeded: approval.needed,
    allowance: approval.actual.toString(),
    approvalExpected: approval.expected.toString(),
    amountIn: amountIn.toString(),
    quote: {
      id: quote.id,
      crossSwapType: quote.crossSwapType,
      expectedFillTime: quote.expectedFillTime,
      expectedOutputAmount: quote.expectedOutputAmount,
      minOutputAmount: quote.minOutputAmount,
      quoteExpiryTimestamp: quote.quoteExpiryTimestamp,
      feeUsd: quote.fees?.total?.amountUsd,
    },
  };
}

export async function buildAcrossSwapTxs({
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
  approvalAmount = "",
} = {}) {
  const { amountIn, quote } = await getAcrossQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
    recipient,
  });
  const chainId = getAcrossChainId(fromChain);
  const approval = getAcrossApprovalInfo(quote);
  const txs = [];

  if (approval.needed) {
    const approveAmount = getApprovalAmount({
      chain: fromChain,
      fromCoin,
      approvalAmount,
      amountIn,
      defaultAmount: approval.expected > amountIn ? approval.expected : amountIn,
    });

    if (
      fromChain != "Solana" &&
      approveAmount != null &&
      approval.spender &&
      approval.token
    ) {
      if (ethers.getAddress(approval.token) == nativeEvmAddress) {
        throw new Error("Across returned native-token approval unexpectedly");
      }

      txs.push(
        ...(approval.actual > 0n
          ? [
              getApproveTx({
                chain: fromChain,
                chainId,
                token: approval.token,
                spender: approval.spender,
                amount: 0n,
              }),
            ]
          : []),
        getApproveTx({
          chain: fromChain,
          chainId,
          token: approval.token,
          spender: approval.spender,
          amount: approveAmount,
        }),
      );
    } else if (approval.approvalTxns.length) {
      txs.push(
        ...approval.approvalTxns.map((txData) =>
          getAcrossUnsignedTx({
            txData: {
              ...txData,
              chainId: txData.chainId || chainId,
            },
            type: "approve",
          }),
        ),
      );
    } else {
      throw new Error("Across approval needed but returned no approval tx");
    }
  }

  if (!quote.swapTx) throw new Error("Across quote returned no swap tx");
  txs.push(
    getAcrossUnsignedTx({
      type: "swap",
      txData: {
        ...quote.swapTx,
        chainId: quote.swapTx.chainId || chainId,
      },
    }),
  );

  return {
    ok: true,
    dex: "Across",
    txs,
    quote: {
      id: quote.id,
      crossSwapType: quote.crossSwapType,
      amountIn: amountIn.toString(),
      expectedOutputAmount: quote.expectedOutputAmount,
      minOutputAmount: quote.minOutputAmount,
      expectedFillTime: quote.expectedFillTime,
      quoteExpiryTimestamp: quote.quoteExpiryTimestamp,
      feeUsd: quote.fees?.total?.amountUsd,
    },
  };
}

export async function executeAcrossSwap({
  walletName = "",
  walletAddress = "",
  fromChain = "",
  toChain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  recipient = "",
  approvalAmount = "",
} = {}) {
  const privateKey = fromChain == "Solana" ? "" : getPrivateKey(walletName);
  const solanaKeypair =
    fromChain == "Solana" ? getSolanaKeypair(walletName) : null;
  if (fromChain != "Solana" && !privateKey) {
    throw new Error(`private key missing: pk_${walletName}`);
  }

  const { amountIn, quote } = await getAcrossQuote({
    walletAddress,
    fromChain,
    toChain,
    fromCoin,
    toCoin,
    amount,
    recipient,
  });
  const txs = [];
  const approval = getAcrossApprovalInfo(quote);

  if (approval.needed) {
    const approveAmount = getApprovalAmount({
      chain: fromChain,
      fromCoin,
      approvalAmount,
      amountIn,
    });

    if (
      fromChain != "Solana" &&
      approveAmount != null &&
      approval.spender &&
      approval.token
    ) {
      if (ethers.getAddress(approval.token) == nativeEvmAddress) {
        throw new Error("Across returned native-token approval unexpectedly");
      }

      const rpc = getChainRpc(fromChain);
      if (!rpc) throw new Error(`rpc not configured: ${fromChain}`);

      const provider = new ethers.JsonRpcProvider(rpc);
      try {
        const wallet = getWallet(privateKey, provider);
        assertWalletMatches(wallet, walletAddress);
        const token = new ethers.Contract(
          ethers.getAddress(approval.token),
          erc20Abi,
          wallet,
        );

        txs.push(
          ...(await approveExactIfNeeded({
            chain: fromChain,
            token,
            owner: wallet.address,
            spender: ethers.getAddress(approval.spender),
            amount: approval.expected || amountIn,
            approvalAmount: approveAmount,
          })),
        );
      } finally {
        provider.destroy?.();
      }
    } else {
      for (const approvalTx of approval.approvalTxns) {
        txs.push(
          await executeAcrossTx({
            privateKey,
            solanaKeypair,
            expectedAddress: walletAddress,
            txData: {
              ...approvalTx,
              chainId: approvalTx.chainId || getAcrossChainId(fromChain),
            },
            type: "approve",
          }),
        );
      }
      if (!approval.approvalTxns.length) {
        throw new Error("Across approval needed but returned no approval tx");
      }
    }
  }

  if (!quote.swapTx) throw new Error("Across quote returned no swap tx");

  txs.push(
    await executeAcrossTx({
      privateKey,
      solanaKeypair,
      expectedAddress: walletAddress,
      txData: {
        ...quote.swapTx,
        chainId: quote.swapTx.chainId || getAcrossChainId(fromChain),
      },
      type: "swap",
    }),
  );

  return {
    ok: true,
    dex: "Across",
    txs,
    quote: {
      id: quote.id,
      crossSwapType: quote.crossSwapType,
      amountIn: amountIn.toString(),
      expectedOutputAmount: quote.expectedOutputAmount,
      minOutputAmount: quote.minOutputAmount,
      expectedFillTime: quote.expectedFillTime,
      quoteExpiryTimestamp: quote.quoteExpiryTimestamp,
      feeUsd: quote.fees?.total?.amountUsd,
    },
  };
}
