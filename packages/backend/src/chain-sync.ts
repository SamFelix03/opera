/**
 * Background getLogs sync → SQLite index. Keeps list APIs off the public RPC hot path.
 */
import type Database from "better-sqlite3";
import {
  appendBidFromEvent,
  bootstrapLorsFromChain,
  bootstrapMandatesFromChain,
  ensureChainIndexTables,
  getSyncCursor,
  hydrateLorFromChain,
  hydrateMandateFromChain,
  lorCount,
  mandateCount,
  markMandateAwarded,
  setSyncCursor,
} from "./chain-index.js";
import { createChainCtx, lorAbi, manAbi } from "./demo/chain.js";

const CURSOR_MANDATE = "MandateRegistry";
const CURSOR_LOR = "LORRegistry";
const CHUNK = 4_000n;
const INTERVAL_MS = Number(process.env.CHAIN_SYNC_INTERVAL_MS ?? 12_000);

let running = false;

async function ensureBootstrap(db: Database.Database): Promise<void> {
  if (mandateCount(db) === 0) {
    console.log("[chain-sync] bootstrapping mandates…");
    const n = await bootstrapMandatesFromChain(db, 200);
    console.log(`[chain-sync] bootstrapped ${n} mandates`);
  }
  if (lorCount(db) === 0) {
    console.log("[chain-sync] bootstrapping lors…");
    const n = await bootstrapLorsFromChain(db, 200);
    console.log(`[chain-sync] bootstrapped ${n} lors`);
  }
  const ctx = createChainCtx();
  const tip = await ctx.publicClient.getBlockNumber();
  if (getSyncCursor(db, CURSOR_MANDATE) == null) setSyncCursor(db, CURSOR_MANDATE, Number(tip));
  if (getSyncCursor(db, CURSOR_LOR) == null) setSyncCursor(db, CURSOR_LOR, Number(tip));
}

async function syncMandateLogs(db: Database.Database): Promise<void> {
  const ctx = createChainCtx();
  const tip = await ctx.publicClient.getBlockNumber();
  const cursor = getSyncCursor(db, CURSOR_MANDATE);
  let from = cursor == null ? tip : BigInt(cursor) + 1n;
  if (from > tip) return;

  while (from <= tip) {
    const to = from + CHUNK > tip ? tip : from + CHUNK;
    const logs = await ctx.publicClient.getContractEvents({
      address: ctx.deployment.contracts.MandateRegistry,
      abi: manAbi,
      fromBlock: from,
      toBlock: to,
      strict: false,
    });

    for (const log of logs) {
      const blockNumber = log.blockNumber != null ? Number(log.blockNumber) : undefined;
      const txHash = log.transactionHash;
      if (log.eventName === "MandatePublished" && log.args.mandateId != null) {
        await hydrateMandateFromChain(db, Number(log.args.mandateId), { txHash, blockNumber });
      } else if (
        log.eventName === "BidPosted" &&
        log.args.mandateId != null &&
        log.args.bidder &&
        log.args.stake != null
      ) {
        const mandateId = Number(log.args.mandateId);
        const existing = db
          .prepare(`SELECT 1 FROM indexed_mandates WHERE mandate_id = ?`)
          .get(mandateId);
        if (!existing) await hydrateMandateFromChain(db, mandateId, { txHash, blockNumber });
        appendBidFromEvent(db, mandateId, String(log.args.bidder), log.args.stake.toString());
      } else if (log.eventName === "Awarded" && log.args.mandateId != null && log.args.winner) {
        const mandateId = Number(log.args.mandateId);
        const existing = db
          .prepare(`SELECT 1 FROM indexed_mandates WHERE mandate_id = ?`)
          .get(mandateId);
        if (!existing) await hydrateMandateFromChain(db, mandateId, { txHash, blockNumber });
        markMandateAwarded(db, mandateId, String(log.args.winner));
      }
    }

    setSyncCursor(db, CURSOR_MANDATE, Number(to));
    if (to >= tip) break;
    from = to + 1n;
  }
}

async function syncLorLogs(db: Database.Database): Promise<void> {
  const ctx = createChainCtx();
  const tip = await ctx.publicClient.getBlockNumber();
  const cursor = getSyncCursor(db, CURSOR_LOR);
  let from = cursor == null ? tip : BigInt(cursor) + 1n;
  if (from > tip) return;

  while (from <= tip) {
    const to = from + CHUNK > tip ? tip : from + CHUNK;
    const logs = await ctx.publicClient.getContractEvents({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      fromBlock: from,
      toBlock: to,
      strict: false,
    });

    for (const log of logs) {
      const blockNumber = log.blockNumber != null ? Number(log.blockNumber) : undefined;
      const txHash = log.transactionHash;
      if (log.args && "lorId" in log.args && log.args.lorId != null) {
        await hydrateLorFromChain(db, Number(log.args.lorId), { txHash, blockNumber });
      }
    }

    setSyncCursor(db, CURSOR_LOR, Number(to));
    if (to >= tip) break;
    from = to + 1n;
  }
}

async function tick(db: Database.Database): Promise<void> {
  if (running) return;
  running = true;
  try {
    await ensureBootstrap(db);
    await syncMandateLogs(db);
    await syncLorLogs(db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[chain-sync] tick failed: ${msg}`);
  } finally {
    running = false;
  }
}

export function startChainSync(db: Database.Database): void {
  ensureChainIndexTables(db);
  console.log(`[chain-sync] starting (interval ${INTERVAL_MS}ms)`);
  void tick(db);
  setInterval(() => void tick(db), INTERVAL_MS);
}
