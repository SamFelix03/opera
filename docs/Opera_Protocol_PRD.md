# OPERA PROTOCOL

**Product Requirements Document**

Cleanverse Build: Verified Finance Hackathon · RWA Track · August 2026

*Compliance-Native Living Operating Rights for Real-World Assets*

Version 1.0 · August 2026

Built on Monad · Powered by the Cleanverse Compliance Stack

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

| Dimension | Traditional RWA platforms | Opera Protocol |
| --- | --- | --- |
| Ownership question | Ask: who owns this asset? | Ask: who is currently authorized to operate it? |
| Compliance timing | Compliance checked at transfer | Compliance reprices authority continuously |
| Delegation | Delegation is static | Authority is economically alive |
| Agents | Agents report | Agents are market participants with staked capital |
| Compliance role | Compliance is a gate | Compliance is a pricing engine |

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

| Signal | Definition | Weight |
| --- | --- | --- |
| CVI tenure | How long has this identity been continuously verified and non-revoked on Cleanverse | 40% weight |
| CCP clean rate | Percentage of this entity's transactions over the trailing 90 days that passed pre-screening with zero AML flags | 40% weight |
| Travel Rule completeness | Percentage of cross-border transfers that included full Travel Rule data | 20% weight |

#### The Three Economic Mechanisms

The compliance score feeds directly into three mechanisms that make the LOR economically alive:

**Yield Bonding** — The holder's earned yield is gated by their live compliance score

| Score band | Yield treatment | Escrow status |
| --- | --- | --- |
| Score 95–100 | Full contracted yield paid immediately | No escrow |
| Score 80–94 | 85% of yield paid; 15% held in escrow pending recovery | Partial hold |
| Score 70–79 | 60% of yield paid; 40% escrowed | Significant hold |
| Score below 70 | Zero yield; 100% routed to slashing pool, distributed to asset owner | Full suspension |

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

Every component of the Cleanverse ecosystem plays a structurally necessary role in Opera. None are decorative.

### 5.1 CVI — Cleanverse Verified Identity

CVI is not used as a simple gate. It is a continuous data feed whose history directly shapes the compliance score that reprices LORs in real time. Three dimensions of CVI are consumed:

- **Tenure** — the duration of an uninterrupted, non-revoked CVI record is the primary input to the score's CVI tenure component. A new operator cannot fake a 24-month clean history. They must earn it, creating a long-term economic incentive to maintain compliance identity, not just obtain it once.
- **Revocation events** — any CVI revocation or flag event triggers an immediate score recalculation and, depending on severity, may initiate an auto-listing of the holder's LORs
- **Jurisdictional attributes** — CVI-encoded jurisdiction data is used by the Mandate Market to enforce geo-restrictions on which operators may bid for mandates on specific asset types

### 5.2 CVA — Cleanverse Verified Assets

Every LOR is denominated in CVA-verified stablecoins. The CVA stake in the Agent Mandate Market must be posted in CVA. Revenue distributions flow through Clean Payment Rails as CVA. This means every economic action in Opera has clean-money origination by construction — there is no pathway for dirty capital to enter the operating rights market because the only settlement instrument accepted is CVA.

The asset token itself is a CVA-backed instrument, linking the LOR's operational authority directly to the verified asset it governs.

### 5.3 CCP Protocol

CCP is load-bearing, not decorative. It serves three distinct functions in Opera:

- **Score input** — the CCP pre-transaction check determines whether each agent action qualifies as a compliance-clean event contributing to the score calculation. Without CCP, the score has no input; without the score, the LOR has no pricing mechanism.
- **Transfer validation** — every LOR transfer passes through CCP pre-screening. Transfer restrictions based on score, jurisdiction, and asset policy are enforced at the CCP layer before the transaction executes.
- **Travel Rule data** — all CVA value transfers automatically carry Travel Rule data, ensuring every revenue distribution and stake settlement is regulatorily complete.

### 5.4 Agent Skill Framework

The Agent Skill Framework is the protagonist of the Agent Mandate Market. Its role in Opera:

- **Principal verification** — every agent action is validated against the mandate's principal authorisation, ensuring agents cannot exceed their operational scope
- **Spend controls** — CVA spend limits encoded in the mandate are enforced at the framework layer, preventing an agent from over-disbursing even if its execution logic contained an error
- **Immutable audit trail** — every agent action is logged with a cryptographic trace, giving asset owners, regulators, and auditors a complete record of who authorised what, when, and what data the agent acted on
- **Score monitoring** — agents continuously read the CCP audit log to compute and update compliance scores, triggering LOR repricing and auto-listing events autonomously

### 5.5 Playground

The Playground is the mandate and rights design workbench. Asset owners use it to configure the compliance rule engine for their LORs before deployment:

- **Score threshold configuration** — set the score band at which yield bonding triggers, auto-listing activates, and transfer tax increases
- **Mandate rule design** — define compliance requirements for agent bidders, including minimum CVI score, jurisdiction restrictions, and CVA stake formulae
- **Flow simulation** — validate a complete operational lifecycle before going on-chain, including simulated score degradation events and their economic consequences
- **Audit report generation** — produce regulator-ready CCP reports on demand from the Playground dashboard

### 5.6 Clean Payment Rails

All revenue flows — from tenants to operators, from operators to asset owners, from distribution vaults to token holders — travel through Clean Payment Rails. This ensures that the entire operational cash flow of the asset is CVA-settled, CCP-audited, and Travel Rule-compliant end-to-end. An institutional investor's capital does not enter an opaque system: every downstream movement of their money is traceable.

### 5.7 Gateway Network

The Gateway Network handles fiat entry and exit without breaking the CVA settlement chain. A property manager in Dubai collecting AED rent and distributing to owners in Singapore uses Gateway for both conversion legs, with the intermediate CVA flow fully monitored by CCP. No correspondent bank is required for either leg.

---

## 6. User Roles

| Role | Responsibilities and access |
| --- | --- |
| Asset Owner | Tokenizes RWA via CVA, publishes Mandates, configures LOR compliance rules in Playground, receives compliance-weighted revenue distributions. Does not manage operators manually — the protocol manages them. |
| Operator / Agent Deployer | CVI-verified entity that deploys a Cleanverse agent, bids for Mandates by posting CVA stakes, and earns yield from LOR holdings. Yield and stake are continuously subject to compliance score. |
| Institutional Investor | Acquires asset tokens or LOR portfolios. Uses the Rights Price Oracle to price compliance risk in their portfolio. Accesses CCP audit reports for regulatory filings. |
| Regulator / Auditor | Reads CCP-generated audit trails via the Playground export API. Observes the Rights Price Oracle as a live compliance quality index. Does not require bespoke reporting from any participant. |
| Compliance Officer | Monitors real-time score dashboards, configures alert thresholds, reviews auto-listing events, and validates that the score algorithm is correctly weighted for their asset class. |

---

## 7. Core User Flows

### 7.1 Asset Tokenization and LOR Creation

- Owner completes CVI verification via Cleanverse onboarding
- Owner registers asset in Opera's Asset Registry, triggering CVA asset token minting
- Owner opens Playground to configure LOR compliance rules: score thresholds, yield bands, jurisdiction restrictions, auto-listing trigger
- Owner publishes LOR definitions to the LOR Registry — each right is now a tradeable instrument awaiting a holder

### 7.2 Mandate Publication and Agent Bidding

- Owner publishes Mandate to the Mandate Registry, specifying operational scope, compliance requirements, and CVA stake formula
- CVI-verified operators review open Mandates and evaluate fit against their compliance score
- Qualifying operator deploys a Cleanverse agent configured with the mandate parameters; agent posts CVA stake automatically
- Mandate is awarded; agent begins autonomous execution within its defined scope

### 7.3 Continuous Compliance and Score-Driven Events

- Cleanverse agent reads CCP audit log on each block and recalculates the operator's compliance score
- Score update triggers yield bond recalculation — operator's earned yield is adjusted immediately
- If score crosses the auto-listing threshold, the LOR is listed on the Transfer Market at the score-adjusted price without human intervention
- Asset owner receives a notification; a new operator can acquire the right and restore full operational status

### 7.4 Revenue Distribution

- Agent executes revenue collection action (e.g. tenant rent payment received in CVA)
- CCP validates the collection action and attaches Travel Rule data
- Revenue Manager contract applies the yield bonding split based on operator's live compliance score
- Owner share distributed immediately; operator share released from escrow as score maintains target band
- Full distribution audit trail available in Playground on demand

### 7.5 Regulator Audit Export

- Regulator authenticates to Playground via institutional CVI credential
- Selects asset, date range, and event types (transfers, distributions, suspensions, score events)
- Agent compiles CCP audit records into a structured, jurisdiction-specific report
- Report is exported and cryptographically signed — admissible as a regulatory filing in supported jurisdictions

---

## 8. Demo Scenario

**Scenario: Tokenized Solar Farm — Singapore Family Office**

### Setup

| | |
| --- | --- |
| Asset | Solar farm in Malaysia producing monthly energy revenue (MYR 180,000/month) |
| Owner | Singapore family office — CVI-verified, Cleanverse member |
| LORs created | Energy Revenue Collection Right, Maintenance Coordination Right |
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

---

## 9. Technical Architecture

### 9.1 Smart Contract Layer (Monad)

| Contract | Responsibility |
| --- | --- |
| Asset Registry | Stores CVA-backed asset tokens; links each asset to its LOR Registry and Mandate Registry |
| LOR Registry | Mints and tracks Living Operating Rights; enforces CVI-gating on issuance and CCP-gating on transfer; executes score-driven auto-listing |
| Mandate Registry | Stores published Mandates; manages CVA stake deposit and release; records winning agent addresses |
| Revenue Manager | Applies yield bonding splits on incoming CVA; routes to escrow or owner based on live compliance score; processes distribution to asset token holders |
| Compliance Score Oracle | On-chain storage of operator compliance scores; updated by authorised Cleanverse agents; consumed by LOR Registry and Revenue Manager |
| Rights Price Oracle | Time-weighted average of LOR transfer prices per asset category; published on-chain for external consumption |
| Slashing Pool | Holds slashed CVA stakes; distributes to asset owners per configurable formula |

### 9.2 Cleanverse API Layer

| API | Consumption in Opera |
| --- | --- |
| CVI API | Identity verification status, tenure, jurisdictional attributes, revocation events |
| CVA API | Asset token issuance, stake management, settlement execution |
| CCP API | Pre-transaction validation, Travel Rule data attachment, audit log streaming |
| Agent Framework API | Agent deployment, principal verification, spend control enforcement, mandate execution |
| Playground API | Rule engine configuration, flow simulation, audit report generation and export |
| Gateway API | Fiat-to-CVA and CVA-to-fiat conversion, licensed on/off ramp routing |

### 9.3 Backend Services

- Score computation service — reads CCP audit log stream, computes operator scores per block, pushes updates to Compliance Score Oracle contract
- Mandate matching service — monitors Mandate Registry, validates agent bids against compliance requirements, executes stake transfer on match
- Auto-listing service — monitors score events, triggers LOR listing transactions when thresholds are crossed
- Notification service — pushes asset owner and operator alerts on score events, auto-listings, and mandate changes

### 9.4 Frontend

- Asset Owner Dashboard — LOR configuration, Mandate publication, revenue tracking, compliance event feed
- Operator Portal — Mandate marketplace, agent deployment UI, live score display, LOR portfolio management
- Audit Workbench — Playground-powered report configuration, export, and cryptographic signing
- Rights Market — LOR transfer market with score-adjusted pricing, compliance history display, and acquisition flow

---

## 10. MVP Scope for Hackathon

The hackathon MVP demonstrates the complete Opera lifecycle in a single coherent demo flow. Every listed feature below is demonstrable end-to-end.

| Feature | What is demonstrated |
| --- | --- |
| Asset issuance | Register asset, mint CVA-backed token, attach metadata and LOR policy |
| LOR creation | Define operating rights with scope, CVI requirements, yield band configuration |
| Mandate publication | Publish structured mandate with compliance requirements and CVA stake formula |
| Agent bidding simulation | Deploy test Cleanverse agent, validate against mandate requirements, post simulated CVA stake |
| Compliance score live feed | Real-time score display updating from CCP audit log, with visible score band changes |
| Yield bonding demonstration | Show yield split change as score crosses band boundaries in demo |
| Score degradation event | Trigger a simulated CVI flag, watch score drop, yield suspend, LOR auto-list in sequence |
| LOR transfer | New operator acquires auto-listed LOR, stake rebalances, operations resume |
| Revenue distribution | Execute a CVA distribution with Travel Rule data, show split with operator escrow |
| Audit report export | Generate and download a Playground CCP report covering the full demo lifecycle |

---

## 11. Future Roadmap

### Phase 2 — Score sophistication

- Multi-dimensional score weighting configurable by asset class (real estate weights vs infrastructure weights)
- Peer benchmarking — score adjusted relative to operator cohort average, not just absolute thresholds
- Score history NFTs — portable compliance reputation that operators carry across asset protocols

### Phase 3 — Market maturity

- LOR CDOs — bundle multiple LORs from a single asset category into a structured product with senior/junior tranches priced by blended compliance score
- Rights Price Oracle integration with external DeFi protocols for compliance-collateralised lending
- Cross-chain LOR portability via Cleanverse's chain-agnostic design

### Phase 4 — Institutional expansion

- DAO governance layer for LOR policy updates on community-owned assets
- Insurance integration — LOR score feeds directly into real-world insurance pricing for the asset
- Sovereign and fund-of-fund mandate structures for large-scale infrastructure tokenization

---

## 12. Hackathon Track Alignment

The Cleanverse RWA track requires: compliance embedded from issuance, CVI and CVA integrated into core logic, accredited-investor whitelisting, transfer restrictions, and Travel Rule-compliant settlement. The table below maps each requirement to the Opera mechanism that satisfies it.

| Track requirement | Opera mechanism |
| --- | --- |
| Compliance embedded from issuance | LOR compliance rules are configured in Playground before deployment and enforced on every subsequent action — compliance is not added after issuance, it governs the asset from the moment the first LOR is created |
| CVI integrated into core logic | CVI tenure and status are the primary input to the compliance score, which reprices LOR yield on every block. CVI is not a gate — it is a data feed that shapes the economics of the entire protocol |
| CVA integrated into core logic | All economic flows (LOR yields, CVA stakes, slashing distributions, revenue) are settled exclusively in CVA. The asset token is a CVA instrument. There is no pathway into Opera's economic layer that bypasses CVA. |
| Accredited-investor whitelisting | LOR acquisition and asset token holding require CVI verification at a configurable level. The Mandate Market additionally enforces minimum compliance scores and jurisdiction restrictions on agent bidders. |
| Transfer restrictions | LOR transfers are gated by CCP pre-screening, score thresholds, and asset policy rules configured in Playground. Transfer costs are score-adjusted, making non-compliant transfers economically irrational before they are technically blocked. |
| Travel Rule-compliant settlement | All CVA value transfers through Clean Payment Rails automatically carry Travel Rule data. Every distribution, stake deposit, and slashing event is Travel Rule-complete by construction. |

---

*Opera Protocol · Cleanverse Build: Verified Finance Hackathon · RWA Track · Version 1.0 · August 2026*

*Built on Monad · Powered by Cleanverse CVI · CVA · CCP · Agent Skill Framework · Playground · Gateway · Clean Payment Rails*
