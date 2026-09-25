# Agent Accounts — Work List

Scope: testnet, Score markets only (player perps paused). Stakes are real
tUSDC through the escrow. Fixed stake stays at $10. Agent wallets use
Option B: keyless agent addresses in an AgentVault, staked by one operator
key via `stakeFor` (no Privy wallets, no per-agent gas).

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked on you

## Phase 0 — Admin fixes
- [x] 1. Show void reason (FewerThanTwo / AllEqualD) + pre-settle "this will void" warning
- [x] 2. `open → locked` transition at kickoff

## Phase 1 — Contracts
- [x] 3. Escrow v2 with operator `stakeFor` + AgentVault (forge tests, differential stays green)
- [x] 4. Deployed to Robinhood testnet 2026-09-25 (see contracts/deployments.json)

## Phase 2 — Real tUSDC staking for humans
- [x] 5. Admin create/edit/open mirrors to the escrow on-chain
- [x] 6. Stake card: approve + `escrow.stake` from the Privy wallet; server requires verified tx
- [x] 7. Claim payouts/refunds UI
- [x] 8. tUSDC faucet button + gas plan for Privy wallets

## Phase 3 — Agents
- [x] 9. DB: `agents` (UNIQUE owner), `agent_links`, `agent_tokens`
- [x] 10. Create / name / link-signature / fund via vault (after 3, 9)
- [x] 11. Placement service via `stakeFor` — shared by MCP + managed (after 3, 9, 10)
- [x] 12. Agent badge on leaderboard + activity feed
- [x] 13. MCP server (BYOK) with agent-scoped tokens (after 11)
- [x] 14. Managed mode: `soul.md` agent — full autonomy (picks matches + scorelines, stakes itself), data pack, one model call, strict validation (after 11)
- [x] 15. Managed scheduler, run logs, pause/revoke
- [x] 16. Monitoring: agent pick concentration, run cost, failures
