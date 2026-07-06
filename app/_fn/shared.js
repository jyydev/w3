import { ethers } from "ethers";

const rpcLogCooldownMs = 60_000;
const rpcFailureLogM = globalThis.__w3RpcFailureLogM || new Map();
globalThis.__w3RpcFailureLogM = rpcFailureLogM;

export function getRpcOrigin(rpc = "") {
  try {
    return new URL(String(rpc || "")).origin;
  } catch {
    return String(rpc || "").split("/").slice(0, 3).join("/") || "";
  }
}

export function cleanErrorText(value = "", maxLength = 240) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let text = raw;
  if (/<html[\s>]/i.test(raw) || /<!doctype\s+html/i.test(raw)) {
    const prefix = raw
      .split(/<!doctype\s+html|<html[\s>]/i)[0]
      .trim()
      .replace(/[:\s]+$/g, "");
    const title = raw
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]*>/g, " ")
      ?.trim();

    text = [prefix, title].filter(Boolean).join(": ");
    if (!text) {
      text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ");
    }
  }

  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getRpcErrorMessage(error) {
  return cleanErrorText(
    error?.shortMessage ||
      error?.reason ||
      error?.message ||
      String(error || "rpc failed"),
  );
}

export function logRpcFailure({
  scope = "rpc",
  chain = "",
  rpc = "",
  error,
} = {}) {
  const origin = getRpcOrigin(rpc);
  const message = getRpcErrorMessage(error);
  const key = `${scope}:${chain}:${origin}:${message}`;
  const now = Date.now();

  if (now - (rpcFailureLogM.get(key) || 0) < rpcLogCooldownMs) return;
  rpcFailureLogM.set(key, now);

  console.warn(
    `[${scope} rpc failed] chain=${chain || "-"} rpc=${origin || "-"} error=${message}`,
  );
}

export function createJsonRpcProvider(
  rpc = "",
  { chain = "", network, staticNetwork = false, scope = "rpc" } = {},
) {
  const provider = new ethers.JsonRpcProvider(rpc, network, {
    staticNetwork,
  });
  const send = provider._send?.bind(provider);

  if (send) {
    provider._send = async (...args) => {
      try {
        return await send(...args);
      } catch (error) {
        logRpcFailure({ scope, chain, rpc, error });
        const message = getRpcErrorMessage(error);
        if (message && message != error?.message) {
          const cleanError = new Error(message);
          cleanError.code = error?.code;
          cleanError.shortMessage = message;
          throw cleanError;
        }
        throw error;
      }
    };
  }

  return provider;
}
