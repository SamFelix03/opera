import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { generateNonce, SiweMessage } from "siwe";

export async function registerSiweRoutes(app: FastifyInstance, db: Database.Database) {
  app.get("/auth/nonce", async (req, reply) => {
    const q = req.query as { address?: string };
    if (!q.address) return reply.code(400).send({ error: "address required" });
    const nonce = generateNonce();
    // Fresh nonce clears verified until /auth/verify succeeds.
    db.prepare(
      `INSERT INTO sessions (address, nonce, verified) VALUES (?, ?, 0)
       ON CONFLICT(address) DO UPDATE SET
         nonce=excluded.nonce,
         verified=0,
         created_at=datetime('now')`,
    ).run(q.address.toLowerCase(), nonce);
    return { nonce };
  });

  app.post("/auth/verify", async (req, reply) => {
    const body = req.body as { message?: string; signature?: string };
    if (!body.message || !body.signature) {
      return reply.code(400).send({ error: "message and signature required" });
    }
    const message = new SiweMessage(body.message);
    const row = db
      .prepare(`SELECT nonce FROM sessions WHERE address = ?`)
      .get(message.address.toLowerCase()) as { nonce: string } | undefined;
    if (!row) return reply.code(401).send({ error: "nonce missing" });

    const result = await message.verify({
      signature: body.signature,
      nonce: row.nonce,
    });
    if (!result.success) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    // Rotate nonce and mark session verified.
    db.prepare(
      `UPDATE sessions SET nonce = ?, verified = 1, created_at = datetime('now') WHERE address = ?`,
    ).run(generateNonce(), message.address.toLowerCase());

    return {
      ok: true,
      address: message.address,
      chainId: message.chainId,
    };
  });

  app.get("/auth/session", async (req, reply) => {
    const q = req.query as { address?: string };
    if (!q.address) return reply.code(400).send({ error: "address required" });
    const row = db
      .prepare(`SELECT address, verified FROM sessions WHERE address = ?`)
      .get(q.address.toLowerCase()) as { address: string; verified: number } | undefined;
    if (!row || !row.verified) {
      return { ok: false, authenticated: false };
    }
    return { ok: true, authenticated: true, address: row.address };
  });
}
