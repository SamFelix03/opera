# Opera Protocol — Demo Runbook (PRD §8)

## Prerequisites

- `config/.env` filled (Cleanverse UAT + Monad RPC + deployer key)
- Contracts at `config/deployments/monad-testnet.json`
- Settlement A-Token at `config/deployments/opera-atoken.json`
- Deployer funded with MON: https://faucet.monad.xyz/
- Optional: `WEBHOOK_BASE_URL` (Cloudflare Tunnel → `:8787`) for A-Token apply callbacks
- Web wallet: `packages/web/.env.local` with `VITE_WALLETCONNECT_PROJECT_ID`

## Run

```bash
pnpm --filter @opera/backend dev   # :8787
pnpm --filter @opera/web dev       # :5173 → /demo
```

Or drive the API:

```bash
curl -X POST http://localhost:8787/demo/bootstrap
curl -X POST http://localhost:8787/demo/$RUN_ID/run-all
```

Steps: `setupIdentities` → `setupAsset` → `fundAndStake` → `normalOps` → `sanctionsEvent` → `replacementAcquire` → `regulatorExport`

## Assert

| Check | Expect |
|---|---|
| Settlement | `opera-atoken` / `0x6A7942…BC4E` |
| Freeze | Cleanverse `update_status` → score **88 → 31** |
| Auto-list | Maint LOR `autoListed=true` |
| Acquire | Replacement holds maint LOR |
| Export | Signed JSON (+ PDF) under `data/demo-exports/` |

## Playground

`/playground` → simulate freeze → score 31, wouldAutoList at threshold 72. Push threshold on-chain via `POST /playground/config`.

## Re-launch A-Token (rare)

```bash
pnpm launch:atoken
```
