import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { generateNonce, SiweMessage } from "siwe";

export async function registerSiweRoutes(app: FastifyInstance, db: Database.Database) {
  app.get("/auth/nonce", async (req, reply) => {
    const q = req.query as { address?: string };
    if (!q.address) return reply.code(400).send({ error: "address required" });
    const nonce = generateNonce();
    db.prepare(
      `INSERT INTO sessions (address, nonce) VALUES (?, ?)
       ON CONFLICT(address) DO UPDATE SET nonce=excluded.nonce, created_at=datetime('now')`,
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

    // Rotate nonce after success
    db.prepare(`UPDATE sessions SET nonce = ? WHERE address = ?`).run(
      generateNonce(),
      message.address.toLowerCase(),
    );

    return {
      ok: true,
      address: message.address,
      chainId: message.chainId,
    };
  });
}
