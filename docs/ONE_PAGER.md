# Opera Protocol — One Pager

**Cleanverse Build · Verified Finance Hackathon · RWA Track · August 2026**

*Primary judging brief. Deeper material lives in the [README](https://github.com/SamFelix03/opera/blob/master/README.md) and companion docs — linked sparingly at the end of each block.*

| Live app | [opera-web-production.up.railway.app](https://opera-web-production.up.railway.app) | Pitch | [opera-pitch.pages.dev](https://opera-pitch.pages.dev/) |
| --- | --- | --- | --- |
| API | [opera-backend-production…](https://opera-backend-production.up.railway.app) | Video | [YouTube demo](https://www.youtube.com/watch?v=mgChF-R9C2Q) |
| Repo | [github.com/SamFelix03/opera](https://github.com/SamFelix03/opera) | How to demo | [HOW_TO_DEMO.md](https://github.com/SamFelix03/opera/blob/master/docs/HOW_TO_DEMO.md) |

Opera makes **who may operate** a tokenized real-world asset an on-chain, Cleanverse-priced instrument. Living Operating Rights (LORs) grant scoped authority over an asset; their **yield, transfer cost, and market listing** move with a live compliance score built from CVI (A-Pass), CCP (Validator), and Travel Rule signals, settled entirely in Cleanverse A-Token (**oCVA**) on Monad.

---

## 1. Problem

The current generation of RWA platforms solved **issuance** well: a compliant digital claim on ownership. They did not solve what happens **after** issuance.

Real assets do not sit still. Property managers collect rent. Solar operators route energy revenue. Maintenance firms service equipment. Fund administrators distribute proceeds. In most stacks those relationships live in contracts, emails, and ops tools — **off-chain**, with no automatic response when an operator’s compliance posture changes.

When compliance is modeled on-chain at all, it is usually a **binary whitelist**: you are in or you are out. A whitelisted operator who is later sanctioned, loses a licence, or fails ongoing screening **keeps full operational authority** until a human notices and manually revokes access. Between degradation and revocation, the asset is exposed. Worse, compliance has almost **no economic consequence** for the holder — only the fear of eventual removal.

Opera’s claim is that operating authority must be **economically alive**: priced continuously by Cleanverse identity and transfer compliance, so the market self-corrects without waiting for a committee.

*More detail → [README §2](https://github.com/SamFelix03/opera/blob/master/README.md#2-problem-statement)*

---

## 2. Solution

Opera adds a **programmable operational layer** on top of tokenized RWAs. Ownership can remain wherever it lives today; **who may act** is expressed as Living Operating Rights governed by Cleanverse rails and a live score.

### Three primitives

**Living Operating Rights (LORs)** — On-chain licences for a scoped job (energy-revenue collection, maintenance coordination, etc.). Minted with a holder, scope, and `minScoreToHold`. Three mechanisms make the right “alive”:

- **Yield bonding** — `RevenueManager.distribute` pays the operator share by score band (full / 85–15 escrow / 60–40 / full slash below 70); asset owner always takes 50% of gross.
- **Transfer cost pricing** — fee bps rise as score falls (`max(50, 5000 − score×45)`).
- **Auto-listing** — when score drops below threshold (default **72**), the LOR lists on the Transfer Market for a cleaner operator to acquire.

**Agent Mandate Market** — Asset owners publish mandates with `minScore`, oCVA stake, spend caps, and jurisdiction. Operators (desk or local `OperaAgent`) bid by posting Cleanverse oCVA as a **compliance bond**. Before bid, the backend enforces A-Pass verify, country/jurisdiction match, and Validator eligibility. Owners award winners; stakes settle in oCVA.

**Rights Price Oracle** — Category prices and TWAP over LOR market activity — a market-determined index of compliance quality for an asset class.

### How it feels in the demo

Singapore family office · solar farm: hire energy + maintenance operators with oCVA stakes → energy operator distributes revenue under yield bands → maintenance A-Pass is frozen (sanctions-style) → score collapses **88 → 31** → maintenance LOR auto-lists → replacement operator acquires → regulator downloads a signed audit pack with Travel Rule artefacts.

```text
A-Pass · Validator · oCVA  →  compliance score
        →  yield · fees · auto-list  →  Transfer Market / audit pack
```

*More detail → [README §3–§4](https://github.com/SamFelix03/opera/blob/master/README.md#3-solution-overview) · [§8 Demo](https://github.com/SamFelix03/opera/blob/master/README.md#8-demo-scenario)*

---

## 3. CVI · CVA integration

Cleanverse is not bolted on for a checklist. It is the **identity, settlement, eligibility, and audit** substrate of every economic action.

### CVI — A-Pass (identity)

Opera creates and manages A-Passes for cast roles and product users: generate with SG country tags (`issuingCountryISO2`), query status/countries/tenure, activate (`status=1`), freeze (`status=2`). **`verify_apass` (success code 4) hard-gates** mint, bid, acquire, and distribute. Country tags on the A-Pass are checked against mandate `jurisdictionRoot` (demo: Singapore) before bid. Tenure from `registeredAt` / expiration feeds the **40% CVI** term of the compliance score. Freeze collapses score via a **×0.35** multiplier (healthy ~88 → **31**) and triggers the auto-list story. Protocol contracts that receive oCVA (`MandateRegistry`, `LORRegistry`, `RevenueManager`) also hold A-Passes so Cleanverse transfer policy can apply end-to-end.

### CVA — A-Token (settlement money)

All stakes, acquire payments, and revenue distributions use Cleanverse LAUNCH A-Token **`OPRACVA3275` (oCVA)** on Monad — not a local mock ERC-20 as primary money. An SG country allow-rule is configured on the token. The token’s **A-Pass transfer policy** means a frozen seller cannot receive oCVA; the acquire path temporarily activates the seller, settles, then re-freezes when the sanctions narrative requires it. A-Token apply webhooks are verified with HMAC on the raw body.

### CCP — Validator + Travel Rule

ScoreStore is registered as a Cleanverse **Validator compliance pool** (Ownable contract; deployer owner signature). `validator/verify` feeds the **40% CCP** score term and participates in the same economic gates as `verify_apass`. Transfer history via `query_txs` supports score signals. After distribute and acquire, Opera calls `download_travel_rule` and attaches results to demo events and the signed regulator pack (`cleanverse.travelRule[]`).

### Unified gate

Every hire/operate/acquire path runs **`requireComplianceForAction`**: `verify_apass` + jurisdiction match + `validator/verify`. Score weights are **40 / 40 / 20** (tenure / CCP / Travel Rule completeness).

| Layer | Integration in Opera |
| --- | --- |
| **CVI / A-Pass** | `generate_apass` / `query_apass` / `update_status` (freeze·activate) / `verify_apass` (hard gate) / country tags → mandate geo / tenure → 40% of score |
| **CVA / A-Token** | LAUNCH token `OPRACVA3275` = sole settlement for stakes, acquire, revenue; SG `atoken` country rule; A-Pass transfer policy (frozen seller cannot receive oCVA) |
| **CCP / Validator** | ScoreStore registered as compliance pool; `validator/verify` on mint / bid / acquire / distribute + CCP score term |
| **Travel Rule** | `download_travel_rule` after distribute & acquire; artefacts in signed audit pack `cleanverse.travelRule[]` |
| **Unified gate** | `requireComplianceForAction` = verify_apass + jurisdiction + validator |
| **Crypto / webhook** | AES-256-CBC cooperate client; HMAC `POST /webhooks/atoken-apply` |

*More detail (full API map + code) → [README §5](https://github.com/SamFelix03/opera/blob/master/README.md#5-cleanverse-stack-integration)*

---

## 4. Deployed chain(s)

| | |
| --- | --- |
| **Network** | **Monad Testnet only** — `chainId` **10143** |
| **Explorer / RPC** | [testnet.monadvision.com](https://testnet.monadvision.com) · `https://testnet-rpc.monad.xyz` |
| **Settlement** | Cleanverse A-Token **OPRACVA3275** at [`0x6A7942B254f84822f7237c6C14aD78A00a22BC4E`](https://testnet.monadvision.com/address/0x6A7942B254f84822f7237c6C14aD78A00a22BC4E) |
| **Opera** | ScoreStore (also Cleanverse Validator pool), LORRegistry, MandateRegistry, RevenueManager, RightsPriceOracle, AssetRegistry |
| **Cleanverse platform** | AccessCore · A-Pass NFT (see README address table) |
| **Live** | Railway web + API; sample MonadVision txs for score, distribute, freeze→31, auto-list, acquire |

*Addresses & txs → [README deployed contracts](https://github.com/SamFelix03/opera/blob/master/README.md#deployed-contracts-monad-testnet--chainid-10143)*

---

## 5. User roles

| Role | What they do in the product |
| --- | --- |
| **Asset owner** | Mint LORs, publish mandates, award winners, watch revenue and notifications (Owner desk · cast `owner`) |
| **Operator** | Ensure A-Pass, bid with oCVA stake, hold LORs, distribute revenue, auto-list (Operator desk · cast `energyOp` / `maintOp` / `replacement`) |
| **Regulator / auditor** | Freeze via Rules, export signed JSON/PDF audit packs (Audit desk · cast `regulator`) |
| **Compliance (Rules)** | Freeze / activate A-Pass, push scores, configure auto-list threshold (Playground) |
| **Investor** | Observe Market / oracle and that operators stay compliant (cast `investor`) |

Optional local **`OperaAgent`** can bid and operate within mandate constraints; it is Opera’s agent process, not a separate Cleanverse ASF product.

*More detail → [README §6](https://github.com/SamFelix03/opera/blob/master/README.md#6-user-roles)*

---

## 6. User flows

1. **Seed / identities** — Cast HQ creates role wallets, Cleanverse A-Passes (SG), funds MON + oCVA, ensures A-Pass on protocol contracts.  
2. **Tokenize & mint LORs** — Owner mints scoped LORs to operators with `minScore`.  
3. **Mandate hire** — Owner publishes mandate → operators bid oCVA (geo + verify + validator gates) → owner awards.  
4. **Operate** — Energy operator `distribute`s oCVA; yield split by live score; Travel Rule download attempted.  
5. **Compliance event** — Freeze maint A-Pass → push score **31** → LOR auto-lists below threshold 72.  
6. **Replacement** — Replacement acquires listed LOR with oCVA (seller A-Pass handled for settlement).  
7. **Audit** — Regulator exports EIP-191–signed event pack (settlement token, freeze formula, events, Travel Rule artefacts).

Cast UI path: **Seed → Hire → Operate → Freeze → Auto-list → Acquire → Export**.

*More detail → [README §7](https://github.com/SamFelix03/opera/blob/master/README.md#7-core-user-flows) · click-by-click [HOW_TO_DEMO.md](./HOW_TO_DEMO.md)*

---

## 7. Concept (judging · 20%)

Opera reframes RWA compliance from a transfer gate into a **pricing engine for operating authority**. The question is not only who owns the asset, but who is **currently authorized to run it** — and whether that authority still deserves full yield and market standing. Differentiation vs traditional RWA stacks: continuous repricing, staked mandate participation, and a self-correcting auto-list cascade when Cleanverse identity degrades. Track alignment: CVI identity, CVA settlement, CCP eligibility, Travel Rule artefacts, and score-gated LOR lifecycle on Monad.

*Pitch → [opera-pitch.pages.dev](https://opera-pitch.pages.dev/) · [README §1](https://github.com/SamFelix03/opera/blob/master/README.md#1-executive-summary)*

---

## 8. Build quality (judging · 25%)

Shipped and verified: live Railway web/API; Foundry `OperaSuite` contract tests; Vitest for AES crypto, SIWE, and webhook HMAC; gate log **C0–C14 PASS** (Cleanverse probes, freeze round-trip, score 88→31, e2e cascade, A-Token issuance); e2e API report **25/25**; EIP-191–signed live audit export with real Monad txs. Architecture is Fastify + SQLite read model + score/chain-sync workers + Cleanverse cooperate client + Monad contracts; score writer and deployer are separate EOAs; webhooks verify HMAC on the raw body.

*Evidence → [GATE_LOG](./GATE_LOG.md) · [e2e-test-report](./e2e-test-report.md) · [README Build & verification](https://github.com/SamFelix03/opera/blob/master/README.md#build--verification)*

---

## 9. UX & Demo (judging · 15%)

Judges should use **Cast mode** on the live app: seed allocates funded role wallets with A-Passes, then follow Owner / Operator / Rules / Market / Audit desks. The product story is visible without a personal wallet. Video walks the same path; HOW_TO_DEMO documents each click and the Cleanverse/Monad calls behind it. Ninety-second highlight: Seed → freeze maint to score 31 → auto-list → replacement acquire → download audit pack.

*→ [HOW_TO_DEMO.md](./HOW_TO_DEMO.md) · [YouTube](https://www.youtube.com/watch?v=mgChF-R9C2Q) · live app above*

---

## 10. Scalability (judging · 10%)

Today’s hackathon stack is intentionally lean (SQLite, in-process workers, public RPC, stub A-Pass for cast). The production plan is concrete: Postgres + Redis + object storage; real KYC vendor sessions feeding `generate_apass`; queue-based score and Travel Rule workers; reorg-safe indexer; KMS custody; multi-tenant RBAC; Fiat Ramp only when corridors and real funds exist. Phased A–D delivery maps each item back to current packages.

*→ [PRODUCTION_SCALE.md](./PRODUCTION_SCALE.md)*

---

*Opera Protocol · Built on Monad · Powered by Cleanverse A-Pass · A-Token · Validator · Travel Rule*
