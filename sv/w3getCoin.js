"use server";
import "ygb";
import { ethers } from "ethers";
import getCoinM from "@/fn/getCoinM";
import { publicWallets, rpcs } from "@/sets";

const providerM = {
  BSC: { rpc: rpcs?.BSC, network: "EVM" },
  Arbitrum: { rpc: rpcs?.Arbitrum, network: "EVM" },
};

const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

function getPublicWallet({ sub, chain }) {
  let wallet = publicWallets?.[sub];
  if (!wallet) return;
  if (typeof wallet == "string") return wallet;
  let chainE = providerM[chain];
  return (
    wallet[chain] ??
    wallet[chain.toLowerCase()] ??
    wallet[chainE?.network] ??
    wallet[chainE?.network?.toLowerCase()] ??
    wallet.evm ??
    wallet.EVM
  );
}

function getRpcs(chainE) {
  const rpcs = Array.isArray(chainE.rpc) ? chainE.rpc : [chainE.rpc];
  return rpcs
    .map((rpc) => (typeof rpc == "string" ? rpc : rpc?.rpc))
    .filter(Boolean);
}

async function getProvider(chainE) {
  let lastError;

  for (const rpc of getRpcs(chainE)) {
    const provider = new ethers.JsonRpcProvider(rpc);
    try {
      await provider.getBlockNumber();
      return provider;
    } catch (e) {
      lastError = e;
      provider.destroy?.();
    }
  }

  throw new Error(lastError?.shortMessage ?? lastError?.message ?? "all rpcs failed");
}

async function w3getCoin({ sub, coin = "USDT", chain = "BSC" } = {}) {
  coin = coin.toUpperCase();
  let envVar = `wd_${sub}`;
  let [, , privateKey] = process.env[envVar]?.split(",").map((e) => e.trim()) ?? [];

  let chainE = providerM[chain];
  if (!chainE) return { code: "Y", msg: `unknown w3 chain: ${chain}` };
  if (!getRpcs(chainE).length) return { code: "Y", msg: `missing w3 rpc: ${chain}` };

  let coinE = getCoinM(chain)[coin];
  if (!coinE) return { code: "Y", msg: `w3 coin contract not found: ${coin}` };

  let provider;
  try {
    provider = await getProvider(chainE);
    let address = privateKey
      ? new ethers.Wallet(privateKey, provider).address
      : getPublicWallet({ sub, chain });
    if (!address) return { code: "Y", msg: `${envVar}: noKey/publicWallet` };
    let balance, decimals;

    if (coinE.native) {
      balance = await provider.getBalance(address);
      decimals = coinE.decimals ?? 18;
    } else {
      let token = new ethers.Contract(coinE.address, erc20Abi, provider);
      [balance, decimals] = await Promise.all([
        token.balanceOf(address),
        coinE.decimals ?? token.decimals(),
      ]);
    }

    return {
      ok: 1,
      msg: ethers.formatUnits(balance, decimals),
      address,
      coin,
      chain,
    };
  } catch (e) {
    provider?.destroy?.();
    E(e);
    return {
      code: "Y",
      msg: e?.shortMessage ?? e?.reason ?? e?.message ?? "unknown w3 error",
    };
  }
}

export default w3getCoin;
