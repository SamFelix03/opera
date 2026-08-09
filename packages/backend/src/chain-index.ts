/**
 * SQLite index for mandates / LORs — list APIs read here, not live Multicall.
 */
import type Database from "better-sqlite3";
import { keccak256, toBytes, zeroAddress } from "viem";
import { createChainCtx, lorAbi, manAbi } from "./demo/chain.js";

export type IndexedMandate = {
  mandateId: number;
  assetId: number;
  scope: string;
  minScore: number;
  jurisdictionRoot: string;
  stakeAmount: string;
  maxSpendPerTx: string;
  publisher: string;
  winner: string;
  open: boolean;
  awarded: boolean;
  txHash?: string | null;
  blockNumber?: number | null;
};

export type IndexedLor = {
  lorId: number;
  assetId: number;
  holder: string;
  scope: string;
  price: string;
  autoListed: boolean;
  active: boolean;
  minScoreToHold: number;
  txHash?: string | null;
  blockNumber?: number | null;
};

export type IndexedBid = {
  mandateId: number;
  bidIndex: number;
  bidder: string;
  stake: string;
  active: boolean;
};

export function scopeLabel(scope: string): string {
  const known: Record<string, string> = {
    [keccak256(toBytes("energy-revenue")).toLowerCase()]: "energy-revenue",
    [keccak256(toBytes("maintenance")).toLowerCase()]: "maintenance",
  };
  return known[scope.toLowerCase()] ?? scope;
}

export function ensureChainIndexTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexed_mandates (
      mandate_id INTEGER PRIMARY KEY,
      asset_id INTEGER NOT NULL,
      scope TEXT NOT NULL,
      min_score INTEGER NOT NULL,
      jurisdiction_root TEXT NOT NULL,
      stake_amount TEXT NOT NULL,
      max_spend_per_tx TEXT NOT NULL,
      publisher TEXT NOT NULL,
      winner TEXT NOT NULL DEFAULT '${zeroAddress}',
      open INTEGER NOT NULL DEFAULT 1,
      awarded INTEGER NOT NULL DEFAULT 0,
      tx_hash TEXT,
      block_number INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mandates_publisher ON indexed_mandates(publisher);
    CREATE INDEX IF NOT EXISTS idx_mandates_open ON indexed_mandates(open, awarded);

    CREATE TABLE IF NOT EXISTS indexed_lors (
      lor_id INTEGER PRIMARY KEY,
      asset_id INTEGER NOT NULL,
      holder TEXT NOT NULL,
      scope TEXT NOT NULL,
      price TEXT NOT NULL DEFAULT '0',
      auto_listed INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      min_score_to_hold INTEGER NOT NULL DEFAULT 0,
      tx_hash TEXT,
      block_number INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lors_holder ON indexed_lors(holder);
    CREATE INDEX IF NOT EXISTS idx_lors_listed ON indexed_lors(auto_listed, active);

    CREATE TABLE IF NOT EXISTS indexed_mandate_bids (
      mandate_id INTEGER NOT NULL,
      bid_index INTEGER NOT NULL,
      bidder TEXT NOT NULL,
      stake TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (mandate_id, bid_index)
    );
    CREATE INDEX IF NOT EXISTS idx_bids_mandate ON indexed_mandate_bids(mandate_id);

    CREATE TABLE IF NOT EXISTS chain_sync_cursor (
      key TEXT PRIMARY KEY,
      last_block INTEGER NOT NULL
    );
  `);
}

export function getSyncCursor(db: Database.Database, key: string): number | null {
  const row = db
    .prepare(`SELECT last_block as lastBlock FROM chain_sync_cursor WHERE key = ?`)
    .get(key) as { lastBlock: number } | undefined;
  return row?.lastBlock ?? null;
}

export function setSyncCursor(db: Database.Database, key: string, lastBlock: number): void {
  db.prepare(
    `INSERT INTO chain_sync_cursor (key, last_block) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET last_block = excluded.last_block`,
  ).run(key, lastBlock);
}

export function mandateCount(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM indexed_mandates`).get() as { c: number };
  return row.c;
}

export function lorCount(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM indexed_lors`).get() as { c: number };
  return row.c;
}

export function upsertMandate(db: Database.Database, m: IndexedMandate): void {
  db.prepare(
    `INSERT INTO indexed_mandates (
      mandate_id, asset_id, scope, min_score, jurisdiction_root,
      stake_amount, max_spend_per_tx, publisher, winner, open, awarded,
      tx_hash, block_number, updated_at
    ) VALUES (
      @mandateId, @assetId, @scope, @minScore, @jurisdictionRoot,
      @stakeAmount, @maxSpendPerTx, @publisher, @winner, @open, @awarded,
      @txHash, @blockNumber, datetime('now')
    )
    ON CONFLICT(mandate_id) DO UPDATE SET
      asset_id = excluded.asset_id,
      scope = excluded.scope,
      min_score = excluded.min_score,
      jurisdiction_root = excluded.jurisdiction_root,
      stake_amount = excluded.stake_amount,
      max_spend_per_tx = excluded.max_spend_per_tx,
      publisher = excluded.publisher,
      winner = excluded.winner,
      open = excluded.open,
      awarded = excluded.awarded,
      tx_hash = COALESCE(excluded.tx_hash, indexed_mandates.tx_hash),
      block_number = COALESCE(excluded.block_number, indexed_mandates.block_number),
      updated_at = datetime('now')`,
  ).run({
    mandateId: m.mandateId,
    assetId: m.assetId,
    scope: m.scope,
    minScore: m.minScore,
    jurisdictionRoot: m.jurisdictionRoot,
    stakeAmount: m.stakeAmount,
    maxSpendPerTx: m.maxSpendPerTx,
    publisher: m.publisher,
    winner: m.winner || zeroAddress,
    open: m.open ? 1 : 0,
    awarded: m.awarded ? 1 : 0,
    txHash: m.txHash ?? null,
    blockNumber: m.blockNumber ?? null,
  });
}

export function upsertLor(db: Database.Database, l: IndexedLor): void {
  db.prepare(
    `INSERT INTO indexed_lors (
      lor_id, asset_id, holder, scope, price, auto_listed, active,
      min_score_to_hold, tx_hash, block_number, updated_at
    ) VALUES (
      @lorId, @assetId, @holder, @scope, @price, @autoListed, @active,
      @minScoreToHold, @txHash, @blockNumber, datetime('now')
    )
    ON CONFLICT(lor_id) DO UPDATE SET
      asset_id = excluded.asset_id,
      holder = excluded.holder,
      scope = excluded.scope,
      price = excluded.price,
      auto_listed = excluded.auto_listed,
      active = excluded.active,
      min_score_to_hold = excluded.min_score_to_hold,
      tx_hash = COALESCE(excluded.tx_hash, indexed_lors.tx_hash),
      block_number = COALESCE(excluded.block_number, indexed_lors.block_number),
      updated_at = datetime('now')`,
  ).run({
    lorId: l.lorId,
    assetId: l.assetId,
    holder: l.holder,
    scope: l.scope,
    price: l.price,
    autoListed: l.autoListed ? 1 : 0,
    active: l.active ? 1 : 0,
    minScoreToHold: l.minScoreToHold,
    txHash: l.txHash ?? null,
    blockNumber: l.blockNumber ?? null,
  });
}

export function upsertBid(db: Database.Database, b: IndexedBid): void {
  db.prepare(
    `INSERT INTO indexed_mandate_bids (mandate_id, bid_index, bidder, stake, active)
     VALUES (@mandateId, @bidIndex, @bidder, @stake, @active)
     ON CONFLICT(mandate_id, bid_index) DO UPDATE SET
       bidder = excluded.bidder,
       stake = excluded.stake,
       active = excluded.active`,
  ).run({
    mandateId: b.mandateId,
    bidIndex: b.bidIndex,
    bidder: b.bidder,
    stake: b.stake,
    active: b.active ? 1 : 0,
  });
}

export function markMandateAwarded(
  db: Database.Database,
  mandateId: number,
  winner: string,
): void {
  db.prepare(
    `UPDATE indexed_mandates
     SET winner = ?, open = 0, awarded = 1, updated_at = datetime('now')
     WHERE mandate_id = ?`,
  ).run(winner, mandateId);
  // Losing bids become inactive once awarded (mirror on-chain award loop).
  db.prepare(
    `UPDATE indexed_mandate_bids
     SET active = 0
     WHERE mandate_id = ? AND lower(bidder) != lower(?)`,
  ).run(mandateId, winner);
}

export function appendBidFromEvent(
  db: Database.Database,
  mandateId: number,
  bidder: string,
  stake: string,
): void {
  const existing = db
    .prepare(
      `SELECT bid_index as bidIndex FROM indexed_mandate_bids
       WHERE mandate_id = ? AND lower(bidder) = lower(?)
       LIMIT 1`,
    )
    .get(mandateId, bidder) as { bidIndex: number } | undefined;
  if (existing) {
    upsertBid(db, {
      mandateId,
      bidIndex: existing.bidIndex,
      bidder,
      stake,
      active: true,
    });
    return;
  }
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(bid_index), -1) as maxIdx FROM indexed_mandate_bids WHERE mandate_id = ?`,
    )
    .get(mandateId) as { maxIdx: number };
  upsertBid(db, {
    mandateId,
    bidIndex: row.maxIdx + 1,
    bidder,
    stake,
    active: true,
  });
}

export function mandateToApi(row: Record<string, unknown>) {
  const scopeRaw = String(row.scope);
  return {
    mandateId: String(row.mandate_id),
    assetId: String(row.asset_id),
    scope: scopeLabel(scopeRaw),
    scopeRaw,
    minScore: String(row.min_score),
    jurisdictionRoot: String(row.jurisdiction_root),
    stakeAmount: String(row.stake_amount),
    maxSpendPerTx: String(row.max_spend_per_tx),
    publisher: String(row.publisher),
    winner: String(row.winner),
    open: Boolean(row.open),
    awarded: Boolean(row.awarded),
  };
}

export function lorToApi(row: Record<string, unknown>) {
  const scopeRaw = String(row.scope);
  return {
    lorId: String(row.lor_id),
    assetId: String(row.asset_id),
    holder: String(row.holder),
    scope: scopeLabel(scopeRaw),
    scopeRaw,
    price: String(row.price),
    autoListed: Boolean(row.auto_listed),
    active: Boolean(row.active),
    minScoreToHold: String(row.min_score_to_hold),
  };
}

export function listIndexedMandates(
  db: Database.Database,
  opts: { openOnly?: boolean; publisher?: string | null; limit?: number },
): { mandates: ReturnType<typeof mandateToApi>[]; nextMandateId: string } {
  const limit = Math.min(opts.limit ?? 50, 200);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.openOnly) {
    clauses.push(`open = 1 AND awarded = 0`);
  }
  if (opts.publisher) {
    clauses.push(`lower(publisher) = lower(?)`);
    params.push(opts.publisher);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT * FROM indexed_mandates ${where}
       ORDER BY mandate_id DESC LIMIT ?`,
    )
    .all(...params, limit) as Record<string, unknown>[];

  const maxRow = db
    .prepare(`SELECT MAX(mandate_id) as m FROM indexed_mandates`)
    .get() as { m: number | null };
  const next = (maxRow.m ?? 0) + 1;

  return {
    nextMandateId: String(next),
    mandates: rows.map(mandateToApi),
  };
}

export function listIndexedLors(
  db: Database.Database,
  opts: { listedOnly?: boolean; holder?: string | null; limit?: number },
): { lors: ReturnType<typeof lorToApi>[]; nextId: string } {
  const limit = Math.min(opts.limit ?? 50, 200);
  const clauses: string[] = [`active = 1`];
  const params: unknown[] = [];
  if (opts.listedOnly) {
    clauses.push(`auto_listed = 1`);
  }
  if (opts.holder) {
    clauses.push(`lower(holder) = lower(?)`);
    params.push(opts.holder);
  }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const rows = db
    .prepare(
      `SELECT * FROM indexed_lors ${where}
       ORDER BY lor_id DESC LIMIT ?`,
    )
    .all(...params, limit) as Record<string, unknown>[];

  const maxRow = db
    .prepare(`SELECT MAX(lor_id) as m FROM indexed_lors`)
    .get() as { m: number | null };
  const next = (maxRow.m ?? 0) + 1;

  return {
    nextId: String(next),
    lors: rows.map(lorToApi),
  };
}

export function listIndexedBids(db: Database.Database, mandateId: number) {
  const rows = db
    .prepare(
      `SELECT bid_index as "index", bidder, stake, active
       FROM indexed_mandate_bids
       WHERE mandate_id = ? AND active = 1
       ORDER BY bid_index ASC`,
    )
    .all(mandateId) as { index: number; bidder: string; stake: string; active: number }[];
  return rows.map((r) => ({
    index: r.index,
    bidder: r.bidder,
    stake: r.stake,
    active: Boolean(r.active),
  }));
}

export async function hydrateMandateFromChain(
  db: Database.Database,
  mandateId: number,
  meta?: { txHash?: string; blockNumber?: number },
): Promise<IndexedMandate | null> {
  const ctx = createChainCtx();
  try {
    const m = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "mandates",
      args: [BigInt(mandateId)],
    });
    const [
      assetId,
      scope,
      minScore,
      jurisdictionRoot,
      stakeAmount,
      maxSpendPerTx,
      publisher,
      winner,
      open,
      awarded,
    ] = m;
    // Uninitialized slot
    if (assetId === 0n && publisher === zeroAddress) return null;
    const row: IndexedMandate = {
      mandateId,
      assetId: Number(assetId),
      scope: scope as string,
      minScore: Number(minScore),
      jurisdictionRoot: jurisdictionRoot as string,
      stakeAmount: stakeAmount.toString(),
      maxSpendPerTx: maxSpendPerTx.toString(),
      publisher: publisher as string,
      winner: (winner as string) || zeroAddress,
      open,
      awarded,
      txHash: meta?.txHash ?? null,
      blockNumber: meta?.blockNumber ?? null,
    };
    upsertMandate(db, row);
    return row;
  } catch {
    return null;
  }
}

export async function hydrateLorFromChain(
  db: Database.Database,
  lorId: number,
  meta?: { txHash?: string; blockNumber?: number },
): Promise<IndexedLor | null> {
  const ctx = createChainCtx();
  try {
    const [row, minScore] = await Promise.all([
      ctx.publicClient.readContract({
        address: ctx.deployment.contracts.LORRegistry,
        abi: lorAbi,
        functionName: "lors",
        args: [BigInt(lorId)],
      }),
      ctx.publicClient.readContract({
        address: ctx.deployment.contracts.LORRegistry,
        abi: lorAbi,
        functionName: "minScoreToHold",
        args: [BigInt(lorId)],
      }),
    ]);
    const [assetId, holder, scope, price, autoListed, active] = row;
    if (assetId === 0n && holder === zeroAddress) return null;
    const indexed: IndexedLor = {
      lorId,
      assetId: Number(assetId),
      holder: holder as string,
      scope: scope as string,
      price: price.toString(),
      autoListed,
      active,
      minScoreToHold: Number(minScore),
      txHash: meta?.txHash ?? null,
      blockNumber: meta?.blockNumber ?? null,
    };
    upsertLor(db, indexed);
    return indexed;
  } catch {
    return null;
  }
}

/** One-shot bid scan for a mandate (fallback when sync hasn't seen BidPosted yet). */
export async function hydrateBidsFromChain(
  db: Database.Database,
  mandateId: number,
): Promise<number> {
  const ctx = createChainCtx();
  let written = 0;
  for (let i = 0; i < 64; i++) {
    try {
      const row = await ctx.publicClient.readContract({
        address: ctx.deployment.contracts.MandateRegistry,
        abi: manAbi,
        functionName: "bids",
        args: [BigInt(mandateId), BigInt(i)],
      });
      const [bidder, stake, active] = row;
      if (bidder === zeroAddress && stake === 0n) break;
      upsertBid(db, {
        mandateId,
        bidIndex: i,
        bidder: bidder as string,
        stake: stake.toString(),
        active,
      });
      written++;
    } catch {
      break;
    }
  }
  return written;
}
export async function bootstrapMandatesFromChain(
  db: Database.Database,
  maxIds = 200,
): Promise<number> {
  const ctx = createChainCtx();
  const registry = ctx.deployment.contracts.MandateRegistry;
  const next = await ctx.publicClient.readContract({
    address: registry,
    abi: manAbi,
    functionName: "nextMandateId",
  });
  const ids: bigint[] = [];
  for (let id = next > 1n ? next - 1n : 0n; id >= 1n && ids.length < maxIds; id--) {
    ids.push(id);
  }
  if (!ids.length) return 0;

  let written = 0;
  const BATCH = 40;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const rows = await ctx.publicClient.multicall({
      allowFailure: true,
      contracts: batch.map((id) => ({
        address: registry,
        abi: manAbi,
        functionName: "mandates" as const,
        args: [id] as const,
      })),
    });
    for (let j = 0; j < batch.length; j++) {
      const r = rows[j];
      if (r?.status !== "success" || !r.result) continue;
      const m = r.result;
      const [
        assetId,
        scope,
        minScore,
        jurisdictionRoot,
        stakeAmount,
        maxSpendPerTx,
        publisher,
        winner,
        open,
        awarded,
      ] = m;
      if (assetId === 0n && publisher === zeroAddress) continue;
      upsertMandate(db, {
        mandateId: Number(batch[j]),
        assetId: Number(assetId),
        scope: scope as string,
        minScore: Number(minScore),
        jurisdictionRoot: jurisdictionRoot as string,
        stakeAmount: stakeAmount.toString(),
        maxSpendPerTx: maxSpendPerTx.toString(),
        publisher: publisher as string,
        winner: (winner as string) || zeroAddress,
        open,
        awarded,
      });
      written++;
    }
  }
  return written;
}

export async function bootstrapLorsFromChain(
  db: Database.Database,
  maxIds = 200,
): Promise<number> {
  const ctx = createChainCtx();
  const registry = ctx.deployment.contracts.LORRegistry;
  const next = await ctx.publicClient.readContract({
    address: registry,
    abi: lorAbi,
    functionName: "nextId",
  });
  const ids: bigint[] = [];
  for (let id = next > 1n ? next - 1n : 0n; id >= 1n && ids.length < maxIds; id--) {
    ids.push(id);
  }
  if (!ids.length) return 0;

  let written = 0;
  const BATCH = 40;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const [rows, scores] = await Promise.all([
      ctx.publicClient.multicall({
        allowFailure: true,
        contracts: batch.map((id) => ({
          address: registry,
          abi: lorAbi,
          functionName: "lors" as const,
          args: [id] as const,
        })),
      }),
      ctx.publicClient.multicall({
        allowFailure: true,
        contracts: batch.map((id) => ({
          address: registry,
          abi: lorAbi,
          functionName: "minScoreToHold" as const,
          args: [id] as const,
        })),
      }),
    ]);
    for (let j = 0; j < batch.length; j++) {
      const r = rows[j];
      if (r?.status !== "success" || !r.result) continue;
      const [assetId, holder, scope, price, autoListed, active] = r.result;
      if (assetId === 0n && holder === zeroAddress) continue;
      const minScore =
        scores[j]?.status === "success" ? Number(scores[j]!.result as bigint) : 0;
      upsertLor(db, {
        lorId: Number(batch[j]),
        assetId: Number(assetId),
        holder: holder as string,
        scope: scope as string,
        price: price.toString(),
        autoListed,
        active,
        minScoreToHold: minScore,
      });
      written++;
    }
  }
  return written;
}
