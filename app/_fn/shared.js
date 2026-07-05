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

function getRpcErrorMessage(error) {
  return (
    error?.shortMessage ||
    error?.reason ||
    error?.message ||
    String(error || "rpc failed")
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
        throw error;
      }
    };
  }

  return provider;
}
