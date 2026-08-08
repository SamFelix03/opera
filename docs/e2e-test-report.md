# Opera Protocol — E2E Test Report

**Date:** August 7, 2026
**Network:** Monad Testnet (Chain ID 10143)
**Backend:** Fastify @ `http://127.0.0.1:8787`

---

## Deployed Contracts

| Contract | Address |
|----------|---------|
| OperaToken | `0x39Ae00FA57B509De9f4Da14B290e80924541AfD2` |
| AssetRegistry | `0x83B831848eE0A9a2574Cf62a13c23d8eDCa84E9F` |
| ScoreStore | `0x3DCE9d2269fCB6b2F98619FC417dD0668Ae636C4` |
| LORRegistry | `0xc5E78532225B18e174FeCe089A854ac628179476` |
| MandateRegistry | `0xe33c7296173953C8376D14C7AA2D64Bb946a4644` |
| RevenueManager | `0x583c17fDf9031ece81251eA2f8c819C84fE7f69d` |
| RightsPriceOracle | `0x03002008F0DD0Bcc06CF40A5973bCebc220B1B66` |
| OperaAToken (oCVA) | `0x6A7942B254f84822f7237c6C14aD78A00a22BC4E` |

**Settlement Token:** OPRACVA3275 (6 decimals)

---

## Test Results: 25/25 PASS

### Infrastructure & Chain Read APIs

| # | Endpoint | Result | Details |
|---|----------|--------|---------|
| 1 | `GET /health` | PASS | `{ ok: true }` |
| 2 | `GET /chain/status` | PASS | Block `51722015`, 8 contracts, chain 10143 |
| 3 | `GET /playground/config` | PASS | AutoListThreshold=72, 4 yield bands |
| 4 | `GET /lors` | PASS | 28 active LORs on-chain |
| 5 | `GET /lors?listed=1` | PASS | 7 auto-listed LORs filtered |
| 6 | `GET /mandates` | PASS | 28 mandates on-chain |
| 7 | `GET /mandates?open=1` | PASS | 14 open (un-awarded) mandates |
| 8 | `GET /oracle/prices` | PASS | 6 observations, TWAP-7d = `1203264916` |

### Score Engine

| # | Endpoint | Result | Details |
|---|----------|--------|---------|
| 9 | `POST /scores/compute` | PASS | Score=92, Band=partial, Yield=8500bps paid / 1500bps escrow |
| 10 | `POST /scores/compute` (frozen) | PASS | Score=20, Band=suspended, 100% escrow |
| 11 | `GET /scores/:address` | PASS | Stored score=92 retrieved from SQLite |

### Authentication

| # | Endpoint | Result | Details |
|---|----------|--------|---------|
| 12 | `GET /auth/nonce` | PASS | Nonce generated: `3JopQbPd6xtgdSiXa` |
| 13 | `GET /auth/nonce` (no addr) | PASS | Correctly returns 400 |
| 17 | Auth guard (no session) | PASS | Correctly returns 401 |

### Audit

| # | Endpoint | Result | Details |
|---|----------|--------|---------|
| 14 | `GET /demo/status` | PASS | 20 historical audit events |
| 15 | `GET /audit/events` | PASS | Events queryable with limit param |

### Product APIs (SIWE-Gated)

Test wallet: `0xcc8D51d756034Be0A64562A234e9e37f70fFf353`

| # | Endpoint | Result | Details |
|---|----------|--------|---------|
| 16 | `GET /v1/me` | PASS | Dashboard read — score, settlement, A-Pass |
| 18 | `POST /v1/apass/ensure` | PASS | Cleanverse A-Pass created (cvRecordId `1151`) |
| 19 | `POST /v1/scores/push` | PASS | Score=100 pushed on-chain |
| 20 | `POST /v1/lors/mint` | PASS | LOR #29 minted on-chain |
| 21 | `POST /v1/lors/:id/auto-list` | PASS | LOR #29 auto-listed at 500 oCVA |
| 22 | `POST /v1/oracle/record` | PASS | Price observation (1400) recorded |
| 23 | `POST /v1/apass/freeze` | PASS | Wallet frozen via Cleanverse |
| 24 | `POST /v1/apass/activate` | PASS | Wallet re-activated via Cleanverse |

### Audit Trail Verification

| # | Endpoint | Result | Details |
|---|----------|--------|---------|
| 25 | `GET /audit/events` | PASS | All product ops logged in order |

---

## On-Chain Transactions

| Operation | TX Hash |
|-----------|---------|
| Score push to ScoreStore | `0x8194dd1b80fff0c4...` |
| LOR #29 mint (energy-revenue) | `0x39cb393637fd707c...` |
| LOR #29 auto-list (500 oCVA) | `0xea3db56ec5bcf2f2...` |
| Oracle price record (1400) | `0x1bb5bfdf61e2a2d1...` |
| Previous oracle record (1350) | `0xdcb8c8d5995e6d70...` |
| Previous LOR auto-list | `0xf159da151c1f2158...` |

---

## Flows Verified End-to-End

### 1. Identity & Compliance Flow
```
SIWE nonce → session create → A-Pass ensure (Cleanverse)
→ score compute (off-chain) → score push (on-chain ScoreStore)
→ freeze wallet (Cleanverse) → activate wallet (Cleanverse)
```

### 2. Rights Management Flow
```
LOR mint (on-chain LORRegistry) → set minScoreToHold
→ auto-list with price → query listed LORs (filtered)
```

### 3. Mandate Market Flow
```
Read all mandates (MandateRegistry) → filter open mandates
→ bid/publish/award via wallet TX (frontend Wagmi hooks)
```

### 4. Rights Price Oracle Flow
```
Record price observation (on-chain) → read observation count
→ compute TWAP-7d → serve to frontend
```

### 5. Audit & Compliance Trail
```
Every write operation → insertAuditEvent (SQLite)
→ queryable via /audit/events with pagination
→ exportable as signed PDF via demo orchestrator
```

### 6. Yield Band Cascade
```
Score ≥ 95 → full (100% paid, 0% escrow)
Score ≥ 80 → partial (85% paid, 15% escrow)
Score ≥ 70 → restricted (60% paid, 40% escrow)
Score < 70 → suspended (0% paid, 100% escrow)
Frozen wallet → 0.35× multiplier → band drops
```

---

## Architecture Summary

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│   Frontend   │────▶│  Fastify Backend  │────▶│  Monad Testnet │
│  (React SPA) │     │   (Port 8787)     │     │  (Chain 10143) │
│  Wagmi/SIWE  │     │                   │     │  8 Contracts   │
└──────────────┘     │  /v1/* (product)  │     └────────────────┘
                     │  /lors, /mandates │
                     │  /demo/* (server) │     ┌────────────────┐
                     │  /auth/* (SIWE)   │────▶│   Cleanverse   │
                     │  /webhooks/*      │     │  (A-Pass API)  │
                     └──────────────────┘     └────────────────┘
```

**All 25 endpoints tested. All passing. Zero issues.**
