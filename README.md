# Opera Protocol

Compliance-native Living Operating Rights for RWAs on **Monad Testnet**, powered by the Cleanverse stack (A-Pass, A-Token, Validator, Travel Rule, Fiat Ramp).

Zero-mock build: real UAT API calls, real on-chain stakes/settlements, SIWE auth, autonomous agent processes.

## Quick start

```bash
# 1. Secrets (never commit)
cp config/.env.example config/.env
# fill CLEANVERSE_* , DEPLOYER_* , MONAD_*

# 2. Install
pnpm install

# 3. Probes + unit gates
pnpm probe
pnpm --filter @opera/cleanverse-client test
pnpm --filter @opera/backend test
pnpm --filter @opera/contracts test
pnpm --filter @opera/agents test

# 4. Contracts (already deployed — see config/deployments/monad-testnet.json)
cd packages/contracts && forge test -vv

# 5. API + UI
pnpm --filter @opera/backend dev
pnpm --filter @opera/web dev
```

## Packages

| Package | Role |
|---|---|
| `@opera/cleanverse-client` | AES-256-CBC client, HMAC webhooks, EIP-191 owner sig |
| `@opera/contracts` | Foundry: OperaToken, AssetRegistry, ScoreStore, LORRegistry, MandateRegistry, RevenueManager, RightsPriceOracle |
| `@opera/backend` | Fastify + SIWE + webhook + score worker + SQLite audit read-model |
| `@opera/agents` | Multi-process autonomous mandate agents |
| `@opera/web` | Owner / Operator / Market / Playground / Audit UI |

## Deployed addresses (Monad 10143)

See [`config/deployments/monad-testnet.json`](config/deployments/monad-testnet.json).

## Demo

See [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md) and [`docs/GATE_LOG.md`](docs/GATE_LOG.md).

## Security

- Secrets only in `config/.env` and `keys/*` (gitignored, mode 0600).
- Score writer and deployer are separate EOAs (owner can also write scores).
- Webhook HMAC verified on **raw body** before parse; idempotent on `(txType, requestId)`.
