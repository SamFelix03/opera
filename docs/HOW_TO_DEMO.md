# Opera Protocol — How to Demo

**Live app:** [https://opera-web-production.up.railway.app](https://opera-web-production.up.railway.app)  
**Visual walkthrough (video):** [https://www.youtube.com/watch?v=mgChF-R9C2Q](https://www.youtube.com/watch?v=mgChF-R9C2Q)  

This guide is the **click-by-click cast demo** of the solar-farm story: hire operators with Living Operating Rights, distribute oCVA revenue, freeze a non-compliant operator, auto-list their LOR, replace them on the Market, and export a signed audit pack. For each step you get **what to click** and **what happens behind the scenes** (Cleanverse + Monad).

Prefer Cast mode (role wallets). The UI shows **(cast)** buttons when a cast is seeded — those call the backend with the role’s private key so you do not need a browser wallet for the story path.

---

## 0. Story in one paragraph

A Singapore family office owns a solar farm. They hire an **energy** operator and a **maintenance** operator via mandates staked in Cleanverse oCVA. The energy operator distributes revenue. Then the maintenance operator’s A-Pass is frozen (sanctions-style event), their compliance score collapses to **31**, the maintenance LOR auto-lists, and a **replacement** operator acquires it. The regulator exports a signed event pack.

| Cast role | Who they are | Primary desk |
| --- | --- | --- |
| `owner` | Asset owner (family office) | Owner |
| `energyOp` | Energy revenue operator | Operator |
| `maintOp` | Maintenance operator (gets frozen) | Operator / Rules |
| `replacement` | Cleaner operator who buys the distressed LOR | Market |
| `regulator` | Examiner / freeze actor | Rules / Audit |
| `investor` | Capital observer | (watch Market / Audit) |

---

## 1. Open the app

1. Go to [opera-web-production.up.railway.app](https://opera-web-production.up.railway.app).
2. Top nav: **Cast** / Demo · Owner · Operator · Market · Rules · Audit.
3. Open **Cast** (`/demo`) — this is Cast HQ.

**BTS:** The web app talks to the Railway backend. Cast state (`runId`, role wallets, events) lives in SQLite on the API. Settlement token is Cleanverse A-Token `OPRACVA3275` on Monad testnet.

---

## 2. Seed the cast (required first)

**Where:** Cast HQ → `/demo`

1. Click **Seed cast** (or **Run seed** in the stage card).
2. Wait **2–5 minutes**. Status shows seeding; keep the tab open.
3. When ready, the cast bar shows role wallets and stages unlock. Event feed starts filling.

**What seed does behind the scenes**

| Phase | Backend / Cleanverse / chain |
| --- | --- |
| Bootstrap | `POST /demo/bootstrap` creates a `runId` and demo role EOAs (keys stored server-side for cast) |
| Accept seed | `POST /demo/:runId/act { action: "seed" }` returns immediately (`accepted: true`) so proxies do not 504 |
| Identities | Cleanverse `generate_apass` / `query_apass` per role with SG `issuingCountryISO2`; activate if needed |
| Asset setup | Scores written to `ScoreStore`; LORs may be prepared depending on seed path; mandates scaffolding |
| Fund | Deployer sends MON for gas; mints oCVA to operators; `ensureApass` on protocol contracts that receive CVA (`MandateRegistry`, `LORRegistry`, `RevenueManager`) |
| Poll | UI polls `GET /demo/:runId/cast` until `prepareCast` is `done` |

**Judge tip:** If seed fails, check API health and Monad RPC; use **Re-seed** only after confirming the previous run is stuck.

---

## 3. Hire — mint LORs, publish mandates, bid, award

Do this **twice** in spirit (energy + maintenance). Cast HQ stage **2. Hire** links to Owner.

### 3.1 Switch to Owner

1. Open **Owner** (`/owner`) or follow Cast HQ → Hire.
2. In the cast role picker / Cast bar, select **Asset owner** (`owner`).

### 3.2 Mint Living Operating Rights

**Where:** Owner → tab **Mint LOR**

1. Set **holder** to the energy operator address (from Cast bar / event chips), or use cast defaults.
2. Scope: `energy-revenue`.
3. Click **Mint LOR (cast)**.
4. Repeat for maintenance: holder = `maintOp`, scope = maintenance / `maintenance` (UI options).

**BTS — `mintLor`**

1. `requireComplianceForAction(holder)` → Cleanverse `verify_apass` + jurisdiction + `validator/verify` (ScoreStore pool).
2. On-chain `LORRegistry.mintLOR(assetId, holder, scope, minScore)`.
3. Indexer/SQLite upserts the LOR row; run stores `energyLorId` / `maintLorId`.
4. Tx appears in Cast recent txs → MonadVision link.

### 3.3 Publish mandates

**Where:** Owner → tab **Mandates** → Publish panel

1. Scope `energy-revenue`, stake e.g. `5000` oCVA, min score `80`.
2. Click **Publish (cast)**.
3. Repeat for maintenance scope.

**BTS — `publishMandate`**

1. Owner wallet signs `MandateRegistry.publishMandate(assetId, scope, minScore, jurisdictionRoot=SG, stake, maxSpend)`.
2. Mandate row indexed as open; jurisdiction tag `keccak256("SG")` stored for later geo-gate on bid.

### 3.4 Operators bid

**Where:** Operator → tab **Bid**

1. Cast role → **Energy operator**.
2. Select the open energy mandate → **Bid**.
3. Confirm **Bid as Energy operator** (cast).
4. Switch role → **Maintenance operator** → bid on the maintenance mandate.

**BTS — `bid`**

1. `requireComplianceForAction(bidder)` + `requireJurisdiction` (A-Pass `countries` must include SG).
2. Approve oCVA spend + `MandateRegistry.bid` transferring stake as compliance bond.
3. Bid indexed under the mandate for the Award dialog.

### 3.5 Owner awards

**Where:** Owner → Mandates → select mandate → **Award**

1. Cast role → **owner**.
2. Open award dialog → select bidder → **Award to … (cast)**.
3. If prompted, mint LOR to winner if not already minted for that scope.

**BTS — `award`**

1. `MandateRegistry.award(mandateId, winner)`.
2. Winner recorded; losers’ stakes releasable per contract rules.
3. Event feed: mandate awarded.

---

## 4. Operate — distribute revenue

**Where:** Cast HQ stage **3. Operate** → Operator → tab **Revenue** (or `/operator?tab=revenue`)

1. Cast role → **Energy operator**.
2. Confirm A-Pass / score look healthy (Ensure A-Pass / Push score if needed).
3. Enter gross amount → **Distribute (cast)**.

**BTS — `distribute`**

1. `verify_apass` on operator.
2. `RevenueManager.distribute(operator, gross)` pulls oCVA from caller:
   - 50% to asset owner
   - Operator share split by `yieldSplit(score)` bands (100% / 85–15 / 60–40 / slash)
3. Backend enqueues Cleanverse `download_travel_rule` for the distribute tx → event `travel_rule.ok` or `travel_rule.skip`.
4. Yield bonding is now visible economically: high score → full operator payout.

---

## 5. Freeze — sanctions-style degradation

**Where:** Cast HQ stage **4. Freeze** → **Rules** (`/playground`), or use Cast HQ freeze chips

1. Cast role → **regulator** (or use Cast HQ one-click freeze on maint).
2. Target = **maintenance operator** address.
3. Click **Freeze A-Pass** / Cast **Freeze maint A-Pass**.
4. Click **Push score (+ auto-list if low)** / **Push frozen score** so on-chain score becomes **31**.

**BTS — `freeze` + `pushScore`**

1. Cleanverse `update_status` with `status: "2"` (frozen) on maint wallet.
2. Score computation: healthy raw inputs × **0.35** freeze multiplier → **31** (from ~88).
3. Authorised score writer calls `ScoreStore.setScore(maint, 31, inputsHash)`.
4. A-Pass frozen bit also blocks receiving oCVA (A-Token transfer policy) — important for later acquire.

**Playground extras:** You can tweak auto-list threshold (default **72**) via **Push on-chain** config — that writes protocol config used by listing logic.

---

## 6. Auto-list the distressed LOR

**Where:** Cast HQ stage **5. Auto-list**, or Operator → Portfolio, or Cast **Auto-list maint LOR**

1. With maint score **31** (&lt; 72), click **Auto-list maint LOR** (cast) if it did not list automatically.
2. Confirm Operator portfolio shows maintenance LOR as **Auto-listed**, or Market shows a new listing.

**BTS — `autoList`**

1. `LORRegistry.setAutoListed(lorId, price)` (or `maybeAutoList` when score already below threshold).
2. LOR appears on Transfer Market listings (`autoListed=true`).
3. Owner notification row written for the cascade.

This is the product thesis: compliance degradation → market self-correction without manual revoke.

---

## 7. Acquire — replacement takes over

**Where:** Cast HQ stage **6. Acquire** → **Market** (`/market`)

1. Cast role → **Replacement operator**.
2. Select the auto-listed maintenance LOR → **Acquire**.
3. Click **Acquire LOR #… (cast)**.
4. If the UI warns about frozen seller: Cast path temp-activates seller A-Pass so oCVA can settle, then re-freezes after (see BTS).

**BTS — `acquire`**

1. Buyer: `requireComplianceForAction` + score ≥ `minScoreToHold`.
2. Seller (frozen maint): Cleanverse ensure/activate so A-Token transfer can complete (frozen A-Pass cannot receive oCVA).
3. Approve oCVA + `LORRegistry.acquireLOR` — payment and holder update on-chain.
4. `download_travel_rule` for acquire tx.
5. Seller A-Pass re-frozen if the sanctions story requires it.
6. Replacement is now the maintenance LOR holder; operations can resume under a clean identity.

---

## 8. Export — regulator pack

**Where:** Cast HQ stage **7. Export** → **Audit** (`/audit`)

1. Cast role → **regulator** (optional).
2. Click **Export** / download audit JSON (and PDF if offered).
3. Open the file: events, settlement token, freeze formula, EIP-191 signature, `cleanverse.travelRule[]`.

**BTS — `export` / `regulatorExport`**

1. Orchestrator builds pack: run metadata, LOR/mandate ids, full `events[]`, integrity `contentHash`.
2. Deployer key signs content (EIP-191) when configured.
3. Files under `data/demo-exports/` on the server; sample in repo: [d76fd19d…json](https://github.com/SamFelix03/opera/blob/master/data/demo-exports/d76fd19d-3718-488e-b0a3-f2b0aa64b545.json).

---

## 9. Optional wallet mode (non-cast)

If you connect a real browser wallet (AppKit / wagmi):

1. SIWE via product `/v1/*` for Ensure A-Pass / me.
2. Owner/Operator/Market buttons **without** “(cast)” send txs from your wallet.
3. You still need MON + oCVA and an active A-Pass on that address.

Cast mode is the reliable judge path because funding and A-Passes are pre-wired by seed.

---

## 10. API-only path (no UI)

Same story without clicking:

```bash
API=https://opera-backend-production.up.railway.app   # or http://127.0.0.1:8787 locally

BOOT=$(curl -sS -X POST "$API/demo/bootstrap" -H 'content-type: application/json' -d '{}')
RID=$(echo "$BOOT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["runId"])')

# Full orchestrated run (long):
curl -sS -X POST "$API/demo/$RID/run-all"

# Or step-by-step:
for step in setupIdentities setupAsset fundAndStake normalOps sanctionsEvent replacementAcquire regulatorExport; do
  curl -sS -X POST "$API/demo/$RID/step/$step"
done
```

Local stack: see [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md).

---

## 11. What to highlight for judges (90 seconds)

1. **Seed** — real Cleanverse A-Passes + oCVA funding.  
2. **Hire** — mandate stake in CVA + compliance gates before bid.  
3. **Distribute** — yield bonded by live score.  
4. **Freeze → 31 → auto-list** — CVI event becomes market event.  
5. **Acquire** — replacement restores operations under Cleanverse settlement rules.  
6. **Export** — signed audit trail with Travel Rule artefacts.

Video twin of this path: [YouTube demo](https://www.youtube.com/watch?v=mgChF-R9C2Q).

---

## 12. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Seed hangs &gt; 8 min | RPC / Cleanverse UAT latency | Check `/health`; refresh Cast HQ; re-seed |
| Bid reverts / gate error | A-Pass inactive or jurisdiction mismatch | Ensure A-Pass; confirm SG countries on identity |
| Acquire fails `APassNotActive` | Seller still frozen without temp-activate | Use **(cast)** Acquire; or Rules → Activate seller briefly |
| Score not 31 after freeze | Push score not run | Rules → Push score / Cast freeze score chip |
| Empty Market | LOR not auto-listed | Cast **Auto-list maint LOR** after score &lt; 72 |
| No export | Run incomplete | Finish acquire; Audit → Export; or `POST /demo/:id/step/regulatorExport` |

---

## Related docs

- [README](../README.md) — product + Cleanverse integration map  
- [DEMO_RUNBOOK.md](./DEMO_RUNBOOK.md) — local API/assert checklist  
- [PRODUCTION_SCALE.md](./PRODUCTION_SCALE.md) — production KYC, Postgres, workers  

---

*Opera Protocol · Cleanverse Build · How to Demo*
