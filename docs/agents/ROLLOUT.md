# Agent Accounts: Rollout Checklist

Where the go-live stands, so any session can pick it up. Work happens on
branch `claude/sharp-gates-jw5ae4`.

## Done
- [x] **Step 1**: deployer wallet `0x4799…28aE` funded (0.0089 ETH after deploy).
- [x] **Step 2**: v2 contracts deployed to Robinhood testnet (2026-09-25),
  addresses in `contracts/deployments.json`:
  - KickoffEscrow `0x1C8Da6A3f0a303944DF9Df0ebd07c4446AE23911`
  - AgentVault `0x09FE39481920B1e2c76Ca978daB23949f0d836C0`
  - reused MockUSDC `0x6d25…bA14`, AccumulatorVault `0x0D70…3bA0`

- [x] **Step 3**: prod DB migrated (2026-09-25). Prod had
  `drizzle.__drizzle_migrations` with 5 rows whose hashes match 0000-0004
  exactly. Applied `0005_agent_accounts` + `0006_agent_runs` in one
  transaction over Neon's HTTPS SQL endpoint (port 5432 is blocked from
  Claude sessions) and recorded them as migration rows 6-7 with the same
  hash/`when` `drizzle-kit migrate` writes, so future migrations line up.
  Verified: 4 `agent*` tables, 3 enums, 5 FKs, 6 indexes.
- [x] **Step 4**: Vercel env vars set (escrow, AgentVault, CRON_SECRET,
  ANTHROPIC_API_KEY, KICKOFF_DATA_*).
- [x] **Step 5**: shipped to `main` (PR #1).
- [x] **Step 6**: human-to-human smoke test passed (market #5, 2 wallets,
  settled on-chain). Agent create/claim still to exercise.
- [x] **kickoff-data hosted**: Render free web service (API + worker in one
  process), Supabase Postgres, cron-job.org keep-alive. FPL is the only
  source for listing and settlement (roles are env config, see
  `services/kickoff-data/DEPLOY.md`); settlement freezes instantly.
- [x] **Listing agent** (`src/lib/listingAgent.ts`): daily Vercel cron
  (`vercel.json`, 05:07 UTC) + "Run listing agent now" in /admin. Lists and
  opens every scheduled EPL fixture in the next 8 days at $10 fixed / 10%
  take; voids markets whose fixture is postponed or moved earlier. One live
  score market per fixture (`markets.data_fixture_id` + unique index), same
  create path as /admin. Settlement webhooks match on `data_fixture_id`.
- [x] **Managed agents scheduler**: daily Vercel cron at 10:07 UTC (12h
  lookahead covers the day's kickoffs).

## Next
- [ ] **Second settlement source before real money**: add a fast source's
  key in Render, then `KICKOFF_DATA_SETTLEMENT_VOTERS=fpl,<source>`,
  `KICKOFF_DATA_SETTLEMENT_QUORUM=2`. Measure each source's full-time lag
  on GW6 (votes carry `fetched_at`) before choosing.
- [ ] **GW6 (10-12 Oct)**: first automatic listing (from ~2 Oct) and first
  FPL-settled markets. Watch /admin and the audit log.
- [ ] **Agent guide page** (`/agents.md`) + hide the Player Perps tab.
- [ ] **Live PnL graph**: feed in-match snapshots from kickoff-data.

## Notes
- Migration `0007_market_fixture_link` was applied to prod (row 8) before
  the listing code shipped: the new code reads `markets.data_fixture_id`.
- `forge script` 1.5 rejects chain 46630; use `scripts/deploy-v2.mts` (viem).
- Markets listed before v2 aren't linked to the new escrow; with chain wiring
  on, /open refuses unlinked drafts. Relist them.
