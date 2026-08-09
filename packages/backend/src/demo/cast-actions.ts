/**
 * Atomic cast actions for dashboard-driven demo (replaces sequential wizard UI).
 * Uses demo role private keys already stored by DemoOrchestrator.bootstrap.
 */
import type Database from "better-sqlite3";
import {
  getAddress,
  keccak256,
  parseUnits,
  toBytes,
  type Hex,
} from "viem";
import { computeScore, demoInputs88 } from "../score.js";
import {
  ensureApass,
  freezeWallet,
  activateWallet,
  queryApassStatus,
} from "../lib/cleanverse-helpers.js";
import {
  setScore,
  mintLOR,
  autoListLOR,
  recordOraclePrice,
} from "../lib/chain-helpers.js";
import { clientFromEnv } from "@opera/cleanverse-client";
import {
  createChainCtx,
  erc20Abi,
  loadOperaAtokenAddress,
  lorAbi,
  manAbi,
  revAbi,
  waitTx,
  walletFor,
  write,
  CATEGORY_SOLAR,
} from "./chain.js";
import {
  DEMO_ROLES,
  getDemoRole,
  getDemoRun,
  listDemoEvents,
  listDemoRoles,
  listStepStatuses,
  setStepStatus,
  updateDemoRun,
  appendDemoEvent,
  type DemoRole,
  type DemoStepName,
} from "./state.js";
import type { DemoOrchestrator } from "./orchestrator.js";

const DECIMALS = 6;
const SCOPE_ENERGY = keccak256(toBytes("energy-revenue"));
const SCOPE_MAINT = keccak256(toBytes("maintenance"));
const JURISDICTION_SG = keccak256(toBytes("SG"));

/** In-process lock so concurrent Seed clicks don't double-mint. */
const seedingRuns = new Set<string>();

const SEED_STEPS: DemoStepName[] = ["setupIdentities", "setupAsset", "fundAndStake"];

export const CAST_ACTIONS = [
  "seed",
  "mintLor",
  "publishMandate",
  "award",
  "bid",
  "distribute",
  "freeze",
  "activate",
  "pushScore",
  "autoList",
  "acquire",
  "export",
  "ensureApass",
] as const;

export type CastActionName = (typeof CAST_ACTIONS)[number];

export type CastTx = { label: string; hash: string };

export type CastActResult = {
  ok: true;
  role: string | null;
  action: CastActionName;
  summary: string;
  actors: { role: string; address: string }[];
  txs: CastTx[];
  ids?: Record<string, string>;
  run: ReturnType<DemoOrchestrator["getRun"]>;
  /** True when seed was accepted and is running in the background. */
  accepted?: boolean;
  seeding?: boolean;
};

export function isSeedInProgress(runId: string): boolean {
  return seedingRuns.has(runId);
}

export function isSeedComplete(db: Database.Database, runId: string): boolean {
  const steps = listStepStatuses(db, runId);
  return steps.some((s) => s.step === "fundAndStake" && s.status === "done");
}

export function seedFailure(db: Database.Database, runId: string): string | null {
  const steps = listStepStatuses(db, runId);
  for (const step of SEED_STEPS) {
    const row = steps.find((s) => s.step === step);
    if (row?.status === "failed") return row.error || `${step} failed`;
  }
  return null;
}

function settlementToken(run: { settlementToken: string | null }): Hex {
  return (run.settlementToken as Hex) || loadOperaAtokenAddress();
}

function requireRole(db: Database.Database, runId: string, role: DemoRole) {
  const r = getDemoRole(db, runId, role);
  if (!r) throw new Error(`Role ${role} missing — bootstrap first`);
  return r;
}

function scopeHash(scope: string): Hex {
  if (scope === "energy-revenue") return SCOPE_ENERGY;
  if (scope === "maintenance") return SCOPE_MAINT;
  return keccak256(toBytes(scope));
}

function suggestedStage(db: Database.Database, runId: string): string {
  const steps = listStepStatuses(db, runId);
  const done = new Set(steps.filter((s) => s.status === "done").map((s) => s.step));
  if (!done.has("fundAndStake") && !done.has("setupAsset")) return "seed";
  if (!done.has("normalOps")) return "operate";
  if (!done.has("sanctionsEvent")) return "freeze";
  if (!done.has("replacementAcquire")) return "acquire";
  if (!done.has("regulatorExport")) return "export";
  return "done";
}

function recentTxsFromEvents(db: Database.Database, runId: string, limit = 8): CastTx[] {
  const events = listDemoEvents(db, runId, 80);
  const out: CastTx[] = [];
  for (const ev of events) {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(ev.payload || "{}") as Record<string, unknown>;
    } catch {
      continue;
    }
    const txs = payload.txs;
    if (Array.isArray(txs)) {
      for (const t of txs) {
        if (t && typeof t === "object" && "hash" in t && typeof (t as CastTx).hash === "string") {
          out.push({
            label: String((t as CastTx).label || ev.kind),
            hash: (t as CastTx).hash,
          });
        }
      }
    }
    for (const key of ["tx", "listTx", "acquireTx", "distributeTx", "bidE", "bidM", "awardE", "awardM"]) {
      const h = payload[key];
      if (typeof h === "string" && h.startsWith("0x") && h.length >= 66) {
        out.push({ label: `${ev.kind}:${key}`, hash: h });
      }
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export function getCastSnapshot(db: Database.Database, orch: DemoOrchestrator, runId: string) {
  const run = orch.getRun(runId);
  if (!run) return null;
  const roles = listDemoRoles(db, runId).map((r) => ({
    role: r.role,
    address: r.address,
    label: r.role,
    customerId: r.customerId,
  }));
  const steps = listStepStatuses(db, runId);
  return {
    runId,
    status: run.status,
    roles,
    ids: {
      assetId: run.assetId,
      energyLorId: run.energyLorId,
      maintLorId: run.maintLorId,
      energyMandateId: run.energyMandateId,
      maintMandateId: run.maintMandateId,
      settlementToken: run.settlementToken,
      settlementMode: run.settlementMode,
    },
    steps,
    suggestedStage: suggestedStage(db, runId),
    recentTxs: recentTxsFromEvents(db, runId),
  };
}

export async function executeCastAct(
  db: Database.Database,
  orch: DemoOrchestrator,
  runId: string,
  body: { role?: string; action: string; args?: Record<string, unknown> },
): Promise<CastActResult> {
  const action = body.action as CastActionName;
  if (!CAST_ACTIONS.includes(action)) {
    throw new Error(`Unknown action ${body.action}. Allowed: ${CAST_ACTIONS.join(", ")}`);
  }
  if (!getDemoRun(db, runId)) throw new Error(`unknown run ${runId}`);

  const args = body.args ?? {};
  const role = (body.role as DemoRole | undefined) ?? null;
  const txs: CastTx[] = [];
  const actors: { role: string; address: string }[] = [];
  let summary = "";
  let ids: Record<string, string> | undefined;

  const mock = process.env.DEMO_MOCK === "1";

  if (action === "seed") {
    const steps = listStepStatuses(db, runId);
    let fund: Record<string, unknown> | undefined;
    for (const step of SEED_STEPS) {
      const row = steps.find((s) => s.step === step);
      if (row?.status === "done") continue;
      // Recover from a previous timed-out/crashed attempt stuck on "running".
      if (row?.status === "running") {
        setStepStatus(db, runId, step, "pending");
      }
      const result = await orch.runStep(runId, step);
      if (step === "fundAndStake") fund = result as Record<string, unknown>;
    }
    for (const [k, v] of Object.entries(fund ?? {})) {
      if (typeof v === "string" && v.startsWith("0x") && v.length >= 66) {
        txs.push({ label: k, hash: v });
      }
    }
    const run = getDemoRun(db, runId)!;
    ids = {
      assetId: String(run.assetId ?? ""),
      energyLorId: String(run.energyLorId ?? ""),
      maintLorId: String(run.maintLorId ?? ""),
      energyMandateId: String(run.energyMandateId ?? ""),
      maintMandateId: String(run.maintMandateId ?? ""),
    };
    summary = "Cast seeded: identities, LORs, mandates, funds, and stakes";
    for (const r of listDemoRoles(db, runId)) {
      actors.push({ role: r.role, address: r.address });
    }
  } else if (action === "export") {
    await orch.runStep(runId, "regulatorExport");
    summary = "Regulator audit pack exported";
    const reg = requireRole(db, runId, "regulator");
    actors.push({ role: "regulator", address: reg.address });
  } else if (mock) {
    summary = `Mock ${action}`;
    appendDemoEvent(db, runId, `cast.${action}`, summary, { mock: true, role, args, txs }, null);
    return {
      ok: true,
      role,
      action,
      summary,
      actors,
      txs,
      ids,
      run: orch.getRun(runId),
    };
  } else if (action === "mintLor") {
    const holderRole = (args.holderRole as DemoRole) || "energyOp";
    const holderAddr = args.holder
      ? (getAddress(String(args.holder)) as Hex)
      : (requireRole(db, runId, holderRole).address as Hex);
    const scope = String(args.scope ?? "energy-revenue");
    const minScore = BigInt(Number(args.minScore ?? 70));
    const run = getDemoRun(db, runId)!;
    const ctx = createChainCtx();
    const assetId = BigInt(Number(args.assetId ?? run.assetId ?? ctx.deployment.assetId ?? 1));
    const owner = requireRole(db, runId, "owner");
    actors.push({ role: "owner", address: owner.address });
    actors.push({ role: "holder", address: holderAddr });
    const result = await mintLOR(ctx, assetId, holderAddr, scopeHash(scope), minScore);
    txs.push({ label: "mintLOR", hash: result.tx });
    ids = { lorId: result.lorId.toString(), scope };
    if (scope.includes("energy") || scope === "energy-revenue") {
      updateDemoRun(db, runId, { energyLorId: Number(result.lorId) });
    } else if (scope.includes("maint")) {
      updateDemoRun(db, runId, { maintLorId: Number(result.lorId) });
    }
    summary = `Minted LOR #${result.lorId} (${scope}) to ${holderAddr.slice(0, 10)}…`;
  } else if (action === "publishMandate") {
    const owner = requireRole(db, runId, "owner");
    actors.push({ role: "owner", address: owner.address });
    const run = getDemoRun(db, runId)!;
    const ctx = createChainCtx();
    const assetId = BigInt(Number(args.assetId ?? run.assetId ?? ctx.deployment.assetId ?? 1));
    const scope = String(args.scope ?? "energy-revenue");
    const stake = parseUnits(String(args.stake ?? "5000"), DECIMALS);
    const maxSpend = parseUnits(String(args.maxSpend ?? "200000"), DECIMALS);
    const minScore = BigInt(Number(args.minScore ?? 80));
    const nextMan = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "nextMandateId",
    });
    const { wallet } = walletFor(ctx, owner.privateKey as Hex);
    const hash = await write(wallet, {
      address: ctx.deployment.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "publishMandate",
      args: [assetId, scopeHash(scope), minScore, JURISDICTION_SG, stake, maxSpend],
    });
    await waitTx(ctx, hash);
    txs.push({ label: "publishMandate", hash });
    ids = { mandateId: nextMan.toString(), scope };
    if (scope.includes("energy") || scope === "energy-revenue") {
      updateDemoRun(db, runId, { energyMandateId: Number(nextMan) });
    } else {
      updateDemoRun(db, runId, { maintMandateId: Number(nextMan) });
    }
    summary = `Published mandate #${nextMan} (${scope})`;
  } else if (action === "award") {
    const owner = requireRole(db, runId, "owner");
    actors.push({ role: "owner", address: owner.address });
    const mandateId = BigInt(String(args.mandateId));
    const winnerRole = args.winnerRole as DemoRole | undefined;
    const winner = args.winner
      ? (getAddress(String(args.winner)) as Hex)
      : winnerRole
        ? (requireRole(db, runId, winnerRole).address as Hex)
        : null;
    if (!winner) throw new Error("winner or winnerRole required");
    actors.push({ role: winnerRole ?? "winner", address: winner });
    const ctx = createChainCtx();
    const { wallet } = walletFor(ctx, owner.privateKey as Hex);
    const hash = await write(wallet, {
      address: ctx.deployment.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "award",
      args: [mandateId, winner],
    });
    await waitTx(ctx, hash);
    txs.push({ label: "award", hash });
    ids = { mandateId: mandateId.toString(), winner };
    summary = `Awarded mandate #${mandateId} to ${winner.slice(0, 10)}…`;
  } else if (action === "bid") {
    if (!role || !DEMO_ROLES.includes(role)) throw new Error("bid requires operator role");
    const bidder = requireRole(db, runId, role);
    actors.push({ role, address: bidder.address });
    const run = getDemoRun(db, runId)!;
    const mandateId = BigInt(
      String(
        args.mandateId ??
          (role === "maintOp" ? run.maintMandateId : run.energyMandateId),
      ),
    );
    if (!mandateId) throw new Error("mandateId required");
    const ctx = createChainCtx();
    const token = settlementToken(run);
    const man = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "mandates",
      args: [mandateId],
    });
    const stakeAmount = man[4] as bigint;
    const { wallet } = walletFor(ctx, bidder.privateKey as Hex);
    const approveHash = await write(wallet, {
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [ctx.deployment.contracts.MandateRegistry, stakeAmount],
    });
    await waitTx(ctx, approveHash);
    txs.push({ label: "approve stake", hash: approveHash });
    const bidHash = await write(wallet, {
      address: ctx.deployment.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "bid",
      args: [mandateId],
    });
    await waitTx(ctx, bidHash);
    txs.push({ label: "bid", hash: bidHash });
    ids = { mandateId: mandateId.toString(), stake: stakeAmount.toString() };
    summary = `${role} bid on mandate #${mandateId}`;
  } else if (action === "distribute") {
    if (!role) throw new Error("distribute requires operator role");
    const op = requireRole(db, runId, role);
    actors.push({ role, address: op.address });
    const run = getDemoRun(db, runId)!;
    const ctx = createChainCtx();
    const token = settlementToken(run);
    const grossHuman = String(args.gross ?? "180000");
    const gross = parseUnits(grossHuman, DECIMALS);
    // Mint gross to operator so distribute can pull
    const mintHash = await write(ctx.deployerWallet, {
      address: token,
      abi: erc20Abi,
      functionName: "mint",
      args: [op.address as Hex, gross],
    });
    await waitTx(ctx, mintHash);
    txs.push({ label: "mint gross", hash: mintHash });
    const { wallet } = walletFor(ctx, op.privateKey as Hex);
    const approveHash = await write(wallet, {
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [ctx.deployment.contracts.RevenueManager, gross],
    });
    await waitTx(ctx, approveHash);
    txs.push({ label: "approve revenue", hash: approveHash });
    const distHash = await write(wallet, {
      address: ctx.deployment.contracts.RevenueManager,
      abi: revAbi,
      functionName: "distribute",
      args: [op.address as Hex, gross],
    });
    await waitTx(ctx, distHash);
    txs.push({ label: "distribute", hash: distHash });
    // Oracle tick
    const oracleHash = await recordOraclePrice(ctx, CATEGORY_SOLAR, parseUnits("1200", DECIMALS));
    txs.push({ label: "oracle record", hash: oracleHash });
    ids = { gross: grossHuman };
    summary = `Distributed ${grossHuman} oCVA for ${role}`;
  } else if (action === "freeze" || action === "activate") {
    const targetRole = (args.targetRole as DemoRole) || "maintOp";
    const target = args.target
      ? String(args.target)
      : requireRole(db, runId, targetRole).address;
    const cv = clientFromEnv();
    actors.push({ role: targetRole, address: target });
    if (role) {
      const actor = requireRole(db, runId, role);
      actors.push({ role, address: actor.address });
    }
    const requestId =
      action === "freeze"
        ? await freezeWallet(cv, target, String(args.reason ?? "Opera cast: sanctions freeze"))
        : await activateWallet(cv, target);
    ids = { target, requestId, targetRole };
    summary =
      action === "freeze"
        ? `Froze A-Pass for ${targetRole} (${target.slice(0, 10)}…)`
        : `Activated A-Pass for ${targetRole} (${target.slice(0, 10)}…)`;
  } else if (action === "pushScore") {
    const targetRole = (args.targetRole as DemoRole) || role || "maintOp";
    const target = args.target
      ? (getAddress(String(args.target)) as Hex)
      : (requireRole(db, runId, targetRole as DemoRole).address as Hex);
    actors.push({ role: String(targetRole), address: target });
    const cv = clientFromEnv();
    const ctx = createChainCtx();
    const apass = await queryApassStatus(cv, target);
    const frozen = apass.status === 2;
    const result = computeScore(demoInputs88(target, frozen));
    const hash = await setScore(ctx, target, result.score, `cast-${frozen ? "frozen" : "live"}`);
    txs.push({ label: "setScore", hash });
    ids = { target, score: String(result.score), frozen: String(frozen) };
    summary = `Pushed score ${result.score} for ${targetRole} (frozen=${frozen})`;
  } else if (action === "autoList") {
    const run = getDemoRun(db, runId)!;
    const lorId = BigInt(String(args.lorId ?? run.maintLorId));
    if (!lorId) throw new Error("lorId required");
    const ctx = createChainCtx();
    const price = parseUnits(String(args.listPrice ?? "500"), DECIMALS);
    const hash = await autoListLOR(ctx, lorId, price);
    txs.push({ label: "autoList", hash });
    ids = { lorId: lorId.toString(), listPrice: String(args.listPrice ?? "500") };
    summary = `Auto-listed LOR #${lorId}`;
  } else if (action === "acquire") {
    const buyerRole = (role as DemoRole) || "replacement";
    const buyer = requireRole(db, runId, buyerRole);
    actors.push({ role: buyerRole, address: buyer.address });
    const run = getDemoRun(db, runId)!;
    const lorId = BigInt(String(args.lorId ?? run.maintLorId));
    if (!lorId) throw new Error("lorId required");
    const ctx = createChainCtx();
    const token = settlementToken(run);
    const lor = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "lors",
      args: [lorId],
    });
    const price = lor[3] as bigint;
    const score = computeScore({
      ...demoInputs88(buyer.address, false),
      travelRuleCompleteTransfers: 5,
      crossBorderTransfers: 5,
    });
    const scoreTx = await setScore(ctx, buyer.address as Hex, score.score, "cast-acq");
    txs.push({ label: "setScore buyer", hash: scoreTx });
    const { wallet } = walletFor(ctx, buyer.privateKey as Hex);
    const approveHash = await write(wallet, {
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [ctx.deployment.contracts.LORRegistry, price],
    });
    await waitTx(ctx, approveHash);
    txs.push({ label: "approve acquire", hash: approveHash });
    const acqHash = await write(wallet, {
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "acquireLOR",
      args: [lorId],
    });
    await waitTx(ctx, acqHash);
    txs.push({ label: "acquireLOR", hash: acqHash });
    ids = { lorId: lorId.toString(), price: price.toString(), buyer: buyer.address };
    summary = `${buyerRole} acquired LOR #${lorId}`;
  } else if (action === "ensureApass") {
    if (!role) throw new Error("ensureApass requires role");
    const r = requireRole(db, runId, role);
    actors.push({ role, address: r.address });
    const cv = clientFromEnv();
    const ctx = createChainCtx();
    await ensureApass(cv, ctx.publicClient, r.address as Hex, role);
    const status = await queryApassStatus(cv, r.address);
    ids = { address: r.address, status: String(status.status) };
    summary = `Ensured A-Pass for ${role} (status=${status.status})`;
  } else {
    throw new Error(`Unhandled action ${action}`);
  }

  appendDemoEvent(
    db,
    runId,
    `cast.${action}`,
    summary,
    { role, args, txs, ids, actors },
    null,
  );

  return {
    ok: true,
    role,
    action,
    summary,
    actors,
    txs,
    ids,
    run: orch.getRun(runId),
  };
}

/**
 * Start seed in the background so proxies (nginx ~60–120s) don't 504.
 * Client should poll GET /demo/:runId/cast until fundAndStake is done.
 */
export function beginSeedInBackground(
  db: Database.Database,
  orch: DemoOrchestrator,
  runId: string,
): CastActResult {
  if (!getDemoRun(db, runId)) throw new Error(`unknown run ${runId}`);

  const actors = listDemoRoles(db, runId).map((r) => ({
    role: r.role,
    address: r.address,
  }));

  if (isSeedComplete(db, runId)) {
    const run = getDemoRun(db, runId)!;
    return {
      ok: true,
      role: null,
      action: "seed",
      summary: "Cast already seeded",
      actors,
      txs: [],
      ids: {
        assetId: String(run.assetId ?? ""),
        energyLorId: String(run.energyLorId ?? ""),
        maintLorId: String(run.maintLorId ?? ""),
        energyMandateId: String(run.energyMandateId ?? ""),
        maintMandateId: String(run.maintMandateId ?? ""),
      },
      run: orch.getRun(runId),
      accepted: false,
      seeding: false,
    };
  }

  if (seedingRuns.has(runId)) {
    return {
      ok: true,
      role: null,
      action: "seed",
      summary: "Seed already in progress — poll cast until fundAndStake is done",
      actors,
      txs: [],
      run: orch.getRun(runId),
      accepted: true,
      seeding: true,
    };
  }

  seedingRuns.add(runId);
  updateDemoRun(db, runId, { status: "seeding", currentStep: "setupIdentities" });
  appendDemoEvent(
    db,
    runId,
    "cast.seed",
    "Seed accepted — running identities, asset setup, and fund/stake in background",
    { accepted: true },
    null,
  );

  void executeCastAct(db, orch, runId, { action: "seed" })
    .then(() => {
      updateDemoRun(db, runId, { status: "ready" });
    })
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      updateDemoRun(db, runId, { status: "seed_failed" });
      appendDemoEvent(db, runId, "cast.seed.failed", msg, { error: msg }, null);
    })
    .finally(() => {
      seedingRuns.delete(runId);
    });

  return {
    ok: true,
    role: null,
    action: "seed",
    summary:
      "Seed started in background (2–5 min on Monad). Stay on Cast HQ — progress updates as steps finish.",
    actors,
    txs: [],
    run: orch.getRun(runId),
    accepted: true,
    seeding: true,
  };
}
