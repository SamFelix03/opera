/**
 * Shared Cleanverse helpers for product routes and demo orchestrator.
 */
import { clientFromEnv, type CleanverseClient } from "@opera/cleanverse-client";
import type { Hex, PublicClient } from "viem";

export function getCv(existing?: CleanverseClient): CleanverseClient {
  return existing ?? clientFromEnv();
}

export async function ensureApass(
  cv: CleanverseClient,
  publicClient: PublicClient,
  addr: Hex,
  label: string,
): Promise<void> {
  const activate = async () => {
    const r = await cv.updateStatus({
      status: "1",
      wallet: { chain: "monad", address: addr },
    });
    const txHash = (r.data as { txHash?: string } | undefined)?.txHash as Hex | undefined;
    if (txHash) {
      try { await publicClient.waitForTransactionReceipt({ hash: txHash }); } catch { /* optional */ }
    }
  };

  try {
    const q = await cv.queryApass({ chain: "monad", address: addr });
    const status = (q.data as { status?: number })?.status;
    if (status === 2) await activate();
    else if (status !== 1) throw new Error(`apass status ${status}`);
  } catch {
    await cv.generateApass({
      customerId: `OPR${label}${addr.slice(2, 10)}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18).toUpperCase(),
      expirationTime: Math.floor(Date.now() / 1000) + 3 * 365 * 24 * 3600,
      wallet: { address: addr, chain: "monad" },
      identityDataList: [
        { idType: "PASSPORT", fullName: `Opera ${label}`, issuingCountryISO2: "SG" },
      ],
      override: true,
    });
    await new Promise((r) => setTimeout(r, 1500));
  }

  for (let i = 0; i < 12; i++) {
    const q = await cv.queryApass({ chain: "monad", address: addr });
    if ((q.data as { status?: number })?.status === 1) return;
    if ((q.data as { status?: number })?.status === 2) await activate();
    await new Promise((r) => setTimeout(r, 1500));
  }
  const final = await cv.queryApass({ chain: "monad", address: addr });
  if ((final.data as { status?: number })?.status !== 1) {
    throw new Error(`A-Pass for ${addr} not active after ensure (label=${label})`);
  }
}

export async function queryApassStatus(
  cv: CleanverseClient,
  addr: string,
): Promise<{ status: number | null; cvRecordId?: string }> {
  try {
    const q = await cv.queryApass({ chain: "monad", address: addr });
    const data = q.data as { status?: number; cvRecordId?: string };
    return { status: data.status ?? null, cvRecordId: data.cvRecordId };
  } catch {
    return { status: null };
  }
}

export async function freezeWallet(
  cv: CleanverseClient,
  addr: string,
  reason = "Opera: compliance freeze",
): Promise<string> {
  const r = await cv.updateStatus({
    status: "2",
    blacklistReason: reason,
    wallet: { chain: "monad", address: addr },
  });
  return r.requestId;
}

export async function activateWallet(
  cv: CleanverseClient,
  addr: string,
): Promise<string> {
  const r = await cv.updateStatus({
    status: "1",
    wallet: { chain: "monad", address: addr },
  });
  return r.requestId;
}
