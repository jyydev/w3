"use client";

export function isAcrossSupportedForChain(fromChain = "") {
  return fromChain != "";
}

export default function AcrossClient({ children }) {
  return children;
}
