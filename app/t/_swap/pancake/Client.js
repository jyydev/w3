"use client";

import { pancakeSupportedChains } from "./shared";

export { pancakeSupportedChains };

const pancakeSupportedChainSet = new Set(pancakeSupportedChains);

export function isPancakeSupportedForChain(chain = "") {
  return pancakeSupportedChainSet.has(chain);
}

export default function PancakeClient({ children }) {
  return children;
}
