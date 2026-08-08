/**
 * SQLite persistence for PRD §8 solar-farm demo runs.
 */
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export const DEMO_ROLES = [
  "owner",
  "energyOp",
  "maintOp",
  "replacement",
  "investor",
  "regulator",
] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];

export const DEMO_STEPS = [
  "setupIdentities",
  "setupAsset",
  "fundAndStake",
  "normalOps",
  "sanctionsEvent",
  "replacementAcquire",
  "regulatorExport",
] as const;

export type DemoStepName = (typeof DEMO_STEPS)[number];

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type DemoRoleRow = {
  runId: string;
  role: DemoRole;
  address: string;
  privateKey: string;
  customerId: string | null;
  cvRecordId: string | null;
};

export type DemoRunRow = {
  id: string;
  assetId: number | null;
  energyLorId: number | null;
  maintLorId: number | null;
  energyMandateId: number | null;
  maintMandateId: number | null;
  settlementToken: string | null;
  settlementMode: string | null;
  currentStep: string | null;
  status: string;
  exportPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DemoEventRow = {
  id: number;
  runId: string;
  step: string | null;
  kind: string;
  message: string;
  payload: string;
  createdAt: string;
};

export function ensureDemoTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_runs (
      id TEXT PRIMARY KEY,
      asset_id INTEGER,
      energy_lor_id INTEGER,
      maint_lor_id INTEGER,
      energy_mandate_id INTEGER,
      maint_mandate_id INTEGER,
      settlement_token TEXT,
      settlement_mode TEXT,
      current_step TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      export_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS demo_roles (
      run_id TEXT NOT NULL,
      role TEXT NOT NULL,
      address TEXT NOT NULL,
      private_key TEXT NOT NULL,
      customer_id TEXT,
      cv_record_id TEXT,
      PRIMARY KEY (run_id, role),
      FOREIGN KEY (run_id) REFERENCES demo_runs(id)
    );

    CREATE TABLE IF NOT EXISTS demo_steps (
      run_id TEXT NOT NULL,
      step TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      started_at TEXT,
      finished_at TEXT,
      PRIMARY KEY (run_id, step),
      FOREIGN KEY (run_id) REFERENCES demo_runs(id)
    );

    CREATE TABLE IF NOT EXISTS demo_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      step TEXT,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES demo_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_demo_events_run ON demo_events(run_id, id);

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
}

function mapRun(row: Record<string, unknown>): DemoRunRow {
  return {
    id: String(row.id),
    assetId: row.asset_id == null ? null : Number(row.asset_id),
    energyLorId: row.energy_lor_id == null ? null : Number(row.energy_lor_id),
    maintLorId: row.maint_lor_id == null ? null : Number(row.maint_lor_id),
    energyMandateId:
      row.energy_mandate_id == null ? null : Number(row.energy_mandate_id),
    maintMandateId:
      row.maint_mandate_id == null ? null : Number(row.maint_mandate_id),
    settlementToken: (row.settlement_token as string) ?? null,
    settlementMode: (row.settlement_mode as string) ?? null,
    currentStep: (row.current_step as string) ?? null,
    status: String(row.status),
    exportPath: (row.export_path as string) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function createDemoRun(db: Database.Database): string {
  ensureDemoTables(db);
  const id = randomUUID();
  db.prepare(`INSERT INTO demo_runs (id, status) VALUES (?, 'created')`).run(id);
  for (const step of DEMO_STEPS) {
    db.prepare(
      `INSERT INTO demo_steps (run_id, step, status) VALUES (?, ?, 'pending')`,
    ).run(id, step);
  }
  return id;
}

export function getDemoRun(
  db: Database.Database,
  runId: string,
): DemoRunRow | null {
  ensureDemoTables(db);
  const row = db.prepare(`SELECT * FROM demo_runs WHERE id = ?`).get(runId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRun(row) : null;
}

export function updateDemoRun(
  db: Database.Database,
  runId: string,
  patch: Partial<{
    assetId: number;
    energyLorId: number;
    maintLorId: number;
    energyMandateId: number;
    maintMandateId: number;
    settlementToken: string;
    settlementMode: string;
    currentStep: string;
    status: string;
    exportPath: string;
  }>,
): void {
  const map: Record<string, string> = {
    assetId: "asset_id",
    energyLorId: "energy_lor_id",
    maintLorId: "maint_lor_id",
    energyMandateId: "energy_mandate_id",
    maintMandateId: "maint_mandate_id",
    settlementToken: "settlement_token",
    settlementMode: "settlement_mode",
    currentStep: "current_step",
    status: "status",
    exportPath: "export_path",
  };
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const col = map[k];
    if (!col) continue;
    sets.push(`${col} = ?`);
    params.push(v);
  }
  params.push(runId);
  db.prepare(`UPDATE demo_runs SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function upsertDemoRole(
  db: Database.Database,
  role: DemoRoleRow,
): void {
  ensureDemoTables(db);
  db.prepare(
    `INSERT INTO demo_roles (run_id, role, address, private_key, customer_id, cv_record_id)
     VALUES (@runId, @role, @address, @privateKey, @customerId, @cvRecordId)
     ON CONFLICT(run_id, role) DO UPDATE SET
       address=excluded.address,
       private_key=excluded.private_key,
       customer_id=COALESCE(excluded.customer_id, demo_roles.customer_id),
       cv_record_id=COALESCE(excluded.cv_record_id, demo_roles.cv_record_id)`,
  ).run({
    runId: role.runId,
    role: role.role,
    address: role.address.toLowerCase(),
    privateKey: role.privateKey,
    customerId: role.customerId,
    cvRecordId: role.cvRecordId,
  });
}

export function listDemoRoles(
  db: Database.Database,
  runId: string,
): DemoRoleRow[] {
  ensureDemoTables(db);
  const rows = db
    .prepare(
      `SELECT run_id as runId, role, address, private_key as privateKey,
              customer_id as customerId, cv_record_id as cvRecordId
       FROM demo_roles WHERE run_id = ?`,
    )
    .all(runId) as DemoRoleRow[];
  return rows;
}

export function getDemoRole(
  db: Database.Database,
  runId: string,
  role: DemoRole,
): DemoRoleRow | null {
  const row = db
    .prepare(
      `SELECT run_id as runId, role, address, private_key as privateKey,
              customer_id as customerId, cv_record_id as cvRecordId
       FROM demo_roles WHERE run_id = ? AND role = ?`,
    )
    .get(runId, role) as DemoRoleRow | undefined;
  return row ?? null;
}

export function setStepStatus(
  db: Database.Database,
  runId: string,
  step: DemoStepName,
  status: StepStatus,
  error?: string | null,
): void {
  ensureDemoTables(db);
  if (status === "running") {
    db.prepare(
      `UPDATE demo_steps SET status=?, error=NULL, started_at=datetime('now'), finished_at=NULL
       WHERE run_id=? AND step=?`,
    ).run(status, runId, step);
  } else if (status === "done" || status === "failed" || status === "skipped") {
    db.prepare(
      `UPDATE demo_steps SET status=?, error=?, finished_at=datetime('now')
       WHERE run_id=? AND step=?`,
    ).run(status, error ?? null, runId, step);
  } else {
    db.prepare(
      `UPDATE demo_steps SET status=?, error=? WHERE run_id=? AND step=?`,
    ).run(status, error ?? null, runId, step);
  }
  updateDemoRun(db, runId, { currentStep: step, status });
}

export function listStepStatuses(db: Database.Database, runId: string) {
  ensureDemoTables(db);
  return db
    .prepare(
      `SELECT step, status, error, started_at as startedAt, finished_at as finishedAt
       FROM demo_steps WHERE run_id = ? ORDER BY rowid`,
    )
    .all(runId) as Array<{
    step: string;
    status: string;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
}

export function appendDemoEvent(
  db: Database.Database,
  runId: string,
  kind: string,
  message: string,
  payload: unknown = {},
  step?: string | null,
): number {
  ensureDemoTables(db);
  const info = db
    .prepare(
      `INSERT INTO demo_events (run_id, step, kind, message, payload)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      runId,
      step ?? null,
      kind,
      message,
      JSON.stringify(payload, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    );
  return Number(info.lastInsertRowid);
}

export function listDemoEvents(
  db: Database.Database,
  runId: string,
  limit = 200,
): DemoEventRow[] {
  ensureDemoTables(db);
  return db
    .prepare(
      `SELECT id, run_id as runId, step, kind, message, payload, created_at as createdAt
       FROM demo_events WHERE run_id = ? ORDER BY id ASC LIMIT ?`,
    )
    .all(runId, limit) as DemoEventRow[];
}

export function insertNotification(
  db: Database.Database,
  n: {
    address: string;
    kind: string;
    title: string;
    body: string;
    payload?: unknown;
  },
): number {
  ensureDemoTables(db);
  const info = db
    .prepare(
      `INSERT INTO notifications (address, kind, title, body, payload)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      n.address.toLowerCase(),
      n.kind,
      n.title,
      n.body,
      JSON.stringify(n.payload ?? {}, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    );
  return Number(info.lastInsertRowid);
}

export function listNotifications(
  db: Database.Database,
  address: string,
  limit = 50,
) {
  ensureDemoTables(db);
  return db
    .prepare(
      `SELECT id, address, kind, title, body, payload, read, created_at as createdAt
       FROM notifications WHERE address = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(address.toLowerCase(), limit);
}
