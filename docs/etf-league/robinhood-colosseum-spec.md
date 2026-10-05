# ETF League — BUILDING.md

**Status:** spec, not built · **Date:** 2026-10-05 · **Prototype:** `README.md`, `league.py`, `stress.py` in this folder
**Target:** Colosseum Crypto World's Fair, **Robinhood Chain track**. Deadline **Mon 12 Oct 2026, 11:59pm PT**.
**Recommended packaging:** ship as a new game mode inside **Kickoff** ("Kickoff ETF League"). Colosseum allows one submission per team, Kickoff is already on Robinhood Chain, and the league reuses Kickoff's engine, stack and contracts.

---

## 1. The product in one paragraph
People hold on-chain ETFs on **EARN** (Balancer V3 weighted pools of Robinhood stock tokens on Robinhood Chain) and already earn trading fees. ETF League adds a weekly game:
- Lock a **fixed $5 USDG stake** next to an ETF you hold.
- ETFs are ranked by the **% growth of their stocks**.
- The **top half win the bottom half's stakes**, split by stake × accuracy.
- **Backers** buy into a creator's ETF, lock $5, join that ETF's team, and win or lose with it. Creators earn **10% of their backers' winnings**.
- Peer-to-peer: the platform never puts money in.

## 2. Locked rules (from the idea file + prototype)
| Rule | Value |
|---|---|
| Stake | Fixed **$5 USDG** per entry, separate from the portfolio |
| Entry requirement | Hold and lock ≥ **$10** of the ETF's pool shares (BPT) for the round |
| Round | **Monday 13:30 UTC (US open) → next Monday 13:30 UTC** (daylight time; adjust after the DST change on 1 Nov) |
| Entries close | At round start |
| Score | % growth of the ETF's **stock tokens only**, using the pool's normalized weights renormalized over stocks. Chainlink prices, time-weighted over 30 min after each open |
| ETF eligibility | ≥ 3 stock tokens with a Chainlink feed; no stock > 50% of the stock part; pool TVL ≥ $100 |
| Teams | One ETF = one team. Captain = the pool creator if they enter, else the first entrant. Others are backers |
| Clone-merging | Pools with the same stock set and weights (rounded to 1%) are **one team**. Later pools join the first |
| Team cap | 20 backers per team |
| One team per wallet per round | Yes |
| Gate | Distance D = best return − return. `k = n//2 + 1`, `m` = k-th smallest D. Win if D < m. Best-coalition rule if ≥ half tie at the top |
| Accuracy | `a = (1 / (1 + D/m))^6` (Kickoff/Trepa) |
| Pot split | Winning teams by **team stake × a** (water-filled under a 100× gain cap). Inside a team: equal per $5, then the creator takes 10% of backers' gains |
| Unmatched | If all winners are capped, the rest is refunded to losers pro-rata |
| Take | 10% of transferred losing stakes: 5% platform, 5% season pot |
| Thin-pot top-up | If pot < 5% of winning stakes, the season pot tops up to that floor |
| Void + refund | < 4 ETFs, all returns equal, a stale or paused price feed for any scored token, or a Robinhood Chain sequencer outage at a snapshot |

## 3. Architecture
```
            ┌──────────────── Kickoff Next.js app (existing) ────────────────┐
 Players ──►│  /league pages · Privy wallet · viem · API routes · cron jobs   │
            └───────┬──────────────────────┬──────────────────────┬──────────┘
                    │                      │                      │
             Postgres (Drizzle)     LeagueEscrow.sol        Read-only chain reads
             rounds, etfs, entries, (Robinhood Chain)       ├─ EARN Balancer V3 Vault: pool tokens/weights
             snapshots, settlements  stakes + BPT locks     ├─ Chainlink AggregatorV3 per stock token
                                     settle + claim          └─ USDG, BPT balances
```
**Reused from Kickoff:**
- Privy auth, viem tx queue, Drizzle + Postgres, Vercel cron.
- `packages/engine` (fixed-point BigInt maths), the settlement-with-verify pattern.
- Leaderboard + PnL share cards, the Foundry project, the deploy scripts.

## 4. Smart contract: `LeagueEscrow.sol` (Foundry, Robinhood Chain)
**State**
- `Round { start, end, entryClose, status (Open/Locked/Settled/Void), stakeAmount=5e6, params }`
- `Entry { round, wallet, teamKey, pool, bptLocked, isCaptain, payout, claimed }`
- `teamKey` = keccak of the sorted (stock token, weight bucket) list, computed off-chain and checked on-chain from the vault's `getPoolTokenInfo` + the pool's `getNormalizedWeights`. Or simplified for the hackathon (see §9).

**Functions**
- `openRound(start, end, params)`: owner/keeper.
- `enter(roundId, pool, bptAmount)`:
  - pulls 5 USDG + `bptAmount` BPT;
  - checks BPT value ≥ $10 (via the keeper-posted price, or an oracle check in v2);
  - one entry per wallet per round;
  - team cap.
- `lockRound(roundId)` at start: no more entries.
- `submitSettlement(roundId, entries[], payouts[], platform, seasonIn, seasonOut)`. Keeper path, like Kickoff's fast path. The contract checks:
  - conservation (`Σpayouts + platform + seasonIn == Σstakes + seasonOut`);
  - each payout either 0, a refund ≤ stake, or ≥ stake for winners;
  - the season-pot balance.
  - Inputs (snapshot prices) are emitted as an event, so anyone can recompute with the open-source engine.
- `voidRound(roundId)`: everyone claims back their stake.
- `claim(roundId)`: returns the USDG payout + the locked BPT.
- `withdrawPlatform()`; season-pot accounting.

**Safety**
- Reentrancy guard; SafeERC20.
- Pausable; no upgradeability for the hackathon.
- BPT is only held and returned, never moved into pools.

## 5. Off-chain services (inside Kickoff)
| Job | When | Does |
|---|---|---|
| `league-open` | Mon 13:25 UTC | Create the next round row + `openRound` |
| `league-discover` | Every 10 min | Read EARN pools (Leaders + launcher-created) from the vault; compute eligibility, stock weights, `teamKey`, TVL |
| `league-snapshot` | Every 5 min for 30 min after each open | Read Chainlink `latestRoundData` for each stock token. Reject stale feeds (`updatedAt` vs heartbeat), `oraclePaused()`, sequencer down. Store samples |
| `league-lock` | Mon 13:30 UTC | `lockRound` |
| `league-settle` | Mon 14:05 UTC (after the end snapshots) | Compute TWAP start/end prices → ETF returns → engine → `submitSettlement`. Publish the input JSON |
| `league-odds` | Every 5 min while open | Estimated payout per $5 per team ("if this wins") for the UI |

**Engine:** port `league.py` to TypeScript BigInt in `packages/engine/src/league.ts`, next to Kickoff's engine. Generate golden test vectors from the Python prototype (`stress.py` scenarios → JSON) and assert identical outputs in Vitest.

**API routes:**
- `GET /api/league/round/current`
- `GET /api/league/etfs?round=`
- `GET /api/league/etf/:pool`
- `GET /api/league/odds?round=`
- `GET /api/league/leaderboard?type=creators|scouts&season=`
- `GET /api/league/me`
- `POST /api/league/prepare-enter` (returns the tx batch: approve USDG, approve BPT, enter)

**DB (Drizzle):**
- `league_rounds`, `league_etfs` (pool, teamKey, weights, eligible, tvl), `league_entries`
- `league_price_samples`, `league_results`
- `league_seasons`, `league_leaderboard`

## 6. Frontend (Kickoff design system)
1. **League home:** countdown to lock / settle; live table of ETFs (return so far, team size, odds per $5); "Enter" CTA.
2. **ETF page:** composition (stocks + weights), live return, team (captain + backers), odds, a link to buy shares on EARN, and "Back this ETF".
3. **Enter / Back flow:**
   - pick an ETF you hold (or buy on EARN first);
   - amount of shares to lock (≥ $10);
   - the $5 stake;
   - one Privy batch: approve + enter.
   Clear copy that the shares come back after the round.
4. **My league:** current entries, locked shares, past results, claim button.
5. **Results:** final ranking, winners, payout per $5, the "verify this settlement" link (input JSON + recompute instructions).
6. **Leaderboards:** creators (wins, streaks, backing attracted) and scouts (backer win rate / ROI). PnL share cards (reuse Kickoff's).
7. **Rules page:** plain-English rules; "'ETF' means an EARN liquidity pool, not a regulated fund"; capital-at-risk notice.

## 7. Demo plan (Colosseum)
- Chainlink stock feeds update **24/5**, so live demo rounds must run during market hours.
- **Demo mode:** the same contracts with 1-hour rounds and 5-minute snapshot windows. Run several real mini-rounds **Wed–Fri** on mainnet with small stakes and test wallets. Record the video by **Fri 9 Oct** (US market closed Sat/Sun, so a weekend recording can't show a live round).
- Show the before/after, the verify link, and a backer winning with a creator.

## 8. Day-by-day (Mon 5 → Mon 12 Oct)
| Day | Work |
|---|---|
| Mon 5 | ✅ Prototype + tests. This spec. Register on Colosseum. Confirm Chainlink feed addresses for Robinhood stock tokens. Ping EARN's team |
| Tue 6 | TS engine port + golden vectors from Python; `LeagueEscrow.sol` + Foundry tests (conservation, claims, void, caps) |
| Wed 7 | Deploy to Robinhood mainnet (small limits); discover/snapshot jobs; DB schema |
| Thu 8 | Settle job end-to-end; API routes; first demo-mode round live |
| Fri 9 | Frontend pages (home, ETF, enter/back, my league, results); record demo rounds during market hours |
| Sat 10 | Leaderboards, share cards, rules page, README; video edit (motion-design skill) |
| Sun 11 | Bug bash, docs, "built during World's Fair" changelog, open-source the repo |
| Mon 12 | Submit (before 11:59pm PT) |

## 9. Hackathon simplifications (say so in the README)
- **Keeper-submitted settlement with on-chain conservation checks,** not full on-chain computation. Anyone can recompute from the published inputs.
- `teamKey` and the $10 BPT minimum are checked off-chain by the keeper at lock time. Invalid entries are refunded.
- Season prizes are not paid out yet (pot accrues; payout rules TBD).
- Stake in USDG. An EARN-token or our-token stake comes later.

## 10. Acceptance criteria (must pass before submitting)
- The TS engine matches every Python golden vector exactly.
- Foundry tests:
  - conservation;
  - no winner gets back less than stake;
  - losers lose at most their stake;
  - void refunds everyone;
  - BPT always returned;
  - claims can't happen twice.
- Settlement voids correctly on a stale or paused feed.
- One live demo round completes on mainnet: enter → lock → settle → claim, with at least 4 ETFs and at least 1 backer team.

## 11. Open questions / risks
- **Chainlink feed addresses** for each Robinhood stock token: take from Chainlink's Robinhood feeds page (don't hardcode from memory). Do all EARN stock tokens have feeds?
- **Stock token eligibility:** Robinhood stock tokens may be restricted for some users (e.g. US persons). Check before inviting testers.
- **EARN dependency:** unknown audit status; small pools. Get EARN's OK and ideally co-marketing.
- **Regulation:** a house take on a prize pot is gambling-like. Present it as a skill contest; take legal advice before any real launch.
- **Season pot:** decide payouts (top creators / scouts per season) so the 5% returns to players.
- **Colosseum slot:** confirm that Kickoff is the submission and the league is its new in-window feature.
