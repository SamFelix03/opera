import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { DemoOrchestrator } from "./orchestrator.js";
import {
  DEMO_STEPS,
  ensureDemoTables,
  listDemoEvents,
  listNotifications,
  type DemoStepName,
} from "./state.js";
import {
  CAST_ACTIONS,
  beginSeedInBackground,
  executeCastAct,
  getCastSnapshot,
} from "./cast-actions.js";
import { readFileSync, existsSync } from "node:fs";
import { explainChainError } from "../lib/chain-errors.js";

export async function registerDemoRoutes(
  app: FastifyInstance,
  db: Database.Database,
) {
  ensureDemoTables(db);
  const mock = process.env.DEMO_MOCK === "1";
  const orch = () => new DemoOrchestrator(db, { mock });

  app.post("/demo/bootstrap", async (_req, reply) => {
    const result = orch().bootstrap();
    return reply.code(201).send(result);
  });

  app.get("/demo/:runId", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = orch().getRun(runId);
    if (!run) return reply.code(404).send({ error: "run not found" });
    return run;
  });

  app.get("/demo/:runId/cast", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const snap = getCastSnapshot(db, orch(), runId);
    if (!snap) return reply.code(404).send({ error: "run not found" });
    return snap;
  });

  app.post("/demo/:runId/act", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!orch().getRun(runId)) {
      return reply.code(404).send({ error: "run not found" });
    }
    const body = (req.body ?? {}) as {
      role?: string;
      action: string;
      args?: Record<string, unknown>;
    };
    if (!body.action) {
      return reply.code(400).send({ error: "action required", allowed: CAST_ACTIONS });
    }
    try {
      // Seed is long-running (many chain + Cleanverse calls) and trips nginx 504s
      // if awaited. Accept immediately and let the client poll /cast.
      if (body.action === "seed") {
        return beginSeedInBackground(db, orch(), runId);
      }
      const result = await executeCastAct(db, orch(), runId, body);
      return result;
    } catch (e) {
      return reply
        .code(500)
        .send({ ok: false, error: explainChainError(e), action: body.action });
    }
  });

  app.post("/demo/:runId/step/:stepName", async (req, reply) => {
    const { runId, stepName } = req.params as {
      runId: string;
      stepName: string;
    };
    if (!DEMO_STEPS.includes(stepName as DemoStepName)) {
      return reply.code(400).send({
        error: "invalid step",
        allowed: DEMO_STEPS,
      });
    }
    if (!orch().getRun(runId)) {
      return reply.code(404).send({ error: "run not found" });
    }
    try {
      const result = await orch().runStep(runId, stepName as DemoStepName);
      return { ok: true, step: stepName, result };
    } catch (e) {
      return reply
        .code(500)
        .send({ ok: false, step: stepName, error: explainChainError(e) });
    }
  });

  app.post("/demo/:runId/run-all", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    if (!orch().getRun(runId)) {
      return reply.code(404).send({ error: "run not found" });
    }
    try {
      const result = await orch().runAll(runId);
      return { ok: true, ...result, run: orch().getRun(runId) };
    } catch (e) {
      return reply
        .code(500)
        .send({ ok: false, error: explainChainError(e), run: orch().getRun(runId) });
    }
  });

  app.get("/demo/:runId/events", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const q = req.query as { limit?: string };
    if (!orch().getRun(runId)) {
      return reply.code(404).send({ error: "run not found" });
    }
    return {
      events: listDemoEvents(db, runId, Number(q.limit ?? 200)),
    };
  });

  app.get("/demo/:runId/export", async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const q = req.query as { format?: string };
    const run = orch().getRun(runId);
    if (!run) return reply.code(404).send({ error: "run not found" });

    if (!run.exportPath || !existsSync(run.exportPath)) {
      await orch().runStep(runId, "regulatorExport");
    }
    const refreshed = orch().getRun(runId)!;
    const format = (q.format ?? "json").toLowerCase();

    if (format === "pdf") {
      const pdfPath = refreshed.exportPath?.replace(/\.json$/, ".pdf");
      if (!pdfPath || !existsSync(pdfPath)) {
        return reply.code(404).send({ error: "PDF not available" });
      }
      const buf = readFileSync(pdfPath);
      return reply
        .header("content-type", "application/pdf")
        .header(
          "content-disposition",
          `attachment; filename="opera-audit-${runId}.pdf"`,
        )
        .send(buf);
    }

    const jsonPath = refreshed.exportPath!;
    const buf = readFileSync(jsonPath);
    return reply
      .header("content-type", "application/json")
      .header(
        "content-disposition",
        `attachment; filename="opera-audit-${runId}.json"`,
      )
      .send(buf);
  });

  app.get("/notifications", async (req, reply) => {
    const q = req.query as { address?: string; limit?: string };
    if (!q.address) {
      return reply.code(400).send({ error: "address query required" });
    }
    return {
      notifications: listNotifications(db, q.address, Number(q.limit ?? 50)),
    };
  });
}
