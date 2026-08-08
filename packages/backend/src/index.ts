import Fastify, { type FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { verifyWebhookSignature } from "@opera/cleanverse-client";
import { insertAuditEvent, openAuditDb, listAuditEvents } from "./db.js";
import { registerSiweRoutes } from "./siwe.js";
import { registerApiRoutes } from "./routes.js";
import { registerDemoRoutes } from "./demo/routes.js";
import { registerChainRoutes } from "./chain-routes.js";
import { registerProductRoutes } from "./product-routes.js";
import { startWorkers } from "./workers.js";
import type Database from "better-sqlite3";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
config({ path: resolve(root, "config/.env") });

export async function buildApp(opts?: {
  dbPath?: string;
  apiKey?: string;
}): Promise<{ app: FastifyInstance; db: Database.Database }> {
  const apiKey = opts?.apiKey ?? process.env.CLEANVERSE_API_KEY;
  if (!apiKey) throw new Error("CLEANVERSE_API_KEY required");

  const dbPath =
    opts?.dbPath ??
    resolve(root, process.env.DATABASE_PATH ?? "./data/opera-audit.sqlite");
  const db = openAuditDb(dbPath);

  const app = Fastify({
    // pino worker transport needs thread-stream; keep console logging via hooks if needed
    logger: false,
  });

  if (!opts?.dbPath) {
    app.addHook("onRequest", async (req) => {
      if (req.url !== "/health") {
        console.log(`[http] ${req.method} ${req.url}`);
      }
    });
  }

  await app.register(async (instance) => {
    instance.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body, done) => {
        (req as { rawBody?: Buffer }).rawBody = body as Buffer;
        try {
          const json = body.length ? JSON.parse((body as Buffer).toString("utf8")) : {};
          done(null, json);
        } catch (e) {
          done(e as Error, undefined);
        }
      },
    );

    instance.post("/webhooks/atoken-apply", async (req, reply) => {
      const raw = (req as { rawBody?: Buffer }).rawBody;
      if (!raw) {
        return reply.code(400).send({ error: "missing raw body" });
      }
      const sig = String(req.headers["x-cleanverse-signature"] ?? "");
      if (!verifyWebhookSignature(raw, sig, apiKey)) {
        return reply.code(401).send({ error: "invalid signature" });
      }

      const body = req.body as {
        txType?: string;
        requestId?: string;
        applyStatus?: string;
        data?: unknown;
      };
      const txType = body.txType ?? "atoken-apply";
      const requestId = body.requestId;
      if (!requestId) {
        return reply.code(400).send({ error: "requestId required" });
      }

      const result = insertAuditEvent(db, {
        kind: "webhook.atoken-apply",
        txType,
        requestId,
        payload: raw.toString("utf8"),
      });

      // Idempotent success on duplicate
      return reply.code(200).send({
        ok: true,
        inserted: result.inserted,
        id: result.id,
        applyStatus: body.applyStatus,
      });
    });

    instance.get("/health", async () => ({ ok: true }));

    instance.get("/audit/events", async (req) => {
      const q = req.query as { limit?: string };
      return { events: listAuditEvents(db, Number(q.limit ?? 50)) };
    });

    await registerSiweRoutes(instance, db);
    await registerApiRoutes(instance, db);
    await registerChainRoutes(instance, db);
    await registerDemoRoutes(instance, db);
    await registerProductRoutes(instance, db);
  });

  return { app, db };
}

async function main() {
  const { app } = await buildApp();
  startWorkers();
  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ port, host: "0.0.0.0" });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
