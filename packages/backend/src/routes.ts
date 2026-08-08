import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { insertAuditEvent, listAuditEvents } from "./db.js";
import { computeScore, type ScoreInputs } from "./score.js";

export async function registerApiRoutes(app: FastifyInstance, db: Database.Database) {
  app.get("/scores/:address", async (req) => {
    const { address } = req.params as { address: string };
    const row = db
      .prepare(`SELECT * FROM scores WHERE address = ?`)
      .get(address.toLowerCase());
    return { score: row ?? null };
  });

  app.post("/scores/compute", async (req) => {
    const body = req.body as ScoreInputs;
    const result = computeScore(body);
    db.prepare(
      `INSERT INTO scores (address, score, tenure, clean_rate, tr_complete, frozen, inputs_json)
       VALUES (@address, @score, @tenure, @cleanRate, @trComplete, @frozen, @inputs)
       ON CONFLICT(address) DO UPDATE SET
         score=excluded.score,
         tenure=excluded.tenure,
         clean_rate=excluded.clean_rate,
         tr_complete=excluded.tr_complete,
         frozen=excluded.frozen,
         inputs_json=excluded.inputs_json,
         updated_at=datetime('now')`,
    ).run({
      address: body.address.toLowerCase(),
      score: result.score,
      tenure: result.tenureNorm,
      cleanRate: result.ccpCleanRate,
      trComplete: result.trComplete,
      frozen: body.frozen ? 1 : 0,
      inputs: JSON.stringify({ ...body, ...result }),
    });
    insertAuditEvent(db, {
      kind: "score.write",
      requestId: body.requestIds?.[0] ?? null,
      payload: JSON.stringify({ address: body.address, ...result, inputs: body }),
    });
    return result;
  });

  app.get("/demo/status", async () => ({
    events: listAuditEvents(db, 20),
  }));
}
