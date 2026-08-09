/**
 * On-chain market + playground config APIs (read Monad; owner writes via deployer key).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type Database from "better-sqlite3";
import { keccak256, toBytes, type Hex } from "viem";
import {
  CATEGORY_SOLAR,
  createChainCtx,
  lorAbi,
  manAbi,
  oracleAbi,
  write,
  waitTx,
} from "./demo/chain.js";
import { insertAuditEvent } from "./db.js";

function scopeLabel(scope: Hex): string {
  const known: Record<string, string> = {
    [keccak256(toBytes("energy-revenue")).toLowerCase()]: "energy-revenue",
    [keccak256(toBytes("maintenance")).toLowerCase()]: "maintenance",
  };
  return known[scope.toLowerCase()] ?? scope;
}

/** How many recent IDs to scan (newest-first). Keeps us under public RPC rate limits. */
const SCAN_WINDOW = 80n;

type MandateTuple = readonly [
  bigint,
  Hex,
  bigint,
  Hex,
  bigint,
  bigint,
  Hex,
  Hex,
  boolean,
  boolean,
];

type LorTuple = readonly [bigint, Hex, Hex, bigint, boolean, boolean];

let mandatesCache: { at: number; next: string; items: Record<string, unknown>[] } | null =
  null;
const MANDATES_CACHE_MS = 8_000;

export async function registerChainRoutes(
  app: FastifyInstance,
  db: Database.Database,
) {
  app.get("/lors", async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { listed?: string; limit?: string; holder?: string };
    const listedOnly = q.listed === "1" || q.listed === "true";
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const holderFilter = q.holder?.toLowerCase() ?? null;
    try {
      const ctx = createChainCtx();
      const registry = ctx.deployment.contracts.LORRegistry;
      const [next, threshold] = await Promise.all([
        ctx.publicClient.readContract({
          address: registry,
          abi: lorAbi,
          functionName: "nextId",
        }),
        ctx.publicClient.readContract({
          address: registry,
          abi: lorAbi,
          functionName: "autoListThreshold",
        }),
      ]);

      const ids: bigint[] = [];
      const start = next > 1n ? next - 1n : 0n;
      for (let id = start; id >= 1n && ids.length < Number(SCAN_WINDOW); id--) {
        ids.push(id);
      }

      const rows = ids.length
        ? await ctx.publicClient.multicall({
            allowFailure: true,
            contracts: ids.map((id) => ({
              address: registry,
              abi: lorAbi,
              functionName: "lors" as const,
              args: [id] as const,
            })),
          })
        : [];

      const scoreIds: bigint[] = [];
      const prelim: { id: bigint; row: LorTuple }[] = [];
      for (let i = 0; i < ids.length; i++) {
        const r = rows[i];
        if (r.status !== "success" || !r.result) continue;
        const row = r.result as LorTuple;
        const [, holder, , , autoListed, active] = row;
        if (!active) continue;
        if (listedOnly && !autoListed) continue;
        if (holderFilter && String(holder).toLowerCase() !== holderFilter) continue;
        prelim.push({ id: ids[i]!, row });
        scoreIds.push(ids[i]!);
        if (prelim.length >= limit) break;
      }

      const scores = scoreIds.length
        ? await ctx.publicClient.multicall({
            allowFailure: true,
            contracts: scoreIds.map((id) => ({
              address: registry,
              abi: lorAbi,
              functionName: "minScoreToHold" as const,
              args: [id] as const,
            })),
          })
        : [];

      const items: Record<string, unknown>[] = prelim.map((p, i) => {
        const [assetId, holder, scope, price, autoListed, active] = p.row;
        const minScore =
          scores[i]?.status === "success" ? (scores[i]!.result as bigint) : 0n;
        return {
          lorId: p.id.toString(),
          assetId: assetId.toString(),
          holder,
          scope: scopeLabel(scope),
          scopeRaw: scope,
          price: price.toString(),
          autoListed,
          active,
          minScoreToHold: minScore.toString(),
        };
      });

      return {
        autoListThreshold: Number(threshold),
        settlementToken: ctx.deployment.settlementToken,
        count: items.length,
        nextId: next.toString(),
        lors: items,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(502).send({ error: "lor list failed", detail: msg });
    }
  });

  app.get("/mandates", async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { open?: string; limit?: string; publisher?: string };
    const openOnly = q.open === "1" || q.open === "true";
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const publisherFilter = q.publisher?.toLowerCase() ?? null;

    try {
      const ctx = createChainCtx();
      const registry = ctx.deployment.contracts.MandateRegistry;
      const next = await ctx.publicClient.readContract({
        address: registry,
        abi: manAbi,
        functionName: "nextMandateId",
      });

      // Reuse a short cache of the recent window when unfiltered (desks poll often).
      const cacheKeyOk = !publisherFilter && !openOnly;
      if (
        cacheKeyOk &&
        mandatesCache &&
        mandatesCache.next === next.toString() &&
        Date.now() - mandatesCache.at < MANDATES_CACHE_MS
      ) {
        const sliced = mandatesCache.items.slice(0, limit);
        return { count: sliced.length, nextMandateId: next.toString(), mandates: sliced };
      }

      const ids: bigint[] = [];
      const start = next > 1n ? next - 1n : 0n;
      for (let id = start; id >= 1n && ids.length < Number(SCAN_WINDOW); id--) {
        ids.push(id);
      }

      const rows = ids.length
        ? await ctx.publicClient.multicall({
            allowFailure: true,
            contracts: ids.map((id) => ({
              address: registry,
              abi: manAbi,
              functionName: "mandates" as const,
              args: [id] as const,
            })),
          })
        : [];

      const allRecent: Record<string, unknown>[] = [];
      const items: Record<string, unknown>[] = [];
      for (let i = 0; i < ids.length; i++) {
        const r = rows[i];
        if (r.status !== "success" || !r.result) continue;
        const m = r.result as MandateTuple;
        const [
          assetId,
          scope,
          minScore,
          jurisdictionRoot,
          stakeAmount,
          maxSpendPerTx,
          publisher,
          winner,
          open,
          awarded,
        ] = m;
        const row = {
          mandateId: ids[i]!.toString(),
          assetId: assetId.toString(),
          scope: scopeLabel(scope),
          scopeRaw: scope,
          minScore: minScore.toString(),
          jurisdictionRoot,
          stakeAmount: stakeAmount.toString(),
          maxSpendPerTx: maxSpendPerTx.toString(),
          publisher,
          winner,
          open,
          awarded,
        };
        allRecent.push(row);
        if (openOnly && !(open && !awarded)) continue;
        if (publisherFilter && String(publisher).toLowerCase() !== publisherFilter) continue;
        items.push(row);
        if (items.length >= limit) break;
      }

      if (!publisherFilter && !openOnly) {
        mandatesCache = { at: Date.now(), next: next.toString(), items: allRecent };
      }

      return { count: items.length, nextMandateId: next.toString(), mandates: items };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(502).send({ error: "mandate list failed", detail: msg });
    }
  });

  app.get("/mandates/:id/bids", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) {
      return reply.code(400).send({ error: "invalid mandate id" });
    }
    const mandateId = BigInt(id);
    const ctx = createChainCtx();
    const bids: { index: number; bidder: string; stake: string; active: boolean }[] = [];

    for (let i = 0; i < 200; i++) {
      try {
        const row = await ctx.publicClient.readContract({
          address: ctx.deployment.contracts.MandateRegistry,
          abi: manAbi,
          functionName: "bids",
          args: [mandateId, BigInt(i)],
        });
        const [bidder, stake, active] = row;
        if (active) {
          bids.push({
            index: i,
            bidder,
            stake: stake.toString(),
            active,
          });
        }
      } catch {
        break;
      }
    }

    return { mandateId: id, count: bids.length, bids };
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
