# Opera Protocol — Production Scalability & Hardening Plan

**Audience:** engineering + judges evaluating long-term viability  
**Scope:** how Opera moves from the hackathon stack (Fastify + SQLite + in-process workers + Monad public RPC + demo A-Pass stubs) to a production-grade, multi-tenant compliance market.  
**Constraint:** every recommendation below maps to something already in the repo (LOR lifecycle, Cleanverse A-Pass/A-Token/Validator/Travel Rule, ScoreStore, Cast/product desks). No vaporware primitives.

---

## 0. Current baseline (honest)

| Layer | Hackathon today | Production target |
| --- | --- | --- |
| API | Single Fastify process on Railway | Stateless API fleet behind LB + region pin |
| Data | SQLite (`better-sqlite3`) file | Postgres primary + read replicas; Redis for sessions/queues |
| Chain index | Polling `getLogs` every ~12s into SQLite | Dedicated indexer → Postgres; optional subgraph later |
| Scores | In-process loop ~15s | Queue workers; Cleanverse webhooks + on-demand verify |
| Identity | Stub `generate_apass` with synthetic passport | Real KYC provider → Cleanverse A-Pass registration |
| Keys | Deployer + score writer EOAs; cast keys in SQLite | KMS / HSM; policy engines; no hot demo keys in DB |
| Settlement | Cleanverse A-Token oCVA on Monad testnet | Same rails on mainnet + optional Fiat Ramp when licensed |
| Observability | Console logs | OpenTelemetry + metrics + audit log pipeline |

The product thesis does not change: LORs remain compliance-priced operating rights. This document is about making that thesis survive real institutions, real KYC, and real traffic.

---

## 1. Guiding principles

1. **Cleanverse remains the compliance source of truth** for identity (A-Pass), money (A-Token), CCP eligibility (Validator), and Travel Rule artefacts. Opera does not re-implement KYC screening.
2. **Opera remains the economic engine** for LOR mint/transfer/acquire, mandates, yield bonding, auto-list, and score → market effects.
3. **SQLite is a demo read model**, not an institution-grade store. Production uses Postgres with clear write paths and idempotency keys.
4. **No long-running work in the HTTP request path.** Mint/bid gates stay sync and fast; score refresh, TR download, chain sync, KYC callbacks are async.
5. **Every money-moving path is gated** by `verify_apass` + Validator `verify` + jurisdiction rules before chain write.
6. **Secrets never live in application DB.** Cast-style disposable keys are hackathon-only.
7. **Auditability is a first-class product.** Every Cleanverse `requestId`, tx hash, and score input hash is stored and exportable.

---

## 2. Target architecture

```
                    ┌──────────────┐
   Wallet / SIWE ──►│ API (Fastify)│──► Postgres (OLTP)
                    └──────┬───────┘         │
                           │                 ▼
                           │          Redis (session, rate limit, cache)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        Score workers  Indexer     KYC / webhook workers
              │            │            │
              ▼            ▼            ▼
         ScoreStore    Monad RPC   Cleanverse cooperate API
         (Monad)       + receipts  (A-Pass, A-Token, Validator, TR)
              │
              ▼
         LOR / Mandate / Revenue contracts
```

**Deployment topology (production):**

- **API service** — N replicas, CPU-bound JSON + SIWE; no SQLite file mounts.
- **Worker service(s)** — score, chain-index, KYC/webhook, Travel Rule fetcher; scale independently.
- **Indexer** — can be the same worker pool initially; split when log volume warrants.
- **Postgres** — managed (RDS / Neon / Railway Postgres / Cloud SQL) with PITR.
- **Redis** — managed; used for SIWE nonces, rate limits, job locks, short-lived caches.
- **Object storage** — S3-compatible for Travel Rule PDFs, audit pack PDFs, KYC evidence references (never raw PII if avoidable).
- **Secrets** — Vault / AWS Secrets Manager / GCP Secret Manager; Railway env only for bootstrap refs.

---

## 3. Data plane: replace SQLite with Postgres

### 3.1 Why

SQLite is excellent for the cast demo (single writer, zero ops). It fails for:

- Concurrent API + worker writers under load
- Horizontal API replicas (file locking / shared volume hell)
- Point-in-time recovery and regulated retention
- Cross-region read replicas for auditor dashboards

### 3.2 Schema domains (logical)

Keep the current mental model; promote tables from SQLite into Postgres schemas:

| Schema | Tables (illustrative) | Writers |
| --- | --- | --- |
| `identity` | `wallets`, `apass_snapshots`, `kyc_cases`, `validator_checks` | API + KYC worker |
| `market` | `mandates`, `lors`, `bids`, `acquisitions` | Indexer + API (projections) |
| `score` | `score_runs`, `score_inputs`, `score_onchain_txs` | Score worker |
| `settlement` | `ocva_transfers`, `travel_rule_reports`, `atoken_webhooks` | Workers |
| `audit` | `events`, `export_packs`, `notifications` | All services (append-only) |
| `ops` | `outbox`, `job_runs`, `sync_cursors` | Workers |

### 3.3 Patterns

- **Idempotency:** every Cleanverse mutation stores `requestId` UNIQUE; every chain write stores `tx_hash` UNIQUE.
- **Transactional outbox:** API writes `outbox` row in same TX as business row; worker publishes jobs. Avoid dual-write races that SQLite papered over.
- **Cursor-based chain sync:** replace ad-hoc SQLite cursors with `ops.sync_cursors(chain_id, contract, block)` and chunked `eth_getLogs` with backoff.
- **Read models:** list endpoints (`/lors`, `/mandates`) always hit Postgres projections, never live RPC on the hot path (already the intent of `chain-sync.ts`).
- **Migrations:** Prisma / Drizzle / node-pg-migrate — versioned, CI-gated. No hand-edited prod schemas.
- **Connection pooling:** PgBouncer or driver pool sized to `(API_replicas × pool) + workers < DB max_connections`.

### 3.4 Redis responsibilities

| Keyspace | Purpose |
| --- | --- |
| `siwe:nonce:*` | Login nonces with TTL |
| `rl:addr:*` / `rl:ip:*` | Rate limits on ensure/freeze/bid |
| `lock:score:{addr}` | Prevent double `setScore` for same operator |
| `cache:apass:{addr}` | Short TTL (30–120s) after `query_apass` |
| `cache:validator:{pool}:{addr}` | Short TTL after `validator/verify` |

Do **not** cache freeze decisions across sanctions windows without invalidation from webhooks.

---

## 4. Identity: real KYC → Cleanverse A-Pass

Cleanverse expects the **institution** to complete KYC, then call `generate_apass` with identity attributes (`identityDataList`, optional `kycSource` / `kycId`). Opera should own the UX and case management; Cleanverse owns on-chain A-Pass registration.

### 4.1 Target flow

```
User connects wallet (SIWE)
    → Create KYC case (Sumsub / Persona / Onfido)
    → User completes document + liveness in vendor SDK
    → Vendor webhook: review.approved | review.rejected | resubmission
    → Opera maps approved profile → Cleanverse generate_apass
         customerId = stable institution customer id
         identityDataList = [{ idType, fullName, issuingCountryISO2, ... }]
         kycSource / kycId = vendor identifiers
         wallet = { address, chain: monad }
    → Poll / webhook until A-Pass status = 1 (active)
    → Snapshot countries, tenure start, cvRecordId into Postgres
    → Unlock product actions (bid / acquire / distribute)
```

### 4.2 Production rules

1. **Never** call `generate_apass` with synthetic `Opera ${label}` names outside demo/cast mode (`DEMO_MOCK` or `CAST_MODE`).
2. **Country tags** must come from verified `issuingCountryISO2` (or vendor address country policy) — this feeds mandate `jurisdictionRoot` gates.
3. **Re-KYC / refresh:** expirationTime from Cleanverse; cron opens renewal cases 30 days before expiry.
4. **Sanctions / freeze:** compliance officer or automated CCP signal → `update_status(2)` → score path → auto-list. Record `blacklistReason` and actor.
5. **Activation:** only after KYC approved *and* institutional policy checks (whitelist, risk tier).
6. **PII minimization:** store vendor `applicantId` + hashes; prefer not to store raw passport images in Opera DB — keep them in the KYC vendor vault; Opera stores references + Cleanverse `currentKycHash` from `query_apass`.
7. **Right to erasure:** soft-delete Opera PII where legally required; A-Pass on-chain state is handled per Cleanverse / counsel guidance.

### 4.3 API surface (new)

| Endpoint | Role |
| --- | --- |
| `POST /v1/kyc/session` | Create vendor applicant + return SDK token |
| `POST /webhooks/kyc/:provider` | Vendor status callbacks (HMAC verified) |
| `GET /v1/kyc/status` | Case state for current SIWE wallet |
| `POST /v1/apass/ensure` | Production: only succeeds if KYC case `approved` |

Cast/demo paths keep today’s stub ensure behind an explicit `ALLOW_STUB_APASS=1` flag, disabled in production.

---

## 5. Compliance gates & score pipeline

### 5.1 Synchronous gates (request path)

Keep these **in the API** before broadcasting chain txs (already the shape of `requireComplianceForAction`):

1. `verify_apass` → must succeed (code 4)
2. `requireJurisdiction` when mandate/LOR jurisdiction is set
3. `validator/verify` against `CLEANVERSE_VALIDATOR_POOL`
4. On-chain `minScore` / allowance checks as today

Hard-fail closed. Timeouts to Cleanverse → fail closed with retryable 503, never “assume valid.”

### 5.2 Asynchronous score worker

Today: in-process `runScoreLoop` every ~15s. Production:

| Change | Detail |
| --- | --- |
| Job queue | BullMQ / Graphile Worker / SQS — one job per operator address |
| Triggers | A-Pass webhook (status change), post-tx hooks, periodic sweep, manual Playground push |
| Locking | Redis lock per address; skip if on-chain score younger than N seconds |
| Batching | Multicall or paced `setScore` with nonce manager per score-writer key |
| Inputs persisted | tenureDays, validator.valid, query_txs aggregates, frozen bit, requestIds → `score_inputs` |
| On-chain | ScoreStore writer key from KMS; gas oracle; replacement txs on stuck nonces |

### 5.3 Auto-list cascade

Decouple from score write:

1. Score worker confirms `setScore` receipt
2. Emits domain event `score.updated`
3. Auto-list worker loads LORs for holder below threshold → `maybeAutoList` / `setAutoListed`
4. Notification outbox → owner feed + optional email/webhook

This avoids scanning all LORs inside the score tick (current bottleneck under many operators).

### 5.4 Travel Rule

- After every oCVA settle path (distribute, acquire, mandate stake where applicable), enqueue `travel_rule.fetch`
- Store `downloadUrl` / object-store copy / error code on `travel_rule_reports`
- Attach to regulator export packs (already `cleanverse.travelRule[]`)
- Retry with exponential backoff on Cleanverse `TR_001` (tx not indexed yet) — expected on fresh txs

---

## 6. Chain indexing & RPC

### 6.1 Indexer design

Evolve `chain-sync.ts` into a dedicated indexer:

1. **Bootstrap** once from deployment block or known start.
2. **Incremental** sync with `fromBlock/toBlock` chunks (keep ~2–4k block chunks or whatever Monad RPC tolerates).
3. **Reorg handling:** store `block_hash` per cursor; on mismatch, roll back projections to common ancestor (critical before mainnet value).
4. **Contracts watched:** MandateRegistry, LORRegistry, RevenueManager, ScoreStore (ScoreUpdated if/when emitted), A-Token Transfer for settlement analytics.
5. **Projection tables** power `/mandates`, `/lors`, `/bids` — API never fans out to public RPC for lists.

### 6.2 RPC strategy

| Env | RPC |
| --- | --- |
| Hackathon | Public Monad testnet RPC |
| Staging | Dedicated provider (Alchemy-class / QuickNode / Monad partner) |
| Prod | Primary + failover endpoints; health-checked |

Add:

- **Write nonce manager** per hot wallet (deployer ops vs score writer vs user wallets via wagmi)
- **Receipt waiter** with timeout + status classification (`replaced`, `reverted`, `dropped`)
- **Rate-limit aware** backoff (already intermittently needed on public RPC)

### 6.3 Multicall

Use Multicall3 (already relevant on Monad) for batch `scoreOf`, LOR reads, and portfolio views to cut round-trips.

---

## 7. Application & API scalability

### 7.1 Stateless API

- Session: SIWE signature → JWT / sealed cookie; Redis optional for revocation list
- No local disk dependency (today’s SQLite path blocks multi-instance)
- Horizontal scale behind Railway / Fly / K8s Ingress
- Timeouts: Cleanverse calls ≤ 8–10s with circuit breaker (opossum / custom)

### 7.2 Rate limiting & abuse

| Route class | Limit (starting point) |
| --- | --- |
| SIWE nonce | 10 / min / IP |
| `apass/ensure`, freeze/activate | 5 / min / wallet |
| Bid / acquire / distribute | 30 / min / wallet |
| Public list GETs | 120 / min / IP |

### 7.3 Feature flags

- `CAST_MODE` — demo roles + stub A-Pass
- `WORKERS_ENABLED` — score loop
- `KYC_REQUIRED` — production default true
- `FIAT_RAMP_ENABLED` — off until licensed corridors exist

### 7.4 Webhooks

| Source | Path | Security |
| --- | --- | --- |
| Cleanverse A-Token apply | `/webhooks/atoken-apply` | HMAC on raw body (already) |
| KYC vendor | `/webhooks/kyc/:provider` | Vendor secret + timestamp skew window |
| Optional Cleanverse status (if offered) | `/webhooks/apass-status` | HMAC; invalidates Redis A-Pass cache |

Idempotent on `(provider, event_id)` UNIQUE.

---

## 8. Keys, custody, and cast mode

### 8.1 Production hot wallets

| Role | Storage | Policy |
| --- | --- | --- |
| Score writer | KMS-backed signing (or Turnkey / Fireblocks API user) | Only `ScoreStore.setScore` |
| Protocol ops (auto-list, rare admin) | Separate KMS key | Contract allowlist + spending limits |
| User funds | User wallet via wagmi / AppKit | Opera never custodies user oCVA |

### 8.2 Hackathon cast keys

Per-run EOAs in SQLite remain **demo-only**. Production checklist:

- `CAST_MODE=0`
- No private keys in Postgres
- If a “guided demo” is needed in prod-like staging, use ephemeral keys from a vault with 24h TTL and chain allowlist

---

## 9. Settlement, Fiat Ramp, and institutional corridors

### 9.1 oCVA (now → prod)

Keep Cleanverse A-Token as primary settlement:

- SG (and later multi-country) `atoken` rules maintained via controlled ops runbooks
- Institutional deposit whitelist writes (`add/remove/restore_whitelist_for_institutional`) behind admin RBAC
- Monitor A-Token pause state; page on unexpected pause

### 9.2 Fiat Ramp (later)

Client methods already exist in `cleanverse-client`. Enable only when:

1. Production Cleanverse ramp markets are live for your corridors
2. Institution is licensed / eligible
3. KYC tier satisfies ramp policy
4. `FIAT_RAMP_ENABLED=1` and real funds ops runbooks exist

Flow: `query_ramp_quote` → `create_ramp_widget_url` → user completes → `query_ramp_order` → credit path still lands in Cleanverse-compliant balances — never a side ledger that bypasses A-Pass.

### 9.3 Frozen-seller acquire

Today’s temp-activate seller is a demo necessity. Production options (pick with counsel):

- **Treasury / escrow contract** that can receive oCVA while seller A-Pass is frozen, then settles to seller on reactivation; or
- **Forced transfer** path with compliance attestation recorded in `audit.events`

---

## 10. Multi-tenancy & RBAC

For more than one asset owner / institution:

| Concern | Approach |
| --- | --- |
| Tenants | `org_id` on all business rows; Cleanverse API credentials per org or shared with attribution |
| Roles | Owner, Operator, Compliance Officer, Auditor, Admin (extend today’s desks) |
| AuthZ | Policy middleware on `/v1/*` — SIWE proves wallet; org membership maps wallet → role |
| Data isolation | Row-level `org_id` checks; auditors get export scope only |
| Playground | Per-org threshold configs; no cross-tenant score writes |

---

## 11. Observability, SLOs, and audit

### 11.1 Telemetry

- OpenTelemetry traces across API → Cleanverse → chain
- Metrics: gate pass/fail rates, score lag (time since A-Pass change → on-chain score), indexer head lag, tx revert rate, TR fetch success rate
- Structured logs with `requestId`, `org_id`, `wallet`, `txHash`

### 11.2 SLOs (initial)

| SLO | Target |
| --- | --- |
| API availability | 99.9% monthly |
| Indexer lag | &lt; 30s under normal load |
| Score freshness after freeze webhook | &lt; 60s to on-chain score |
| Gate Cleanverse error budget | &lt; 1% of gated requests |

### 11.3 Regulator exports

Keep signed packs; production upgrades:

- Store packs in object storage with retention policy
- Include KYC case id (not raw PII), validator verify requestIds, TR artefacts, score input hashes
- Optional automated weekly export job per org

---

## 12. Testing & release engineering

| Layer | Practice |
| --- | --- |
| Unit | Score math, jurisdiction matching, fee bps, yield bands |
| Integration | Cleanverse UAT sandbox + Anvil/Monad testnet fixtures |
| E2E | Cast path against testnet in CI nightly (not every PR) |
| Load | k6 against list endpoints + gated bid dry-runs |
| Contracts | Foundry fork tests for LOR/mandate/revenue invariants |
| Migrations | Expand/contract; never destructive without backup prove-out |
| Deploy | Blue/green or rolling; workers drain queue before cutover |

Environments: `local` → `staging` (Cleanverse UAT + Monad testnet) → `production` (mainnet when ready).

---

## 13. Phased delivery roadmap

### Phase A — Foundation (1–2 sprints)

- Postgres + migrations; dual-run or hard cut from SQLite
- Redis for SIWE + locks
- Split API / worker processes
- Dedicated RPC; nonce manager for score writer
- Structured logging + basic metrics

### Phase B — Identity & compliance (2–3 sprints)

- Sumsub/Persona KYC session + webhooks
- Production `apass/ensure` requires approved KYC
- A-Pass cache invalidation; freeze playbooks
- Validator pool config as first-class org setting
- Travel Rule retry queue

### Phase C — Market scale (2–3 sprints)

- Event-driven auto-list
- Indexer reorg safety
- Multicall portfolio APIs
- Admin RBAC for atoken rules / institutional whitelist
- Object storage for exports & TR files

### Phase D — Institutional (ongoing)

- Multi-tenant orgs
- Fiat Ramp flag + corridors
- KMS custody for protocol keys
- External notifiers (email/Slack) for auto-list
- Mainnet deployment checklist + incident runbooks

---

## 14. Capacity sketch (order-of-magnitude)

Assumptions for a single-region staging→early prod:

| Load | Handling |
| --- | --- |
| ~50 orgs, ~5k operators | 2–3 API replicas, 2 workers, small Postgres (4 vCPU) |
| List QPS hundreds | Served from projections + Redis cache |
| Score updates | Event-driven; periodic sweep only for stale addresses |
| Chain logs | Indexer alone talks to RPC for historical sync |

Revisit when mandate/LOR events exceed ~50–100/sec sustained — then partition projections by `org_id` / `asset_id` and consider a dedicated indexer service.

---

## 15. Explicit non-goals (near term)

- Replacing Cleanverse A-Pass with a custom identity NFT
- Custodial user wallets inside Opera
- Building an in-house AML transaction-monitoring engine (consume Cleanverse CCP / vendor feeds instead)
- Premature multi-chain LOR portability before Monad mainnet operational maturity

---

## 16. Mapping back to the hackathon codebase

| Today | Production evolution |
| --- | --- |
| `packages/backend` SQLite | Postgres repositories; same route shapes |
| `cleanverse-helpers.ts` | Shared lib + stricter fail-closed defaults |
| `score-worker.ts` | Queue consumer |
| `chain-sync.ts` | Indexer service with reorg handling |
| `ensureApass` stub identity | KYC-gated ensure |
| Cast keys in SQLite | Removed in prod; staging vault ephemerals |
| `CLEANVERSE_VALIDATOR_POOL` | Per-env / per-org config in DB + secrets |
| Audit JSON/PDF | Same format → object storage + retention |

---

*This plan is the scalability companion to the Opera Protocol README. Implementation should proceed phase by phase without breaking the live Monad testnet demo path.*
