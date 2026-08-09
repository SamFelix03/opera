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

export async function registerChainRoutes(
  app: FastifyInstance,
  db: Database.Database,
) {
  app.get("/lors", async (req: FastifyRequest) => {
    const q = req.query as { listed?: string; limit?: string; holder?: string };
    const listedOnly = q.listed === "1" || q.listed === "true";
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const holderFilter = q.holder?.toLowerCase() ?? null;
    const ctx = createChainCtx();
    const next = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "nextId",
    });
    const threshold = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "autoListThreshold",
    });

    // Newest first — old ascending scan hid fresh mint/list IDs behind the limit.
    const items: Record<string, unknown>[] = [];
    for (let id = next - 1n; id >= 1n && items.length < limit; id--) {
      const row = await ctx.publicClient.readContract({
        address: ctx.deployment.contracts.LORRegistry,
        abi: lorAbi,
        functionName: "lors",
        args: [id],
      });
      const [assetId, holder, scope, price, autoListed, active] = row;
      if (!active) continue;
      if (listedOnly && !autoListed) continue;
      if (holderFilter && String(holder).toLowerCase() !== holderFilter) continue;
      const minScore = await ctx.publicClient.readContract({
        address: ctx.deployment.contracts.LORRegistry,
        abi: lorAbi,
        functionName: "minScoreToHold",
        args: [id],
      });
      items.push({
        lorId: id.toString(),
        assetId: assetId.toString(),
        holder,
        scope: scopeLabel(scope),
        scopeRaw: scope,
        price: price.toString(),
        autoListed,
        active,
        minScoreToHold: minScore.toString(),
      });
    }

    return {
      autoListThreshold: Number(threshold),
      settlementToken: ctx.deployment.settlementToken,
      count: items.length,
      nextId: next.toString(),
      lors: items,
    };
  });

  app.get("/mandates", async (req: FastifyRequest) => {
    const q = req.query as { open?: string; limit?: string; publisher?: string };
    const openOnly = q.open === "1" || q.open === "true";
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const publisherFilter = q.publisher?.toLowerCase() ?? null;
    const ctx = createChainCtx();
    const next = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "nextMandateId",
    });

    // Newest first so freshly published cast/demo mandates appear in desk lists.
    const items: Record<string, unknown>[] = [];
    for (let id = next - 1n; id >= 1n && items.length < limit; id--) {
      const m = await ctx.publicClient.readContract({
        address: ctx.deployment.contracts.MandateRegistry,
        abi: manAbi,
        functionName: "mandates",
        args: [id],
      });
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
      if (openOnly && !(open && !awarded)) continue;
      if (publisherFilter && String(publisher).toLowerCase() !== publisherFilter) continue;
      items.push({
        mandateId: id.toString(),
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
      });
    }

    return { count: items.length, nextMandateId: next.toString(), mandates: items };
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
