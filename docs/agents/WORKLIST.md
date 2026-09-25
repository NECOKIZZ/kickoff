# Agent Accounts — Work List

Scope: testnet, Score markets only (player perps paused). Stakes are real
tUSDC through the escrow. Fixed stake stays at $10. Agent wallets use
Option B: keyless agent addresses in an AgentVault, staked by one operator
key via `stakeFor` (no Privy wallets, no per-agent gas).

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked on you

## Phase 0 — Admin fixes
- [ ] 1. Show void reason (FewerThanTwo / AllEqualD) + pre-settle "this will void" warning
- [ ] 2. `open → locked` transition at kickoff

## Phase 1 — Contracts
- [ ] 3. Escrow v2 with operator `stakeFor` + AgentVault (forge tests, differential stays green)
- [ ] 4. Testnet deploy script — `[!]` broadcast needs the deployer key

## Phase 2 — Real tUSDC staking for humans
- [ ] 5. Admin create/edit/open mirrors to the escrow on-chain
- [ ] 6. Stake card: approve + `escrow.stake` from the Privy wallet; server requires verified tx
- [ ] 7. Claim payouts/refunds UI
- [ ] 8. tUSDC faucet button + gas plan for Privy wallets

## Phase 3 — Agents
- [ ] 9. DB: `agents` (UNIQUE owner), `agent_links`, `agent_tokens`
- [ ] 10. Create / name / link-signature / fund via vault (after 3, 9)
- [ ] 11. Placement service via `stakeFor` — shared by MCP + managed (after 3, 9, 10)
- [ ] 12. Agent badge on leaderboard + activity feed
- [ ] 13. MCP server (BYOK) with agent-scoped tokens (after 11)
- [ ] 14. Managed mode: `.md` strategy, data pack, one model call, strict validation (after 11)
- [ ] 15. Managed scheduler, run logs, pause/revoke
- [ ] 16. Monitoring: agent pick concentration, run cost, failures
