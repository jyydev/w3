function toRaw(value) {
  try {
    return BigInt(String(value ?? 0));
  } catch {
    return 0n;
  }
}

function isEnergyResource(value) {
  const resource = String(value ?? "BANDWIDTH").toUpperCase();
  return resource == "ENERGY" || resource == "1";
}

export function getTronStakeV2State(account = {}, nowMs = Date.now()) {
  const energyStakeRaw = (Array.isArray(account?.frozenV2)
    ? account.frozenV2
    : []
  )
    .filter((entry) => isEnergyResource(entry?.type))
    .reduce((sum, entry) => sum + toRaw(entry?.amount), 0n);
  const allUnfreezeEntries = (Array.isArray(account?.unfrozenV2)
    ? account.unfrozenV2
    : []
  )
    .map((entry) => ({
      resource: isEnergyResource(entry?.type) ? "ENERGY" : "BANDWIDTH",
      amountRaw: toRaw(entry?.unfreeze_amount),
      expireTime: Number(entry?.unfreeze_expire_time || 0),
    }))
    .filter((entry) => entry.amountRaw > 0n);
  const energyUnfreezeEntries = allUnfreezeEntries.filter(
    (entry) => entry.resource == "ENERGY",
  );
  const withdrawableRaw = allUnfreezeEntries
    .filter((entry) => entry.expireTime > 0 && entry.expireTime <= nowMs)
    .reduce((sum, entry) => sum + entry.amountRaw, 0n);
  const pendingEnergyRaw = energyUnfreezeEntries.reduce(
    (sum, entry) => sum + entry.amountRaw,
    0n,
  );
  const nextEnergyClaimAt =
    energyUnfreezeEntries
      .map((entry) => entry.expireTime)
      .filter((expireTime) => expireTime > nowMs)
      .sort((a, b) => a - b)[0] || 0;

  return {
    energyStakeRaw,
    allUnfreezeEntries,
    energyUnfreezeEntries,
    pendingEnergyRaw,
    withdrawableRaw,
    nextEnergyClaimAt,
  };
}
