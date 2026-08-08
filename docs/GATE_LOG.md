# Opera Protocol — Gate Log

| Gate | Date | Result | Notes / Request IDs |
|---|---|---|---|
| C0 Monad probe | 2026-08-07 | PASS | chainId 10143; deployer funded |
| C0 Cleanverse probe | 2026-08-07 | PASS | `f4b4fab7-a8a4-4dcb-88ea-d3446b1aeee2` |
| C1 AES offline | 2026-08-07 | PASS | 6 vitest tests |
| C1 live read | 2026-08-07 | PASS | `c35f16ed-cbdd-4854-b906-899ade31bc8d` |
| C2 A-Pass freeze round-trip | 2026-08-07 | PASS | freeze status=2 → unfreeze status=1; gen `a3c2584b…` |
| C2.5 webhook HMAC | 2026-08-07 | PASS | reject bad sig; accept + idempotent duplicate |
| C3–C7 forge + deploy | 2026-08-07 | PASS | 6 forge tests; Monad deploy (see `config/deployments/monad-testnet.json`) |
| C8 SIWE + routes | 2026-08-07 | PASS | SIWE nonce+verify vitest |
| C9 score freeze 88→31 | 2026-08-07 | PASS | on-chain 88→31; txs `0x9d2a4e8b…` / `0xd54b1a9e…` |
| C10 e2e cascade | 2026-08-07 | PASS | lorId 2; slash pool 500→1000 oCVA; replacement acquired |
| C11 agents | 2026-08-07 | PASS | mandate 3; bids `0x4581…` / `0x5903…`; principalOk winner only |
| C12–C14 demo | 2026-08-07 | PASS | web build; README; DEMO_RUNBOOK; audit rebuild CLI |
| CVA A-Token (Monad) | 2026-08-07 | PASS | Standard `LAUNCH` ISSUED `0x6A7942…BC4E` (OPRACVA3275); wrapped path ISSUE_FAILED — do not use |
| Settlement redeploy | 2026-08-07 | PASS | LOR/Mandate/Revenue bound to A-Token; assetId 2 |
| PRD §8 live frontend path | 2026-08-07 | PASS | run `d76fd19d…`: freeze 88→31, auto-list, acquire `0x69a95a21…`, EIP-191 signed audit pack |
| Cloudflare Tunnel | 2026-08-07 | PASS | `WEBHOOK_BASE_URL` → trycloudflare `/webhooks/atoken-apply` (quick tunnel; restart per session) |

