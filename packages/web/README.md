# Opera Protocol — Web

Vite + React frontend for the PRD §8 solar-farm demo and role dashboards.

## Env

Create `packages/web/.env.local` (gitignored) or export before `pnpm dev`:

```bash
# Required for MetaMask + WalletConnect (Reown AppKit)
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

Get a free Project ID from [cloud.reown.com](https://cloud.reown.com) or [cloud.walletconnect.com](https://cloud.walletconnect.com).

Without `VITE_WALLETCONNECT_PROJECT_ID`, the UI shows a setup banner and stays read-only for wallet connect; Demo status / score / audit views still work.

## Run

From repo root (backend on `:8787`, Vite proxies `/api`):

```bash
pnpm --filter @opera/backend dev
pnpm --filter @opera/web dev
# → http://localhost:5173
```

Fund wallets at https://faucet.monad.xyz/

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Home — brand hero, connect, link to Demo |
| `/demo` | PRD §8 wizard (bootstrap → steps → run all → events → export) |
| `/owner` | Mandates / LORs / revenue / notifications |
| `/operator` | Score, open mandates, agent status |
| `/market` | Listed LORs / Rights Price Oracle |
| `/playground` | Threshold + freeze simulation |
| `/audit` | Events + download export |

## Stack

- Reown AppKit (`@reown/appkit`) + Wagmi + Viem
- Monad Testnet `chainId` **10143**, RPC `https://testnet-rpc.monad.xyz`
