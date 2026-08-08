# Opera Protocol — End-to-End Implementation Plan

**Hackathon:** Cleanverse Build: Verified Finance · RWA Track · August 2026
**Chain:** Monad (per PRD; chain kept as config value for hygiene)
**Deadline:** 3+ weeks from 2026-08-07
**Status:** v1.0 · Plan approved by stakeholder; components being built in order with per-component test gates.

---

## 0. Verified reality (read the docs before planning)

Facts confirmed from `docs/cleanverse-docs.md` and the PRD, not assumed:

1. **PRD module names ≠ API names.** Cleanverse exposes: **A-Pass** (identity — `generate_apass`, `query_apass`, `update_status`), **A-Token / Wrapped A-Token** (assets — `atoken/*`), **Validator Compliance** (pooled compliance checks — `validator/verify`, `is_register`, etc.), **Fiat Ramp** (gateway — `query_ramp_*`, `create_ramp_widget_url`), **Travel Rule** (`download_travel_rule`), **faucet** (`faucet`), **tx history** (`query_txs`, `query_institution_txs`).
2. **No "Agent Skill Framework API" exists.** No "Playground API" exists. No CCP "audit log stream" or "AML flag feed" exists. No compliance-score endpoint exists. → These are **Opera-side components we build**, consuming Cleanverse's real rails. This is the honest core of the pitch: Cleanverse supplies identity/asset/compliance rails; Opera computes living economics on top.
3. **Encryption:** AES-**256**-CBC (api-key base64-decodes to 32 bytes), PKCS7 padding, fixed zero IV. Encrypted endpoints send `{"data":"<base64 ciphertext>"}`. Some endpoints take plain JSON (validator reads, ramp, query_txs, etc.). Verified against the issued sandbox key (read from `CLEANVERSE_API_KEY`) → 32 bytes. Credentials are never committed; see `config/.env.example`.
4. **Owner signatures** (register A-Token, validator grant/register): EIP-191 `personal_sign` over `lowercase(chain) + lowercase(address)` concatenated, hex 65 bytes.
5. **Webhook HMAC:** `X-Cleanverse-Signature` = lowercase hex `HMAC-SHA256(rawBody, base64decode(apiKey))`; retry backoff 1/5/15/60/240 min.
6. **Faucet rate limit: once per ~24h per address** (error string: `wait 86396 seconds`).
7. **A-Pass chains include `monad`** (case-insensitive). A-Pass `customerId`: ≥12 chars, alnum only.
8. **Freeze multiplier reproduces PRD demo numbers exactly:** demo needs 88 → 31. `update_status(status:2)` freezes an A-Pass (real, reversible, on-chain). Define frozen ⇒ `score = round(raw × 0.35)` ⇒ `88 × 0.35 = 30.8 → 31`. The sanctions event in the demo is a real Cleanverse state change, not a mock.
9. **`verify_apass` result codes:** 1 token not found · 2 no A-Pass · 3 A-Pass invalid (expired/frozen) · 4 allowed. `validator/verify` returns `valid: bool` (pool must not be paused).
10. **Status flow for A-Token issuance:** `PENDING → APPROVED → ISSUED` (success) / `REJECTED` / `ISSUE_FAILED`. Only `ISSUED` counts. Async — poll `query_apply_status` or receive webhook.
11. **Toolchain on dev machine:** node 22.23, pnpm 9.15, Foundry 1.2.3 (forge/cast), python3 3.13, git 2.49. Monorepo will be pnpm workspaces + TypeScript + Vitest; contracts in Foundry.

### Blockers found during planning
- **B1 (networking):** `uatapi.cleanverse.com` and `api.cleanverse.com` are not reachable from this environment (curl exit 56; sandbox allowlist contains only `agentrouter.org`, `api.anthropic.com`). Stakeholder approved allowlisting `uatapi.cleanverse.com`. Until it lands, **live gates are deferred; all offline gates proceed**.
- **B2 (Monad deployment):** PRD says Monad; Monad is a valid A-Pass chain, but *A-Token / Validator contracts on Monad are unconfirmed*. First live call = `query_deposit_atoken_list {chain:"monad"}`. If empty/missing → escalate (CV-2) before building token flow on assumptions.
- **B3 (CCP feed):** no AML-flag/screening feed exists. Approved approach: **derive** clean-rate from real data — `query_txs` success rows + `validator/verify` + `verify_apass` outcomes over a trailing 90-day window. Proxy documented in the audit trail; formal ask filed (CV-6).

---

## 1. Architecture

Monorepo, pnpm workspaces:

```
traco/
├── docs/                          # PRD, cleanverse docs, THIS PLAN
├── config/                        # env templates, chain config, seed identities
├── packages/
│   ├── cleanverse-client/         # C1: AES + API client + webhook HMAC (offline-testable)
│   ├── contracts/                 # C3–C7: Foundry (Solidity, Monad/EVM)
│   ├── backend/                   # C8–C10: API gateway, score service, matching/auto-list workers
│   ├── playground/                # C11: LOR/mandate config + flow simulation + audit export
│   └── web/                       # C12: owner / operator / market / audit dashboards
└── scripts/                       # probes, fixture replay, demo runbook
```

**Stack:** TypeScript, Fastify (backend), better-sqlite3 (audit/state store), Zod (validation), Vitest (tests), Vite + React + Tailwind + Recharts (frontends), Foundry (contracts), pdf-lib (audit PDF export), node-cron (worker cadence).

**Layering rule:** every component depends only on the layer below. `web/playground → backend → cleanverse-client → (Cleanverse API | fixtures)`. Contracts are called by backend via viem/cast; contract state is the source of truth, backend caches for UI.

---

## 2. PRD → implementation mapping

| PRD primitive / claim | Implementation | Cleanverse real endpoint / Opera-built |
|---|---|---|
| CVI verified identity | A-Pass (tier, status, countries, tenure via `registeredAt`) | `generate_apass`, `query_apass`, `query_apass_list`, `update_status` |
| CVA asset token | CVA-backed RWA token | **Wrapped A-Token (aUSDC on Monad)** via `launch_wrapped_atoken`/`register_wrapped_atoken` + whitelist + `access_core` mint; fallback: own A-Token via `launch` (admin mints) |
| CCP transfer validation | Transfer gating + score input | `validator/verify`, `verify_apass`, `atoken/rules`, `atoken/is_paused` |
| CCP pre-screening / AML feed | **Built by Opera** (documented proxy) | derived from `query_txs` + verify outcomes (CV-6 asks for real feed) |
| Travel Rule-compliant settlement | Every CVA transfer → Travel Rule report | `download_travel_rule(txHash)` → time-limited PDF URL |
| Compliance score | **Built by Opera** (score service) | inputs: `query_apass` (tenure/status), `query_txs`, verifies; push to contract |
| Yield bonding / escrow | RevenueManager + Escrow contract | Opera contract; settlement in aUSDC/A-Token |
| Transfer cost pricing | Score-based transfer fee in LORRegistry | Opera contract; fee routed to asset owner |
| Auto-listing on degradation | Auto-listing worker + contract flag | Opera; trigger = score drop below threshold |
| Agent Mandate Market | MandateRegistry + matching service + agents | Opera contracts; agent = backend service with principal verification + spend limits |
| Rights Price Oracle | TWAP oracle contract | Opera; prices from LOR transfers per asset category |
| Playground | Opera web app | Opera; calls backend which calls Cleanverse where needed |
| Gateway Network (fiat) | Fiat Ramp | `query_ramp_quote`, `create_ramp_widget_url`, `query_ramp_order` |

---

## 3. Contract layer (packages/contracts — Monad, EVM)

| Contract | Responsibility | Key state / functions |
|---|---|---|
| `OperaToken` | CVA-backed RWA asset token (ERC20: mintable, pausable, transfer-restricted) | `mint`, `pause`, `_beforeTokenTransfer` → Validator/A-Pass gate hook |
| `AssetRegistry` | Registers assets; links asset → LOR Registry + Mandate Registry + asset metadata (category for oracle) | `registerAsset`, `getAsset` |
| `LORRegistry` | Mint/transfer Living Operating Rights; CVI-gate issuance; CCP-gate + score-fee on transfer; auto-list flag | `mintLOR`, `transferLOR`, `setScore`, `setAutoListed`, `acquireLOR` |
| `MandateRegistry` | Mandates, CVA stake deposit/release/slash, winner binding, principal verification data | `publishMandate`, `bid`, `award`, `slashStake`, `releaseStake` |
| `RevenueManager` | Yield-bonding split by score band; escrow; slashing pool; pro-rata distribution | `distribute`, `releaseEscrow`, `slashToOwner` |
| `RightsPriceOracle` | TWAP of LOR prices per asset category | `recordPrice`, `twap(category)` |
| `ScoreStore` | On-chain storage of operator compliance scores (written by score service, read by LORRegistry/RevenueManager) | `setScore`, `getScore` |

**Yield-bonding table (PRD §4.1, encoded in RevenueManager):**
| Score band | Paid | Escrowed |
|---|---|---|
| 95–100 | 100% | none |
| 80–94 | 85% | 15% |
| 70–79 | 60% | 40% |
| <70 | 0% | 100% → slashing pool → asset owner |

**Score formula (score service; contract stores result):**
```
tenureNorm   = clamp(0,100, round(100 × tenureDays / 365))
ccpCleanRate = 100 × cleanScreeningEvents / totalScreeningEvents (trailing 90d; fresh = 100)
trComplete   = 100 × travelRuleCompleteTransfers / crossBorderTransfers (trailing 90d; fresh = 100)
rawScore     = round(0.40×tenureNorm + 0.40×ccpCleanRate + 0.20×trComplete)
score        = A-Pass frozen ? round(rawScore × 0.35) : rawScore
```
Auto-list threshold default 72; band thresholds 95/80/70 — all configurable via Playground → `setScoreConfig`.

---

## 4. Backend (packages/backend)

### 4.1 API gateway (Fastify)
Routes (REST, JSON): assets, lors, mandates, bids, scores, distributions, audit events, notifications, playground config CRUD, audit export. Auth: demo API-key per role (owner/operator/investor/regulator) — no wallets in browser for the demo; on-chain actions are signed by backend custodial keys.

### 4.2 Workers (node-cron / setInterval)
- **Score service** — every ~5s: poll `query_apass` per operator (status/tenure), pull `query_txs` window, run verifies, compute score per formula, push to `ScoreStore`, emit score events, trigger band-change events.
- **Mandate matching** — on new bids: validate vs mandate compliance requirements (min score, jurisdiction from A-Pass `countries`, CVA stake), award, execute stake transfer.
- **Auto-listing** — on score < threshold: set LOR auto-listed, publish listing at score-adjusted price to Rights Market feed, notify asset owner.
- **Notification service** — in-app feed + event log (all persisted to SQLite for the audit trail).
- **Webhook receiver** — `/webhooks/atoken-apply`: verify HMAC-SHA256 (base64-decoded api-key), record issuance result.

### 4.3 Audit store (SQLite, better-sqlite3)
Every score event, transfer, distribution, escrow change, mandate event, verify result — timestamped, tx-hash-linked, with a signature field for regulatory export. Powers the Audit Workbench and the demo's "regulator review" (PRD §8).

---

## 5. Cleanverse integration specifics (packages/cleanverse-client)

| Function | Endpoint | Encrypted? |
|---|---|---|
| `generateApass` | `POST /generate_apass` | ✅ |
| `queryApass` | `POST /query_apass` | plain |
| `queryApassList` | `POST /query_apass_list` | plain |
| `updateStatus` (freeze/unfreeze) | `POST /update_status` | ✅ |
| `verifyApass` | `POST /verify_apass` | plain |
| `launchAtoken` / `launchWrapped` | `POST /atoken/launch[_wrapped_atoken]` | ✅ |
| `queryApplyStatus` (+poll helper) | `GET /atoken/query_apply_status/{requestId}` | plain |
| `addRule` / `rules` / `isPaused` / `setPaused` | `POST /atoken/*` | rule add/set = ✅, reads plain |
| `validatorGrant/Register` | `POST /validator/grant\|register` (owner sig) | ✅ |
| `validatorSetRule/AddRule/RemoveRule/SetPaused` | `POST /validator/*` | ✅ |
| `validatorIsRegister/Rules/Verify/IsPaused` | `POST /validator/*` | plain |
| `rampQuote/WidgetUrl/Order` | `POST /query_ramp_quote` etc. | plain |
| `queryTxs` / `queryInstitutionTxs` | `POST /query_txs` etc. | plain |
| `downloadTravelRule` | `POST /download_travel_rule` | plain |
| `faucet` | `POST /faucet` | plain |
| `queryDepositAtokenList` | `POST /query_deposit_atoken_list` | plain |
| `queryDepositAddress` / `queryInstitutionWhiteList` | `POST /query_*` | plain |
| Webhook verify | `HMAC-SHA256(rawBody, base64decode(apiKey))` | n/a |

Client must: AES-256-CBC encrypt/decrypt with zero IV; unwrap `{code,message,data}`; map error taxonomy (`0001` param, `0002` business + `[RM_xxx]`, `12026/12027` validator chain); poll `queryApplyStatus` to terminal; retry transient failures with backoff; sign EIP-191 `chain+address` for owner-sig endpoints; verify webhook HMAC.

---

## 6. Demo scenario (PRD §8 → runbook)

**Asset:** Solar farm (Malaysia, MYR 180k/mo). **Owner:** SG family office. **Roles/wallets (fresh Monad EVM keys, seed script):**

| Identity | customerId (≥12 alnum) | Role |
|---|---|---|
| Family office | `OPRAOWNER0001` | Asset owner |
| Energy revenue operator | `OPRAOPREV0001` | LOR: Energy Revenue Collection |
| Maintenance operator | `OPRAOPMAINT0001` | LOR: Maintenance Coordination (will be flagged) |
| Replacement operator | `OPRAOPNEW0001` | Acquires after auto-list |
| Investor | `OPRAINVESTOR01` | Asset token holder |
| Regulator (MAS examiner) | `OPRAEXAMINER01` | Audit export |

**Sequence (all real API calls, scripted):**
1. **Setup:** generate 6 A-Passes on Monad; launch Wrapped aUSDC A-Token (or fallback A-Token); grant MINTER_ROLE to access_core (wrapped path) or our minter; whitelist institution; faucet/seed treasury (24h limit ⇒ seed once, recycle internally); deploy Opera contracts; register Validator pools; publish 2 mandates (min score 80, stake 5,000).
2. **Month 1–3 simulation:** 2 operators win mandates, post stakes; energy agent "invoices" grid (backend simulates tenant payment into distribution vault in aUSDC); RevenueManager distributes with 100% yield (scores ≥95); maintenance agent posts CCP-validated inspection; oracle records premium LOR prices.
3. **Month 4 — compliance event:** `update_status(status:2, reason:"Sanctions watchlist hit")` on maintenance operator's A-Pass → score service recomputes → 88 × 0.35 = **31** → band <70 → yield 100% escrowed → auto-listing worker lists LOR at score-adjusted price → new operator (`OPRAOPNEW0001`) acquires with higher-quality stake → operations resume in same cycle → owner gets exactly one notification.
4. **Regulator review:** examiner logs into Audit Workbench, pulls event log (score history, flag, suspension, auto-list, transfer), exports Travel Rule-complete report: every aUSDC transfer in the period with `download_travel_rule` PDF URLs, HMAC-signed.
5. **Rights Price Oracle:** LOR index per category shown over time; score-drop visible in index.

---

## 7. Requirements from Cleanverse side (formal asks)

| # | Requirement | Why | Blocks |
|---|---|---|---|
| CV-1 | Allowlist `uatapi.cleanverse.com` in the dev sandbox network policy | curl exit 56 today; nothing live works | All live gates |
| CV-2 | Confirm Monad is fully provisioned: A-Token/Wrapped A-Token/Validator/Fiat Ramp on `monad`; provide sandbox Monad RPC URL(s) + chain id; confirm `access_core` + `apass` addresses on Monad | `query_deposit_atoken_list {chain:"monad"}` is the probe; PRD mandates Monad | C3–C7 deploys, token flow |
| CV-3 | Faucet: waive/increase the 24h per-address limit for this app, or provide an approved mint path | 86,400s cooldown makes iterative integration and demo funding impossible | Live funding |
| CV-4 | Confirm whether A-Token launch/register applications auto-approve in sandbox; if manual, who approves and how fast; provide a fast channel | Issuance is async and gated (`PENDING→APPROVED→ISSUED`) | Token flow |
| CV-5 | Confirm webhook HMAC key = exactly this api-key (base64-decoded) and that webhooks are enabled for our api-id | Docs say so; we implement against it | Webhook receiver |
| CV-6 | (Feature ask) A real CCP screening/AML feed: e.g. screening status on `query_txs` rows, or a screening-event endpoint, or an audit-log stream. **Until provided:** score's 40% CCP component is derived from `query_txs` success + validator/verify outcomes (documented proxy) | Score formula needs clean-rate input | (deferred — proxy ships now) |
| CV-7 | Confirm `update_status` freeze on a user's A-Pass propagates to `verify_apass`/`validator/verify` results for that wallet | Demo cascade (88→31, transfer blocked) depends on this | Demo month 4 |
| CV-8 | Confirm dev-machine IP is on the sandbox IP allowlist (docs list 403 "Unallowed IP") | 403s otherwise | All live calls |

**Other integrations:**
- **Monad RPC** for Foundry deploys + reads (public testnet RPC or Cleanverse-provided; must also be allowlisted for our environment to reach it).
- **SQLite** (better-sqlite3) for audit/state. **pdf-lib** for audit PDFs. **Recharts** for score/live feeds. **node-cron** for workers. No external SaaS.

---

## 8. Component build order with test gates

Discipline: **build → test → confirm → next.** A component is "done" only when its gate passes.

| # | Component | Build | Test gate (must pass to proceed) |
|---|---|---|---|
| C0 | Network probe + Monad probe script | scripts/probe.ts | ✅ connectivity (pending CV-1); Monad token list (pending CV-2) |
| C1 | `cleanverse-client`: AES-256-CBC + envelope + all endpoint wrappers + errors + webhook HMAC | TS package | NIST AES-256-CBC vector test; round-trips; ciphertext pin; fixture-based client tests (envelope, RM codes, decryption failure) — **all offline** ✅ |
| C2 | Fixture replay harness (`tests/fixtures/*.json` + `replay`) | TS | full client suite green offline; live mode auto-switches when allowlist lands |
| C3 | `OperaToken` + `AssetRegistry` | Foundry | `forge test`: mint/pause/gate; deploy + `cast` checks on Monad testnet (pending RPC) |
| C4 | `LORRegistry` + `ScoreStore` | Foundry | forge: mint, CVI-gated issuance, score-based transfer fee, auto-list flag; on-chain script |
| C5 | `MandateRegistry` | Foundry | forge: publish/bid/award/slash/release lifecycle |
| C6 | `RevenueManager` + escrow + slashing pool | Foundry | forge: all 4 yield bands, escrow recovery, slash path |
| C7 | `RightsPriceOracle` | Foundry | forge: TWAP correctness over price series |
| C8 | Backend gateway + webhook receiver + SQLite audit store | Fastify/TS | integration tests: every route; HMAC verify with documented vector; audit rows written for every event |
| C9 | Score service | TS worker | deterministic tests: fixture tx series → expected score incl. 88→31; band-change events emitted |
| C10 | Matching + auto-listing + notification workers | TS worker | e2e sim test: publish→bid→award→score drop→auto-list→acquire→resume, all states asserted |
| C11 | Playground: LOR config, mandate designer, flow simulation, audit export (PDF) | React | config→deployed LOR reflects changes; simulation reproduces 88→31 cascade; signed PDF export |
| C12 | Dashboards: Owner / Operator / Rights Market / Audit Workbench | React | full §10 demo flow runs via UI, twice consecutively, no manual steps |
| C13 | Demo scenario pack + runbook + dress rehearsal | scripts + docs | complete PRD §8 sequence end-to-end with real endpoints in one sitting |
| C14 | Hardening: error paths, security pass, README, API docs, on-chain addresses doc | — | review + regression green |

**Dependencies:** C3 before C4 (asset reference), C4/C5/C6 before C8–C10 (backend calls contracts), C8 before C11/C12 (frontends call backend), C1–C2 throughout (client). Live gates C0/C3+ are soft-blocked on CV-1/CV-2; fixtures keep the pipeline moving meanwhile.

---

## 9. Timeline (3+ weeks)

| Window | Work |
|---|---|
| W1 (Aug 7–13) | C0–C2, monorepo scaffold, C3–C4 contracts + forge tests |
| W2 (Aug 14–20) | C5–C7 contracts, deploy on Monad (pending CV-2), C8 backend |
| W3 (Aug 21–27) | C9 score service, C10 workers, C11 Playground |
| W4 (Aug 28–Sep 3) | C12 dashboards, C13 demo pack + rehearsal, C14 hardening |
| Buffer | 3–5 days of slippage reserved for live-integration surprises (faucet, issuance latency, Monad RPC) |

**Weekly checkpoint:** run the full test suite + demo runbook; anything failing blocks new component starts.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| R1 Monad not provisioned (CV-2 unanswered) | Probe first; escalate immediately; chain is config (switch cost ≈ 1 env var + redeploy) |
| R2 Faucet 24h limit | Seed treasury once at setup; internal recycling; CV-3 ask |
| R3 Async issuance stalls demo | Submit token applications at setup start; poll + webhook; keep fallback A-Token ready |
| R4 "Score is derived, not from a real AML feed" | Proxy is documented, deterministic, and every input row visible in audit trail; CV-6 filed |
| R5 Allowlist latency | Fixture harness keeps offline gates honest; live gates marked pending, never silently skipped |
| R6 Wrapped aUSDC flow complexity (owner sig, MINTER_ROLE, whitelist) | Fallback: own A-Token via `launch` + admin mint — same demo semantics |
| R7 "Per-block repricing" vs reality | Score service polls ~5s (Monad ≈1s blocks); demo-friendly; event stream is what judges see |

---

*Opera Protocol · Implementation Plan v1.0 · 2026-08-07 · Built on Monad · Powered by Cleanverse A-Pass / A-Token / Validator / Fiat Ramp / Travel Rule*

## 11. External verification of Cleanverse's feature surface (2026-08-07)

§2 previously assumed four capabilities don't exist based only on `docs/cleanverse-docs.md`.
Verified against public sources; the docs were right, and one assumption was wrong in our favour.

| Assumed absent | Verdict | Evidence |
|---|---|---|
| Agent Skill Framework / agent APIs | **Confirmed absent** | No public source links Cleanverse to agent tooling. Homepage names only *Cleanverse protocol* and *GovOS*; no AI/agent content. The "Agent Skills" ecosystem is Anthropic's, unrelated. |
| Playground / sandbox testing API | **Confirmed absent** | Not on the homepage, not in the v5.6 docs. UAT is a separate *base URL*, not a distinct product. |
| Compliance-score endpoint | **Confirmed absent** | The word "score" appears nowhere in Cleanverse's public material. Scoring is ours to build. |
| CCP AML feed / audit-log stream | **Confirmed absent as a feed** | Public material offers "downloadable audit-ready reports" and "visibility of global sanctions and central blacklist registry" — reports and UI surfaces, not a subscribable API. Matches `download_travel_rule` + `query_txs` in the docs. |
| — | **New finding** | Cleanverse's homepage lists **Monad** among connected chains (Arbitrum, Base, BNB Chain, Ethereum, HashKey, Monad, PlatON, Polygon, Solana). Public support for the *network*; per-app contract provisioning still needs CV-2. |

Two products appear publicly that the v5.6 docs never mention: **GovOS** (supervisory environment
translating policy into programmable on-chain controls) and **CleanGraph** (community-described
orchestration layer evaluating CVI/CVA/CCP pre-settlement). Neither has public endpoint docs.
GovOS overlaps Opera's rule-enforcement surface — added as **CV-9**: ask whether GovOS or CleanGraph
expose an API we should build against instead of reimplementing.

**Conclusion:** the compliance score, its inputs, and the audit trail are legitimately ours to build.
That is a *product boundary*, not a mock. Nothing in §3's formula is a stand-in for a Cleanverse
endpoint we failed to find.

## 12. Zero-mock audit — gaps against "fully production ready"

Every item where the plan-as-written was not real. **P0 blocks the demo being honest; P1 is
production hardening; P2 is acceptable-as-designed with justification.**

### P0 — must be real, currently fake

| # | Gap | Fix |
|---|---|---|
| M1 | **C2 fixture replay harness** — recorded responses replayed offline. A green suite would prove nothing about the live API. | Delete the replay path. Integration tests hit the live API or **fail as skipped-and-loud**, never pass on fixtures. Keep recorded bodies only as *schema* samples for parser unit tests, in `test/schemas/`, never as transport substitutes. |
| M2 | **"Agent bidding simulation"** (PRD §10 feature 4) — a loop inventing bids. | Real autonomous agents: separate processes, own keypairs, own A-Pass identities, reading mandates from chain and submitting signed bids. The 3+ week timeline affords this. PRD §10's word "simulation" describes the *scenario*, not permission to fake the mechanism. |
| M3 | **"Backend simulates tenant payment"** — revenue appearing by fiat. | Real ERC-20 stablecoin transfer on Monad into `RevenueManager`. Optionally originate via Cleanverse Fiat Ramp (`create_ramp_widget_url` → `query_ramp_order`) for a genuine fiat→on-chain leg. |
| M4 | **"Simulated CVA stake"** — mandate stake as a number in SQLite. | Real token escrow in `MandateRegistry`, staked and slashable on-chain. |
| M5 | **API-key-per-role demo auth** — roles by shared secret. | Wallet auth: EIP-4361 (SIWE) over the identity's real keypair, session bound to the A-Pass-holding address. Same signing primitive as §5's EIP-191 owner signatures. |
| M6 | **`vitest` declared but `node --test` used** *(fixed)* | `package.json` test script now matches the runner. |
| M7 | **Hardcoded api-key in tests + plan** *(fixed)* | Synthetic 32-byte key for algorithm tests; env-sourced shape assertion that skips when unset. `config/.env.example` holds placeholders only. |

### P1 — real but not production-grade

| # | Gap | Fix |
|---|---|---|
| M8 | **Backend holds custodial signing keys** in env vars. | Keys per role in separate processes; never one process signing for all identities. Document the trust boundary explicitly. For a hackathon, file-scoped keys with `0600` are acceptable *if* the boundary is written down. |
| M9 | **SQLite as system-of-record** for audit data. | Acceptable for the demo, but chain is authoritative: SQLite is a *read model* rebuildable from on-chain events + Cleanverse queries. Add a rebuild command proving it holds no unrecoverable state. |
| M10 | **Score written by a backend EOA** — a trusted oracle writing to `ScoreStore`. | Keep it, but make the *inputs* auditable: every score write emits the input tuple (tenure, clean rate, TR completeness, freeze flag) and the Cleanverse request-ids they came from, so any observer can recompute. |
| M11 | **Webhook receiver needs a public HTTPS URL** — no ingress. | Real ingress with TLS before C7. Verify HMAC on **raw bytes** before parsing; return 2xx only after durable persistence, since Cleanverse retries 1/5/15/60/240min. |
| M12 | **No idempotency on webhook replay.** | Unique index on `(txType, requestId)`; treat duplicate delivery as success. |
| M13 | **Uninstallable deps** (npm 403 on viem/vitest). | Blocks C3+ (EIP-191 needs viem). Either the registry gets unblocked or a vendored `secp256k1` path is needed. **Open blocker B4.** |

### P2 — designed, not mocked

| # | Item | Why it stands |
|---|---|---|
| M14 | **Derived CCP clean-rate** | Verified above: no AML feed exists to call. Computed from real `verify_apass` / `validator/verify` / `query_txs` outcomes with real request-ids. A real computation over real data. |
| M15 | **Freeze multiplier (0.35)** | `update_status(status:2)` is a genuine reversible on-chain A-Pass freeze. The multiplier is a published product rule, and the 88→31 drop is real state change, not theatre. |
| M16 | **Monad-only** | User decision; PRD-aligned; Monad publicly listed as connected. Remove residual "Base fallback" hedges from §1–§3. |

### Consequent plan changes

- §8 build order: **C2 becomes "live integration harness"** — no replay. Insert **C2.5: real ingress + webhook receiver** before any A-Token work.
- §8: **C9 "bidding simulator" → "autonomous agent runtime"** (M2), sized for 3+ weeks.
- §10 risk **R5 deleted** ("fixtures keep offline gates honest") — it is the thing being removed.
- New blocker **B4** (registry 403) and new ask **CV-9** (GovOS/CleanGraph API surface).
- **Hard rule for every gate C2–C14:** a component is "done" only when its test ran against
  `api.cleanverse.com` and the request-id is recorded in the plan. No component passes on a fixture.
