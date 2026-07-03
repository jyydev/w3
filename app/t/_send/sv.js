"use server";

import { ethers } from "ethers";
import { SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import coinM from "@/fn/coinM";
import {
  erc20Interface,
  assertWhitelistedRecipient,
  executeRawEvmTx,
  executeSolanaTx,
  getCoinDecimals,
  getPrivateKey,
  getSolanaConnection,
  getSolanaInstructionTx,
  getSolanaKeypair,
  getSolanaPublicKey,
  getTradeCoinBalance as getTradeCoinBalanceShared,
  getTradeCoinPrice as getTradeCoinPriceShared,
  getUnsignedTx,
  relayChainIds,
} from "../sharedServer";

export async function getTradeCoinPrice(args) {
  return getTradeCoinPriceShared(args);
}

export async function getTradeCoinBalance(args) {
  return getTradeCoinBalanceShared(args);
}

function getSendAmount({ chain = "", coin = "", amount = "" } = {}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("send amount must be greater than 0");

  return amountIn;
}

async function getSolanaSendTx({
  walletAddress = "",
  coin = "",
  amountIn,
  recipient = "",
} = {}) {
  const coinE = coinM?.Solana?.[coin];
  if (!coinE) throw new Error(`coin not found: Solana ${coin}`);

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

export async function buildSendTx({
  walletAddress = "",
  chain = "",
  coin = "",
  amount = "",
  recipient = "",
} = {}) {
  const coinE = coinM?.[chain]?.[coin];
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (!recipient) throw new Error("recipient missing");

  const amountIn = getSendAmount({ chain, coin, amount });
  let tx;

  if (chain == "Solana") {
    tx = await getSolanaSendTx({
      walletAddress,
      coin,
      amountIn,
      recipient,
    });
  } else {
    if (!ethers.isAddress(walletAddress)) throw new Error("EVM sender required");
    if (!ethers.isAddress(recipient)) throw new Error("EVM recipient required");

    const chainId = relayChainIds[chain];
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
  });
  const tx = built.txs[0];
  let sent;

  if (chain == "Solana") {
    sent = await executeSolanaTx({
      keypair: getSolanaKeypair(walletName),
      expectedAddress: walletAddress,
      tx,
    });
  } else {
    const privateKey = getPrivateKey(walletName);
    if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

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
