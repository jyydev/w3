"use client";

export function isRelaySupportedForChain(fromChain = "") {
  return fromChain != "";
}

export default function RelayClient({ children }) {
  return children;
}
