const tronTransactionLifetimeMs = 5 * 60_000;

export function getUnsignedTronTransaction(transaction) {
  if (!transaction || typeof transaction != "object") return transaction;

  const unsigned = { ...transaction };
  delete unsigned.signature;
  return unsigned;
}

export async function refreshTronTransaction(tronWeb, transaction) {
  if (!tronWeb || !transaction?.raw_data) {
    throw new Error("Tron transaction missing");
  }

  const refBlock = tronWeb.trx.getCurrentRefBlockParams
    ? await tronWeb.trx.getCurrentRefBlockParams()
    : await getTronRefBlock(tronWeb);
  const timestamp = Number(
    refBlock.timestamp || transaction.raw_data.timestamp || Date.now(),
  );
  const expiration = Math.max(
    Number(refBlock.expiration || 0),
    timestamp + tronTransactionLifetimeMs,
  );

  const refreshed = await tronWeb.transactionBuilder.newTxID(
    {
      ...getUnsignedTronTransaction(transaction),
      raw_data: {
        ...transaction.raw_data,
        ...refBlock,
        expiration,
      },
    },
    { txLocal: true },
  );

  return getUnsignedTronTransaction(refreshed);
}

async function getTronRefBlock(tronWeb) {
  const block = await tronWeb.trx.getCurrentBlock();
  const blockHeader = block?.block_header?.raw_data;
  const blockId = String(block?.blockID || "");
  if (!blockHeader || !blockId) throw new Error("Tron block unavailable");

  return {
    ref_block_bytes: Number(blockHeader.number)
      .toString(16)
      .slice(-4)
      .padStart(4, "0"),
    ref_block_hash: blockId.slice(16, 32),
    expiration: Number(blockHeader.timestamp) + tronTransactionLifetimeMs,
    timestamp: Number(blockHeader.timestamp),
  };
}
