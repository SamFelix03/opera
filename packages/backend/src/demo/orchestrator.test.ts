import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { openAuditDb } from "../db.js";
import { computeScore, demoInputs88 } from "../score.js";
import { DemoOrchestrator } from "./orchestrator.js";
import {
  DEMO_STEPS,
  listDemoEvents,
  listNotifications,
  listStepStatuses,
} from "./state.js";

describe("demo orchestrator step machine (mock)", () => {
  let dbPath: string;
  let db: ReturnType<typeof openAuditDb>;
  let orch: DemoOrchestrator;

  beforeEach(() => {
    dbPath = join(tmpdir(), `opera-demo-${Date.now()}-${Math.random()}.sqlite`);
    db = openAuditDb(dbPath);
    orch = new DemoOrchestrator(db, { mock: true });
  });

  afterEach(() => {
    db.close();
    if (existsSync(dbPath)) unlinkSync(dbPath);
    const wal = `${dbPath}-wal`;
    const shm = `${dbPath}-shm`;
    if (existsSync(wal)) unlinkSync(wal);
    if (existsSync(shm)) unlinkSync(shm);
  });

  it("freeze formula stays real: 88 → 31", () => {
    const raw = computeScore(demoInputs88("0xabc", false));
    const frozen = computeScore(demoInputs88("0xabc", true));
    expect(raw.score).toBe(88);
    expect(frozen.rawScore).toBe(88);
    expect(frozen.score).toBe(31);
    expect(Math.round(88 * 0.35)).toBe(31);
  });

  it("bootstrap creates 6 roles and pending steps", () => {
    const { runId, roles } = orch.bootstrap();
    expect(runId).toBeTruthy();
    expect(roles).toHaveLength(6);
    expect(roles.map((r) => r.role).sort()).toEqual(
      ["energyOp", "investor", "maintOp", "owner", "regulator", "replacement"].sort(),
    );
    const steps = listStepStatuses(db, runId);
    expect(steps).toHaveLength(DEMO_STEPS.length);
    expect(steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("run-all completes every PRD §8 step in order", async () => {
    const { runId, roles } = orch.bootstrap();
    const owner = roles.find((r) => r.role === "owner")!;

    const { results } = await orch.runAll(runId);

    for (const step of DEMO_STEPS) {
      expect(results[step]).toBeDefined();
    }

    const steps = listStepStatuses(db, runId);
    expect(steps.every((s) => s.status === "done")).toBe(true);

    const events = listDemoEvents(db, runId);
    expect(events.some((e) => e.kind === "step.start")).toBe(true);
    expect(events.some((e) => e.kind === "run-all.done")).toBe(true);

    // sanctions wrote freeze score 31 with real formula
    const freezeEv = events.find((e) => e.kind === "freeze.mock");
    expect(freezeEv).toBeTruthy();
    const payload = JSON.parse(freezeEv!.payload);
    expect(payload.score).toBe(31);
    expect(payload.rawScore).toBe(88);

    const notes = listNotifications(db, owner.address) as Array<{ kind: string }>;
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(notes.some((n) => n.kind === "lor.auto_listed")).toBe(true);
    expect(notes.some((n) => n.kind === "lor.acquired")).toBe(true);

    const run = orch.getRun(runId)!;
    expect(run.status).toBe("completed");
    expect(run.exportPath).toBeTruthy();
    expect(existsSync(run.exportPath!)).toBe(true);
  });

  it("single step can be driven independently", async () => {
    const { runId } = orch.bootstrap();
    await orch.runStep(runId, "setupIdentities");
    const steps = listStepStatuses(db, runId);
    expect(steps.find((s) => s.step === "setupIdentities")?.status).toBe("done");
    expect(steps.find((s) => s.step === "setupAsset")?.status).toBe("pending");
  });

  it("sanctionsEvent asserts freeze formula even when mocked", async () => {
    const { runId } = orch.bootstrap();
    await orch.runStep(runId, "setupIdentities");
    await orch.runStep(runId, "setupAsset");
    const out = (await orch.runStep(runId, "sanctionsEvent")) as {
      score: number;
      rawScore: number;
    };
    expect(out.rawScore).toBe(88);
    expect(out.score).toBe(31);
  });
});
