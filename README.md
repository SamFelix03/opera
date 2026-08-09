# OPERA PROTOCOL

**Product Requirements Document + Implementation README**

Cleanverse Build: Verified Finance Hackathon · RWA Track · August 2026

*Compliance-Native Living Operating Rights for Real-World Assets*

Version 1.0 · August 2026

Built on Monad · Powered by the Cleanverse Compliance Stack

---

## Important links


| Resource                            | Link                                                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live app (Railway)**              | [https://opera-web-production.up.railway.app](https://opera-web-production.up.railway.app)                                                                                                                                                                                        |
| **Live API**                        | [https://opera-backend-production.up.railway.app](https://opera-backend-production.up.railway.app) (`GET /health` → `{"ok":true}`)                                                                                                                                                |
| **Pitch deck**                      | TBD                                                                                                                                                                                                                                                                               |
| **Demo video**                      | [https://www.youtube.com/watch?v=mgChF-R9C2Q](https://www.youtube.com/watch?v=mgChF-R9C2Q)                                                                                                                                                                                        |
| **Source repository**               | [https://github.com/SamFelix03/opera](https://github.com/SamFelix03/opera)                                                                                                                                                                                                        |
| **Sample audit export (txs + run)** | `[data/demo-exports/d76fd19d-3718-488e-b0a3-f2b0aa64b545.json](https://github.com/SamFelix03/opera/blob/master/data/demo-exports/d76fd19d-3718-488e-b0a3-f2b0aa64b545.json)` — live Monad + Cleanverse A-Token run (`settlement.mode: "opera-atoken"`), 48 events, EIP-191 signed |
| **Deployments config**              | `[config/deployments/monad-testnet.json](https://github.com/SamFelix03/opera/blob/master/config/deployments/monad-testnet.json)`                                                                                                                                                  |
| **A-Token launch record**           | `[config/deployments/opera-atoken.json](https://github.com/SamFelix03/opera/blob/master/config/deployments/opera-atoken.json)`                                                                                                                                                    |




### Deployed contracts (Monad Testnet · chainId `10143`)

Explorer: [https://testnet.monadvision.com](https://testnet.monadvision.com) · RPC: `https://testnet-rpc.monad.xyz`


| Contract                                        | Address                                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Settlement (Cleanverse A-Token · `OPRACVA3275`) | `[0x6A7942B254f84822f7237c6C14aD78A00a22BC4E](https://testnet.monadvision.com/address/0x6A7942B254f84822f7237c6C14aD78A00a22BC4E)` |
| OperaToken (legacy local ERC20)                 | `[0x39Ae00FA57B509De9f4Da14B290e80924541AfD2](https://testnet.monadvision.com/address/0x39Ae00FA57B509De9f4Da14B290e80924541AfD2)` |
| AssetRegistry                                   | `[0x83B831848eE0A9a2574Cf62a13c23d8eDCa84E9F](https://testnet.monadvision.com/address/0x83B831848eE0A9a2574Cf62a13c23d8eDCa84E9F)` |
| ScoreStore                                      | `[0x3DCE9d2269fCB6b2F98619FC417dD0668Ae636C4](https://testnet.monadvision.com/address/0x3DCE9d2269fCB6b2F98619FC417dD0668Ae636C4)` |
| LORRegistry                                     | `[0xc5E78532225B18e174FeCe089A854ac628179476](https://testnet.monadvision.com/address/0xc5E78532225B18e174FeCe089A854ac628179476)` |
| MandateRegistry                                 | `[0xe33c7296173953C8376D14C7AA2D64Bb946a4644](https://testnet.monadvision.com/address/0xe33c7296173953C8376D14C7AA2D64Bb946a4644)` |
| RevenueManager                                  | `[0x583c17fDf9031ece81251eA2f8c819C84fE7f69d](https://testnet.monadvision.com/address/0x583c17fDf9031ece81251eA2f8c819C84fE7f69d)` |
| RightsPriceOracle                               | `[0x03002008F0DD0Bcc06CF40A5973bCebc220B1B66](https://testnet.monadvision.com/address/0x03002008F0DD0Bcc06CF40A5973bCebc220B1B66)` |
| Cleanverse AccessCore (platform)                | `[0x8F118338a1fa41E7Fa86Be19A4e8B99Ed58A6EcC](https://testnet.monadvision.com/address/0x8F118338a1fa41E7Fa86Be19A4e8B99Ed58A6EcC)` |
| Cleanverse A-Pass NFT (platform)                | `[0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9](https://testnet.monadvision.com/address/0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9)` |
| Deployer / treasury                             | `0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844`                                                                                       |
| Score writer                                    | `0x99Cf8b5a338B86f1360eaf6a1c913634E36201E8`                                                                                       |


Sample on-chain txs from the export above (Monad testnet):


| Step                 | Tx                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Energy score = 100   | `[0xcc7b2598…](https://testnet.monadvision.com/tx/0xcc7b25988a8f0aa38ce64b29d1b74183945bf5e20182cd72507c2bf129f48b0f)` |
| Maint score = 88     | `[0xd2708c36…](https://testnet.monadvision.com/tx/0xd2708c362931eb41ddd1a5a380a1c75a57fe82119647df587516a79bdf8d8d73)` |
| Revenue distribute   | `[0xa91744f8…](https://testnet.monadvision.com/tx/0xa91744f8b62461f7669e308d850b2efe948ae2b87c4ed38451c392b755fc1f38)` |
| Oracle `recordPrice` | `[0x83b9d6e4…](https://testnet.monadvision.com/tx/0x83b9d6e4f1db1d260dc6fa94875fbc3bae0f7327b08ba79fb8f688fa01fd9f5d)` |
| Frozen score = 31    | `[0xe10777c5…](https://testnet.monadvision.com/tx/0xe10777c59421376c1158b576f3fc757d464ad01421f0c9daa492ad94a4537d19)` |
| Maint LOR auto-list  | `[0x357ef385…](https://testnet.monadvision.com/tx/0x357ef385ad91ec4d91b8570075228a73ca18e2307a12a1d5725f14be7a46c6d5)` |
| Replacement acquire  | `[0x69a95a21…](https://testnet.monadvision.com/tx/0x69a95a2147c8ddabc0dd3bfb577db06a1da58f4795fea9fa6a03955aacdda1d2)` |


---



## Repository layout


| Package                                                                                                    | Role                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `[packages/cleanverse-client](https://github.com/SamFelix03/opera/tree/master/packages/cleanverse-client)` | AES-256-CBC Cleanverse cooperate API client, HMAC webhooks                                                      |
| `[packages/contracts](https://github.com/SamFelix03/opera/tree/master/packages/contracts)`                 | Foundry: ScoreStore, LORRegistry, MandateRegistry, RevenueManager, RightsPriceOracle, AssetRegistry, OperaToken |
| `[packages/backend](https://github.com/SamFelix03/opera/tree/master/packages/backend)`                     | Fastify API, SIWE, score worker, cast demo, SQLite index, A-Token webhook                                       |
| `[packages/agents](https://github.com/SamFelix03/opera/tree/master/packages/agents)`                       | Local `OperaAgent` processes (on-chain bid / revenue / inspection) — **not** Cleanverse Agent Skill Framework   |
| `[packages/web](https://github.com/SamFelix03/opera/tree/master/packages/web)`                             | Owner / Operator / Market / Playground / Audit / Demo cast UI                                                   |




### Quick start

```bash
cp config/.env.example config/.env   # CLEANVERSE_*, DEPLOYER_*, MONAD_*
pnpm install
pnpm --filter @opera/backend dev     # :8787
pnpm --filter @opera/web dev         # :5173 → proxies /api
```

Contracts are already deployed — see addresses above. Demo cast: open Cast HQ → **Seed cast** → follow Owner / Operator / Market / Playground desks.

---



## 1. Executive Summary

Opera Protocol is a compliance-native RWA lifecycle platform that goes fundamentally beyond tokenization. While existing RWA platforms stop at issuance — minting a token that represents ownership and calling it done — Opera models the entire operational reality of a real-world asset: who is authorized to manage it, collect from it, service it, and distribute its revenue, and whether that authority is currently valid.

The central innovation is the Living Operating Right (LOR): a programmable, economically active instrument that grants authority over specific asset operations and whose yield, transfer price, and market status are continuously repriced by a compliance score derived from the holder's behaviour on the Cleanverse stack. Compliance is not a gate. It is the pricing engine.

Opera introduces three primitives that do not exist in any current RWA platform:

- **Living Operating Rights (LORs)** —
  - Authority instruments whose yield and price move with the holder's real-time compliance score
- **Agent Mandate Market** —
  - A market where CVI-verified operators deploy autonomous Cleanverse agents to bid for, win, and execute operational mandates, staking CVA as a compliance bond that is slashed on score degradation
- **Rights Price Oracle** —
  - A continuous on-chain index of LOR prices that creates, for the first time, a market-determined valuation of compliance quality across an asset class

> **TRACK FIT:** Opera covers the full RWA track requirement: CVA-backed issuance, CVI-gated accreditation, CCP-enforced transfer restrictions, Travel Rule-compliant settlement — but frames them as the foundation of an emergent compliance economy, not a checklist.

---



## 2. Problem Statement



### 2.1 The Issuance-Only Gap

The current generation of RWA platforms has solved one problem well: creating a compliant digital representation of an asset's ownership. What they have not solved is everything that happens after issuance.

Real-world assets do not sit still. They have operational lifecycles that involve multiple entities, changing permissions, expiring licences, and ongoing regulatory requirements:

- Property managers collect rent and enforce lease terms
- Aircraft operators sublease planes to regional carriers
- Fund managers distribute dividends and manage subscriptions
- Solar farms route energy revenue to token holders
- Warehouse operators manage inventory and insurance

In current platforms, all of these relationships are managed off-chain, manually, and with no compliance enforcement. A property manager can be sanctioned, lose their licence, or become a politically-exposed person — and the asset's smart contract has no mechanism to detect or respond to any of it.

### 2.2 The Static Delegation Problem

When compliance is modelled at all in existing RWA platforms, it is modelled as a binary state: an entity is either whitelisted or it is not. This produces a fragile system. A whitelisted operator whose compliance degrades continues to hold full authority until a human compliance officer manually revokes it. Between the degradation event and the revocation, the asset is exposed.

More fundamentally, static delegation means compliance has no economic consequence for the holder. There is no incentive to maintain a high compliance posture beyond the fear of manual revocation. Opera replaces fear with price signals.

### 2.3 The Agent Utilisation Gap

Cleanverse's Agent Skill Framework — the most powerful and underutilised component of the stack — is positioned in most integrations as automation middleware: it monitors and reports. Opera repositions it as the execution runtime of a compliance derivatives market, where agents are economic actors with financial skin in the game.

---



## 3. Solution Overview

Opera Protocol introduces a programmable operational layer on top of tokenized RWAs. Every operational action — rent collection, maintenance contracting, lease execution, revenue distribution — is mediated by a Living Operating Right governed by Cleanverse's compliance infrastructure and continuously re-priced by a real-time compliance score.

### 3.1 Why This is Different


| Dimension          | Traditional RWA platforms      | Opera Protocol                                     |
| ------------------ | ------------------------------ | -------------------------------------------------- |
| Ownership question | Ask: who owns this asset?      | Ask: who is currently authorized to operate it?    |
| Compliance timing  | Compliance checked at transfer | Compliance reprices authority continuously         |
| Delegation         | Delegation is static           | Authority is economically alive                    |
| Agents             | Agents report                  | Agents are market participants with staked capital |
| Compliance role    | Compliance is a gate           | Compliance is a pricing engine                     |


---



## 4. Core Primitives



### 4.1 Living Operating Rights (LORs)

A Living Operating Right is an on-chain instrument that grants authority to perform specific operational actions on a tokenized RWA. It is not a static permission. It has an economic structure that responds continuously to the compliance health of whoever holds it.

#### Operational scope examples

- Rent Collection Right — authorises collection of tenant payments and deposit into distribution vault
- Lease Management Right — authorises execution and termination of lease agreements
- Maintenance Coordination Right — authorises commissioning maintenance contracts up to a defined CVA limit
- Revenue Distribution Right — authorises pro-rata distribution to asset token holders
- Insurance Administration Right — authorises policy renewals and claims submission
- Inspection Right — authorises periodic asset condition reporting



#### The Compliance Score

Every LOR holder carries a continuously updated compliance score (0–100), recalculated on each Monad block, computed by a Cleanverse agent reading three signals from the protocol stack:


| Signal                   | Definition                                                                                                       | Weight     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| CVI tenure               | How long has this identity been continuously verified and non-revoked on Cleanverse                              | 40% weight |
| CCP clean rate           | Percentage of this entity's transactions over the trailing 90 days that passed pre-screening with zero AML flags | 40% weight |
| Travel Rule completeness | Percentage of cross-border transfers that included full Travel Rule data                                         | 20% weight |




#### The Three Economic Mechanisms

The compliance score feeds directly into three mechanisms that make the LOR economically alive:

**Yield Bonding** — The holder's earned yield is gated by their live compliance score


| Score band     | Yield treatment                                                      | Escrow status    |
| -------------- | -------------------------------------------------------------------- | ---------------- |
| Score 95–100   | Full contracted yield paid immediately                               | No escrow        |
| Score 80–94    | 85% of yield paid; 15% held in escrow pending recovery               | Partial hold     |
| Score 70–79    | 60% of yield paid; 40% escrowed                                      | Significant hold |
| Score below 70 | Zero yield; 100% routed to slashing pool, distributed to asset owner | Full suspension  |


**Transfer Cost Pricing** — Transfer fees move inversely with compliance score

High-scoring LOR holders pay minimal CCP transfer fees, incentivising compliant operators to grow their LOR portfolio. Low-scoring holders face a punitive transfer tax routed to the asset owner. This creates a natural market pressure: maintaining a high compliance score is not just ethically required, it is economically rational.

**Auto-Listing on Score Degradation** — The market self-corrects without human intervention

When a holder's score drops below a configurable threshold (default: 72), their LOR is automatically listed on the Opera Transfer Market at a score-adjusted price. A higher-compliance operator can acquire the right and immediately restore full operational capacity. The asset owner receives a notification. They do not need to revoke, reassign, or manage. The protocol manages it.

### 4.2 Agent Mandate Market

The Agent Mandate Market is the mechanism by which operators acquire and execute LORs. It repositions the Cleanverse Agent Skill Framework from automation middleware to the execution runtime of a compliance-staked operational market.

#### How it works

- **Mandate publication** →
  - Asset owner publishes a structured Mandate to the public Mandate Registry, specifying: the operational scope (what the agent is permitted to do), compliance requirements for the executing agent (minimum CVI score, jurisdiction restrictions, maximum per-transaction CVA limit, required AML flag rate of zero), and a CVA stake that the winning operator must post before authorisation
- **Agent bidding** →
  - Any CVI-verified operator can deploy a Cleanverse agent that reads the Mandate Registry, evaluates whether it can satisfy the compliance requirements, and bids by posting the required CVA stake
- **Autonomous execution** →
  - The winning agent operates within the mandate's scope — collecting revenue, executing distributions, generating CCP audit reports — without human intervention, using the Agent Skill Framework's principal verification and spend controls to enforce scope boundaries
- **Compliance staking and slashing** →
  - The CVA stake is slashed based on the agent's compliance score, not on outcome. This is a compliance bond, not a performance bond. If the agent executes perfectly but its operator's CVI is flagged for a sanctions hit, the stake is partially slashed even if no capital was lost. The market price of a mandate stake reflects the cost of credibly committing to compliance quality.

> **KEY INSIGHT:** In Opera, the Agent Skill Framework is not automating tasks. It is the execution layer of a compliance derivatives market. Mandates are standardised contracts. Agents are market participants. Stakes are the collateral layer that prices compliance quality.



### 4.3 Rights Price Oracle

Because LORs trade continuously on the Opera Transfer Market and their prices are continuously influenced by the compliance scores of their holders, a time-weighted average of LOR prices for a given asset category becomes an on-chain compliance quality index for that asset class.

Use cases for the oracle:

- Institutional underwriting — a bank extending credit against a real estate fund can price their facility using the LOR index for that asset category as a leading compliance risk indicator
- Regulatory observation — a regulator can monitor the index as a real-time signal of compliance stress across a sector without requiring bespoke reporting
- Cross-asset benchmarking — fund managers can compare compliance quality across asset classes using a single standardised price series
- Cleanverse ecosystem proof — the oracle provides market-determined evidence that Cleanverse's compliance infrastructure has economic value, not just regulatory-checkbox value

---



## 5. Cleanverse Stack Integration

PRD §5 describes the **target** Cleanverse story. This section documents **what Opera actually wires today**, with GitHub deep-links and code. Where a PRD claim is aspirational, it is called out explicitly.

### 5.0 Integration map (every touchpoint)

| # | Cleanverse capability | Used in Opera? | How | Primary code |
| --- | --- | --- | --- | --- |
| 1 | AES-256-CBC crypto | **Yes · live** | Encrypted write bodies | [cleanverse-client](https://github.com/SamFelix03/opera/blob/master/packages/cleanverse-client/src/index.ts) |
| 2 | Webhook HMAC | **Yes · live** | A-Token apply callbacks | [backend webhook](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/index.ts) |
| 3 | `generate_apass` | **Yes · live** | Identity bootstrap | [ensureApass](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/lib/cleanverse-helpers.ts) |
| 4 | `query_apass` (+ list for `registeredAt`) | **Yes · live** | Status, countries, tenure, freeze | [queryApassStatus](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/lib/cleanverse-helpers.ts) |
| 5 | `update_status` | **Yes · live** | Freeze / activate | helpers + cast / product |
| 6 | `verify_apass` (code 4 hard gate) | **Yes · live** | Mint / bid / acquire / distribute | `requireComplianceForAction` |
| 7 | `query_apass_list` | **Yes · live** | Institution roster + tenure backfill | `GET /v1/apass/list` |
| 8 | Country tags → mandate geo | **Yes · live** | `jurisdictionRoot` vs A-Pass `countries` before bid | `requireJurisdiction` |
| 9 | A-Token launch + webhook | **Yes · live** | `OPRACVA3275` | [launch script](https://github.com/SamFelix03/opera/blob/master/scripts/launch-opera-atoken.ts) |
| 10 | A-Token settlement (oCVA) | **Yes · live** | Stakes, acquire, revenue | [deployments](https://github.com/SamFelix03/opera/blob/master/config/deployments/monad-testnet.json) |
| 11 | A-Token A-Pass transfer gating | **Yes · enforced by CV token** | Frozen seller → `APassNotActive`; temp-activate on acquire | [chain-errors](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/lib/chain-errors.ts) |
| 12 | `atoken/add_rule` + `rules` (SG) | **Yes · live** | SG whitelist on oCVA | `POST /v1/atoken/rules/ensure-sg` · [script](https://github.com/SamFelix03/opera/blob/master/scripts/ensure-atoken-sg-rule.ts) |
| 13 | Validator `verify` (CCP eligibility) | **Yes · when pool set** | `CLEANVERSE_VALIDATOR_POOL` → gate + score CCP term | helpers · [register script](https://github.com/SamFelix03/opera/blob/master/scripts/register-validator-pool.ts) |
| 14 | `query_txs` | **Yes · TR / fallback CCP proxy** | TR completeness; CCP fallback if no pool (AML still conceptual) | [score-worker](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/score-worker.ts) |
| 15 | `download_travel_rule` | **Yes · live** | After distribute/acquire; audit pack `cleanverse.travelRule` | helpers · `POST /v1/travel-rule` |
| 16 | `query_deposit_address` | **Yes · live** | Deposit wallets | `GET /v1/deposit-address/:address` |
| 17 | `query_institution_white_list` | **Yes · live** | Institution whitelist | `GET /v1/institution/whitelist` |
| 18 | EIP-191 `signOwnerMessage` | **Yes · ops** | Validator grant/register signatures | [register-validator-pool.ts](https://github.com/SamFelix03/opera/blob/master/scripts/register-validator-pool.ts) |
| 19 | Fiat Ramp | **Deferred · §11** | Live product + real funds only | unused client methods |
| 20 | Agent Skill Framework | **Out of scope** | Local `OperaAgent` only | — |

### 5.1 CVI / A-Pass — how Opera uses identity

**PRD claim:** continuous CVI tenure + revocation events as score feeds; jurisdiction attributes for mandate geo-gates.

**Implemented:**

1. **A-Pass lifecycle** — generate, query, activate (`status=1`), freeze (`status=2`).
2. **Freeze bit** drives demo 88 → 31 (`rawScore × 0.35`).
3. **Tenure** from `registeredAt` (`query_apass_list`) or derived from `expirationTime` → 40% CVI term.
4. **Country tags** gate bids when mandate `jurisdictionRoot` is set (demo uses `keccak256("SG")`).
5. **`verify_apass` code 4** hard-gates mint / bid / acquire / distribute.
6. **APIs:** `POST /v1/apass/ensure|freeze|activate`, `GET /v1/apass/list`, cast actions.

Full helper: [cleanverse-helpers.ts](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/lib/cleanverse-helpers.ts).

**Gaps vs PRD:** no A-Pass revocation webhook (push/poll); `jurisdictionRoot` enforced off-chain before `bid`, not inside the Solidity `bid` function.

### 5.2 CVA / A-Token — settlement money

**Implemented:** Cleanverse LAUNCH A-Token `OPRACVA3275` as settlement; SG country rule via `atoken/add_rule`; frozen A-Pass cannot receive oCVA (acquire temp-activates seller).

### 5.3 CCP Protocol — score input & transfer validation

| Sub-claim | Reality |
| --- | --- |
| Score weights 40/40/20 | **Yes** — `score.ts` |
| CCP eligibility (`validator/verify`) | **Yes when `CLEANVERSE_VALIDATOR_POOL` set** — gates + score CCP term; soft-skip if unset |
| CCP AML clean-rate feed | **Conceptual / future** — §11 Phase 2 |
| Economic-action pre-screen | **Yes** — `verify_apass` + optional validator on mint/bid/acquire/distribute |
| Travel Rule reports | **Yes** — `download_travel_rule` after distribute/acquire; pack + `POST /v1/travel-rule` |

### 5.4 Agent Skill Framework

**Out of scope.** Local `OperaAgent` only. Mandate fields `minScore` / stake / `maxSpendPerTx` / `jurisdictionRoot` (off-chain geo) remain on `MandateRegistry`.

### 5.5 Client cryptography & webhooks (foundational)

AES-256-CBC + HMAC webhook on raw body — [cleanverse-client](https://github.com/SamFelix03/opera/blob/master/packages/cleanverse-client/src/index.ts) · [webhook](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/index.ts).

### 5.6 Where Cleanverse shows in the UI

| Surface | Behavior |
| --- | --- |
| Operator Ensure A-Pass | `/v1/apass/ensure` or cast |
| WalletBar oCVA | Settlement A-Token balance |
| Market acquire | Frozen-seller A-Pass note |
| Profile / me | A-Pass + validator eligibility |
| Product APIs | list / deposit / whitelist / travel-rule / atoken rules |

### 5.7 End-to-end Cleanverse path in the solar-farm demo

```
setupIdentities     → generate/query A-Pass (SG country tags)
prepareCast/fund    → ensureApass on operators + protocol contracts; fund oCVA
hire (cast desks)   → verify_apass + jurisdiction + optional validator before mint/bid
normalOps           → verify_apass; distribute oCVA; downloadTravelRule → audit events
sanctionsEvent      → update_status(2) → score 88→31 → auto-list
replacementAcquire  → buyer compliance gate; seller ensure + verify; acquireLOR; TR; re-freeze
regulatorExport     → signed pack including cleanverse.travelRule[]
```

Ops: `scripts/ensure-atoken-sg-rule.ts`, `scripts/register-validator-pool.ts` (then set `CLEANVERSE_VALIDATOR_POOL`).

Orchestrator / cast: [orchestrator.ts](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/demo/orchestrator.ts) · [cast-actions.ts](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/demo/cast-actions.ts)

---

## Scalability plan

Grounded in the **current** architecture (Fastify + SQLite + ~15s workers + Monad public RPC), not vaporware.

### Near-term (demo → multi-tenant staging)


| Area                | Current                                            | Scale move                                                                                           |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Mandate / LOR lists | SQLite index + ~12s `getLogs` sync                 | Keep SQL as read model; shard by `assetId`; optional Postgres when volume exceeds single-node SQLite |
| Score updates       | `SCORE_INTERVAL_MS` default **15s**, not per-block | Batch `setScore` multicalls; subscribe to Cleanverse webhooks for A-Pass status instead of polling   |
| RPC                 | Monad public endpoint (rate-limited)               | Dedicated RPC / Alchemy-class provider; queue writes; backoff already partially needed               |
| Cast demo keys      | Per-run EOAs in SQLite                             | KMS / ephemeral vault; never ship demo keys to browser                                               |
| Frontend API        | Prod web → public Railway backend URL              | Keep public API; drop broken private nginx hop or fix mesh DNS                                       |




### Mid-term (production compliance market)

1. **CCP AML feed** — still conceptual (§11); validator eligibility + Travel Rule downloads are live when configured.
2. **Event-driven auto-list** — score writer emits events → indexer → `setAutoListed` without scanning all holder LORs every tick.
3. **Acquire settlement** — pay treasury on distress sales *or* Cleanverse escrow that can receive while seller A-Pass is frozen (avoids temp-activate).
4. **Mandate matching service** — optional automated award when score/stake constraints met (today: manual `award`).
5. **Oracle continuity** — record LOR TWAP on every successful `acquireLOR` / `transferLOR`, not only demo `recordPrice`.



### Longer-term (PRD Phase 2–4 alignment)

Multi-dimensional score weights by asset class, portable score-history credentials, external DeFi consumption of Rights Price Oracle, **CCP AML feeds** (replacing conceptual heuristics), and **fiat settlement via Cleanverse Gateway / Fiat Ramp once the product is live with real funds** — see §11.

---



## 6. User Roles *(as implemented)*


| Role                      | What exists in the product                                                                                                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset Owner               | Owner desk: mint LORs, publish mandates, award winners, view revenue / events (`[Owner.tsx](https://github.com/SamFelix03/opera/blob/master/packages/web/src/pages/Owner.tsx)`). Cast role `owner`.                                                                               |
| Operator / Agent Deployer | Operator desk: ensure A-Pass, bid + stake oCVA, portfolio, distribute revenue, auto-list (`[Operator.tsx](https://github.com/SamFelix03/opera/blob/master/packages/web/src/pages/Operator.tsx)`). Optional local `OperaAgent`. Cast roles `energyOp` / `maintOp` / `replacement`. |
| Institutional Investor    | Cast role `investor` + Market / oracle views — **no** dedicated underwriting desk.                                                                                                                                                                                                |
| Regulator / Auditor       | Audit desk exports signed JSON/PDF event packs; cast role `regulator`. **No** institutional CVI login or jurisdiction-specific CCP filing.                                                                                                                                        |
| Compliance Officer        | Covered by Playground Rules (freeze / push score / activate) + score badges — **no** separate officer console.                                                                                                                                                                    |


---



## 7. Core User Flows *(as implemented)*



### 7.1 Asset tokenization and LOR creation

- Cast seed / `setupIdentities` ensures A-Passes for role wallets.
- Asset id is taken from deployment (`assetId: 2`) via `AssetRegistry` (demo does not re-issue a new Cleanverse asset token each run).
- Owner mints LORs on `LORRegistry` with `scope`, `holder`, `minScore` (default 70 in UI flows).
- Playground configures **auto-list threshold** and simulates score bands; it does **not** deploy a full off-chain rule engine.



### 7.2 Mandate publication and bidding

- Owner publishes mandate: `minScore`, `stakeAmount`, `maxSpendPerTx`, optional `jurisdictionRoot`.
- Operators (or `OperaAgent`) `bid` by approving + transferring oCVA stake.
- Owner **manually awards** a winner; stake of losers is releasable per contract logic.
- Jurisdiction is enforced **off-chain** before bid via A-Pass `countries` vs mandate `jurisdictionRoot` (demo uses SG). AML flag rate remains conceptual (§11).



### 7.3 Continuous compliance and score-driven events

- Score worker (when `WORKERS_ENABLED=1`) ticks ~every **15s**: `queryApass` + `queryTxs` → `computeScore` → `ScoreStore.setScore` → maybe auto-list (`[score-worker.ts](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/score-worker.ts)`, `[workers.ts](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/workers.ts)`).
- Demo / cast path: freeze A-Pass → push score 31 → `setAutoListed` / `maybeAutoList`.
- Notifications written to SQLite for owner alerts.



### 7.4 Revenue distribution

- `RevenueManager.distribute(operator, gross)` pulls oCVA from caller; **50%** to asset owner; operator half split by `yieldSplit(score)` bands matching PRD (100% / 85–15 / 60–40 / slash-all) — `[RevenueManager.sol](https://github.com/SamFelix03/opera/blob/master/packages/contracts/src/RevenueManager.sol#L38-L75)`.
- Travel Rule download attempted after demo txs; often `travel_rule.skip` in exports.



### 7.5 Regulator audit export

- `regulatorExport` builds a pack: asset ids, settlement token, freeze formula, full demo `events[]`, EIP-191 `contentHash` + deployer signature when keys available.
- Downloadable from Audit desk / API; samples under `[data/demo-exports/](https://github.com/SamFelix03/opera/tree/master/data/demo-exports)`.
- This is an **Opera event pack**, not a Cleanverse CCP regulatory filing product.

---



## 8. Demo Scenario

**Scenario: Tokenized Solar Farm — Singapore Family Office**

### Setup


|                    |                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------- |
| Asset              | Solar farm in Malaysia producing monthly energy revenue (MYR 180,000/month)         |
| Owner              | Singapore family office — CVI-verified, Cleanverse member                           |
| LORs created       | Energy Revenue Collection Right, Maintenance Coordination Right                     |
| Mandates published | Two Mandates: one per LOR, with score minimum of 80, CVA stake of 5,000 per mandate |




### Month 1–3: Normal operation

- Two CVI-verified operators win the Mandates and post CVA stakes
- Energy Revenue agent invoices the grid operator monthly, deposits CVA proceeds into the distribution vault, distributes to asset token holders
- Maintenance agent commissions quarterly inspection, posts CCP-validated maintenance report
- Both operators score above 90 — full yield, minimal transfer fees, LORs price at premium on the oracle



### Month 4: Compliance event

- The maintenance operator's parent company appears on an updated sanctions watchlist
- CVI is flagged — operator's compliance score drops from 88 to 31 within one block
- Yield bonding triggers immediately: 100% of maintenance fee held in escrow, zero released
- Score crosses auto-listing threshold: Maintenance LOR listed on Transfer Market at score-adjusted price automatically
- A new CVI-verified operator reviews the listing, evaluates the Mandate requirements, posts a higher-quality stake, and acquires the right
- Maintenance operations resume under new operator within the same block cycle
- Asset owner received one notification. No manual revocation, no legal negotiation, no operational gap.



### Regulator review

- MAS examiner logs into Playground with institutional CVI credential
- Pulls the full event log: score history, flagging event, yield suspension, auto-listing, transfer, and replacement — all timestamped and cryptographically attested
- Exports a Travel Rule-complete report showing every CVA transfer in the period, with full sender/beneficiary identity proofs
- No manual compliance work was performed by anyone during the entire event. The protocol enforced it.



### How the hackathon build actually runs this story


| Narrative beat   | Implementation                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identities       | Real Cleanverse A-Pass generate/query (unless `DEMO_MOCK=1`)                                                                                                   |
| Scores 100 / 88  | `ScoreStore.setScore` with `demoInputs88` / healthy inputs — **not** per-block CVI tenure                                                                      |
| Stakes & revenue | Real oCVA transfers on Monad                                                                                                                                   |
| Sanctions        | Real `update_status(2)` freeze + score ×0.35 → **31**                                                                                                          |
| Auto-list        | On-chain `maybeAutoList` / `setAutoListed` (threshold **72**)                                                                                                  |
| Acquire          | `acquireLOR`; seller A-Pass temporarily activated so oCVA can settle                                                                                           |
| Regulator pack   | Signed JSON/PDF of Opera events ([sample export](https://github.com/SamFelix03/opera/blob/master/data/demo-exports/d76fd19d-3718-488e-b0a3-f2b0aa64b545.json)) |


**Cast HQ path (UI):** Seed → Hire (mint / publish / bid / award) → Operate (distribute) → Freeze + push score (Playground) → Auto-list → Market acquire as Replacement → Audit export. Steps enum: `DEMO_STEPS` [in](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/demo/state.ts#L18-L27) `state.ts`.

---



## 9. Technical Architecture *(as implemented)*



### 9.1 Smart Contract Layer (Monad)


| Contract           | Responsibility in this repo                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| AssetRegistry      | Registers asset metadata / ids used by demo                                                                            |
| LORRegistry        | `mintLOR`, `transferLOR` (score fee bps = `max(50, 5000 − score×45)`), `setAutoListed` / `maybeAutoList`, `acquireLOR` |
| MandateRegistry    | Publish / bid (oCVA stake) / award / principal checks; jurisdiction tag stored                                         |
| RevenueManager     | Yield bonding bands + owner 50% split + escrow map + `slashingPool` (not a separate Slashing Pool contract)            |
| ScoreStore         | Authorised writer updates operator scores                                                                              |
| RightsPriceOracle  | Owner `recordPrice` + `twap(category, window)`                                                                         |
| OperaToken         | Local ERC20 with optional `transferGate` — **not** primary settlement                                                  |
| Cleanverse A-Token | External settlement ERC-20 with A-Pass transfer policy                                                                 |


Transfer fee: `[LORRegistry.sol](https://github.com/SamFelix03/opera/blob/master/packages/contracts/src/LORRegistry.sol#L67-L74)` · Auto-list threshold default 72: [L25](https://github.com/SamFelix03/opera/blob/master/packages/contracts/src/LORRegistry.sol#L25).

### 9.2 Cleanverse API Layer *(consumed vs unused)*


| API | Consumption in Opera |
| --- | --- |
| A-Pass generate / query / update / verify / list | **Live** identity, tenure, geo, hard gates |
| A-Token launch / rules / webhook | **Live** settlement + SG country rule |
| Validator `verify` | **Live when `CLEANVERSE_VALIDATOR_POOL` set** |
| `query_txs` | **TR / fallback CCP proxy** (AML conceptual) |
| `download_travel_rule` | **Live** post-tx + audit pack |
| Deposit / institution whitelist | **Live** product reads |
| Fiat Ramp APIs | **Deferred** — §11 Phase 4 |
| Agent Framework API | **Out of scope** |




### 9.3 Backend services


| Service                             | Status                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Score computation worker            | Implemented (~15s loop when enabled)                                                                                                                                                                                         |
| Auto-listing cascade                | Implemented (worker + cast/product push)                                                                                                                                                                                     |
| SQLite mandate/LOR/bid index + sync | Implemented (`[chain-index.ts](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/chain-index.ts)`, `[chain-sync.ts](https://github.com/SamFelix03/opera/blob/master/packages/backend/src/chain-sync.ts)`) |
| Mandate matching service            | **Not implemented** (manual award)                                                                                                                                                                                           |
| Notification service                | SQLite notifications + UI feed                                                                                                                                                                                               |
| SIWE sessions                       | Implemented for product `/v1/*`                                                                                                                                                                                              |




### 9.4 Frontend


| Desk                                                  | Status                                        |
| ----------------------------------------------------- | --------------------------------------------- |
| Owner / Operator / Market / Playground / Audit / Demo | Implemented                                   |
| Cast mode                                             | Role wallets + `POST /demo/:runId/act`        |
| Wallet mode                                           | wagmi / AppKit writes for users with own keys |


---



## 10. MVP Scope for Hackathon *(demo checklist vs code)*


| Feature                     | What is demonstrated in this build                                                  |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Asset issuance              | Deployment-bound asset id + Cleanverse A-Token settlement (not per-run CVA mint UI) |
| LOR creation                | On-chain mint with scope + `minScore`                                               |
| Mandate publication         | On-chain publish with stake / minScore / maxSpend                                   |
| Agent bidding simulation    | Operator or local `OperaAgent` posts oCVA stake — **not** Cleanverse ASF            |
| Compliance score live feed  | ScoreStore + badges + worker/push; CCP inputs largely synthetic/heuristic           |
| Yield bonding demonstration | `RevenueManager.yieldSplit` bands enforced on distribute                            |
| Score degradation event     | Freeze A-Pass → score 31 → LOR auto-list                                            |
| LOR transfer                | `acquireLOR` on Market / cast (seller A-Pass must be receivable)                    |
| Revenue distribution        | oCVA `distribute` with score split; TR download best-effort                         |
| Audit report export         | Signed Opera event pack JSON/PDF                                                    |


---



## 11. Future Roadmap



### Phase 2 — Score sophistication

- Multi-dimensional score weighting configurable by asset class (real estate weights vs infrastructure weights)
- Peer benchmarking — score adjusted relative to operator cohort average, not just absolute thresholds
- Score history NFTs — portable compliance reputation that operators carry across asset protocols
- **CCP AML clean-rate feed** — conceptual today (`query_txs` counts every history row as clean; see score worker CV-6). A future update will replace that heuristic with real Cleanverse CCP / AML screening outcomes as the 40% CCP term in `computeScore`



### Phase 3 — Market maturity

- LOR CDOs — bundle multiple LORs from a single asset category into a structured product with senior/junior tranches priced by blended compliance score
- Rights Price Oracle integration with external DeFi protocols for compliance-collateralised lending
- Cross-chain LOR portability via Cleanverse's chain-agnostic design



### Phase 4 — Institutional expansion

- DAO governance layer for LOR policy updates on community-owned assets
- Insurance integration — LOR score feeds directly into real-world insurance pricing for the asset
- Sovereign and fund-of-fund mandate structures for large-scale infrastructure tokenization
- **Fiat settlement (Cleanverse Gateway / Fiat Ramp)** — not in the hackathon build. Client methods exist (`query_ramp_*`, `create_ramp_widget_url`) but are unused on purpose: fiat on/off-ramp only makes sense when **real funds** are involved and the product is **live** (licensed corridors, institution eligibility, and production Cleanverse ramp markets). Until then, Opera settles exclusively in Cleanverse A-Token (oCVA) on Monad testnet

---



## 12. Hackathon Track Alignment

The Cleanverse RWA track requires: compliance embedded from issuance, CVI and CVA integrated into core logic, accredited-investor whitelisting, transfer restrictions, and Travel Rule-compliant settlement. The table below maps each requirement to the Opera mechanism that satisfies it **in this repository**.


| Track requirement                 | Opera mechanism (honest)                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compliance embedded from issuance | LOR `minScore`, mandate `minScore`, A-Pass required to move oCVA; Playground threshold + cast freeze story — **not** a full pre-deploy CCP rule engine |
| CVI integrated into core logic    | A-Pass status drives freeze → score collapse → auto-list; tenure/CCP/TR numerics are weighted locally and often synthetic                              |
| CVA integrated into core logic    | All stakes, acquire payments, and revenue splits use Cleanverse-issued A-Token oCVA                                                                    |
| Accredited-investor whitelisting  | Score / `minScore` gates on mint, bid, and acquire — **not** a separate accreditation tier API                                                         |
| Transfer restrictions             | On-chain score gates + Cleanverse A-Token A-Pass policy on settlement; **no** CCP `validator/verify` on LOR transfers                                  |
| Travel Rule-compliant settlement  | Best-effort `downloadTravelRule` after demo txs; **not** automatic attachment on every transfer                                                        |


---



## Security notes

- Secrets only in `config/.env` and `keys/*` (gitignored).
- Score writer and deployer are separate EOAs where configured.
- Webhook HMAC verified on **raw body** before parse; idempotent on `(txType, requestId)`.
- Cast demo private keys live in SQLite for the hackathon cast UX — treat as disposable test keys.

---

*Opera Protocol · Cleanverse Build: Verified Finance Hackathon · RWA Track · Version 1.0 · August 2026*

*Built on Monad · Powered by Cleanverse CVI · CVA · CCP · Agent Skill Framework · Playground · Gateway · Clean Payment Rails*

*Implementation README documents live A-Pass + A-Token settlement on Monad testnet; see §5 for what is wired vs aspirational.*