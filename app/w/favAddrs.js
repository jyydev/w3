import { ckPrefix } from "@/sets";

export const favAddrCookie = `${ckPrefix ?? ""}favAddrs`;

export function getFavAddrKey(type = "evm", address = "") {
  const clean = String(address || "").trim();
  if (!clean) return "";

  return `${type}:${type == "evm" ? clean.toLowerCase() : clean}`;
}

export function parseFavAddrs(value) {
  try {
    const text = String(value || "[]");
    const favs = JSON.parse(text.startsWith("%") ? decodeURIComponent(text) : text);
    if (!Array.isArray(favs)) return [];

    const seen = new Set();

    return favs
      .map((fav) => ({
        type: ["evm", "solana", "tron"].includes(fav?.type)
          ? fav.type
          : "evm",
        name: String(fav?.name || ""),
        address: String(fav?.address || "").trim(),
      }))
      .filter((fav) => fav.address)
      .filter((fav) => {
        const key = getFavAddrKey(fav.type, fav.address);
        if (!key || seen.has(key)) return false;
        seen.add(key);

        return true;
      });
  } catch {
    return [];
  }
}

export function encodeFavAddrs(favs) {
  return JSON.stringify(
    favs.map(({ type, name, address }) => ({ type, name, address })),
  );
}
