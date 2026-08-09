/**
 * Auto-list LORs held by an address when score drops / freeze detected.
 */
import type Database from "better-sqlite3";
import { parseUnits, type Hex } from "viem";
import { createChainCtx, findLorsByHolder, lorAbi, scoreAbi, waitTx, write } from "./chain.js";
import { hydrateLorFromChain } from "../chain-index.js";
import { insertNotification } from "./state.js";

export async function maybeAutoListForAddress(
  db: Database.Database,
  holder: Hex,
  listPrice = parseUnits("500", 6),
): Promise<{ listed: bigint[]; txs: Hex[] }> {
  const ctx = createChainCtx();
  const threshold = await ctx.publicClient.readContract({
    address: ctx.deployment.contracts.LORRegistry,
    abi: lorAbi,
    functionName: "autoListThreshold",
  });
  const score = await ctx.publicClient.readContract({
    address: ctx.deployment.contracts.ScoreStore,
    abi: scoreAbi,
    functionName: "getScore",
    args: [holder],
  });
  if (score >= threshold) {
    return { listed: [], txs: [] };
  }

  const fromIndex = db
    .prepare(
      `SELECT lor_id as id FROM indexed_lors
       WHERE lower(holder) = lower(?) AND active = 1 AND auto_listed = 0`,
    )
    .all(holder) as { id: number }[];

  let lorIds = fromIndex.map((r) => BigInt(r.id));
  if (lorIds.length === 0) {
    // Fallback scan only when the index has no rows for this holder.
    lorIds = await findLorsByHolder(ctx, holder);
  }

  const listed: bigint[] = [];
  const txs: Hex[] = [];

  for (const lorId of lorIds) {
    const before = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "lors",
      args: [lorId],
    });
    if (before[4]) continue; // already auto-listed
    if ((before[1] as string).toLowerCase() !== holder.toLowerCase()) continue;
    if (!before[5]) continue; // inactive

    const hash = await write(ctx.deployerWallet, {
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "maybeAutoList",
      args: [lorId, listPrice],
    });
    await waitTx(ctx, hash);

    const after = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "lors",
      args: [lorId],
    });
    if (!after[4]) continue;

    listed.push(lorId);
    txs.push(hash);
    await hydrateLorFromChain(db, Number(lorId), { txHash: hash });

    const ownerAddr =
      (process.env.DEMO_OWNER_ADDRESS as string | undefined) ??
      ctx.deployer.address;
    insertNotification(db, {
      address: ownerAddr,
      kind: "lor.auto_listed",
      title: "LOR auto-listed on score drop",
      body: `LOR #${lorId} held by ${holder} auto-listed after freeze/score drop.`,
      payload: { lorId: lorId.toString(), holder, tx: hash },
    });
  }

  return { listed, txs };
}
