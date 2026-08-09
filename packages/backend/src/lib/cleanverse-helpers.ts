/**
 * Shared Cleanverse helpers for product routes and demo orchestrator.
 */
import {
  clientFromEnv,
  signOwnerMessage,
  type CleanverseClient,
} from "@opera/cleanverse-client";
import { keccak256, toBytes, type Hex, type PublicClient } from "viem";
import { loadDeployment, loadOperaAtokenAddress, OPERA_ATOKEN } from "../demo/chain.js";

export const CHAIN = "monad";
export const JURISDICTION_SG = keccak256(toBytes("SG"));

export type ApassProfile = {
  status: number | null;
  cvRecordId?: string;
  tier?: string;
  subTier?: number;
  group?: string;
  subGroup?: string;
  countries: string[];
  expirationTime?: number;
  registeredAt?: string;
  tenureDays: number;
  requestId?: string;
};

export function getCv(existing?: CleanverseClient): CleanverseClient {
  return existing ?? clientFromEnv();
}

export function settlementAtoken(): Hex {
  const d = loadDeployment();
  return (d.settlementToken ?? d.contracts.OperaAToken ?? loadOperaAtokenAddress() ?? OPERA_ATOKEN) as Hex;
}

function asCountries(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => String(c).trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
}

/** Tenure days from registeredAt, else derive from expirationTime assuming 3y issuance window. */
export function tenureDaysFromApass(data: {
  registeredAt?: string;
  expirationTime?: number;
}): number {
  const override = process.env.SCORE_TENURE_DAYS;
  if (override && Number.isFinite(Number(override))) return Math.max(1, Number(override));

  if (data.registeredAt) {
    const t = Date.parse(data.registeredAt.endsWith("Z") ? data.registeredAt : `${data.registeredAt}Z`);
    if (!Number.isNaN(t)) {
      return Math.max(1, Math.min(3650, Math.floor((Date.now() - t) / 86_400_000)));
    }
  }
  if (data.expirationTime && data.expirationTime > 0) {
    const issuedApprox = data.expirationTime - 3 * 365 * 24 * 3600;
    if (issuedApprox > 0) {
      return Math.max(1, Math.min(3650, Math.floor((Date.now() / 1000 - issuedApprox) / 86_400)));
    }
  }
  return 365;
}

export async function queryApassStatus(
  cv: CleanverseClient,
  addr: string,
): Promise<ApassProfile> {
  const empty: ApassProfile = { status: null, countries: [], tenureDays: 365 };
  try {
    const q = await cv.queryApass({ chain: CHAIN, address: addr });
    const data = q.data as {
      status?: number;
      cvRecordId?: string;
      tier?: string;
      subTier?: number;
      group?: string;
      subGroup?: string;
      countries?: string[];
      expirationTime?: number;
      registeredAt?: string;
    };
    let registeredAt = data.registeredAt;
    // query_apass may omit registeredAt — list endpoint has it
    if (!registeredAt) {
      try {
        const list = await cv.queryApassList({
          chain: CHAIN,
          walletAddress: addr,
          page: 1,
          pageSize: 5,
        });
        const items =
          (list.data as { items?: Array<{ walletAddress?: string; registeredAt?: string }> })
            ?.items ?? [];
        const hit = items.find(
          (i) => i.walletAddress?.toLowerCase() === addr.toLowerCase(),
        );
        registeredAt = hit?.registeredAt ?? items[0]?.registeredAt;
      } catch {
        /* optional */
      }
    }
    return {
      status: data.status ?? null,
      cvRecordId: data.cvRecordId,
      tier: data.tier,
      subTier: data.subTier,
      group: data.group,
      subGroup: data.subGroup,
      countries: asCountries(data.countries),
      expirationTime: data.expirationTime,
      registeredAt,
      tenureDays: tenureDaysFromApass({
        registeredAt,
        expirationTime: data.expirationTime,
      }),
      requestId: q.requestId,
    };
  } catch {
    return empty;
  }
}

export async function ensureApass(
  cv: CleanverseClient,
  publicClient: PublicClient,
  addr: Hex,
  label: string,
  countryIso2 = "SG",
): Promise<void> {
  const activate = async () => {
    const r = await cv.updateStatus({
      status: "1",
      wallet: { chain: CHAIN, address: addr },
    });
    const txHash = (r.data as { txHash?: string } | undefined)?.txHash as Hex | undefined;
    if (txHash) {
      try {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      } catch {
        /* optional */
      }
    }
  };

  try {
    const q = await cv.queryApass({ chain: CHAIN, address: addr });
    const status = (q.data as { status?: number })?.status;
    if (status === 2) await activate();
    else if (status !== 1) throw new Error(`apass status ${status}`);
  } catch {
    await cv.generateApass({
      customerId: `OPR${label}${addr.slice(2, 10)}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18).toUpperCase(),
      expirationTime: Math.floor(Date.now() / 1000) + 3 * 365 * 24 * 3600,
      wallet: { address: addr, chain: CHAIN },
      identityDataList: [
        {
          idType: "PASSPORT",
          fullName: `Opera ${label}`,
          issuingCountryISO2: countryIso2.toUpperCase(),
        },
      ],
      override: true,
    });
    await new Promise((r) => setTimeout(r, 1500));
  }

  for (let i = 0; i < 12; i++) {
    const q = await cv.queryApass({ chain: CHAIN, address: addr });
    if ((q.data as { status?: number })?.status === 1) return;
    if ((q.data as { status?: number })?.status === 2) await activate();
    await new Promise((r) => setTimeout(r, 1500));
  }
  const final = await cv.queryApass({ chain: CHAIN, address: addr });
  if ((final.data as { status?: number })?.status !== 1) {
    throw new Error(`A-Pass for ${addr} not active after ensure (label=${label})`);
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
    wallet: { chain: CHAIN, address: addr },
  });
  return r.requestId;
}

export async function activateWallet(
  cv: CleanverseClient,
  addr: string,
): Promise<string> {
  const r = await cv.updateStatus({
    status: "1",
    wallet: { chain: CHAIN, address: addr },
  });
  return r.requestId;
}

/** Hard gate: verify_apass data.code must be 4 (valid A-Pass + transfer allowed). */
export async function requireValidApass(
  cv: CleanverseClient,
  addr: string,
  atoken: string = settlementAtoken(),
): Promise<{ code: number; message?: string; requestId: string }> {
  const r = await cv.verifyApass({
    chain: CHAIN,
    atoken,
    address: addr,
  });
  const data = r.data as { code?: number; message?: string };
  const code = Number(data.code ?? 0);
  if (code !== 4) {
    const labels: Record<number, string> = {
      1: "A-Token not found",
      2: "user does not have A-Pass",
      3: "A-Pass exists but cannot transfer A-Token (expired or frozen)",
    };
    throw new Error(
      `verify_apass failed for ${addr}: code=${code} (${labels[code] ?? data.message ?? "not eligible"})`,
    );
  }
  return { code, message: data.message, requestId: r.requestId };
}

/** Decode mandate jurisdictionRoot (keccak256 of ISO2) into country codes we recognize. */
export function countriesFromJurisdictionRoot(root: Hex | string): string[] {
  const r = String(root).toLowerCase();
  if (!r || r === "0x" + "0".repeat(64)) return [];
  if (r === JURISDICTION_SG.toLowerCase()) return ["SG"];
  // keccak256("MY"), ("US") for future mandates
  const known: Record<string, string> = {
    [keccak256(toBytes("MY")).toLowerCase()]: "MY",
    [keccak256(toBytes("US")).toLowerCase()]: "US",
    [keccak256(toBytes("SG")).toLowerCase()]: "SG",
  };
  const c = known[r];
  return c ? [c] : [];
}

export async function requireJurisdiction(
  cv: CleanverseClient,
  addr: string,
  jurisdictionRoot: Hex | string,
): Promise<{ countries: string[]; required: string[] }> {
  const required = countriesFromJurisdictionRoot(jurisdictionRoot);
  if (required.length === 0) {
    const apass = await queryApassStatus(cv, addr);
    return { countries: apass.countries, required: [] };
  }
  const apass = await queryApassStatus(cv, addr);
  const ok = required.some((c) => apass.countries.includes(c));
  if (!ok) {
    throw new Error(
      `jurisdiction gate: ${addr} A-Pass countries [${apass.countries.join(",") || "none"}] ` +
        `do not satisfy mandate requirement [${required.join(",")}]`,
    );
  }
  return { countries: apass.countries, required };
}

export type ValidatorCheck = {
  skipped: boolean;
  valid?: boolean;
  requestId?: string;
  pool?: string;
  reason?: string;
};

/**
 * CCP pool eligibility via POST /validator/verify.
 * Skips (does not fail) when CLEANVERSE_VALIDATOR_POOL is unset — register a pool first via scripts.
 */
export async function checkValidatorEligibility(
  cv: CleanverseClient,
  userAddress: string,
): Promise<ValidatorCheck> {
  const pool = process.env.CLEANVERSE_VALIDATOR_POOL?.trim();
  if (!pool) {
    return { skipped: true, reason: "CLEANVERSE_VALIDATOR_POOL unset" };
  }
  try {
    const r = await cv.validatorVerify({
      chain: CHAIN,
      contract_address: pool,
      user_address: userAddress,
    });
    const valid = Boolean((r.data as { valid?: boolean })?.valid);
    return { skipped: false, valid, requestId: r.requestId, pool };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Pool missing / paused — soft skip so demo is not bricked
    if (/12027|not register|paused|Invalid/i.test(msg)) {
      return { skipped: true, reason: msg, pool };
    }
    throw e;
  }
}

export async function requireValidatorIfConfigured(
  cv: CleanverseClient,
  userAddress: string,
): Promise<ValidatorCheck> {
  const check = await checkValidatorEligibility(cv, userAddress);
  if (!check.skipped && check.valid === false) {
    throw new Error(
      `validator/verify rejected ${userAddress} for pool ${check.pool} (CCP eligibility)`,
    );
  }
  return check;
}

/** Combined preflight for economic actions that move oCVA. */
export async function requireComplianceForAction(
  cv: CleanverseClient,
  addr: string,
  opts: { jurisdictionRoot?: Hex | string; skipValidator?: boolean } = {},
): Promise<{
  apass: ApassProfile;
  verifyRequestId: string;
  validator: ValidatorCheck;
  jurisdiction?: { countries: string[]; required: string[] };
}> {
  const verify = await requireValidApass(cv, addr);
  const apass = await queryApassStatus(cv, addr);
  let jurisdiction: { countries: string[]; required: string[] } | undefined;
  if (opts.jurisdictionRoot) {
    jurisdiction = await requireJurisdiction(cv, addr, opts.jurisdictionRoot);
  }
  const validator = opts.skipValidator
    ? { skipped: true, reason: "skipped" }
    : await requireValidatorIfConfigured(cv, addr);
  return { apass, verifyRequestId: verify.requestId, validator, jurisdiction };
}

export async function downloadTravelRuleForTx(
  cv: CleanverseClient,
  txHash: string,
  walletAddress: string,
  meta?: { customerId?: string; cvRecordId?: string },
): Promise<{ txHash: string; downloadUrl?: string; fileName?: string; error?: string; requestId?: string }> {
  try {
    const tr = await cv.downloadTravelRule({
      txHash,
      customerId: meta?.customerId,
      cvRecordId: meta?.cvRecordId,
      wallet: { chain: CHAIN, address: walletAddress },
    });
    const data = tr.data as { downloadUrl?: string; fileName?: string };
    return {
      txHash,
      downloadUrl: data.downloadUrl,
      fileName: data.fileName,
      requestId: tr.requestId,
    };
  } catch (e) {
    return {
      txHash,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function listInstitutionApasses(
  cv: CleanverseClient,
  opts: { page?: number; pageSize?: number; status?: number; walletAddress?: string } = {},
) {
  return cv.queryApassList({
    chain: CHAIN,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 20,
    ...(opts.status != null ? { status: opts.status } : {}),
    ...(opts.walletAddress ? { walletAddress: opts.walletAddress } : {}),
  });
}

export async function queryDepositAddress(cv: CleanverseClient, address: string) {
  return cv.queryDepositAddress({ chain: CHAIN, address });
}

export async function queryInstitutionWhitelist(cv: CleanverseClient, symbol?: string) {
  return cv.queryInstitutionWhiteList({
    chain: CHAIN,
    ...(symbol ? { symbol } : {}),
  });
}

export async function queryAtokenRules(cv: CleanverseClient, atoken = settlementAtoken()) {
  return cv.atokenRules({ chain: CHAIN, atoken_address: atoken });
}

/**
 * Ensure an SG country whitelist rule exists on the Opera A-Token (idempotent-ish:
 * add_rule rejects duplicates — treat that as success).
 */
export async function ensureAtokenSgCountryRule(
  cv: CleanverseClient,
  atoken: string = settlementAtoken(),
): Promise<{ ok: boolean; added: boolean; rules: unknown; error?: string }> {
  const existing = await cv.atokenRules({ chain: CHAIN, atoken_address: atoken });
  const rules =
    (existing.data as { rules?: Array<{ countries?: string[]; is_black_list?: boolean }> })?.rules ??
    [];
  const hasSg = rules.some(
    (r) => !r.is_black_list && asCountries(r.countries).includes("SG"),
  );
  if (hasSg) return { ok: true, added: false, rules };

  try {
    await cv.addAtokenRule({
      chain: CHAIN,
      atoken_address: atoken,
      rule: {
        allowed_group: "",
        allowed_sub_group: "",
        min_tier: 0,
        min_sub_tier: 0,
        is_black_list: false,
        countries: ["SG"],
      },
    });
    const after = await cv.atokenRules({ chain: CHAIN, atoken_address: atoken });
    return { ok: true, added: true, rules: after.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/duplicate|already|exist/i.test(msg)) {
      return { ok: true, added: false, rules, error: msg };
    }
    return { ok: false, added: false, rules, error: msg };
  }
}

/** EIP-191 owner_signature for Cleanverse write endpoints that require it. */
export async function ownerSignatureFor(
  subjectAddress: string,
  privateKey: `0x${string}` = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`,
): Promise<`0x${string}`> {
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY required for owner_signature");
  return signOwnerMessage(privateKey, CHAIN, subjectAddress);
}
