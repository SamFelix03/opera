/**
 * On-chain market + playground config APIs.
 * Mandate/LOR lists are served from the SQLite index (see chain-index / chain-sync).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Database from "better-sqlite3";
import {
  hydrateBidsFromChain,
  hydrateLorFromChain,
  hydrateMandateFromChain,
  listIndexedBids,
  listIndexedLors,
  listIndexedMandates,
} from "./chain-index.js";
import {
  CATEGORY_SOLAR,
  createChainCtx,
  lorAbi,
  oracleAbi,
  write,
  waitTx,
} from "./demo/chain.js";
import { insertAuditEvent } from "./db.js";

export async function registerChainRoutes(
  app: FastifyInstance,
  db: Database.Database,
) {
  app.get("/lors", async (req: FastifyRequest) => {
    const q = req.query as { listed?: string; limit?: string; holder?: string };
    const listedOnly = q.listed === "1" || q.listed === "true";
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const holderFilter = q.holder ?? null;

    const { lors, nextId } = listIndexedLors(db, {
      listedOnly,
      holder: holderFilter,
      limit,
    });

    let settlementToken: string | undefined;
    let autoListThreshold = 72;
    try {
      const ctx = createChainCtx();
      settlementToken = ctx.deployment.settlementToken;
      autoListThreshold = Number(
        await ctx.publicClient.readContract({
          address: ctx.deployment.contracts.LORRegistry,
          abi: lorAbi,
          functionName: "autoListThreshold",
        }),
      );
    } catch {
      /* list still works from SQLite */
    }

    return {
      autoListThreshold,
      settlementToken,
      count: lors.length,
      nextId,
      lors,
    };
  });

  app.get("/mandates", async (req: FastifyRequest) => {
    const q = req.query as { open?: string; limit?: string; publisher?: string };
    const openOnly = q.open === "1" || q.open === "true";
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const publisherFilter = q.publisher ?? null;

    const { mandates, nextMandateId } = listIndexedMandates(db, {
      openOnly,
      publisher: publisherFilter,
      limit,
    });

    return { count: mandates.length, nextMandateId, mandates };
  });

  app.get("/mandates/:id/bids", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) {
      return reply.code(400).send({ error: "invalid mandate id" });
    }
    const mandateId = Number(id);
    let bids = listIndexedBids(db, mandateId);
    if (bids.length === 0) {
      try {
        await hydrateBidsFromChain(db, mandateId);
        bids = listIndexedBids(db, mandateId);
      } catch {
        /* return empty */
      }
    }
    return { mandateId: id, count: bids.length, bids };
  });

  app.post("/chain/index/mandate", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { mandateId?: string | number };
    const id = Number(body.mandateId);
    if (!Number.isFinite(id) || id < 1) {
      return reply.code(400).send({ error: "mandateId required" });
    }
    const row = await hydrateMandateFromChain(db, id);
    if (!row) return reply.code(404).send({ error: "mandate not found on chain" });
    return { ok: true, mandateId: String(id) };
  });

  app.post("/chain/index/lor", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { lorId?: string | number };
    const id = Number(body.lorId);
    if (!Number.isFinite(id) || id < 1) {
      return reply.code(400).send({ error: "lorId required" });
    }
    const row = await hydrateLorFromChain(db, id);
    if (!row) return reply.code(404).send({ error: "lor not found on chain" });
    return { ok: true, lorId: String(id) };
  });

  app.get("/oracle/prices", async () => {
    const ctx = createChainCtx();
    const category = CATEGORY_SOLAR;
    const count = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.RightsPriceOracle,
      abi: oracleAbi,
      functionName: "observationCount",
      args: [category],
    });
    let twap7d: string | null = null;
    let twapError: string | null = null;
    if (count > 0n) {
      try {
        const twap = await ctx.publicClient.readContract({
          address: ctx.deployment.contracts.RightsPriceOracle,
          abi: oracleAbi,
          functionName: "twap",
          args: [category, 7n * 24n * 3600n],
        });
        twap7d = twap.toString();
      } catch (e) {
        twapError = e instanceof Error ? e.message : String(e);
      }
    }
    return {
      category: "solar",
      categoryHash: category,
      observationCount: count.toString(),
      twap7d,
      twapError,
      oracle: ctx.deployment.contracts.RightsPriceOracle,
    };
  });

  app.get("/playground/config", async () => {
    const ctx = createChainCtx();
    const threshold = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "autoListThreshold",
    });
    return {
      chainId: 10143,
      lorRegistry: ctx.deployment.contracts.LORRegistry,
      autoListThreshold: Number(threshold),
      yieldBands: [
        { min: 95, paidBps: 10_000, escrowBps: 0 },
        { min: 80, paidBps: 8500, escrowBps: 1500 },
        { min: 70, paidBps: 6000, escrowBps: 4000 },
        { min: 0, paidBps: 0, escrowBps: 10_000 },
      ],
      freezeMultiplier: 0.35,
      settlementDecimals: ctx.deployment.settlementDecimals ?? 6,
    };
  });

  app.post("/playground/config", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { autoListThreshold?: number };
    const t = Number(body.autoListThreshold);
    if (!Number.isFinite(t) || t < 0 || t > 100) {
      return reply.code(400).send({ error: "autoListThreshold must be 0–100" });
    }
    const ctx = createChainCtx();
    const hash = await write(ctx.deployerWallet, {
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "setAutoListThreshold",
      args: [BigInt(Math.floor(t))],
    });
    await waitTx(ctx, hash);
    insertAuditEvent(db, {
      kind: "playground.config",
      requestId: hash,
      payload: JSON.stringify({ autoListThreshold: t, tx: hash }),
    });
    return { ok: true, autoListThreshold: Math.floor(t), tx: hash };
  });

  app.get("/chain/status", async () => {
    const ctx = createChainCtx();
    const block = await ctx.publicClient.getBlockNumber();
    const d = ctx.deployment;
    return {
      ok: true,
      chainId: 10143,
      block: block.toString(),
      settlement: {
        token: d.settlementToken ?? d.contracts.OperaAToken,
        symbol: d.settlementSymbol ?? "OPRACVA",
        decimals: d.settlementDecimals ?? 6,
      },
      contracts: d.contracts,
    };
  });
}
