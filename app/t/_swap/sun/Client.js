"use client";

export function isSunSupportedForChain(chain = "") {
  return chain == "Tron";
}

export default function SunClient({ children }) {
  return children;
}
