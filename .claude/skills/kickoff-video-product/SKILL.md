---
name: kickoff-video-product
description: Kickoff.cash product facts and claim rules for videos — what Score Markets are, how closeness scoring and payouts work, the worked example, the Season Accumulator, and exactly what may and may not be claimed (testnet, no Player Perps). Use when writing any Kickoff video script, storyboard, on-screen text, or product UI mockup.
---

# Kickoff product facts for video

Every fact below comes from the repo (`src/ui/docs/DocsPage.tsx`, `packages/engine`, `src/lib/leaderboard.ts`, `contracts/`). Re-check against the code before publishing anything time-sensitive. The public docs page (`/docs`) is the canonical wording.

## Status — read first

- **Testnet, play money.** Kickoff runs on testnet with test USDC. Every video must make this clear (a persistent "Testnet · play money" tag or an end-card line). Never imply real winnings, real deposits, or a mainnet launch. Mainnet is "a config change, not a rebuild, and will be announced" — do not date it.
- **Score Markets only.** Player Perps (FPL-points markets) exist in the code and docs but are **not live**. Do not show, mention, or tease them: no player-points UI, no "Player Perps" text, no player-card carousel.
- Access is by **waitlist and invite code**, opening in waves. The CTA is the waitlist / "Enter the markets", not "sign up and deposit".
- Positioning: "The first proximity market on Robinhood Chain." Don't claim any Robinhood partnership or endorsement — only that it runs on the chain.

## The one-sentence idea

Kickoff is a prediction market for football where you're paid for **how close you land**, not just whether you were right. You predict the final score; the closer you are, the more you earn.

## How a Score Market works

1. **Pick a scoreline** (2-1, 0-0, anything) and stake USDC before kickoff. You can restake to change your pick any time before lock.
2. **Close still pays.** It isn't yes/no. Payouts scale with how close you land: 2-1 when it ends 2-0 still earns.
3. **Split the pool.** At full time the pool splits by stake × accuracy. Nail it exactly and you take the biggest share.

Market life: **Listed → Open → Locked (at kickoff) → Settled.** Rules are frozen when a market opens — what you see when you stake is what settles.

## Scoring: distance

Each position gets a distance D from the real result (0 = exact). Four football-shaped parts:

| Part | Weight |
|---|---|
| Wrong winner/draw | 4.0 penalty |
| Goal-difference gap (capped at 3) | 1.0 per goal |
| Total-goals gap (capped at 4) | 0.5 per goal |
| Clean-sheet miss | 0.25 per miss |

Winner call dominates by design. 2-1 and 1-0 are closer *as football results* than 2-1 and 0-1.

## Payout: three moves

1. **Median gate** — positions strictly closer than the median distance win; the rest lose. It counts traders, not dollars, so a whale can't move the median. Roughly the closer half of the field is paid.
2. **Best-coalition rule** — if the single closest distance is shared by at least half the field, only that group wins.
3. **The split** — losing stakes (minus fee) form the dividend pool; each winner's share ∝ stake × accuracy, where accuracy `a = (1/(1+r))³` and `r` is distance relative to the median. Exact = the maximum.

Winners always keep their full stake plus their share. A single win is capped at 100× stake.

You can be **wrong and still win** if the rest of the field was further off. Equal accuracy earns equal ROI whether you staked $2 or $200.

## Worked example (use this, don't invent numbers)

Five traders stake $10 each. Match ends **2-1**.

| Trader | Pick | Distance | Result |
|---|---|---|---|
| A | 2-1 | 0.00 | wins |
| B | 1-0 | 1.25 | wins |
| C | 3-1 | 1.50 | loses (sits on the median) |
| D | 1-1 | 5.50 | loses |
| E | 0-2 | 7.75 | loses |

Losing stakes $30, 10% fee $3, dividend pool $27. **A ≈ +$23.23 (+232%). B ≈ +$3.77 (+38%).** C, D, E lose their stake. Exact is worth about six times a merely-close win. Always label this "illustrative example" on screen.

## Fees and the Season Accumulator

- Fee is **10% of losing stakes only**. Winners' stakes are never touched; voided markets take nothing; no deposit, withdrawal, or per-trade fees.
- The take splits: **5% platform, 5% Season Accumulator.**
- The **Season Accumulator** is a season-long prize pool funded by every settled market, visible live on the leaderboard, paid at season end to the top of the season leaderboard (held in an on-chain vault; winners claim their own share).
- **Leaderboard** rewards sustained accuracy, not one lucky hit: geometric mean of per-market precision scores, times a log-dampened volume multiplier, with an eligibility gate.

## Fairness points (for a "why it's fair" cut, not the launch video)

No house on the other side — your counterparty is the pool. Void + full refund if fewer than two entries, all entries equally distant, or the fixture is abandoned. Results cross-checked across independent data sources with a finality delay; disputes hold the market instead of settling wrongly. Settlement is deterministic integer arithmetic, replayable from recorded positions.

## Product UI worth showing (Score Markets)

- **The 5×5 concentration grid** — where the pool's money sits across scorelines (4+ edge buckets), intensity by stake share, your pick outlined in green. The signature visual of the mechanic.
- **Live PnL chart** — your position if the match ended now, KO→FT, with dashed goal markers like "12' ARS", green line, dashed breakeven.
- **Gameweek rail** — chips per gameweek with state dots (live / open / finished), matches below.
- **Season board** — live accumulator pool on top, cumulative leaderboard below.
- **Sign-in** — email, Google, or wallet; email users get an embedded wallet automatically, no seed phrase. Stakes in USDC.

Build these as faithful HTML recreations in the brand styling; don't show fake numbers as if they were live data.

## Claims: allowed / forbidden

**Allowed:** "Closeness matters", "close still pays", "you can be wrong and still win", "no house on the other side", "fees only come out of losing stakes", "the full maths is public", "runs on Robinhood Chain (testnet)".

**Forbidden:** guaranteed or projected returns; "risk-free"; any payout figure presented as real; "earn", "profit", "get rich" framing; mainnet/real-money language; a launch date; Player Perps; a Robinhood partnership; jurisdiction or legality statements. The product deliberately shows no payout estimate before staking — don't fake one in a mockup.

## Launch video spine (draft — refine once reference videos are in)

Target 45–60s, landscape 16:9 with a 9:16 cut. Beats: (1) yes/no is a blunt tool → (2) "Closeness matters." → (3) the 5×5 grid, a pick lands → (4) worked example resolves: exact wins big, close still wins, wrong loses → (5) every market feeds the Season pot → (6) "Beat the pack, keep the stack." + waitlist + testnet tag. Keep one idea per beat and a single accent color.
