/**
 * PRD §8 solar-farm demo — thin step machine over Cleanverse + Monad contracts.
 *
 * Steps: bootstrap → setupIdentities → setupAsset → fundAndStake → normalOps
 *        → sanctionsEvent → replacementAcquire → regulatorExport
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import {
  clientFromEnv,
  type CleanverseClient,
} from "@opera/cleanverse-client";
import { OperaAgent } from "@opera/agents";
import {
  keccak256,
  toBytes,
  parseEther,
  parseUnits,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { computeScore, demoInputs88 } from "../score.js";
import { ensureApass as ensureApassHelper } from "../lib/cleanverse-helpers.js";
import { setScore as setScoreHelper } from "../lib/chain-helpers.js";
import {
  appendDemoEvent,
  createDemoRun,
  DEMO_ROLES,
  DEMO_STEPS,
  getDemoRole,
  getDemoRun,
  insertNotification,
  listDemoEvents,
  listDemoRoles,
  listStepStatuses,
  setStepStatus,
  updateDemoRun,
  upsertDemoRole,
  type DemoRole,
  type DemoStepName,
} from "./state.js";
import {
  createChainCtx,
  erc20Abi,
  loadOperaAtokenAddress,
  lorAbi,
  manAbi,
  oracleAbi,
  scoreAbi,
  sendNative,
  waitTx,
  walletFor,
  write,
  type ChainCtx,
} from "./chain.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const ROLE_KEYS_PATH = resolve(root, "keys/demo-roles.json");

const SCOPE_ENERGY = keccak256(toBytes("energy-revenue"));
const SCOPE_MAINT = keccak256(toBytes("maintenance"));
const JURISDICTION_SG = keccak256(toBytes("SG"));
const CATEGORY_SOLAR = keccak256(toBytes("solar"));
const DECIMALS = 6;
const GAS_MIN = parseEther("0.15");

export type OrchestratorOptions = {
  mock?: boolean;
  cv?: CleanverseClient;
  chain?: ChainCtx;
};

function customerIdFor(role: DemoRole, runId: string): string {
  const suffix = runId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  return `OPR${role.toUpperCase().slice(0, 4)}${suffix}XX`.slice(0, 18);
}

function loadRoleKeys(): Partial<Record<DemoRole, Hex>> {
  try {
    if (!existsSync(ROLE_KEYS_PATH)) return {};
    return JSON.parse(readFileSync(ROLE_KEYS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveRoleKeys(keys: Partial<Record<DemoRole, Hex>>) {
  mkdirSync(resolve(root, "keys"), { recursive: true });
  writeFileSync(ROLE_KEYS_PATH, JSON.stringify(keys, null, 2));
}

export class DemoOrchestrator {
  readonly db: Database.Database;
  readonly opts: OrchestratorOptions;
  private cv: CleanverseClient | null = null;
  private chain: ChainCtx | null = null;

  constructor(db: Database.Database, opts: OrchestratorOptions = {}) {
    this.db = db;
    this.opts = opts;
  }

  private log(
    runId: string,
    step: DemoStepName | null,
    kind: string,
    message: string,
    payload: unknown = {},
  ) {
    appendDemoEvent(this.db, runId, kind, message, payload, step);
  }

  private getCv(): CleanverseClient {
    if (this.opts.cv) return this.opts.cv;
    if (!this.cv) this.cv = clientFromEnv();
    return this.cv;
  }

  private getChain(): ChainCtx {
    if (this.opts.chain) return this.opts.chain;
    if (!this.chain) this.chain = createChainCtx();
    return this.chain;
  }

  /** Settlement = Cleanverse Opera A-Token (6 decimals). */
  private settlementToken(runSettlement?: string | null): Hex {
    return (runSettlement as Hex) || loadOperaAtokenAddress();
  }

  private requireId(
    runId: string,
    label: string,
    value: number | null | undefined,
  ): bigint {
    if (value == null) {
      throw new Error(`${label} missing — complete setupAsset first (run ${runId})`);
    }
    return BigInt(value);
  }

  private async ensureGas(ctx: ChainCtx, addr: Hex, min = GAS_MIN) {
    const bal = await ctx.publicClient.getBalance({ address: addr });
    if (bal >= min) return;
    await waitTx(
      ctx,
      await sendNative(ctx.deployerWallet, { to: addr, value: min - bal + parseEther("0.05") }),
    );
  }

  private async ensureApass(addr: Hex, label: string) {
    await ensureApassHelper(this.getCv(), this.getChain().publicClient, addr, label);
  }

  private async setScore(ctx: ChainCtx, addr: Hex, score: number, tag: string) {
    await setScoreHelper(ctx, addr, score, tag);
  }

  private agent(
    ctx: ChainCtx,
    name: string,
    pk: Hex,
    stakeToken: Hex,
    maxSpend: bigint,
  ) {
    return new OperaAgent({
      name,
      privateKey: pk,
      rpcUrl: ctx.rpcUrl,
      mandateRegistry: ctx.deployment.contracts.MandateRegistry,
      stakeToken,
      revenueManager: ctx.deployment.contracts.RevenueManager,
      maxSpendPerTx: maxSpend,
    });
  }

  // ── Public API ────────────────────────────────────────────

  bootstrap(runId?: string) {
    const id = runId ?? createDemoRun(this.db);
    const keys = loadRoleKeys();
    let dirty = false;
    const rolesOut: Array<{ role: DemoRole; address: string; customerId: string }> = [];

    for (const role of DEMO_ROLES) {
      const existing = getDemoRole(this.db, id, role);
      if (existing) {
        rolesOut.push({
          role,
          address: existing.address,
          customerId: existing.customerId ?? customerIdFor(role, id),
        });
        continue;
      }
      let pk = keys[role];
      if (!pk) {
        pk = generatePrivateKey();
        keys[role] = pk;
        dirty = true;
      }
      const account = privateKeyToAccount(pk);
      const cid = customerIdFor(role, id);
      upsertDemoRole(this.db, {
        runId: id,
        role,
        address: account.address,
        privateKey: pk,
        customerId: cid,
        cvRecordId: null,
      });
      rolesOut.push({ role, address: account.address, customerId: cid });
    }
    if (dirty) saveRoleKeys(keys);

    updateDemoRun(this.db, id, { status: "bootstrapped" });
    this.log(id, null, "bootstrap", "Demo run created", { roles: rolesOut });
    return {
      runId: id,
      roles: rolesOut,
      fundHint: "fundAndStake auto-funds MON + CVA from deployer",
    };
  }

  getRun(runId: string) {
    const run = getDemoRun(this.db, runId);
    if (!run) return null;
    return {
      ...run,
      runId: run.id,
      roles: listDemoRoles(this.db, runId).map((r) => ({
        role: r.role,
        address: r.address,
        customerId: r.customerId,
        cvRecordId: r.cvRecordId,
      })),
      steps: listStepStatuses(this.db, runId),
    };
  }

  async runStep(runId: string, step: DemoStepName): Promise<unknown> {
    if (!getDemoRun(this.db, runId)) throw new Error(`unknown run ${runId}`);
    setStepStatus(this.db, runId, step, "running");
    this.log(runId, step, "step.start", `Starting ${step}`);
    updateDemoRun(this.db, runId, { currentStep: step, status: "running" });
    try {
      const fn = {
        setupIdentities: () => this.setupIdentities(runId),
        setupAsset: () => this.setupAsset(runId),
        fundAndStake: () => this.fundAndStake(runId),
        normalOps: () => this.normalOps(runId),
        sanctionsEvent: () => this.sanctionsEvent(runId),
        replacementAcquire: () => this.replacementAcquire(runId),
        regulatorExport: () => this.regulatorExport(runId),
      }[step];
      const result = await fn();
      setStepStatus(this.db, runId, step, "done");
      this.log(runId, step, "step.done", `Completed ${step}`, result ?? {});
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStepStatus(this.db, runId, step, "failed", msg);
      this.log(runId, step, "step.failed", msg);
      throw e;
    }
  }

  async runAll(runId: string) {
    const results: Record<string, unknown> = {};
    updateDemoRun(this.db, runId, { status: "running" });
    this.log(runId, null, "run-all.start", "Sequential demo run started");
    for (const step of DEMO_STEPS) {
      results[step] = await this.runStep(runId, step);
    }
    updateDemoRun(this.db, runId, { status: "completed", currentStep: "regulatorExport" });
    this.log(runId, null, "run-all.done", "PRD §8 demo completed");
    return { results };
  }

  // ── Steps ─────────────────────────────────────────────────

  async setupIdentities(runId: string) {
    if (this.opts.mock) {
      for (const role of DEMO_ROLES) {
        const r = getDemoRole(this.db, runId, role)!;
        upsertDemoRole(this.db, { ...r, cvRecordId: `mock-cv-${role}` });
      }
      this.log(runId, "setupIdentities", "identity.mock", "Mock A-Passes");
      return { mode: "mock" };
    }

    const cv = this.getCv();
    const expirationTime = Math.floor(Date.now() / 1000) + 3 * 365 * 24 * 3600;
    const out: Record<string, unknown> = {};

    for (const role of DEMO_ROLES) {
      const r = getDemoRole(this.db, runId, role)!;
      try {
        const q = await cv.queryApass({ chain: "monad", address: r.address });
        const data = q.data as { status?: number; cvRecordId?: string };
        if (data.status === 1 || data.status === 2) {
          upsertDemoRole(this.db, { ...r, cvRecordId: data.cvRecordId ?? r.cvRecordId });
          out[role] = { reused: true, cvRecordId: data.cvRecordId };
          continue;
        }
      } catch {
        /* generate */
      }
      const customerId = r.customerId ?? customerIdFor(role, runId);
      const gen = await cv.generateApass({
        customerId,
        expirationTime,
        wallet: { address: r.address, chain: "monad" },
        identityDataList: [
          { idType: "PASSPORT", fullName: `Opera Demo ${role}`, issuingCountryISO2: "SG" },
        ],
      });
      upsertDemoRole(this.db, {
        ...r,
        customerId,
        cvRecordId: (gen.data as { cvRecordId?: string })?.cvRecordId ?? null,
      });
      out[role] = { generated: true, requestId: gen.requestId };
    }
    return out;
  }

  async setupAsset(runId: string) {
    const energy = getDemoRole(this.db, runId, "energyOp")!;
    const maint = getDemoRole(this.db, runId, "maintOp")!;

    if (this.opts.mock) {
      updateDemoRun(this.db, runId, {
        assetId: 1,
        energyLorId: 1,
        maintLorId: 2,
        energyMandateId: 1,
        maintMandateId: 2,
      });
      this.log(runId, "setupAsset", "scores.mock", "Mock asset ids");
      return { mode: "mock", assetId: 1 };
    }

    const ctx = this.getChain();
    const d = ctx.deployment;
    const assetId = BigInt(d.assetId ?? 1);
    const energyScore = computeScore({
      ...demoInputs88(energy.address, false),
      travelRuleCompleteTransfers: 5,
      crossBorderTransfers: 5,
    });
    const maintScore = computeScore(demoInputs88(maint.address, false));

    await this.setScore(ctx, energy.address as Hex, energyScore.score, "energy");
    await this.setScore(ctx, maint.address as Hex, maintScore.score, "maint");

    const nextLor = await ctx.publicClient.readContract({
      address: d.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "nextId",
    });
    await waitTx(
      ctx,
      await write(ctx.deployerWallet, {
        address: d.contracts.LORRegistry,
        abi: lorAbi,
        functionName: "mintLOR",
        args: [assetId, energy.address as Hex, SCOPE_ENERGY, 80n],
      }),
    );
    await waitTx(
      ctx,
      await write(ctx.deployerWallet, {
        address: d.contracts.LORRegistry,
        abi: lorAbi,
        functionName: "mintLOR",
        args: [assetId, maint.address as Hex, SCOPE_MAINT, 80n],
      }),
    );

    const stake = parseUnits("5000", DECIMALS);
    const maxSpend = parseUnits("200000", DECIMALS);
    const nextMan = await ctx.publicClient.readContract({
      address: d.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "nextMandateId",
    });
    await waitTx(
      ctx,
      await write(ctx.deployerWallet, {
        address: d.contracts.MandateRegistry,
        abi: manAbi,
        functionName: "publishMandate",
        args: [assetId, SCOPE_ENERGY, 80n, JURISDICTION_SG, stake, maxSpend],
      }),
    );
    await waitTx(
      ctx,
      await write(ctx.deployerWallet, {
        address: d.contracts.MandateRegistry,
        abi: manAbi,
        functionName: "publishMandate",
        args: [assetId, SCOPE_MAINT, 80n, JURISDICTION_SG, stake, maxSpend],
      }),
    );

    const ids = {
      assetId: Number(assetId),
      energyLorId: Number(nextLor),
      maintLorId: Number(nextLor) + 1,
      energyMandateId: Number(nextMan),
      maintMandateId: Number(nextMan) + 1,
    };
    updateDemoRun(this.db, runId, ids);
    this.log(runId, "setupAsset", "asset.ready", "LORs + mandates published", ids);
    return ids;
  }

  async fundAndStake(runId: string) {
    const run = getDemoRun(this.db, runId)!;
    const energy = getDemoRole(this.db, runId, "energyOp")!;
    const maint = getDemoRole(this.db, runId, "maintOp")!;
    const replacement = getDemoRole(this.db, runId, "replacement")!;
    const owner = getDemoRole(this.db, runId, "owner")!;

    if (this.opts.mock) {
      updateDemoRun(this.db, runId, { settlementToken: "0xmock", settlementMode: "mock" });
      this.log(runId, "fundAndStake", "fund.mock", "Mock fund + stake");
      return { mode: "mock" };
    }

    const ctx = this.getChain();
    const d = ctx.deployment;
    const token = this.settlementToken();
    updateDemoRun(this.db, runId, {
      settlementToken: token,
      settlementMode: "opera-atoken",
    });

    const mintAmt = parseUnits("100000", DECIMALS);
    const people = [energy, maint, replacement, owner];

    // Gas + A-Pass + mint for operators; A-Pass on contracts that receive CVA
    for (const r of people) {
      const addr = r.address as Hex;
      await this.ensureGas(ctx, addr);
      await this.ensureApass(addr, r.role);
      await waitTx(
        ctx,
        await write(ctx.deployerWallet, {
          address: token,
          abi: erc20Abi,
          functionName: "mint",
          args: [addr, mintAmt],
        }),
      );
    }
    for (const addr of [
      d.contracts.MandateRegistry,
      d.contracts.LORRegistry,
      d.contracts.RevenueManager,
    ] as Hex[]) {
      await this.ensureApass(addr, "CTR");
    }

    // Scores must be ≥80 for bid (re-assert in case score worker stomped)
    const eScore = computeScore({
      ...demoInputs88(energy.address, false),
      travelRuleCompleteTransfers: 5,
      crossBorderTransfers: 5,
    });
    const mScore = computeScore(demoInputs88(maint.address, false));
    const rScore = computeScore({
      ...demoInputs88(replacement.address, false),
      travelRuleCompleteTransfers: 5,
      crossBorderTransfers: 5,
    });
    await this.setScore(ctx, energy.address as Hex, eScore.score, "bid-e");
    await this.setScore(ctx, maint.address as Hex, mScore.score, "bid-m");
    await this.setScore(ctx, replacement.address as Hex, rScore.score, "bid-r");

    const maxSpend = parseUnits("200000", DECIMALS);
    const energyAgent = this.agent(ctx, "energyOp", energy.privateKey as Hex, token, maxSpend);
    const maintAgent = this.agent(ctx, "maintOp", maint.privateKey as Hex, token, maxSpend);

    await this.ensureGas(ctx, energy.address as Hex);
    await this.ensureGas(ctx, maint.address as Hex);

    const energyMan = this.requireId(runId, "energyMandateId", run.energyMandateId);
    const maintMan = this.requireId(runId, "maintMandateId", run.maintMandateId);
    const bidE = await energyAgent.bidOn(energyMan);
    const bidM = await maintAgent.bidOn(maintMan);

    const awardE = await write(ctx.deployerWallet, {
      address: d.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "award",
      args: [energyMan, energy.address as Hex],
    });
    await waitTx(ctx, awardE);
    const awardM = await write(ctx.deployerWallet, {
      address: d.contracts.MandateRegistry,
      abi: manAbi,
      functionName: "award",
      args: [maintMan, maint.address as Hex],
    });
    await waitTx(ctx, awardM);

    this.log(runId, "fundAndStake", "mandate.award", "Mandates awarded", {
      bidE,
      bidM,
      awardE,
      awardM,
    });
    return { token, bidE, bidM };
  }

  async normalOps(runId: string) {
    const run = getDemoRun(this.db, runId)!;
    const energy = getDemoRole(this.db, runId, "energyOp")!;
    const maint = getDemoRole(this.db, runId, "maintOp")!;
    const owner = getDemoRole(this.db, runId, "owner")!;

    if (this.opts.mock) {
      const high = computeScore({
        ...demoInputs88(energy.address, false),
        travelRuleCompleteTransfers: 5,
        crossBorderTransfers: 5,
      });
      this.log(runId, "normalOps", "revenue.mock", "Mock revenue", { score: high.score });
      return { mode: "mock", score: high.score };
    }

    const ctx = this.getChain();
    const d = ctx.deployment;
    const token = this.settlementToken(run.settlementToken);
    const gross = parseUnits("180000", DECIMALS);

    await this.ensureGas(ctx, energy.address as Hex, parseEther("0.2"));
    await this.ensureGas(ctx, maint.address as Hex, parseEther("0.2"));

    const energyScore = computeScore({
      ...demoInputs88(energy.address, false),
      travelRuleCompleteTransfers: 5,
      crossBorderTransfers: 5,
    });
    await this.setScore(ctx, energy.address as Hex, energyScore.score, "ops");

    await waitTx(
      ctx,
      await write(ctx.deployerWallet, {
        address: token,
        abi: erc20Abi,
        functionName: "mint",
        args: [energy.address as Hex, gross],
      }),
    );

    const agent = this.agent(
      ctx,
      "energyOp",
      energy.privateKey as Hex,
      token,
      parseUnits("200000", DECIMALS),
    );
    const distTx = await agent.executeRevenue(
      this.requireId(runId, "energyMandateId", run.energyMandateId),
      gross,
    );

    await waitTx(
      ctx,
      await write(ctx.deployerWallet, {
        address: d.contracts.RightsPriceOracle,
        abi: oracleAbi,
        functionName: "recordPrice",
        args: [CATEGORY_SOLAR, parseUnits("1200", DECIMALS)],
      }),
    );

    // Inspection: principalOk-gated CVA fee (best-effort)
    let inspectionTx: Hex | null = null;
    try {
      await this.getCv().verifyApass({
        chain: "monad",
        address: maint.address,
        tokenAddress: token,
      });
      const maintAgent = this.agent(
        ctx,
        "maintOp",
        maint.privateKey as Hex,
        token,
        parseUnits("10000", DECIMALS),
      );
      inspectionTx = await maintAgent.executeInspection(
        this.requireId(runId, "maintMandateId", run.maintMandateId),
        parseUnits("50", DECIMALS),
        owner.address as Hex,
      );
    } catch (e) {
      this.log(runId, "normalOps", "inspection.skip", String(e instanceof Error ? e.message : e));
    }

    // Travel Rule best-effort on A-Token transfer hashes
    const travelUrls: Array<{ txHash: string; url?: string; error?: string }> = [];
    for (const txHash of [distTx, ...(inspectionTx ? [inspectionTx] : [])]) {
      try {
        const tr = await this.getCv().downloadTravelRule({ chain: "monad", txHash });
        travelUrls.push({
          txHash,
          url: (tr.data as { downloadUrl?: string })?.downloadUrl,
        });
      } catch (e) {
        travelUrls.push({
          txHash,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    this.log(runId, "normalOps", "revenue.distribute", "Revenue + oracle done", {
      distTx,
      inspectionTx,
      score: energyScore.score,
    });
    return { distributeTx: distTx, inspectionTx, energyScore: energyScore.score, travelUrls };
  }

  async sanctionsEvent(runId: string) {
    const run = getDemoRun(this.db, runId)!;
    const maint = getDemoRole(this.db, runId, "maintOp")!;
    const owner = getDemoRole(this.db, runId, "owner")!;

    const frozenResult = computeScore(demoInputs88(maint.address, true));
    if (frozenResult.score !== 31 || frozenResult.rawScore !== 88) {
      throw new Error(`freeze formula broken: ${frozenResult.rawScore}→${frozenResult.score}`);
    }

    if (this.opts.mock) {
      insertNotification(this.db, {
        address: owner.address,
        kind: "lor.auto_listed",
        title: "Maintenance LOR auto-listed",
        body: `Score dropped to ${frozenResult.score} after freeze.`,
        payload: { lorId: run.maintLorId, score: frozenResult.score },
      });
      this.log(runId, "sanctionsEvent", "freeze.mock", "Mock freeze + auto-list", {
        score: frozenResult.score,
        rawScore: frozenResult.rawScore,
      });
      return { mode: "mock", score: frozenResult.score, rawScore: frozenResult.rawScore };
    }

    const ctx = this.getChain();
    const cv = this.getCv();

    // Wallet-only freeze (customerId causes CV_100)
    let freezeRequestId: string;
    try {
      const freeze = await cv.updateStatus({
        status: "2",
        blacklistReason: "Opera demo: sanctions watchlist",
        wallet: { chain: "monad", address: maint.address },
      });
      freezeRequestId = freeze.requestId;
    } catch (e) {
      const q = await cv.queryApass({ chain: "monad", address: maint.address });
      if ((q.data as { status?: number })?.status !== 2) throw e;
      freezeRequestId = q.requestId;
    }

    await this.setScore(ctx, maint.address as Hex, frozenResult.score, "frozen");

    const listPrice = parseUnits("500", DECIMALS);
    const listTx = await write(ctx.deployerWallet, {
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "maybeAutoList",
      args: [this.requireId(runId, "maintLorId", run.maintLorId), listPrice],
    });
    await waitTx(ctx, listTx);

    const lorState = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "lors",
      args: [this.requireId(runId, "maintLorId", run.maintLorId)],
    });

    insertNotification(this.db, {
      address: owner.address,
      kind: "lor.auto_listed",
      title: "Maintenance LOR auto-listed",
      body: `Score ${frozenResult.score} after freeze. LOR #${run.maintLorId} listed.`,
      payload: { lorId: run.maintLorId, score: frozenResult.score, listTx, autoListed: lorState[4] },
    });

    this.log(runId, "sanctionsEvent", "lor.auto_listed", "Auto-listed after freeze", {
      score: frozenResult.score,
      listTx,
      autoListed: lorState[4],
    });

    return {
      freezeRequestId,
      score: frozenResult.score,
      rawScore: frozenResult.rawScore,
      listTx,
      autoListed: lorState[4],
    };
  }

  async replacementAcquire(runId: string) {
    const run = getDemoRun(this.db, runId)!;
    const replacement = getDemoRole(this.db, runId, "replacement")!;
    const maint = getDemoRole(this.db, runId, "maintOp")!;
    const owner = getDemoRole(this.db, runId, "owner")!;

    if (this.opts.mock) {
      insertNotification(this.db, {
        address: owner.address,
        kind: "lor.acquired",
        title: "Maintenance LOR transferred",
        body: `Replacement acquired LOR #${run.maintLorId}.`,
        payload: { lorId: run.maintLorId, buyer: replacement.address },
      });
      this.log(runId, "replacementAcquire", "acquire.mock", "Mock acquire");
      return { mode: "mock", holder: replacement.address };
    }

    const ctx = this.getChain();
    const token = this.settlementToken(run.settlementToken);
    const listPrice = parseUnits("500", DECIMALS);
    const { wallet } = walletFor(ctx, replacement.privateKey as Hex);

    const repScore = computeScore({
      ...demoInputs88(replacement.address, false),
      travelRuleCompleteTransfers: 5,
      crossBorderTransfers: 5,
    });
    await this.setScore(ctx, replacement.address as Hex, repScore.score, "acq");
    await this.ensureGas(ctx, replacement.address as Hex);

    await waitTx(
      ctx,
      await write(wallet, {
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [ctx.deployment.contracts.LORRegistry, listPrice],
      }),
    );

    // Frozen A-Pass cannot receive CVA — activate and wait before settlement
    await this.ensureApass(maint.address as Hex, "maintOp");

    const maintLorId = this.requireId(runId, "maintLorId", run.maintLorId);
    const acqTx = await write(wallet, {
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "acquireLOR",
      args: [maintLorId],
    });
    await waitTx(ctx, acqTx);

    const cv = this.getCv();
    await cv
      .updateStatus({
        status: "2",
        blacklistReason: "Opera demo: re-freeze after settlement",
        wallet: { chain: "monad", address: maint.address },
      })
      .catch(() => undefined);

    const lorFinal = await ctx.publicClient.readContract({
      address: ctx.deployment.contracts.LORRegistry,
      abi: lorAbi,
      functionName: "lors",
      args: [maintLorId],
    });

    insertNotification(this.db, {
      address: owner.address,
      kind: "lor.acquired",
      title: "Maintenance LOR transferred",
      body: `Replacement ${replacement.address} acquired LOR #${run.maintLorId}.`,
      payload: { lorId: run.maintLorId, buyer: replacement.address, tx: acqTx },
    });

    this.log(runId, "replacementAcquire", "lor.acquired", "Replacement acquired LOR", {
      tx: acqTx,
      holder: lorFinal[1],
    });
    return { acquireTx: acqTx, holder: lorFinal[1], score: repScore.score };
  }

  async regulatorExport(runId: string) {
    const run = this.getRun(runId)!;
    const events = listDemoEvents(this.db, runId, 1000);

    const pack = {
      title: "Opera Protocol — PRD §8 Solar Farm Audit Pack",
      generatedAt: new Date().toISOString(),
      runId,
      asset: {
        name: "Malaysia Solar Farm",
        assetId: run.assetId,
        energyLorId: run.energyLorId,
        maintLorId: run.maintLorId,
      },
      settlement: { token: run.settlementToken, mode: run.settlementMode },
      freezeFormula: { demo: "raw 88 → frozen 31", multiplier: 0.35 },
      events: events.map((e) => ({
        id: e.id,
        step: e.step,
        kind: e.kind,
        message: e.message,
        payload: (() => {
          try {
            return JSON.parse(e.payload);
          } catch {
            return e.payload;
          }
        })(),
        createdAt: e.createdAt,
      })),
    };

    const canonical = JSON.stringify(pack);
    const contentHash = keccak256(toBytes(canonical));
    let signature: Hex | null = null;
    let signer: string | null = null;
    if (!this.opts.mock) {
      try {
        const ctx = this.getChain();
        signature = await ctx.deployerWallet.signMessage({
          account: ctx.deployer,
          message: { raw: contentHash },
        });
        signer = ctx.deployer.address;
      } catch {
        /* skip */
      }
    }

    const signedPack = {
      ...pack,
      integrity: {
        alg: "EIP-191",
        contentHash,
        sha256: createHash("sha256").update(canonical).digest("hex"),
        signer,
        signature,
      },
    };

    const outDir = resolve(root, "data/demo-exports");
    mkdirSync(outDir, { recursive: true });
    const jsonPath = resolve(outDir, `${runId}.json`);
    writeFileSync(jsonPath, JSON.stringify(signedPack, null, 2));

    let pdfPath: string | null = null;
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      let page = doc.addPage([612, 792]);
      let y = 750;
      const draw = (text: string, size = 10, isBold = false) => {
        if (y < 40) {
          page = doc.addPage([612, 792]);
          y = 750;
        }
        page.drawText(text.slice(0, 100), {
          x: 40,
          y,
          size,
          font: isBold ? bold : font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= size + 6;
      };
      draw("Opera Protocol — Audit Pack", 16, true);
      draw(`Run: ${runId}`);
      draw(`Generated: ${pack.generatedAt}`);
      draw(`Hash: ${contentHash}`, 8);
      draw("Event log", 12, true);
      for (const e of signedPack.events.slice(0, 80)) {
        draw(`[${e.createdAt}] ${e.kind}: ${e.message}`, 8);
      }
      pdfPath = resolve(outDir, `${runId}.pdf`);
      writeFileSync(pdfPath, await doc.save());
    } catch {
      /* optional */
    }

    updateDemoRun(this.db, runId, { exportPath: jsonPath, status: "exported" });
    this.log(runId, "regulatorExport", "export.ready", "Audit pack written", {
      jsonPath,
      pdfPath,
      eventCount: events.length,
      signed: Boolean(signature),
    });
    return { jsonPath, pdfPath, eventCount: events.length, pack: signedPack };
  }
}
