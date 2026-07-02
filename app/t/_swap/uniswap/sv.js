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
  getPrivateKey,
  getUnsignedTx,
  getWallet,
  nativeEvmAddress,
  relayChainIds,
} from "../../sharedServer";

const defaultSlippageBps = 50n;const uniswapFeeTiers = [100, 500, 3000, 10000];
const uniswapV3M = {
  Ethereum: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  BSC: {
    quoter: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
    router: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
  },
  Arbitrum: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  Optimism: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  Base: {
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  },
  zkSyncEra: {
    quoter: "0x8Cb537fc92E26d8EBBb760E632c95484b6Ea3e28",
    router: "0x99c56385daBCE3E81d8499d0b8d0257aBC07E8A3",
  },
  Avalanche: {
    quoter: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
    router: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
  },
};
const uniswapWrappedNativeM = {
  Ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  BSC: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  Arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  Optimism: "0x4200000000000000000000000000000000000006",
  Base: "0x4200000000000000000000000000000000000006",
  zkSyncEra: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91",
  Avalanche: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
};
const uniswapQuoterAbi = [
  "function quoteExactInputSingle(tuple(address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
];
const uniswapRouterAbi = [
  "function exactInputSingle(tuple(address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
  "function unwrapWETH9(uint256 amountMinimum,address recipient) payable",
];
const uniswapRouterInterface = new ethers.Interface(uniswapRouterAbi);

function getUniswapToken(chain = "", coin = "") {
  const coinE = coinM?.[chain]?.[coin];
  if (!coinE) throw new Error(`coin not found: ${chain} ${coin}`);
  if (coinE.native) {
    const wrapped = uniswapWrappedNativeM[chain];
    if (!wrapped) throw new Error(`wrapped native missing: ${chain} ${coin}`);

    return {
      address: ethers.getAddress(wrapped),
      native: true,
    };
  }
  if (!coinE.address || !ethers.isAddress(coinE.address)) {
    throw new Error(`EVM token address missing: ${chain} ${coin}`);
  }

  return {
    address: ethers.getAddress(coinE.address),
    native: false,
  };
}

export async function getUniswapSupportedSwap() {
  const chains = Object.keys(uniswapV3M).map((chain) => ({
    chain,
    chainId: relayChainIds[chain] || "",
    name: chain,
    added: !!coinM?.[chain],
    router: uniswapV3M[chain]?.router || "",
    quoter: uniswapV3M[chain]?.quoter || "",
  }));
  const tokens = Object.keys(uniswapV3M).flatMap((chain) =>
    Object.entries(coinM?.[chain] || {}).map(([symbol, coinE]) => ({
      chain,
      chainId: relayChainIds[chain] || "",
      address: coinE.native
        ? uniswapWrappedNativeM[chain] || nativeEvmAddress
        : coinE.address || "",
      symbol,
      name: coinE.name || symbol,
      decimals: Number(coinE.decimals),
      added: true,
      native: !!coinE.native,
    })),
  );

  return { chains, tokens };
}

async function getBestUniswapQuote({ chain, provider, tokenIn, tokenOut, amountIn }) {
  const uniswapE = uniswapV3M[chain];
  const quoter = new ethers.Contract(
    uniswapE.quoter,
    uniswapQuoterAbi,
    provider,
  );
  let best = null;

  for (const fee of uniswapFeeTiers) {
    try {
      const quote = await quoter.quoteExactInputSingle.staticCall({
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0,
      });
      const amountOut = BigInt(quote.amountOut ?? quote[0] ?? 0);
      if (amountOut > 0n && (!best || amountOut > best.amountOut)) {
        best = { fee, amountOut };
      }
    } catch {
      // Try the next fee tier.
    }
  }

  if (!best) throw new Error(`No Uniswap V3 direct pool quote for ${chain}`);

  return best;
}

function getUniswapAmountIn({ chain, fromCoin, amount }) {
  const amountIn = ethers.parseUnits(
    String(amount || "0"),
    getCoinDecimals(chain, fromCoin),
  );
  if (amountIn <= 0n) throw new Error("swap amount must be greater than 0");

  return amountIn;
}

export async function getUniswapSwapPreview({
  walletAddress = "",
  chain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Uniswap is EVM-only here");
  if (!uniswapV3M[chain]) throw new Error(`Uniswap not configured: ${chain}`);
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const tokenInE = getUniswapToken(chain, fromCoin);
  const tokenOutE = getUniswapToken(chain, toCoin);
  if (tokenInE.address == tokenOutE.address) {
    throw new Error("sell coin and buy coin are the same");
  }

  const amountIn = getUniswapAmountIn({ chain, fromCoin, amount });
  const provider = new ethers.JsonRpcProvider(rpc);
  try {
    const uniswapE = uniswapV3M[chain];
    const token = new ethers.Contract(tokenInE.address, erc20Abi, provider);
    const allowancePromise = tokenInE.native
      ? Promise.resolve(amountIn)
      : token.allowance(walletAddress, uniswapE.router);
    const [allowance, quote] = await Promise.all([
      allowancePromise,
      getBestUniswapQuote({
        chain,
        provider,
        tokenIn: tokenInE.address,
        tokenOut: tokenOutE.address,
        amountIn,
      }),
    ]);
    const amountOutMinimum =
      (quote.amountOut * (10000n - defaultSlippageBps)) / 10000n;

    return {
      ok: true,
      chain,
      approvalNeeded: !tokenInE.native && BigInt(allowance) < amountIn,
      allowance: allowance.toString(),
      amountIn: amountIn.toString(),
      quote: {
        fee: quote.fee,
        amountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        slippageBps: Number(defaultSlippageBps),
      },
    };
  } finally {
    provider.destroy?.();
  }
}

export async function buildUniswapSwapTxs({
  walletAddress = "",
  chain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Uniswap is EVM-only here");
  if (!uniswapV3M[chain]) throw new Error(`Uniswap not configured: ${chain}`);
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const chainId = relayChainIds[chain];
  const tokenInE = getUniswapToken(chain, fromCoin);
  const tokenOutE = getUniswapToken(chain, toCoin);
  if (tokenInE.address == tokenOutE.address) {
    throw new Error("sell coin and buy coin are the same");
  }

  const amountIn = getUniswapAmountIn({ chain, fromCoin, amount });
  const provider = new ethers.JsonRpcProvider(rpc);
  try {
    const uniswapE = uniswapV3M[chain];
    const token = new ethers.Contract(tokenInE.address, erc20Abi, provider);
    const allowancePromise = tokenInE.native
      ? Promise.resolve(amountIn)
      : token.allowance(walletAddress, uniswapE.router);
    const [allowance, quote] = await Promise.all([
      allowancePromise,
      getBestUniswapQuote({
        chain,
        provider,
        tokenIn: tokenInE.address,
        tokenOut: tokenOutE.address,
        amountIn,
      }),
    ]);
    const allowanceN = BigInt(allowance);
    const approveAmount = getApprovalAmount({
      chain,
      amountIn,
      fromCoin,
      approvalAmount,
      defaultAmount: amountIn,
    });
    const amountOutMinimum =
      (quote.amountOut * (10000n - defaultSlippageBps)) / 10000n;
    const txs = [];

    if (!tokenInE.native && allowanceN < amountIn && approveAmount != null) {
      if (allowanceN > 0n) {
        txs.push(
          getApproveTx({
            chain,
            chainId,
            token: tokenInE.address,
            spender: uniswapE.router,
            amount: 0n,
          }),
        );
      }
      txs.push(
        getApproveTx({
          chain,
          chainId,
          token: tokenInE.address,
          spender: uniswapE.router,
          amount: approveAmount,
        }),
      );
    }

    const swapParams = {
      tokenIn: tokenInE.address,
      tokenOut: tokenOutE.address,
      fee: quote.fee,
      recipient: tokenOutE.native ? uniswapE.router : ethers.getAddress(walletAddress),
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    };
    const data = tokenOutE.native
      ? uniswapRouterInterface.encodeFunctionData("multicall", [
          [
            uniswapRouterInterface.encodeFunctionData("exactInputSingle", [
              swapParams,
            ]),
            uniswapRouterInterface.encodeFunctionData("unwrapWETH9", [
              amountOutMinimum,
              ethers.getAddress(walletAddress),
            ]),
          ],
        ])
      : uniswapRouterInterface.encodeFunctionData("exactInputSingle", [
          swapParams,
        ]);
    txs.push(
      getUnsignedTx({
        chain,
        chainId,
        type: "swap",
        txData: {
          to: uniswapE.router,
          data,
          value: tokenInE.native ? amountIn.toString() : "0",
        },
      }),
    );

    return {
      ok: true,
      dex: "Uniswap",
      chain,
      txs,
      quote: {
        fee: quote.fee,
        amountIn: amountIn.toString(),
        amountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        slippageBps: Number(defaultSlippageBps),
      },
    };
  } finally {
    provider.destroy?.();
  }
}

export async function executeUniswapSwap({
  walletName = "",
  walletAddress = "",
  chain = "",
  fromCoin = "",
  toCoin = "",
  amount = "",
  approvalAmount = "",
} = {}) {
  if (chain == "Solana") throw new Error("Uniswap is EVM-only here");
  if (!uniswapV3M[chain]) throw new Error(`Uniswap not configured: ${chain}`);
  if (!ethers.isAddress(walletAddress)) throw new Error("EVM wallet address required");

  const privateKey = getPrivateKey(walletName);
  if (!privateKey) throw new Error(`private key missing: pk_${walletName}`);

  const rpc = getChainRpc(chain);
  if (!rpc) throw new Error(`rpc not configured: ${chain}`);

  const tokenInE = getUniswapToken(chain, fromCoin);
  const tokenOutE = getUniswapToken(chain, toCoin);
  if (tokenInE.address == tokenOutE.address) {
    throw new Error("sell coin and buy coin are the same");
  }

  const amountIn = getUniswapAmountIn({ chain, fromCoin, amount });
  const approveAmount = getApprovalAmount({
    chain,
    fromCoin,
    approvalAmount,
    amountIn,
  });

  const provider = new ethers.JsonRpcProvider(rpc);
  try {
    const wallet = getWallet(privateKey, provider);
    assertWalletMatches(wallet, walletAddress);

    const uniswapE = uniswapV3M[chain];
    const quote = await getBestUniswapQuote({
      chain,
      provider,
      tokenIn: tokenInE.address,
      tokenOut: tokenOutE.address,
      amountIn,
    });
    const amountOutMinimum =
      (quote.amountOut * (10000n - defaultSlippageBps)) / 10000n;
    const txs = [];

    if (!tokenInE.native) {
      const token = new ethers.Contract(tokenInE.address, erc20Abi, wallet);
      txs.push(
        ...(await approveExactIfNeeded({
          chain,
          token,
          owner: wallet.address,
          spender: uniswapE.router,
          amount: amountIn,
          approvalAmount: approveAmount,
        })),
      );
    }

    const router = new ethers.Contract(uniswapE.router, uniswapRouterAbi, wallet);
    const swapParams = {
      tokenIn: tokenInE.address,
      tokenOut: tokenOutE.address,
      fee: quote.fee,
      recipient: tokenOutE.native ? uniswapE.router : wallet.address,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0,
    };
    const txOverrides = tokenInE.native ? { value: amountIn } : {};
    const swapTx = tokenOutE.native
      ? await router.multicall(
          [
            router.interface.encodeFunctionData("exactInputSingle", [
              swapParams,
            ]),
            router.interface.encodeFunctionData("unwrapWETH9", [
              amountOutMinimum,
              wallet.address,
            ]),
          ],
          txOverrides,
        )
      : await router.exactInputSingle(swapParams, txOverrides);
    const receipt = await swapTx.wait();
    txs.push({
      chain,
      type: "swap",
      hash: swapTx.hash,
      blockNumber: receipt?.blockNumber ?? null,
    });

    return {
      ok: true,
      dex: "Uniswap",
      chain,
      txs,
      quote: {
        fee: quote.fee,
        amountIn: amountIn.toString(),
        amountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        slippageBps: Number(defaultSlippageBps),
      },
    };
  } finally {
    provider.destroy?.();
  }
}
