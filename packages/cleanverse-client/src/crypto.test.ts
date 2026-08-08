import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptJson,
  encryptJson,
  signWebhookBody,
  verifyWebhookSignature,
  CleanverseClient,
  decodeApiKey,
} from "./index.js";

// re-export helper for synthetic key
function syntheticKeyB64(): string {
  return randomBytes(32).toString("base64");
}

describe("AES-256-CBC zero-IV", () => {
  it("round-trips JSON with 32-byte key", () => {
    const key = syntheticKeyB64();
    expect(decodeApiKey(key).length).toBe(32);
    const payload = { hello: "opera", n: 42, nested: { a: true } };
    const ct = encryptJson(payload, key);
    expect(typeof ct).toBe("string");
    expect(decryptJson(ct, key)).toEqual(payload);
  });

  it("rejects non-32-byte keys", () => {
    expect(() => decodeApiKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("matches Node createCipheriv reference vector", () => {
    const key = Buffer.alloc(32, 7);
    const keyB64 = key.toString("base64");
    const plain = Buffer.from(JSON.stringify({ x: 1 }), "utf8");
    const cipher = createCipheriv("aes-256-cbc", key, Buffer.alloc(16, 0));
    const expected = Buffer.concat([cipher.update(plain), cipher.final()]).toString("base64");
    expect(encryptJson({ x: 1 }, keyB64)).toBe(expected);
  });
});

describe("webhook HMAC", () => {
  it("signs and verifies raw body", () => {
    const key = syntheticKeyB64();
    const body = Buffer.from('{"event":"ISSUED","requestId":"WA1"}', "utf8");
    const sig = signWebhookBody(body, key);
    expect(sig).toMatch(/^[0-9a-f]+$/);
    expect(verifyWebhookSignature(body, sig, key)).toBe(true);
    expect(verifyWebhookSignature(body, "00".repeat(32), key)).toBe(false);
  });

  it("matches createHmac reference", () => {
    const key = Buffer.alloc(32, 3);
    const keyB64 = key.toString("base64");
    const body = "raw-bytes";
    const expected = createHmac("sha256", key).update(body).digest("hex");
    expect(signWebhookBody(body, keyB64)).toBe(expected);
  });
});

describe("CleanverseClient encrypt path (mocked fetch)", () => {
  it("wraps body in {data: ciphertext} when encrypt=true", async () => {
    const key = syntheticKeyB64();
    let captured: string | undefined;
    const client = new CleanverseClient({
      baseUrl: "https://example.test/api/cooperate",
      apiId: "APPTEST",
      apiKey: key,
      fetchImpl: async (_url, init) => {
        captured = String(init?.body);
        return new Response(JSON.stringify({ code: "0000", message: "ok", data: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    await client.generateApass({ customerId: "OPRATEST00001", expirationTime: 1863690034, wallet: { address: "0xabc", chain: "monad" } });
    const parsed = JSON.parse(captured!);
    expect(parsed.data).toBeTypeOf("string");
    expect(decryptJson(parsed.data, key)).toMatchObject({ customerId: "OPRATEST00001" });
  });
});
