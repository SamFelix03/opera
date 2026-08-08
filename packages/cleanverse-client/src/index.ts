import { createCipheriv, createDecipheriv, createHmac, randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { toBytes, toHex } from "viem";

const ZERO_IV = Buffer.alloc(16, 0);

export class CleanverseError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
    readonly requestId?: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "CleanverseError";
  }
}

export function decodeApiKey(apiKeyBase64: string): Buffer {
  const key = Buffer.from(apiKeyBase64, "base64");
  if (key.length !== 32) {
    throw new Error(`Cleanverse api-key must decode to 32 bytes (AES-256); got ${key.length}`);
  }
  return key;
}

export function encryptJson(plaintext: unknown, apiKeyBase64: string): string {
  const key = decodeApiKey(apiKeyBase64);
  const cipher = createCipheriv("aes-256-cbc", key, ZERO_IV);
  const input = Buffer.from(JSON.stringify(plaintext), "utf8");
  return Buffer.concat([cipher.update(input), cipher.final()]).toString("base64");
}

export function decryptJson<T = unknown>(ciphertextB64: string, apiKeyBase64: string): T {
  const key = decodeApiKey(apiKeyBase64);
  const decipher = createDecipheriv("aes-256-cbc", key, ZERO_IV);
  const input = Buffer.from(ciphertextB64, "base64");
  const plain = Buffer.concat([decipher.update(input), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as T;
}

/** X-Cleanverse-Signature = lowercase hex HMAC-SHA256(rawBody, base64decode(apiKey)) */
export function signWebhookBody(rawBody: Buffer | string, apiKeyBase64: string): string {
  const key = decodeApiKey(apiKeyBase64);
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  return createHmac("sha256", key).update(body).digest("hex");
}

export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signatureHex: string,
  apiKeyBase64: string,
): boolean {
  const expected = signWebhookBody(rawBody, apiKeyBase64);
  const got = signatureHex.trim().toLowerCase().replace(/^0x/, "");
  if (expected.length !== got.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  }
  return mismatch === 0;
}

/** EIP-191 personal_sign over lowercase(chain) + lowercase(address) */
export async function signOwnerMessage(
  privateKey: `0x${string}`,
  chain: string,
  address: string,
): Promise<`0x${string}`> {
  const account = privateKeyToAccount(privateKey);
  const message = `${chain.toLowerCase()}${address.toLowerCase()}`;
  return account.signMessage({ message });
}

export type CleanverseClientOptions = {
  baseUrl: string;
  apiId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
};

type Envelope = {
  code?: string;
  message?: string;
  data?: unknown;
  requestId?: string;
};

export class CleanverseClient {
  readonly baseUrl: string;
  readonly apiId: string;
  readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CleanverseClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiId = opts.apiId;
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    decodeApiKey(this.apiKey);
  }

  private async request(
    path: string,
    body: unknown,
    opts: { encrypt?: boolean; method?: string } = {},
  ): Promise<{ data: unknown; requestId: string; raw: Envelope; httpStatus: number }> {
    const requestId = randomUUID();
    const encrypt = opts.encrypt ?? false;
    const method = opts.method ?? "POST";
    const payload = encrypt ? { data: encryptJson(body, this.apiKey) } : body;

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "api-id": this.apiId,
        "X-Request-ID": requestId,
      },
      body: method === "GET" ? undefined : JSON.stringify(payload),
    });

    const text = await res.text();
    let parsed: Envelope;
    try {
      parsed = JSON.parse(text) as Envelope;
    } catch {
      throw new CleanverseError(
        `Non-JSON response: ${text.slice(0, 200)}`,
        "PARSE",
        res.status,
        requestId,
        text,
      );
    }

    if (typeof parsed.data === "string" && encrypt) {
      try {
        parsed.data = decryptJson(parsed.data, this.apiKey);
      } catch {
        // some success payloads return plain data even on encrypt endpoints
      }
    }

    const code = String(parsed.code ?? "");
    if (res.status === 403) {
      throw new CleanverseError(
        parsed.message ?? "Forbidden (api-id / IP allowlist / decrypt)",
        "403",
        403,
        requestId,
        parsed,
      );
    }

    if (!res.ok || (code && code !== "0000" && code !== "0")) {
      throw new CleanverseError(
        parsed.message ?? `Cleanverse error ${code || res.status}`,
        code || String(res.status),
        res.status,
        requestId,
        parsed,
      );
    }

    return { data: parsed.data, requestId, raw: parsed, httpStatus: res.status };
  }

  // ── A-Pass ──────────────────────────────────────────────
  generateApass(body: Record<string, unknown>) {
    return this.request("/generate_apass", body, { encrypt: true });
  }

  queryApass(body: Record<string, unknown>) {
    return this.request("/query_apass", body);
  }

  queryApassList(body: Record<string, unknown> = { page: 1, pageSize: 20 }) {
    return this.request("/query_apass_list", body);
  }

  updateStatus(body: Record<string, unknown>) {
    return this.request("/update_status", body, { encrypt: true });
  }

  verifyApass(body: Record<string, unknown>) {
    return this.request("/verify_apass", body);
  }

  // ── A-Token ─────────────────────────────────────────────
  launchAtoken(body: Record<string, unknown>) {
    return this.request("/atoken/launch", body, { encrypt: true });
  }

  launchWrappedAtoken(body: Record<string, unknown>) {
    return this.request("/atoken/launch_wrapped_atoken", body, { encrypt: true });
  }

  registerAtoken(body: Record<string, unknown>) {
    return this.request("/atoken/register_atoken", body, { encrypt: true });
  }

  registerWrappedAtoken(body: Record<string, unknown>) {
    return this.request("/atoken/register_wrapped_atoken", body, { encrypt: true });
  }

  async queryApplyStatus(requestId: string) {
    const rid = randomUUID();
    const res = await this.fetchImpl(
      `${this.baseUrl}/atoken/query_apply_status/${encodeURIComponent(requestId)}`,
      {
        method: "GET",
        headers: {
          "api-id": this.apiId,
          "X-Request-ID": rid,
        },
      },
    );
    const parsed = (await res.json()) as Envelope;
    if (!res.ok || (parsed.code && parsed.code !== "0000")) {
      throw new CleanverseError(
        parsed.message ?? "query_apply_status failed",
        String(parsed.code ?? res.status),
        res.status,
        rid,
        parsed,
      );
    }
    return { data: parsed.data, requestId: rid, raw: parsed, httpStatus: res.status };
  }

  addAtokenRule(body: Record<string, unknown>) {
    return this.request("/atoken/add_rule", body, { encrypt: true });
  }

  atokenRules(body: Record<string, unknown>) {
    return this.request("/atoken/rules", body);
  }

  atokenIsPaused(body: Record<string, unknown>) {
    return this.request("/atoken/is_paused", body);
  }

  atokenSetPaused(body: Record<string, unknown>) {
    return this.request("/atoken/set_paused", body, { encrypt: true });
  }

  // ── Validator ───────────────────────────────────────────
  validatorGrant(body: Record<string, unknown>) {
    return this.request("/validator/grant", body, { encrypt: true });
  }

  validatorRegister(body: Record<string, unknown>) {
    return this.request("/validator/register", body, { encrypt: true });
  }

  validatorVerify(body: Record<string, unknown>) {
    return this.request("/validator/verify", body);
  }

  validatorIsRegister(body: Record<string, unknown>) {
    return this.request("/validator/is_register", body);
  }

  validatorRules(body: Record<string, unknown>) {
    return this.request("/validator/rules", body);
  }

  validatorIsPaused(body: Record<string, unknown>) {
    return this.request("/validator/is_paused", body);
  }

  validatorSetPaused(body: Record<string, unknown>) {
    return this.request("/validator/set_paused", body, { encrypt: true });
  }

  validatorSetRule(body: Record<string, unknown>) {
    return this.request("/validator/set_rule", body, { encrypt: true });
  }

  validatorAddRule(body: Record<string, unknown>) {
    return this.request("/validator/add_rule", body, { encrypt: true });
  }

  validatorRemoveRule(body: Record<string, unknown>) {
    return this.request("/validator/remove_rule", body, { encrypt: true });
  }

  // ── Settlement / ramp / faucet ──────────────────────────
  queryTxs(body: Record<string, unknown>) {
    return this.request("/query_txs", body);
  }

  queryInstitutionTxs(body: Record<string, unknown>) {
    return this.request("/query_institution_txs", body);
  }

  downloadTravelRule(body: Record<string, unknown>) {
    return this.request("/download_travel_rule", body);
  }

  faucet(body: Record<string, unknown>) {
    return this.request("/faucet", body);
  }

  queryDepositAtokenList(body: Record<string, unknown>) {
    return this.request("/query_deposit_atoken_list", body);
  }

  queryDepositAddress(body: Record<string, unknown>) {
    return this.request("/query_deposit_address", body);
  }

  queryInstitutionWhiteList(body: Record<string, unknown>) {
    return this.request("/query_institution_white_list", body);
  }

  queryRampQuote(body: Record<string, unknown>) {
    return this.request("/query_ramp_quote", body);
  }

  createRampWidgetUrl(body: Record<string, unknown>) {
    return this.request("/create_ramp_widget_url", body);
  }

  queryRampOrder(body: Record<string, unknown>) {
    return this.request("/query_ramp_order", body);
  }
}

export function clientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CleanverseClient {
  const baseUrl = env.CLEANVERSE_BASE_URL;
  const apiId = env.CLEANVERSE_API_ID;
  const apiKey = env.CLEANVERSE_API_KEY;
  if (!baseUrl || !apiId || !apiKey) {
    throw new Error("CLEANVERSE_BASE_URL, CLEANVERSE_API_ID, CLEANVERSE_API_KEY required");
  }
  return new CleanverseClient({ baseUrl, apiId, apiKey });
}

export { toBytes, toHex };
