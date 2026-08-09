/**
 * Shared on-chain write helpers for product routes and demo orchestrator.
 */
import { keccak256, parseUnits, toBytes, type Hex } from "viem";
import { scoreAbi, lorAbi, oracleAbi, write, waitTx, type ChainCtx } from "../demo/chain.js";

export async function setScore(
  ctx: ChainCtx,
  addr: Hex,
  score: number,
  tag: string,
): Promise<Hex> {
  const hash = await write(ctx.scoreWriterWallet, {
    address: ctx.deployment.contracts.ScoreStore,
    abi: scoreAbi,
    functionName: "setScore",
    args: [addr, BigInt(score), keccak256(toBytes(`${tag}-${score}`))],
  });
  await waitTx(ctx, hash);
  return hash;
}

export async function mintLOR(
  ctx: ChainCtx,
  assetId: bigint,
  holder: Hex,
  scope: Hex,
  minScore: bigint,
): Promise<{ lorId: bigint; tx: Hex }> {
  const nextBefore = await ctx.publicClient.readContract({
    address: ctx.deployment.contracts.LORRegistry,
    abi: lorAbi,
    functionName: "nextId",
  });
  const hash = await write(ctx.deployerWallet, {
    address: ctx.deployment.contracts.LORRegistry,
    abi: lorAbi,
    functionName: "mintLOR",
    args: [assetId, holder, scope, minScore],
  });
  await waitTx(ctx, hash);
  return { lorId: nextBefore, tx: hash };
}

export async function autoListLOR(
  ctx: ChainCtx,
  lorId: bigint,
  listPrice: bigint,
): Promise<Hex> {
  // Explicit UI/cast listing must actually list. maybeAutoList is a silent no-op when
  // score >= threshold, which made portfolio "Auto-list" look successful while Market stayed empty.
  const hash = await write(ctx.deployerWallet, {
    address: ctx.deployment.contracts.LORRegistry,
    abi: lorAbi,
    functionName: "setAutoListed",
    args: [lorId, listPrice],
  });
  await waitTx(ctx, hash);
  const row = await ctx.publicClient.readContract({
    address: ctx.deployment.contracts.LORRegistry,
    abi: lorAbi,
    functionName: "lors",
    args: [lorId],
  });
  if (!row[4]) {
    throw new Error(`LOR #${lorId} still not auto-listed after setAutoListed`);
  }
  return hash;
}

export async function recordOraclePrice(
  ctx: ChainCtx,
  category: Hex,
  price: bigint,
): Promise<Hex> {
  const hash = await write(ctx.deployerWallet, {
    address: ctx.deployment.contracts.RightsPriceOracle,
    abi: oracleAbi,
    functionName: "recordPrice",
    args: [category, price],
  });
  await waitTx(ctx, hash);
  return hash;
}
