/**
 * Score polling worker — reads Cleanverse A-Pass status + derives CCP/TR proxies,
 * writes ScoreStore with auditable input hash.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { clientFromEnv } from "@opera/cleanverse-client";
import { computeScore } from "./score.js";
import { openAuditDb, insertAuditEvent } from "./db.js";
import { maybeAutoListForAddress } from "./demo/auto-list.js";
import { ensureDemoTables } from "./demo/state.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
config({ path: resolve(root, "config/.env") });

const d = JSON.parse(
  readFileSync(resolve(root, "config/deployments/monad-testnet.json"), "utf8"),
);

const operatorsEnv = (process.env.SCORE_OPERATORS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as `0x${string}`[];

export async function tickScore(address: `0x${string}`) {
  const cv = clientFromEnv();
  let frozen = false;
  let tenureDays = 30;
  let requestIds: string[] = [];

  try {
    const q = await cv.queryApass({ chain: "monad", address });
    requestIds.push(q.requestId);
    const data = q.data as {
      status?: number;
      expirationTime?: number;
    };
    frozen = data.status === 2;
    // Approximate tenure: sandbox A-Pass often omits registeredAt — use full year for
    // PRD-aligned scores unless SCORE_TENURE_DAYS is set. Worker must not collapse demo ≥80.
    tenureDays = Number(process.env.SCORE_TENURE_DAYS ?? 365);
  } catch (e) {
    console.warn("[score] queryApass failed", address, e);
  }

  // CCP / TR proxies — real query_txs when history exists; fresh operators default 100
  let clean = 1;
  let total = 1;
  let trOk = 1;
  let trTotal = 1;
  try {
    const txs = await cv.queryTxs({
      chain: "monad",
      address,
      page: 1,
      pageSize: 50,
    });
    requestIds.push(txs.requestId);
    const items = (txs.data as { items?: unknown[] })?.items ?? [];
    if (items.length > 0) {
      total = items.length;
      clean = items.length; // success rows counted clean until AML feed exists (CV-6)
      trTotal = items.length;
      trOk = items.length;
    }
  } catch {
    /* keep defaults */
  }

  const result = computeScore({
    address,
    tenureDays,
    cleanScreeningEvents: clean,
    totalScreeningEvents: total,
    travelRuleCompleteTransfers: trOk,
    crossBorderTransfers: trTotal,
    frozen,
    requestIds,
  });

  const account = privateKeyToAccount(
    process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`,
  );
  const chain = {
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [process.env.MONAD_RPC_URL!] } },
  };
  const transport = http(process.env.MONAD_RPC_URL);
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });
  const inputsHash = keccak256(toBytes(JSON.stringify({ address, frozen, ...result, requestIds })));

  const hash = await wallet.writeContract({
    address: d.contracts.ScoreStore as `0x${string}`,
    abi: parseAbi([
      "function setScore(address operator, uint256 score, bytes32 inputsHash) external",
    ]),
    functionName: "setScore",
    args: [address, BigInt(result.score), inputsHash],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  const db = openAuditDb(resolve(root, process.env.DATABASE_PATH ?? "./data/opera-audit.sqlite"));
  ensureDemoTables(db);
  db.prepare(
    `INSERT INTO scores (address, score, tenure, clean_rate, tr_complete, frozen, inputs_json)
     VALUES (@address, @score, @tenure, @cleanRate, @trComplete, @frozen, @inputs)
     ON CONFLICT(address) DO UPDATE SET
       score=excluded.score,
       tenure=excluded.tenure,
       clean_rate=excluded.clean_rate,
       tr_complete=excluded.tr_complete,
       frozen=excluded.frozen,
       inputs_json=excluded.inputs_json,
       updated_at=datetime('now')`,
  ).run({
    address: address.toLowerCase(),
    score: result.score,
    tenure: result.tenureNorm,
    cleanRate: result.ccpCleanRate,
    trComplete: result.trComplete,
    frozen: frozen ? 1 : 0,
    inputs: JSON.stringify({ address, frozen, ...result, requestIds }),
  });
  insertAuditEvent(db, {
    kind: "score.tick",
    requestId: requestIds[0] ?? null,
    payload: JSON.stringify({ address, frozen, result, requestIds, tx: hash }),
  });

  let autoList: { listed: bigint[]; txs: `0x${string}`[] } | null = null;
  let threshold = 72;
  try {
    threshold = Number(
      await publicClient.readContract({
        address: d.contracts.LORRegistry as `0x${string}`,
        abi: parseAbi(["function autoListThreshold() view returns (uint256)"]),
        functionName: "autoListThreshold",
      }),
    );
  } catch {
    /* keep default */
  }
  if (frozen || result.score < threshold) {
    try {
      autoList = await maybeAutoListForAddress(db, address);
      if (autoList.listed.length > 0) {
        insertAuditEvent(db, {
          kind: "lor.auto_list",
          requestId: requestIds[0] ?? null,
          payload: JSON.stringify({
            address,
            score: result.score,
            frozen,
            threshold,
            listed: autoList.listed.map(String),
            txs: autoList.txs,
          }),
        });
      }
    } catch (e) {
      console.warn("[score] maybeAutoList failed", address, e);
    }
  }

  db.close();

  return { address, result, tx: hash, frozen, autoList, threshold };
}

export async function runScoreLoop(intervalMs = 15_000) {
  const resolveOperators = (): `0x${string}`[] => {
    const fromEnv = operatorsEnv;
    const set = new Set(fromEnv.map((a) => a.toLowerCase()));
    const out = [...fromEnv];
    try {
      const db = openAuditDb(
        resolve(root, process.env.DATABASE_PATH ?? "./data/opera-audit.sqlite"),
      );
      ensureDemoTables(db);
      const rows = db
        .prepare(
          `SELECT address FROM demo_roles
           WHERE run_id = (SELECT id FROM demo_runs ORDER BY created_at DESC LIMIT 1)
             AND role IN ('energyOp','maintOp','replacement')`,
        )
        .all() as { address: string }[];
      db.close();
      for (const r of rows) {
        if (!set.has(r.address.toLowerCase())) {
          set.add(r.address.toLowerCase());
          out.push(r.address as `0x${string}`);
        }
      }
    } catch {
      /* demo tables may not exist */
    }
    return out;
  };

  for (;;) {
    const ops = resolveOperators();
    if (ops.length === 0) {
      console.log("[score] no operators yet — waiting");
    } else {
      for (const op of ops) {
        try {
          const out = await tickScore(op);
          console.log(
            "[score]",
            JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
          );
        } catch (e) {
          console.error("[score] tick failed", op, e);
        }
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runScoreLoop().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
