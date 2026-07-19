"use server";

import { ethers } from "ethers";
import { SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { chainIds } from "@/data/basic";
import {
  erc20Interface,
  assertWhitelistedRecipient,
  executeRawEvmTx,
  executeSolanaTx,
  executeTronTx,
  getCoinDecimals,
  getPrivateKey,
  getSolanaConnection,
  getSolanaInstructionTx,
  getSolanaKeypair,
  getSolanaPublicKey,
  getTronAddress,
  getTronPrivateKey,
  getTronWeb,
  getTradeCoinEntry,
  getTradeCoinBalance as getTradeCoinBalanceShared,
  getTradeCoinPrice as getTradeCoinPriceShared,
  getUnsignedTx,
} from "../sharedServer";

export async function getTradeCoinPrice(args) {
  return getTradeCoinPriceShared(args);
}

export async function getTradeCoinBalance(args) {
  return getTradeCoinBalanceShared(args);
}

function getSendAmount({
  chain = "",
  coin = "",
  amount = "",
  coinE = null,
} = {}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, coin, coinE),
  );
  if (amountIn <= 0n) throw new Error("send amount must be greater than 0");

  return amountIn;
}

async function getSolanaSendTx({
  walletAddress = "",
  coin = "",
  coinE = null,
  amountIn,
  recipient = "",
} = {}) {
  const fromKey = getSolanaPublicKey(walletAddress, "Solana sender address");
  const toKey = getSolanaPublicKey(recipient, "Solana recipient address");
  const instructions = [];

  if (coinE.native) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: fromKey,
        toPubkey: toKey,
        lamports: amountIn,
      }),
    );
  } else {
    const mint = getSolanaPublicKey(coinE.address, "Solana token mint");
    const sourceAta = getAssociatedTokenAddressSync(mint, fromKey);
    const destinationAta = getAssociatedTokenAddressSync(mint, toKey);
    const connection = getSolanaConnection();
    const destinationInfo = await connection.getAccountInfo(
      destinationAta,
      "confirmed",
    );

    if (!destinationInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          fromKey,
          destinationAta,
          toKey,
          mint,
        ),
      );
    }

    instructions.push(
      createTransferInstruction(sourceAta, destinationAta, fromKey, amountIn),
    );
  }

  return getSolanaInstructionTx({
    user: fromKey.toBase58(),
    instructions,
    type: "send",
  });
}

async function getTronSendTx({
  walletAddress = "",
  coin = "",
  coinE = null,
  amountIn,
  recipient = "",
} = {}) {
  const from = getTronAddress(walletAddress, "Tron sender address");
  const to = getTronAddress(recipient, "Tron recipient address");
  const tronWeb = getTronWeb();
  let transaction;

  if (coinE.native) {
    if (amountIn > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("TRX send amount exceeds the transaction builder limit");
    }
    transaction = await tronWeb.transactionBuilder.sendTrx(
      to,
      Number(amountIn),
      from,
    );
  } else {
    const token = getTronAddress(coinE.address, "TRC-20 token address");
    const triggered = await tronWeb.transactionBuilder.triggerSmartContract(
      token,
      "transfer(address,uint256)",
      { feeLimit: 100_000_000, callValue: 0 },
      [
        { type: "address", value: to },
        { type: "uint256", value: amountIn.toString() },
      ],
      from,
    );
    if (!triggered?.result?.result || !triggered?.transaction) {
      throw new Error(
        triggered?.result?.message || `cannot build Tron ${coin} transfer`,
      );
    }
    transaction = triggered.transaction;
  }

  return {
    chain: "Tron",
    type: "send",
    format: "tron:transaction",
    transaction,
  };
}

export async function buildSendTx({
  walletAddress = "",
  chain = "",
  coin = "",
  amount = "",
  recipient = "",
  coinE: dynamicCoinE = null,
} = {}) {
  const coinE = getTradeCoinEntry(chain, coin, dynamicCoinE);
  if (!recipient) throw new Error("recipient missing");

  const amountIn = getSendAmount({ chain, coin, amount, coinE });
  let tx;

  if (chain == "Solana") {
    tx = await getSolanaSendTx({
      walletAddress,
      coin,
      coinE,
      amountIn,
      recipient,
    });
  } else if (chain == "Tron") {
    tx = await getTronSendTx({
      walletAddress,
      coin,
      coinE,
      amountIn,
      recipient,
    });
  } else {
    if (!ethers.isAddress(walletAddress)) throw new Error("EVM sender required");
    if (!ethers.isAddress(recipient)) throw new Error("EVM recipient required");

    const chainId = chainIds[chain];
    if (!chainId) throw new Error(`chain unsupported: ${chain}`);
    if (!coinE.native && !ethers.isAddress(coinE.address)) {
      throw new Error(`EVM token address missing: ${chain} ${coin}`);
    }
    tx = getUnsignedTx({
      chain,
      chainId,
      type: "send",
      txData: coinE.native
        ? {
            to: ethers.getAddress(recipient),
            data: "0x",
            value: amountIn.toString(),
          }
        : {
            to: ethers.getAddress(coinE.address),
            data: erc20Interface.encodeFunctionData("transfer", [
              ethers.getAddress(recipient),
              amountIn,
            ]),
            value: "0",
          },
    });
  }

  return {
    ok: true,
    action: "Send",
    chain,
    coin,
    amountIn: amountIn.toString(),
    txs: [tx],
  };
}

export async function executeSend({
  walletName = "",
  walletAddress = "",
  chain = "",
  coin = "",
  amount = "",
  recipient = "",
  coinE = null,
} = {}) {
  try {
    assertWhitelistedRecipient({ address: recipient });
  } catch (e) {
    return {
      ok: false,
      action: "Send",
      chain,
      coin,
      error: e?.message || "recipient not whitelisted",
      txs: [],
    };
  }

  const built = await buildSendTx({
    walletAddress,
    chain,
    coin,
    amount,
    recipient,
    coinE,
  });
  const tx = built.txs[0];
  let sent;

  if (chain == "Solana") {
    sent = await executeSolanaTx({
      keypair: getSolanaKeypair(walletName),
      expectedAddress: walletAddress,
      tx,
    });
  } else if (chain == "Tron") {
    const privateKey = getTronPrivateKey(walletName);
    if (!privateKey) {
      throw new Error(
        `private key missing: pk_tron_raw_${walletName} or pk_tron_${walletName}`,
      );
    }

    sent = await executeTronTx({
      privateKey,
      expectedAddress: walletAddress,
      tx,
      waitForConfirmation: false,
    });
  } else {
    const privateKey = getPrivateKey(walletName);
    if (!privateKey) {
      throw new Error(`private key missing: pk_raw_${walletName} or pk_${walletName}`);
    }

    sent = await executeRawEvmTx({
      privateKey,
      expectedAddress: walletAddress,
      chainId: tx.chainId,
      txData: tx,
      type: "send",
    });
  }

  return {
    ...built,
    txs: [sent],
  };
}
