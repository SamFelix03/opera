import { runScoreLoop } from "./score-worker.js";

export function startWorkers() {
  if (process.env.WORKERS_ENABLED === "1") {
    console.log("[workers] score loop starting");
    void runScoreLoop(Number(process.env.SCORE_INTERVAL_MS ?? 15_000));
  }
}
