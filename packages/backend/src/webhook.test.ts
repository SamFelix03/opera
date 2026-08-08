import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { signWebhookBody } from "@opera/cleanverse-client";
import { randomBytes } from "node:crypto";
import { buildApp } from "./index.js";

const apiKey = randomBytes(32).toString("base64");
const dbPath = join(tmpdir(), `opera-webhook-${Date.now()}.sqlite`);

describe("C2.5 webhook HMAC + idempotency", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let db: Awaited<ReturnType<typeof buildApp>>["db"];

  beforeAll(async () => {
    const built = await buildApp({ dbPath, apiKey });
    app = built.app;
    db = built.db;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it("rejects bad signature", async () => {
    const body = JSON.stringify({
      txType: "launch",
      requestId: "WA-BAD",
      applyStatus: "ISSUED",
    });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/atoken-apply",
      headers: {
        "content-type": "application/json",
        "x-cleanverse-signature": "00".repeat(32),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts valid signature and is idempotent", async () => {
    const body = JSON.stringify({
      txType: "launch",
      requestId: "WA-GOOD-1",
      applyStatus: "ISSUED",
    });
    const sig = signWebhookBody(body, apiKey);
    const res1 = await app.inject({
      method: "POST",
      url: "/webhooks/atoken-apply",
      headers: {
        "content-type": "application/json",
        "x-cleanverse-signature": sig,
      },
      payload: body,
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().inserted).toBe(true);

    const res2 = await app.inject({
      method: "POST",
      url: "/webhooks/atoken-apply",
      headers: {
        "content-type": "application/json",
        "x-cleanverse-signature": sig,
      },
      payload: body,
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().inserted).toBe(false);
  });
});

describe("C9 score formula", () => {
  it("88 → 31 with freeze multiplier", async () => {
    const { computeScore, demoInputs88 } = await import("./score.js");
    const raw = computeScore(demoInputs88("0xabc", false));
    expect(raw.rawScore).toBe(88);
    expect(raw.score).toBe(88);
    const frozen = computeScore(demoInputs88("0xabc", true));
    expect(frozen.rawScore).toBe(88);
    expect(frozen.score).toBe(31);
    expect(frozen.band).toBe("suspended");
    expect(frozen.yieldPaidBps).toBe(0);
  });
});
