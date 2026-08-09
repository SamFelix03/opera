/**
 * Product API routes — wallet-driven (SIWE-gated writes).
 * These are the real platform endpoints, not the demo orchestrator.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type Database from "better-sqlite3";
import { getAddress, keccak256, parseUnits, toBytes, type Hex } from "viem";
import { clientFromEnv } from "@opera/cleanverse-client";
import { createChainCtx, scoreAbi, CATEGORY_SOLAR } from "./demo/chain.js";
import { insertAuditEvent } from "./db.js";
import { ensureApass, queryApassStatus, freezeWallet, activateWallet } from "./lib/cleanverse-helpers.js";
import { setScore, mintLOR, autoListLOR, recordOraclePrice } from "./lib/chain-helpers.js";
import { computeScore, type ScoreInputs } from "./score.js";

function requireSession(
  db: Database.Database,
  req: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const addr = (req.headers["x-opera-address"] as string ?? "").toLowerCase();
  if (!addr) {
    reply.code(401).send({ error: "x-opera-address header required" });
    return null;
  }
  const row = db
    .prepare("SELECT address, verified FROM sessions WHERE address = ?")
    .get(addr) as { address: string; verified: number } | undefined;
  if (!row || !row.verified) {
    reply.code(401).send({ error: "SIWE session required — POST /auth/verify first" });
    return null;
  }
  return row.address;
}

export async function registerProductRoutes(
  app: FastifyInstance,
  db: Database.Database,
) {
  const cv = clientFromEnv();

  app.get("/v1/me", async (req: FastifyRequest, reply: FastifyReply) => {
    const addr = requireSession(db, req, reply);
    if (!addr) return;
    const ctx = createChainCtx();
    const scoreRow = db.prepare("SELECT * FROM scores WHERE address = ?").get(addr) as Record<string, unknown> | undefined;
    let onChainScore: string | null = null;
    try {
      const s = await ctx.publicClient.readContract({
        address: ctx.deployment.contracts.ScoreStore,
        abi: scoreAbi,
        functionName: "getScore",
        args: [addr as Hex],
      });
      onChainScore = s.toString();
    } catch { /* not set */ }
    const apass = await queryApassStatus(cv, addr);
    return {
      address: addr,
      score: scoreRow ?? null,
      onChainScore,
      apass,
      settlement: {
        token: ctx.deployment.settlementToken,
        symbol: ctx.deployment.settlementSymbol,
        decimals: ctx.deployment.settlementDecimals ?? 6,
      },
    };
  });

  app.post("/v1/apass/ensure", async (req: FastifyRequest, reply: FastifyReply) => {
    const addr = requireSession(db, req, reply);
    if (!addr) return;
    const ctx = createChainCtx();
    await ensureApass(cv, ctx.publicClient, addr as Hex, "user");
    const status = await queryApassStatus(cv, addr);
    insertAuditEvent(db, { kind: "product.apass.ensure", payload: JSON.stringify({ address: addr, status }) });
    return { ok: true, address: addr, apass: status };
  });

  app.post("/v1/apass/freeze", async (req: FastifyRequest, reply: FastifyReply) => {
    const addr = requireSession(db, req, reply);
    if (!addr) return;
    const body = req.body as { address?: string; reason?: string };
    const target = (body.address ?? addr).toLowerCase();
    const requestId = await freezeWallet(cv, target, body.reason);
    insertAuditEvent(db, { kind: "product.apass.freeze", payload: JSON.stringify({ target, requestId }) });
    return { ok: true, target, requestId };
  });

  app.post("/v1/apass/activate", async (req: FastifyRequest, reply: FastifyReply) => {
    const addr = requireSession(db, req, reply);
    if (!addr) return;
    const body = req.body as { address?: string };
    const target = (body.address ?? addr).toLowerCase();
    const requestId = await activateWallet(cv, target);
    insertAuditEvent(db, { kind: "product.apass.activate", payload: JSON.stringify({ target, requestId }) });
    return { ok: true, target, requestId };
  });

  app.post("/v1/scores/push", async (req: FastifyRequest, reply: FastifyReply) => {
    const addr = requireSession(db, req, reply);
    if (!addr) return;
    const body = req.body as { address?: string };
    const rawTarget = body.address ?? addr;
    const target = (rawTarget.length === 42 ? getAddress(rawTarget) : rawTarget) as Hex;
    const ctx = createChainCtx();
    const apass = await queryApassStatus(cv, target);
    const result = computeScore({
      address: target,
      tenureDays: 365,
      cleanScreeningEvents: 10,
      totalScreeningEvents: 10,
      travelRuleCompleteTransfers: 5,
      crossBorderTransfers: 5,
      frozen: apass.status === 2,
      requestIds: ["product-push"],
    });
    const tx = await setScore(ctx, target, result.score, "product");
    db.prepare(
      `INSERT INTO scores (address, score, tenure, clean_rate, tr_complete, frozen, inputs_json)
       VALUES (@address, @score, @tenure, @cleanRate, @trComplete, @frozen, @inputs)
       ON CONFLICT(address) DO UPDATE SET
         score=excluded.score, tenure=excluded.tenure, clean_rate=excluded.clean_rate,
         tr_complete=excluded.tr_complete, frozen=excluded.frozen, inputs_json=excluded.inputs_json,
         updated_at=datetime('now')`,
    ).run({
      address: target.toLowerCase(),
      score: result.score,
      tenure: result.tenureNorm,
      cleanRate: result.ccpCleanRate,
      trComplete: result.trComplete,
      frozen: apass.status === 2 ? 1 : 0,
      inputs: JSON.stringify({ ...result }),
    });
    insertAuditEvent(db, { kind: "product.score.push", payload: JSON.stringify({ target, score: result.score, tx }) });
    return { ok: true, address: target, score: result.score, tx };
  });

  app.post("/v1/lors/mint", async (req: FastifyRequest, reply: FastifyReply) => {
    const addr = requireSession(db, req, reply);
    if (!addr) return;
    const body = req.body as { holder: string; scope: string; minScore?: number; assetId?: number };
    if (!body.holder || !body.scope) {
      return reply.code(400).send({ error: "holder and scope required" });
    }
    const ctx = createChainCtx();
    const assetId = BigInt(body.assetId ?? ctx.deployment.assetId ?? 1);
    const scopeHash = keccak256(toBytes(body.scope));
    const holder = getAddress(body.holder) as Hex;
    const result = await mintLOR(ctx, assetId, holder, scopeHash, BigInt(body.minScore ?? 70));
    insertAuditEvent(db, {
      kind: "product.lor.mint",
      payload: JSON.stringify({ lorId: result.lorId.toString(), holder: body.holder, scope: body.scope, tx: result.tx }),
    });
    return { ok: true, lorId: result.lorId.toString(), tx: result.tx };
  });

  app.post("/v1/lors/:id/auto-list", async (req: FastifyRequest, reply: FastifyReply) => {
    const addr = requireSession(db, req, reply);
    if (!addr) return;
    const { id } = req.params as { id: string };
    const body = req.body as { listPrice?: string };
    const ctx = createChainCtx();
    const price = parseUnits(body.listPrice ?? "500", ctx.deployment.settlementDecimals ?? 6);
    const tx = await autoListLOR(ctx, BigInt(id), price);
    insertAuditEvent(db, { kind: "product.lor.autolist", payload: JSON.stringify({ lorId: id, tx }) });
    return { ok: true, lorId: id, tx };
  });

  app.post("/v1/oracle/record", async (req: FastifyRequest, reply: FastifyReply) => {
    const addr = requireSession(db, req, reply);
    if (!addr) return;
    const body = req.body as { category?: string; price: string };
    const ctx = createChainCtx();
    const category = body.category ? keccak256(toBytes(body.category)) : CATEGORY_SOLAR;
    const price = parseUnits(body.price, ctx.deployment.settlementDecimals ?? 6);
    const tx = await recordOraclePrice(ctx, category, price);
    insertAuditEvent(db, { kind: "product.oracle.record", payload: JSON.stringify({ category: body.category ?? "solar", price: body.price, tx }) });
    return { ok: true, tx };
  });
}
