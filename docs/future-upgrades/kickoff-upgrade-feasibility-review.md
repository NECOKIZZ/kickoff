# Kickoff — Upgrade Proposals: Feasibility Review & Infrastructure Mapping

**Reviewed:** 2026-07-28, against the actual built state of `~/kickoff` (backend 6 steps +
contracts deployed on testnet 46630 + kickoff-data service complete).
**Inputs:** `kickoff-p2p-and-x-staking-roadmap.md` (2026-07-23) + `kickoff-robinhood-chain-alignment.md`.
**Scope:** feasibility + mapping only. Nothing here is being built now.

---

## 0. Corrections to the proposal docs (facts drifted since 07-23)

These matter because later sections build on them:

1. **γ=6 / "water-filling" is NOT our engine.** The P2P doc's header says it depends on
   "production Trepa live-valuation (γ=6, accuracy weights, water-filling)." Kickoff's locked
   engine (user-approved 2026-07-21, §7.2) is **stake×accuracy dividend split with an
   UNWEIGHTED median win/lose gate, γ=3 default** (per-market override 1–12, frozen at open).
   Everything in §1 that says "the same function used at settlement" must mean **our**
   `settle()` in `@kickoff/engine` — which is already byte-identically ported into
   `KickoffEscrow.sol` and differentially tested. The doc's §1.6 worked example uses a
   placeholder formula and says so; fine.
2. **The shared live-valuation function already exists in embryo.** The doc's §1.3 action
   item ("expose a pure callable `V_i(t)`") is ~80% done:
   `computeSettlement(market, interimOutcome)` in `src/lib/markets.ts` runs the real engine
   against any outcome, and `GET /api/markets/:id/estimate` already serves live
   mark-to-model quotes. What's missing for P2P is only the *time-value band* wrapper.
3. **Live feed cadence is 120s in-play, not "10–15s".** §1.4's freeze-window design assumes
   a 10–15s poll. kickoff-data's S3 in-play cadence is **2 min** (60s near-settlement),
   chosen for Apify cost. This changes P2P risk math materially — see §1 below.
4. **"Supabase" (§3.5) → we use Postgres 16 + Drizzle.** Same idea, different store; the
   waitlist tables go into the existing app DB, not a new service.
5. **BALLDONTLIE (§4.2 signal list)** is still a kickoff-data §12 future upgrade, not an
   integrated source. Agent signal sets should be defined against kickoff-data's `/v1`
   surface (state/events/stats/players), which IS built.

---

## 1. P2P Ticket Marketplace — feasible, biggest real subsystem, 3 hard blockers

**Verdict: feasible and well-conceived, but it is a contracts-phase project, not an app
feature. Sequence after launch volume proves demand (doc's own §1.8 agrees).**

### Maps onto what exists
| Proposal piece | Existing infra it lands on |
|---|---|
| Live valuation `V_i(t)` | `computeSettlement()` + `/api/markets/:id/estimate` — extend, don't rebuild |
| Live score feed | kickoff-data `/v1/fixtures/:id/state` (+ `staleness_seconds` honesty field, which the freeze logic needs and already has) |
| Score-change freeze trigger | `fixture.status_changed` webhook + `match_state.last_event_at` — the receiver pattern already exists in `/api/data-hooks` |
| Time Value Band v2 data ("goal-rate-by-minute") | **Free win:** kickoff-data's `match_events` (minute + score_after) and raw archive accumulate exactly this dataset from day one of burn-in. Every matchday builds the v2 model's training data with zero extra work |
| Guaranteed instant-sell ledger | Same pattern as accumulator ledger (off-chain rows + on-chain settlement), if platform-absorbed |

### Hard blockers (in dependency order)
1. **Tickets don't exist on-chain.** `KickoffEscrow` positions are rows keyed to a wallet —
   there is no transferable ticket object and no `buyTicket()`. This needs a new escrow
   version (positions as transferable ids + atomic pay-and-reassign). The deployed testnet
   escrow can't be patched; it's a redeploy. Do NOT bolt transfers onto the current
   contract — the settle() path assumes stable ownership.
2. **The 120s data cadence vs. sniping.** With a 2-min poll, a buyer watching TV knows about
   a goal ~90–120s before our feed does. §1.4's 15–30s freeze window is calibrated to a
   10–15s feed and is useless at 120s. Options, pick one at build time:
   (a) tighten S3 in-play cadence to 15–30s **only for fixtures with open P2P books**
   (Apify cost roughly ×4–8 on those fixtures — still dollars, not hundreds), or
   (b) freeze fills for the full poll interval after every `last_event_at` change, which at
   120s cadence means the book is frozen a large fraction of a goal-heavy match.
   (a) is the real answer; price it into the feature.
3. **Rebate-pool solvency (§1.5)** — doc flags it honestly. The clean backstop given our
   locked economics: cap rebates per match and top up from the platform's existing 5% take,
   never from the escrow pot. Needs a decision, not research.

### Smaller opens (doc §1.7, still true)
Draw-side classification for the skew; instant-sell counterparty (platform vs matched
buyer); re-listing rate limits. None are architectural.

---

## 2. X-Native Reply-to-Stake — feasible, cheapest of the big three, compliance-gated

**Verdict: technically straightforward on our stack; the real gates are X API pricing
drift and the compliance gut-check (doc §2.5 — auto-staking off a public reply).**

### Maps onto what exists
- **Reply polling loop** is literally our scheduler pattern: a per-market job
  (`x.replyPoll`, conversation_id keyed) with cadence config and budget mirror — the
  kickoff-data worker's planner/runner split was built for exactly this shape. Whether it
  lives in the app or as another worker lane is a build-time choice; the pattern is proven.
- **`x_user_id ↔ wallet` mapping** → users table + Privy embedded wallets (exists).
- **Spend policy ("max $/prediction, daily cap")** → HMAC-signed policy pattern from
  Synesis, as the doc says; nothing analogous exists in Kickoff yet, so this is the one
  genuinely new security-sensitive component. Port it carefully, don't improvise it.
- **Stake execution** → existing positions endpoint; the bot is just another client.
- **Claim funnel for unlinked repliers** → this IS the waitlist/referral funnel (§3);
  build that first and the X feature gets its acquisition landing page for free.
- Cost reality in the doc (~low tens of $ per market via recent-search polling) still
  reads right; re-verify pricing at build time as the doc itself insists.

### Opens
Dedup policy (first-valid vs last-before-lock) — recommend **first valid reply wins**
(edits ignored): simplest to explain publicly and hardest to game.

---

## 3. Waitlist & Referral — build-now candidate; already on the near-term list

**Verdict: fully feasible today, zero dependency on anything unbuilt, and the user has
independently listed "waitlist page" as a pre-deploy build item (2026-07-28). This is the
doc's own #1 in sequencing. Alignment: total.**

### Maps onto what exists
- Tables (`referral_code → referrer`, `referee → code, status, activated_at`, score
  events) → app Postgres + Drizzle migration, alongside `users`.
- **"Reward only on funded stake ≥ threshold"** anti-abuse gate → the positions table
  already records funded stakes with verified `stakeTxHash` (on-chain Staked event
  verification built in task 7) — the activation trigger is a query, not new infra.
- Kickoff Score perks map to real, existing mechanisms: fee-rate discount (take is a
  per-market knob), accumulator bonus entries (vault + ledger exist), gated markets
  (admin listing exists).
- Pre-provisioning a Privy wallet at signup — supported by Privy server-auth flow.

### Opens (doc §3.6, need user numbers at build time)
Point values per task; activation stake threshold; tiers vs linear. Recommend deciding
these when the page is designed — they're copy/economy choices, not architecture.

---

## 4. Agentic Prediction Infrastructure — feasible LAST; two of its deps now exist

**Verdict: correctly sequenced last by the doc. Its dependency list has actually
improved since 07-23: the "live data on the same cadence as humans" requirement and the
signal sandbox are now trivially satisfiable because kickoff-data exists — every agent
signal (state/events/stats/players) comes from `/v1` with `staleness_seconds`, so
"no privileged data path" (§4.3) is enforced by construction: agents and the UI read the
same endpoint with the same staleness. The remaining hard dependency is §1's ticket
transfer + shared valuation, which doesn't exist yet.**

- Strategy-as-config (not code) + fixed connector list → define connectors as `/v1`
  endpoints + (later) BALLDONTLIE once kickoff-data §12 adds it.
- Tasks+Steps + HMAC policies → port from Synesis (same component the X feature needs —
  build once, reuse twice).
- Agent-vs-human fairness (§4.4) is real and is the same problem as P2P blocker #2 —
  whatever freeze/cadence answer P2P picks, agents inherit it, plus the doc's proposed
  mandatory reaction-latency floor (recommend yes, cheap and defensible).

---

## 5. Robinhood alignment ideas

| Idea | Verdict | Mapping / blockers |
|---|---|---|
| **Park idle float in Morpho (~7% APY)** | Feasible, "now"-tier per the doc — but ONE structural blocker: `AccumulatorVault` is deposit-only with a one-shot `finalizeSeason`; it cannot lend its balance out. Needs a vault v2 (deposit → supply Morpho → withdraw at finalize) or an owner-managed sidecar. Contract change = sequence with the P2P escrow redeploy so it's one migration, not two. Also: Morpho is on **mainnet** (4663); we're on testnet — nothing to park yet. | Low effort at mainnet time; cleanest pitch-deck story of the lot, as the doc says |
| **AI-agent narrative for BD/grants** | Free. The claim is now stronger than when the doc was written: Kickoff runs an autonomous data service with budget-guarded agents, a settlement quorum, and (roadmap) prediction agents. Use in outreach whenever. | Messaging only |
| **Accumulator payout in stock tokens** | Buildable v2 as doc says; both flagged constraints (thin basket, weekend liquidity) remain true. Swap-on-delay/TWAP at next US open is the right fix. **Gate on compliance review first** — doc's §4 flag stands, and it compounds with the X-staking and agent compliance flags: get ONE jurisdiction review covering all three, not three separate gut-checks. | Medium; after Morpho float (which builds the vault-v2 plumbing it needs anyway) |
| **Football-club equity payout** | Watch-only. No football-adjacent token listed on the chain yet. Re-check when RWA listings broaden. | Blocked externally |

---

## 6. Recommended sequencing (delta vs the doc's §5)

The doc's order survives contact with the codebase, with two amendments:

1. **Waitlist + referral** — unchanged, and now concretely scheduled (it's on the
   pre-deploy build list). Design the Kickoff Score economy numbers during UI work.
2. Core staking flow validation — done on testnet; "validate" now means burn-in + real
   users, not more building.
3. **P2P marketplace** — unchanged as #3, but re-scoped: it's an escrow-v2 contracts
   project + a data-cadence cost decision, not an app feature. **Bundle the Morpho vault
   v2 into the same contracts iteration** (amendment 1).
4. **X-native staking** — unchanged, but **build the Synesis policy-port as its first
   milestone and share it with #5** (amendment 2). Its claim funnel rides on #1.
5. **Agentic infrastructure** — last, per doc. Its data-fairness prerequisite is already
   satisfied by kickoff-data; only the P2P dependency remains.
6. Compliance: one consolidated jurisdiction review covering X-staking, agents, and
   stock-token payouts, before any of the three ships.

---

## 7. Answers now available to the doc's §6 open questions

- *"Actual production live-valuation function signature?"* — `computeSettlement(m, outcome)`
  over `@kickoff/engine`'s `settle()`; γ=3 stake×accuracy, NOT γ=6 water-filling.
- *"Historical goal-rate-by-minute data source?"* — self-sourced: kickoff-data
  `match_events.minute` + `score_after`, accumulating from burn-in day one.
- *"Freeze window feasibility?"* — recalibrate to the real 120s cadence or buy the
  15–30s cadence for P2P fixtures (see §1 blocker 2).
- Still genuinely open (user decisions): skew classification for draws, rebate cap form,
  X dedup policy (recommend first-valid), Kickoff Score point economy, agent fee-share %,
  agent latency floor (recommend yes).
