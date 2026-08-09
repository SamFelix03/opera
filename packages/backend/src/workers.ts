import type Database from "better-sqlite3";
import { runScoreLoop } from "./score-worker.js";
import { startChainSync } from "./chain-sync.js";

export function startWorkers(db: Database.Database) {
  startChainSync(db);
  if (process.env.WORKERS_ENABLED === "1") {
    console.log("[workers] score loop starting");
    void runScoreLoop(Number(process.env.SCORE_INTERVAL_MS ?? 15_000));
  }
}
