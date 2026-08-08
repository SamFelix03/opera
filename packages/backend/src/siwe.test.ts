import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { SiweMessage } from "siwe";
import { randomBytes } from "node:crypto";
import { buildApp } from "./index.js";

const apiKey = randomBytes(32).toString("base64");
const dbPath = join(tmpdir(), `opera-siwe-${Date.now()}.sqlite`);

describe("C8 SIWE auth", () => {
  let app: Awaited<ReturnType<typeof buildApp>>["app"];
  let db: Awaited<ReturnType<typeof buildApp>>["db"];
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);

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

  it("issues nonce and verifies SIWE signature", async () => {
    const nonceRes = await app.inject({
      method: "GET",
      url: `/auth/nonce?address=${account.address}`,
    });
    expect(nonceRes.statusCode).toBe(200);
    const { nonce } = nonceRes.json();

    const message = new SiweMessage({
      domain: "localhost",
      address: account.address,
      statement: "Sign in to Opera Protocol",
      uri: "http://localhost:8787",
      version: "1",
      chainId: 10143,
      nonce,
    });
    const prepared = message.prepareMessage();
    const signature = await account.signMessage({ message: prepared });

    const verifyRes = await app.inject({
      method: "POST",
      url: "/auth/verify",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ message: prepared, signature }),
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().ok).toBe(true);
    expect(verifyRes.json().address.toLowerCase()).toBe(account.address.toLowerCase());
  });
});
