import deployments from "../../../config/deployments/monad-testnet.json";
import type {
  BootstrapResponse,
  DemoEvent,
  DemoRun,
  DemoStepName,
} from "./types/demo";

const API = "/api";

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(body || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text || res.statusText);
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  return parse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ——— Demo orchestration ——— */

export function bootstrapDemo(body?: Record<string, unknown>) {
  return apiPost<BootstrapResponse>("/demo/bootstrap", body ?? {});
}

export function getDemoRun(runId: string) {
  return apiGet<DemoRun>(`/demo/${runId}`);
}

export function runDemoStep(runId: string, step: DemoStepName) {
  return apiPost<{ ok?: boolean; step: string; result?: unknown; error?: string }>(
    `/demo/${runId}/step/${step}`,
  );
}

export function runDemoAll(runId: string) {
  return apiPost<{ ok?: boolean; results?: unknown }>(`/demo/${runId}/run-all`);
}

export function getDemoEvents(runId: string) {
  return apiGet<{ events: DemoEvent[] }>(`/demo/${runId}/events`).then((res) => ({
    events: (res.events ?? []).map(normalizeEvent),
  }));
}

function normalizeEvent(ev: DemoEvent & { payload?: unknown; message?: string }): DemoEvent {
  return {
    ...ev,
    message: ev.message,
    payload:
      typeof ev.payload === "string"
        ? (() => {
            try {
              return JSON.parse(ev.payload);
            } catch {
              return ev.payload;
            }
          })()
        : ev.payload,
  };
}

export function resolveRunId(run: DemoRun | null | undefined): string | null {
  if (!run) return null;
  return run.runId ?? run.id ?? null;
}

export function demoIdsSummary(run: DemoRun) {
  return {
    assetId: run.assetId,
    lorIds: run.lorIds ?? {
      energy: run.energyLorId,
      maintenance: run.maintLorId,
    },
    mandateIds: run.mandateIds ?? {
      energy: run.energyMandateId,
      maintenance: run.maintMandateId,
    },
    settlement: {
      token: run.settlementToken,
      mode: run.settlementMode,
    },
  };
}

export function getDemoStatus() {
  return apiGet<{ events: DemoEvent[] }>("/demo/status");
}

export function downloadDemoExport(runId: string) {
  return apiDownload(`/demo/${runId}/export`, `opera-demo-${runId}-audit.json`);
}

export function getNotifications(address: string) {
  return apiGet<{ notifications: unknown[] }>(
    `/notifications?address=${encodeURIComponent(address)}`,
  );
}

export function getScore(address: string) {
  return apiGet<{ score: unknown }>(`/scores/${address}`);
}

export function computeScore(body: Record<string, unknown>) {
  return apiPost<Record<string, unknown>>("/scores/compute", body);
}

export function getAuditEvents(limit = 50) {
  return apiGet<{ events: unknown[] }>(`/audit/events?limit=${limit}`);
}

export function normalizeRoles(
  roles: BootstrapResponse["roles"] | DemoRun["roles"] | undefined,
): { role: string; address: string; label?: string; customerId?: string | null }[] {
  if (!roles) return [];
  if (Array.isArray(roles)) {
    return roles.map((r) => ({
      role: r.role,
      address: r.address,
      label: r.label,
      customerId: r.customerId,
    }));
  }
  return Object.entries(roles).map(([role, value]) => {
    if (typeof value === "string") {
      return { role, address: value };
    }
    return {
      role: value.role ?? role,
      address: value.address,
      label: value.label,
      customerId: value.customerId,
    };
  });
}

/* ——— Product APIs (SIWE-gated) ——— */

function authHeaders(): Record<string, string> {
  const addr = sessionStorage.getItem("opera.siwe.address") ?? "";
  return addr ? { "x-opera-address": addr } : {};
}

export async function apiAuthGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  return parse<T>(res);
}

export async function apiAuthPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export function getMe() {
  return apiAuthGet<{
    address: string;
    score: Record<string, unknown> | null;
    onChainScore: string | null;
    apass: { status: number | null; cvRecordId?: string };
    settlement: { token: string; symbol: string; decimals: number };
  }>("/v1/me");
}

export function ensureApass() {
  return apiAuthPost<{ ok: boolean; address: string; apass: unknown }>("/v1/apass/ensure");
}

export function pushScore(address?: string) {
  return apiAuthPost<{ ok: boolean; address: string; score: number; tx: string }>("/v1/scores/push", address ? { address } : undefined);
}

export function mintLor(holder: string, scope: string, minScore = 70, assetId?: number) {
  return apiAuthPost<{ ok: boolean; lorId: string; tx: string }>("/v1/lors/mint", { holder, scope, minScore, assetId });
}

export function autoListLor(lorId: string, listPrice?: string) {
  return apiAuthPost<{ ok: boolean; lorId: string; tx: string }>(`/v1/lors/${lorId}/auto-list`, { listPrice });
}

export { deployments };
