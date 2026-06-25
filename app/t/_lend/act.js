"use server";

import { ethers } from "ethers";
import coinM from "@/fn/coinM";
import {
  approveExactIfNeeded,
  assertWalletMatches,
  erc20Abi,
  getApprovalAmount,
  getApproveTx,
  getChainRpc,
  getCoinDecimals,
  getEvmTokenAddress,
  getPrivateKey,
  getTradeCoinPrice as getTradeCoinPriceShared,
  getUnsignedTx,
  getWallet,
  relayChainIds,
} from "../sharedServer";

const aaveV3PoolM = {
  Ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
  EthereumEtherFi: "0x0AA97c284e98396202b6A04024F5E2c65026F3c0",
  EthereumHorizon: "0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8",
  EthereumLido: "0x4e033931ad43597d96D6bcc25c280717730B58B1",
  BSC: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
  BNB: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
  Arbitrum: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Avalanche: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Optimism: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Polygon: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Base: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  Celo: "0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402",
  Fantom: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Gnosis: "0xb50201558B00496A145fE76f7424749556E326D8",
  Harmony: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  Ink: "0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA",
  Linea: "0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac",
  Mantle: "0x458F293454fE0d67EC0655f3672301301DD51422",
  MegaEth: "0x7e324AbC5De01d112AfC03a584966ff199741C28",
  Metis: "0x90df02551bB792286e8D4f13E0e357b4Bf1D6a57",
  Monad: "0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef",
  Plasma: "0x925a2A7214Ed92428B5b1B090F80b25700095e12",
  Scroll: "0x11fCfe756c05AD438e312a7fd934381537D3cFfe",
  Soneium: "0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B",
  Sonic: "0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3",
  XLayer: "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116",
  ZkSync: "0x78e30497a3c7527d953c6B1E3541b021A98Ac43c",
  zkSyncEra: "0x78e30497a3c7527d953c6B1E3541b021A98Ac43c",
};
const aavePoolAbi = [
  "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
  "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
];
const aTokenAbi = [
  "function UNDERLYING_ASSET_ADDRESS() view returns (address)",
];
const venusTokenAbi = [
  "function underlying() view returns (address)",
  "function exchangeRateStored() view returns (uint256)",
  "function mint(uint256 mintAmount) returns (uint256)",
  "function redeem(uint256 redeemTokens) returns (uint256)",
];
const aavePoolInterface = new ethers.Interface(aavePoolAbi);
const venusTokenInterface = new ethers.Interface(venusTokenAbi);

export async function getTradeCoinPrice(args) {
  return getTradeCoinPriceShared(args);
}

function getAavePool(chain = "", lendCoin = "") {
  const coinPool = coinM?.[chain]?.[lendCoin]?.aavePool ||
    coinM?.[chain]?.[lendCoin]?.pool;
  const pool = ethers.isAddress(coinPool || "")
    ? coinPool
    : aaveV3PoolM[coinPool] || aaveV3PoolM[chain];
  if (!pool) throw new Error(`Aave not configured: ${coinPool || chain}`);

  return ethers.getAddress(pool);
}

function getAaveAmount({ chain = "", coin = "", amount = "" } = {}) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, coin),
  );
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

async function assertAaveMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
} = {}) {
  const underlying = getEvmTokenAddress(chain, underlyingCoin, "Aave underlying");
  const aTokenAddress = getEvmTokenAddress(chain, lendCoin, "Aave token");
  const aToken = new ethers.Contract(aTokenAddress, aTokenAbi, provider);
  const actualUnderlying = ethers.getAddress(await aToken.UNDERLYING_ASSET_ADDRESS());

  if (actualUnderlying != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  return { underlying, aTokenAddress };
}

function getVenusToken(chain = "", lendCoin = "") {
  return getEvmTokenAddress(chain, lendCoin, "Venus token");
}

function getVenusAmount({
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
} = {}) {
  const coin = action == "redeem" ? lendCoin : underlyingCoin;
  const amountIn = ethers.parseUnits(String(amount || "0"), getCoinDecimals(chain, coin));
  if (amountIn <= 0n) throw new Error("amount must be greater than 0");

  return amountIn;
}

function getVenusExchangeRate({
  rateRaw = 0n,
  underlyingDecimals = 18,
  receiptDecimals = 8,
} = {}) {
  const scaleDecimals = 18 + underlyingDecimals - receiptDecimals;
  if (scaleDecimals < 0) return Number(rateRaw) * 10 ** Math.abs(scaleDecimals);

  return Number(ethers.formatUnits(rateRaw, scaleDecimals));
}

async function assertVenusMarket({
  provider,
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
} = {}) {
  const underlying = getEvmTokenAddress(chain, underlyingCoin, "Venus underlying");
  const vTokenAddress = getVenusToken(chain, lendCoin);
  const vToken = new ethers.Contract(vTokenAddress, venusTokenAbi, provider);
  const [actualUnderlying, exchangeRateRaw] = await Promise.all([
    vToken.underlying(),
    vToken.exchangeRateStored(),
  ]);

  if (ethers.getAddress(actualUnderlying) != underlying) {
    throw new Error(`${lendCoin} underlying does not match ${underlyingCoin}`);
  }

  const underlyingDecimals = getCoinDecimals(chain, underlyingCoin);
  const receiptDecimals = getCoinDecimals(chain, lendCoin);
  const underlyingPerReceipt = getVenusExchangeRate({
    rateRaw: BigInt(exchangeRateRaw),
    underlyingDecimals,
    receiptDecimals,
  });

  return {
    underlying,
    vTokenAddress,
    exchangeRateRaw: BigInt(exchangeRateRaw),
    underlyingPerReceipt,
    receiptPerUnderlying: underlyingPerReceipt ? 1 / underlyingPerReceipt : 0,
  };
}

export async function getAaveLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({ chain, coin: underlyingCoin, amount });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
    });
    const allowance = action == "redeem"
      ? amountIn
      : BigInt(
          await new ethers.Contract(underlying, erc20Abi, provider).allowance(
            walletAddress,
            pool,
          ),
        );

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      approvalNeeded: action != "redeem" && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      pool,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildAaveLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({ chain, coin: underlyingCoin, amount });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
    });
    const txs = [];

    if (action == "redeem") {
      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "redeem",
          txData: {
            to: pool,
            data: aavePoolInterface.encodeFunctionData("withdraw", [
              underlying,
              amountIn,
              ethers.getAddress(walletAddress),
            ]),
            value: "0",
          },
        }),
      );
    } else {
      const allowance = BigInt(
        await new ethers.Contract(underlying, erc20Abi, provider).allowance(
          walletAddress,
          pool,
        ),
      );
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        defaultAmount: amountIn,
      });

      if (allowance < amountIn && approveAmount != null) {
        if (allowance > 0n) {
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: underlying,
              spender: pool,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: underlying,
            spender: pool,
            amount: approveAmount,
          }),
        );
      }

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "lend",
          txData: {
            to: pool,
            data: aavePoolInterface.encodeFunctionData("supply", [
              underlying,
              amountIn,
              ethers.getAddress(walletAddress),
              0,
            ]),
            value: "0",
          },
        }),
      );
    }

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      pool,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeAaveLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Aave is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const pool = getAavePool(chain, lendCoin);
  const amountIn = getAaveAmount({ chain, coin: underlyingCoin, amount });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const { underlying } = await assertAaveMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
    });
    const poolContract = new ethers.Contract(pool, aavePoolAbi, wallet);
    const txs = [];

    if (action == "redeem") {
      const redeemTx = await poolContract.withdraw(
        underlying,
        amountIn,
        wallet.address,
      );
      const receipt = await redeemTx.wait();
      txs.push({
        chain,
        type: "redeem",
        hash: redeemTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else {
      const token = new ethers.Contract(underlying, erc20Abi, wallet);
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
      });
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: pool,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );

      const lendTx = await poolContract.supply(
        underlying,
        amountIn,
        wallet.address,
        0,
      );
      const receipt = await lendTx.wait();
      txs.push({
        chain,
        type: "lend",
        hash: lendTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    }

    return {
      ok: true,
      defi: "Aave",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      pool,
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function getVenusLendPreview({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
    });
    const allowance =
      action == "redeem"
        ? amountIn
        : BigInt(
            await new ethers.Contract(
              market.underlying,
              erc20Abi,
              provider,
            ).allowance(walletAddress, market.vTokenAddress),
          );

    return {
      ok: true,
      defi: "Venus",
      chain,
      action,
      approvalNeeded: action != "redeem" && allowance < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      underlyingPerReceipt: market.underlyingPerReceipt,
      receiptPerUnderlying: market.receiptPerUnderlying,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildVenusLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  if (!chainId) throw new Error(`chain unsupported: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
    });
    const txs = [];

    if (action == "redeem") {
      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "redeem",
          txData: {
            to: market.vTokenAddress,
            data: venusTokenInterface.encodeFunctionData("redeem", [amountIn]),
            value: "0",
          },
        }),
      );
    } else {
      const allowance = BigInt(
        await new ethers.Contract(
          market.underlying,
          erc20Abi,
          provider,
        ).allowance(walletAddress, market.vTokenAddress),
      );
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
        defaultAmount: amountIn,
      });

      if (allowance < amountIn && approveAmount != null) {
        if (allowance > 0n) {
          txs.push(
            getApproveTx({
              chain,
              chainId,
              token: market.underlying,
              spender: market.vTokenAddress,
              amount: 0n,
            }),
          );
        }
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: market.underlying,
            spender: market.vTokenAddress,
            amount: approveAmount,
          }),
        );
      }

      txs.push(
        getUnsignedTx({
          chain,
          chainId,
          type: "lend",
          txData: {
            to: market.vTokenAddress,
            data: venusTokenInterface.encodeFunctionData("mint", [amountIn]),
            value: "0",
          },
        }),
      );
    }

    return {
      ok: true,
      defi: "Venus",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeVenusLend({
  walletName = "",
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Venus is EVM-only here");
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const amountIn = getVenusAmount({
    chain,
    action,
    underlyingCoin,
    lendCoin,
    amount,
  });
  const provider = new ethers.JsonRpcProvider(rpc);

  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);
    const market = await assertVenusMarket({
      provider,
      chain,
      underlyingCoin,
      lendCoin,
    });
    const vToken = new ethers.Contract(market.vTokenAddress, venusTokenAbi, wallet);
    const txs = [];

    if (action == "redeem") {
      const redeemTx = await vToken.redeem(amountIn);
      const receipt = await redeemTx.wait();
      txs.push({
        chain,
        type: "redeem",
        hash: redeemTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    } else {
      const token = new ethers.Contract(market.underlying, erc20Abi, wallet);
      const approveAmount = getApprovalAmount({
        chain,
        fromCoin: underlyingCoin,
        approvalAmount,
        amountIn,
      });
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: market.vTokenAddress,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );

      const lendTx = await vToken.mint(amountIn);
      const receipt = await lendTx.wait();
      txs.push({
        chain,
        type: "lend",
        hash: lendTx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      });
    }

    return {
      ok: true,
      defi: "Venus",
      chain,
      action,
      underlyingCoin,
      lendCoin,
      amountIn: amountIn.toString(),
      market: market.vTokenAddress,
      exchangeRateRaw: market.exchangeRateRaw.toString(),
      txs,
    };
  } finally {
    provider.destroy?.();
  }
}
