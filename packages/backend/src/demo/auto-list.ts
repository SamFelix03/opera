/**
 * Auto-list LORs held by an address when score drops / freeze detected.
 */
import type Database from "better-sqlite3";
import { parseUnits, type Hex } from "viem";
import { createChainCtx, findLorsByHolder, lorAbi, waitTx, write } from "./chain.js";
import { insertNotification } from "./state.js";

export async function maybeAutoListForAddress(
  db: Database.Database,
  holder: Hex,
  listPrice = parseUnits("500", 6),
): Promise<{ listed: bigint[]; txs: Hex[] }> {
  const ctx = createChainCtx();
  const lors = await findLorsByHolder(ctx, holder);
  const listed: bigint[] = [];
  const txs: Hex[] = [];

  for (const lorId of lors) {
    const before = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "lors",
      args: [lorId],
    });
    if (before[4]) continue; // already auto-listed

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
    // Contract silently no-ops when score >= threshold — only count real listings
    if (!after[4]) continue;

    listed.push(lorId);
    txs.push(hash);

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
