"use server";

import { ethers } from "ethers";
import {
  tronEnergyStakeCoin,
  tronEnergyStakeCoinE,
} from "@/data/coins/tron";
import { getTronStakeV2State } from "@/fn/tronStake";
import {
  executeTronTx,
  getTronAddress,
  getTronPrivateKey,
  runTronRpc,
} from "../../sharedServer";

const tronStakeResource = "ENERGY";
const minimumStakeRaw = 1_000_000n;
const defaultUnfreezeDelayDays = 14;
const defaultMaxUnfreezeOperations = 32;

function getRawAmount(value = "0", label = "amount") {
  let raw;
  try {
    raw = ethers.parseUnits(String(value || "0"), tronEnergyStakeCoinE.decimals);
  } catch {
    throw new Error(`${label} invalid`);
  }
  if (raw < 0n) throw new Error(`${label} cannot be negative`);

  return raw;
}

function getTronBuilderAmount(raw = 0n) {
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("TRX staking amount is too large for TronWeb");
  }

  return Number(raw);
}

function getResultValue(result, key, fallback = 0) {
  if (result?.status != "fulfilled") return fallback;
  return result.value?.[key] ?? fallback;
}

function getUnfreezeDelayDays(result) {
  if (result?.status != "fulfilled" || !Array.isArray(result.value)) {
    return defaultUnfreezeDelayDays;
  }

  const value = Number(
    result.value.find((entry) => entry?.key == "getUnfreezeDelayDays")?.value,
  );
  return value > 0 ? value : defaultUnfreezeDelayDays;
}

export async function getTronStakingState({
  walletAddress = "",
} = {}) {
  const owner = getTronAddress(walletAddress, "Tron wallet address");

  return runTronRpc({
    scope: "TRX Staking status",
    action: async (tronWeb) => {
      const account = await tronWeb.trx.getAccount(owner);
      const stakeState = getTronStakeV2State(account);
      const [availableResult, withdrawableResult, chainParametersResult] =
        await Promise.allSettled([
          tronWeb.trx.getAvailableUnfreezeCount(owner, { confirmed: false }),
          tronWeb.trx.getCanWithdrawUnfreezeAmount(owner, Date.now(), {
            confirmed: false,
          }),
          tronWeb.trx.getChainParameters(),
        ]);
      const availableUnfreezeCount = Number(
        getResultValue(
          availableResult,
          "count",
          Math.max(
            0,
            defaultMaxUnfreezeOperations -
              stakeState.allUnfreezeEntries.length,
          ),
        ),
      );
      const apiWithdrawableRaw = BigInt(
        String(getResultValue(withdrawableResult, "amount", 0)),
      );
      const withdrawableRaw =
        apiWithdrawableRaw > stakeState.withdrawableRaw
          ? apiWithdrawableRaw
          : stakeState.withdrawableRaw;
      const unfreezeDelayDays = getUnfreezeDelayDays(chainParametersResult);

      return {
        resource: tronStakeResource,
        freeBalanceRaw: String(account?.balance || 0),
        energyStakeRaw: stakeState.energyStakeRaw.toString(),
        energyStakeFormatted: ethers.formatUnits(
          stakeState.energyStakeRaw,
          tronEnergyStakeCoinE.decimals,
        ),
        pendingEnergyRaw: stakeState.pendingEnergyRaw.toString(),
        pendingEnergyFormatted: ethers.formatUnits(
          stakeState.pendingEnergyRaw,
          tronEnergyStakeCoinE.decimals,
        ),
        withdrawableRaw: withdrawableRaw.toString(),
        withdrawableFormatted: ethers.formatUnits(
          withdrawableRaw,
          tronEnergyStakeCoinE.decimals,
        ),
        nextEnergyClaimAt: stakeState.nextEnergyClaimAt,
        availableUnfreezeCount: Number.isFinite(availableUnfreezeCount)
          ? Math.max(0, availableUnfreezeCount)
          : 0,
        maxUnfreezeOperations: defaultMaxUnfreezeOperations,
        unfreezeDelayDays,
        pendingEntries: stakeState.allUnfreezeEntries.map((entry) => ({
          resource: entry.resource,
          amount: ethers.formatUnits(
            entry.amountRaw,
            tronEnergyStakeCoinE.decimals,
          ),
          amountRaw: entry.amountRaw.toString(),
          expireTime: entry.expireTime,
          withdrawable:
            entry.expireTime > 0 && entry.expireTime <= Date.now(),
        })),
      };
    },
  });
}

export async function getTronStakingLendPreview({
  walletAddress = "",
  chain = "",
  underlyingCoin = "",
  lendCoin = "",
  amount = "0",
} = {}) {
  if (chain != "Tron") throw new Error(`TRX Staking chain unsupported: ${chain}`);
  if (underlyingCoin != "TRX" || lendCoin != tronEnergyStakeCoin) {
    throw new Error("TRX Staking market invalid");
  }

  const state = await getTronStakingState({ walletAddress });
  const amountIn = getRawAmount(amount);

  return {
    ok: true,
    defi: "TRX Staking",
    chain,
    underlyingCoin,
    lendCoin,
    amountIn: amountIn.toString(),
    receiptPerUnderlying: 1,
    approvalNeeded: false,
    approvalAmountNeeded: false,
    staking: state,
  };
}

export async function buildTronStakingLendTxs({
  walletAddress = "",
  chain = "",
  action = "lend",
  underlyingCoin = "",
  lendCoin = "",
  amount = "0",
} = {}) {
  const preview = await getTronStakingLendPreview({
    walletAddress,
    chain,
    underlyingCoin,
    lendCoin,
    amount,
  });
  const owner = getTronAddress(walletAddress, "Tron wallet address");
  const amountIn = BigInt(preview.amountIn);
  const state = preview.staking;
  const normalizedAction = action == "withdraw" ? "claim" : action;

  if (!["lend", "redeem", "claim"].includes(normalizedAction)) {
    throw new Error(`TRX Staking action unsupported: ${action}`);
  }
  if (normalizedAction == "lend") {
    if (amountIn < minimumStakeRaw) {
      throw new Error("TRX Stake 2.0 minimum is 1 TRX");
    }
    if (amountIn > BigInt(state.freeBalanceRaw)) {
      throw new Error("stake qty exceeds TRX balance");
    }
  }
  if (normalizedAction == "redeem") {
    if (amountIn <= 0n) throw new Error("unstake qty is 0");
    if (amountIn > BigInt(state.energyStakeRaw)) {
      throw new Error("unstake qty exceeds TRX Energy stake");
    }
    if (state.availableUnfreezeCount <= 0) {
      throw new Error("no TRON unstaking slots available");
    }
  }
  if (normalizedAction == "claim" && BigInt(state.withdrawableRaw) <= 0n) {
    throw new Error("no unstaked TRX available to claim");
  }

  const transaction = await runTronRpc({
    scope: `TRX Staking ${normalizedAction}`,
    action: (tronWeb) => {
      if (normalizedAction == "lend") {
        return tronWeb.transactionBuilder.freezeBalanceV2(
          getTronBuilderAmount(amountIn),
          tronStakeResource,
          owner,
        );
      }
      if (normalizedAction == "redeem") {
        return tronWeb.transactionBuilder.unfreezeBalanceV2(
          getTronBuilderAmount(amountIn),
          tronStakeResource,
          owner,
        );
      }

      return tronWeb.transactionBuilder.withdrawExpireUnfreeze(owner);
    },
  });
  const type =
    normalizedAction == "lend"
      ? "stake"
      : normalizedAction == "redeem"
        ? "unstake"
        : "claim";

  return {
    ...preview,
    action: type,
    txs: [
      {
        chain: "Tron",
        type,
        format: "tron:transaction",
        transaction,
        refreshBlockRef: true,
      },
    ],
  };
}

export async function executeTronStakingLend({
  walletName = "",
  walletAddress = "",
  ...params
} = {}) {
  const privateKey = getTronPrivateKey(walletName);
  if (!privateKey) {
    throw new Error(
      `private key missing: pk_tron_raw_${walletName} or pk_tron_${walletName}`,
    );
  }

  const built = await buildTronStakingLendTxs({
    walletAddress,
    ...params,
  });
  const txs = [];

  for (const tx of built.txs) {
    txs.push(
      await executeTronTx({
        privateKey,
        expectedAddress: walletAddress,
        tx,
      }),
    );
  }

  return { ...built, txs };
}
