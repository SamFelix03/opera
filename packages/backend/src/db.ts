import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureChainIndexTables } from "./chain-index.js";

export type AuditEvent = {
  id?: number;
  kind: string;
  txType?: string | null;
  requestId?: string | null;
  payload: string;
  createdAt?: string;
};

export function openAuditDb(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      tx_type TEXT,
      request_id TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_audit_webhook
      ON audit_events(tx_type, request_id)
      WHERE tx_type IS NOT NULL AND request_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS sessions (
      address TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scores (
      address TEXT PRIMARY KEY,
      score INTEGER NOT NULL,
      tenure INTEGER NOT NULL,
      clean_rate INTEGER NOT NULL,
      tr_complete INTEGER NOT NULL,
      frozen INTEGER NOT NULL,
      inputs_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_addr
      ON notifications(address, id DESC);
  `);
  ensureChainIndexTables(db);
  return db;
}

export function insertAuditEvent(
  db: Database.Database,
  event: AuditEvent,
): { inserted: boolean; id?: number } {
  try {
    const info = db
      .prepare(
        `INSERT INTO audit_events (kind, tx_type, request_id, payload)
         VALUES (@kind, @txType, @requestId, @payload)`,
      )
      .run({
        kind: event.kind,
        txType: event.txType ?? null,
        requestId: event.requestId ?? null,
        payload: event.payload,
      });
    return { inserted: true, id: Number(info.lastInsertRowid) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) return { inserted: false };
    throw e;
  }
}

export function listAuditEvents(db: Database.Database, limit = 100) {
  return db
    .prepare(
      `SELECT id, kind, tx_type as txType, request_id as requestId, payload, created_at as createdAt
       FROM audit_events ORDER BY id DESC LIMIT ?`,
    )
    .all(limit);
}
