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

## Next
- [ ] **Step 3: production DB migrations (Neon).** The Claude environment
  needs the Neon host in its allowed domains and `PROD_DATABASE_URL` as an
  env var. Then, before changing anything:
  1. Inspect `drizzle.__drizzle_migrations` on prod (does it exist? how many
     rows?). The committed journal gives 0000-0004 tiny `when` values so a DB
     that already ran them skips them; if prod was built with `drizzle-kit
     push` (no migrations table), apply only `0005` + `0006` by hand instead.
  2. Tell the owner exactly what will run, then run it.
- [ ] **Step 4: Vercel env vars** (owner, in Vercel → Settings → Environment
  Variables). They apply on the next deploy:
  - `NEXT_PUBLIC_ESCROW_ADDRESS` = new KickoffEscrow
  - `NEXT_PUBLIC_AGENT_VAULT_ADDRESS` = AgentVault
  - `CRON_SECRET`, `ANTHROPIC_API_KEY` (managed agents)
- [ ] **Step 5: ship the code**: merge the branch to `main` (Vercel deploys it).
- [ ] **Step 6: smoke test on testnet**: create + open a $10 market from
  /admin, stake from two wallets, create an agent, settle, claim.
- [ ] **Open decision**: scheduler for managed agents (Vercel Hobby allows only
  daily crons; GitHub Action or Vercel Pro).

## Notes
- `forge script` 1.5 rejects chain 46630; use `scripts/deploy-v2.mts` (viem).
- Markets listed before v2 aren't linked to the new escrow; with chain wiring
  on, /open refuses unlinked drafts. Relist them.
