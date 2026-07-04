"use client";

import { ethers } from "ethers";
import {
  base64ToBytes,
  getBrowserSigner,
  getBrowserSolanaSigner,
  getSolanaSignature,
  getWalletStandardAccount,
} from "../../clientShared";
import { submitRelaySignature } from "./sv";

export function isRelaySupportedForChain(fromChain = "") {
  return fromChain != "";
}

function relaySignMessageBytes(sign = {}) {
  const message =
    sign.message ?? sign.data ?? sign.value ?? sign.signableMessage ?? "";
  if (message instanceof Uint8Array) return message;
  if (Array.isArray(message)) return Uint8Array.from(message);
  if (Array.isArray(message?.data)) return Uint8Array.from(message.data);
  if (typeof message != "string") {
    return ethers.toUtf8Bytes(JSON.stringify(message || ""));
  }

  const text = message.trim();
  if (ethers.isHexString(text)) return ethers.getBytes(text);
  if (
    /^[A-Za-z0-9+/]+={0,2}$/.test(text) &&
    text.length % 4 == 0 &&
    text.length > 16
  ) {
    try {
      return base64ToBytes(text);
    } catch {
      // Fall through to UTF-8.
    }
  }

  return ethers.toUtf8Bytes(message);
}

function isRelaySolanaSignatureItem(item = {}) {
  const signatureKind = String(item?.sign?.signatureKind || "").toLowerCase();

  return (
    Number(item?.chainId) == 792703809 ||
    ["ed25519", "solana", "svm"].some((key) => signatureKind.includes(key))
  );
}

async function signBrowserRelaySolanaItem({ item, wallet = "", address = "" }) {
  const provider = await getBrowserSolanaSigner({ wallet, address });
  const message = relaySignMessageBytes(item.sign || {});
  let result;

  if (provider.walletStandard) {
    const standardWallet = provider.walletStandardWallet;
    const account = getWalletStandardAccount(provider, address);
    const signMessage =
      standardWallet?.features?.["solana:signMessage"]?.signMessage;
    if (!account) throw new Error("Solana wallet account missing");
    if (signMessage) {
      result = await signMessage({
        account,
        message,
      });
    }
  }

  if (!result && provider.signMessage) {
    result = await provider.signMessage(message, "utf8");
  }
  if (!result) throw new Error("Solana wallet cannot sign Relay message");

  const signature = getSolanaSignature(result);
  if (!signature) throw new Error("Solana wallet returned no signature");
  await submitRelaySignature({ post: item.post, signature });

  return { signatureKind: item.sign?.signatureKind || "ed25519" };
}

export async function signBrowserRelayItem({
  item,
  wallet = "",
  address = "",
}) {
  if (isRelaySolanaSignatureItem(item)) {
    return signBrowserRelaySolanaItem({ item, wallet, address });
  }

  const signer = await getBrowserSigner({
    wallet,
    address,
    chainId: item.chainId,
  });
  const sign = item.sign || {};
  let signature = "";

  if (sign.signatureKind == "eip191") {
    const message = sign.message || "";
    signature = await signer.signMessage(
      ethers.isHexString(message) ? ethers.getBytes(message) : message,
    );
  } else if (sign.signatureKind == "eip712") {
    const types = { ...(sign.types || {}) };
    delete types.EIP712Domain;
    signature = await signer.signTypedData(sign.domain, types, sign.value);
  } else {
    throw new Error(`Relay signature unsupported: ${sign.signatureKind}`);
  }

  await submitRelaySignature({ post: item.post, signature });

  return { signatureKind: sign.signatureKind };
}

export default function RelayClient({ children }) {
  return children;
}
