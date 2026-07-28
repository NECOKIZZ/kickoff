# Kickoff.cash — Future Features: P2P Marketplace, X-Native Staking, Growth Loop & Agentic Infrastructure

**Status:** Roadmap / post-hackathon
**Last updated:** July 23, 2026
**Depends on:** Production Trepa live-valuation formula (γ=6, accuracy weights, water-filling); §1's shared `V_i(t)` valuation function and atomic buy/sell contract are load-bearing dependencies for §4 (agents reuse the same pricing and settlement paths as human traders)

---

## 0. Plain-English Summary

**P2P Ticket Marketplace:** Right now, once you stake a scoreline prediction on Kickoff, you're locked in until the final whistle. This feature lets you sell your position mid-match to someone else — either to lock in a profit, cut a loss, or let a late buyer take a shot on an upset. The pot itself never changes size; only *who owns which ticket* changes. Instead of quoting a single "current worth," the platform shows a *range* — wider early in the match (more time left for things to swing), narrower late (little time left to change). A seller can take a guaranteed instant sale at the low end, or list higher within the range and wait for a buyer. Pricing is also nudged so that betting on the "obvious" side late costs more, and buying into the underdog side costs less — rewarding people who take on real risk instead of people trying to snipe a sure thing.

**X-Native Staking:** Post a market as a tweet, let people reply with their predicted scoreline, and have that reply turn into a real stake on Kickoff — without them leaving X. Works fully "automatically" only for users who've already linked their X account to a funded wallet; first-time repliers get routed into a signup flow instead, which becomes a growth/acquisition channel rather than a limitation.

**Waitlist & Referral:** A pre-launch scoring system (Kickoff's version of Melee's "Melee Score") that gives people a reason to engage before there's a live product to stake on, plus a two-sided referral program — both the referrer and the person they invite get rewarded, but only once the invited person actually stakes real money, not just for signing up.

**Agentic Prediction Infrastructure:** Let users configure automated "prediction agents" — strategies that compute a scoreline prediction from defined data signals, stake on Kickoff, and can monitor + exit a position mid-match through the P2P marketplace based on rules the user sets. Reuses infrastructure already built for Oracle, Pythia, Delphi, and Synesis rather than starting from scratch.

All four are being logged as roadmap items, not hackathon scope.

---

## 1. P2P Ticket Marketplace (Early Exit / Late Entry)

### 1.1 Core Philosophy

- The escrow pot is fixed at kickoff. It never grows or shrinks from P2P trading — trades only reassign **ownership of an existing ticket**, wallet to wallet.
- This sidesteps the "late money dilutes early risk-takers" problem that plain parimutuel markets (and even Melee's PMM) have to solve with extra machinery — here it's solved structurally, for free, because no new capital enters the pool after kickoff.
- The protocol takes **zero directional risk** — it never buys, sells, or holds inventory. It only facilitates matching and (new, vs. the original draft) collects a small fee/rebate spread on fills.

### 1.2 Architecture

- **Ticket = ownership pointer.** Each stake is represented as a ticket ID mapped to an owner address, plus its original prediction and stake amount. The escrow pot itself never moves during a P2P trade.
- **Atomic settlement required.** The original draft had buyer-pays-seller as a separate step from the ownership-pointer update — that's a trust gap (seller could take payment and never transfer, or vice versa). Production version needs a single atomic contract call: `buyTicket(ticketId)` that transfers payment and reassigns ownership in the same transaction, same pattern as an NFT marketplace `buy()` function.
- **Live score feed** drives the leaderboard/valuation recompute (same feed already used for the live chart poll-to-push pattern).

### 1.3 Live Valuation — Intrinsic Value vs. Time Value Band

**Critical constraint (unchanged):** whatever formula prices a ticket mid-match must be the *exact same function* used at final settlement (Trepa: γ=6, accuracy weights, water-filling), just evaluated against the live score instead of the final score. If the P2P quote uses a simplified stand-in formula while final payout uses the real Trepa curve, buyers and sellers are trading on a number that doesn't match what they'll actually be paid.

**Why a single "fair value" number isn't enough:** a raw live valuation only answers "what is this worth if the match ended right now." Early in a match, that's misleading — a ticket that looks dead in minute 20 can still be revived by 70 minutes of play still ahead of it. Pricing purely off the instantaneous snapshot systematically underprices tickets with a lot of match time remaining, which is exactly the gap a fast-moving buyer can exploit against a seller who only sees the spot number.

**Fix: split the quote into two components, same logic as an option's price.**

- **Intrinsic Value** — the raw Trepa live valuation, `V_i(t)`, exactly as before (§1.3 original). "What this ticket is worth if the match ended this second."
- **Time Value Band** — an added-and-subtracted range around `V_i(t)` that represents the swing still possible given the minutes left on the clock. Wide early in the match, shrinking toward zero as full time approaches.

**Displayed quote becomes a range, not a point:**

```
Sell range = [ V_i(t) − TimeValue(t) ,  V_i(t) + TimeValue(t) ]
```

- **v1 (shippable now) — heuristic band width.** Scale the band with time remaining using the same decay shape already used for the guardrail cap: `TimeValue(t) = V_i(t) × 0.5 × (minutes_remaining / 90)`. Not statistically rigorous, but directionally correct and cheap to ship — wide band early, razor-thin band late.
- **v2 (later upgrade) — modeled band width.** Derive the band from an actual forward-looking model: simulate likely remaining scoring events using historical goal-rate-by-minute data to get a real probability distribution of where the ticket could land, then take the band from that distribution's spread rather than a shape-matching formula. This is the same "signal → probability" skill already built for Oracle/Pythia, applied to in-match football variance instead of news-to-probability.

**Action item:** expose the production Trepa valuation function as a pure, callable "what would this ticket be worth if the match ended right now" function (`V_i(t)`), so the live UI, the band calculation, and final settlement all call the same code path. The band wraps around this single source of truth — it never replaces it.

### 1.4 Pricing Guardrails (Layered)

Single caps (e.g. "ask ≤ max possible payout") aren't tight enough alone — they block outright scams but still allow absurd markups. Recommend layering:

| Layer | Rule | Purpose |
|---|---|---|
| Hard ceiling | `A_max = P_total` | Backstop against fat-finger / scam listings |
| Dynamic value-multiple ceiling | `A_max = V_i × k(t)`, where `k(t) = 1 + 4 × (minutes_remaining / 90)` | Allows wider premiums early (more uncertainty to price in), tightens as the clock runs down |
| Floored-out ticket basis | For tickets with `V_i ≈ $0` (deep in cutoff/low-probability zone): cap ask off **original stake**, not live value, e.g. `A_max_cutoff = stake × k(t) × proximity_factor` | A near-dead ticket still has real lottery value; capping off $0 live value would block listing it at all |
| Anti-wash floor | `A_min = max($0.01, 5% × stake)` + rate-limit re-listing the same ticket within a short window | Prevents colluding wallets faking volume by flipping a ticket at near-zero price |
| Freeze window | Pause new fills ~15–30s after a detected score change | Live feed polls every 10–15s; without a freeze, someone can snipe a ticket a moment before the leaderboard updates to reflect a goal |

`k(t)` above binds differently depending on the ticket: for a leading/favorite ticket the dynamic cap can exceed the hard pot cap late in uncertainty-heavy periods (hard cap binds); for a longshot ticket the dynamic cap is much tighter and does the actual work of constraining the price (see worked example, §1.6).

**Interaction with the Time Value Band (§1.3):** these caps apply to the *top* of the sell range (`V_i(t) + TimeValue(t)`), not to `V_i(t)` alone — a wide early-match band pushing against the guardrail ceiling is expected behavior, not a bug.

**Guaranteed instant-sell option:** offer the *bottom* of the band (`V_i(t) − TimeValue(t)`) as an always-available, one-click guaranteed sale price — for a seller who wants certainty over holding out for a better fill. This is Kickoff's P2P-funded answer to Melee's cashout LP vault, without needing a separate liquidity pool: the platform (or a matched buyer) takes the position at the conservative end of the range, and the seller gets instant, guaranteed liquidity. List-and-wait at a higher price within the band stays available for anyone willing to hold out.

### 1.5 Disadvantaged-Side Pricing Skew

This is the mechanic that makes the marketplace more than a plain order book (a plain order book is just a thinner Polymarket clone).

- Classify each ticket's **side** (not the trader's role) as *favorite* or *underdog*, based on current pool composition / leaderboard position — not who's buying or selling it.
- **Favorite-side tickets** trade at a premium over fair value: `ask ≈ V_i × (1 + s)`. This is the "easy money" side — buying in late on a near-certain outcome should cost more.
- **Underdog-side tickets** trade at a discount for the buyer: `buyer_price ≈ V_i × (1 − s)`, while the **seller still receives full fair value `V_i`** — the discount is not taken out of the seller's pocket.
- The gap between what the underdog buyer pays and what the underdog seller receives (`V_i × s`) is funded from a small **rebate pool**, seeded by the premium collected on favorite-side trades. This keeps the escrow pot itself untouched — the cross-subsidy lives entirely in a separate fee/rebate ledger, not in trader capital.
- `s` (skew rate) should scale with how lopsided the current pool is — wider skew when the favorite/underdog gap is extreme, narrower when the market is close.

**Open risk (flag honestly):** premiums collected vs. rebates owed won't necessarily balance within a single match — if very few favorite-side trades happen but many underdog trades do, the rebate pool could run short. Needs either a cap on total rebate payout per match, a dynamically shrinking `s` as the pool depletes, or a small top-up from the platform's existing 5% reserve take.

### 1.6 Worked Example (illustrative only — placeholder formula)

⚠️ **This uses a simplified stand-in weighting (`weight_i = 1 / (1 + Error_i)`), not the real production Trepa formula.** Numbers below are for illustrating how the guardrail layers interact, not a claim about actual Trepa output. Swap in the real γ=6/water-filling function before this ships.

Pool: $1,000 total across 4 tickets.

| Ticket | Stake | Error | Weight | Weighted Stake | Fair Value `V_i` |
|---|---|---|---|---|---|
| A | $300 | 0 | 1.000 | 300 | $555.56 |
| B | $200 | 1 | 0.500 | 100 | $185.19 |
| C | $300 | 2 | 0.333 | 100 | $185.19 |
| D | $200 | 4 | 0.200 | 40 | $74.07 |

At minute 60 (30 min remaining), `k(t) = 1 + 4×(30/90) = 2.333`.

- **Ticket A (favorite):** dynamic cap = $555.56 × 2.333 ≈ $1,296 → hard pot cap ($1,000) binds instead. Effective max ask: **$1,000**.
- **Ticket D (underdog):** dynamic cap = $74.07 × 2.333 ≈ **$172.80** → this is well under the pot cap, so the dynamic layer does the actual constraining. Effective max ask: **$172.80**.

With skew rate `s = 10%`:
- Ticket A lists as favorite-side: suggested ask ≈ $555.56 × 1.10 = **$611.12**.
- Ticket D lists as underdog-side: seller quoted **$74.07** (full fair value), buyer pays **$66.66** (10% discount), rebate pool covers the **$7.41** gap.

**Adding the Time Value Band (v1 heuristic) on top:** at minute 60, `minutes_remaining = 30`, so `TimeValue(t) = V_i(t) × 0.5 × (30/90) = V_i(t) × 0.1667`.

- **Ticket D:** `TimeValue = $74.07 × 0.1667 ≈ $12.35`. Sell range = **$61.72 – $86.42**, instead of a flat $74.07. Guaranteed instant-sell (bottom of band): **$61.72**. This is narrower than the earlier "underpriced at minute 20" example specifically because there's less match time left at minute 60 — the band does the same job the guardrail `k(t)` decay does, just applied to the seller-facing range instead of the buyer-facing cap.
- Compare to minute 20 (`minutes_remaining = 70`): `TimeValue = V_i(t) × 0.5 × (70/90) ≈ V_i(t) × 0.389` — a much wider band, correctly reflecting that far more can still happen.

### 1.7 Open Technical Requirements

- Define tiebreak rules precisely (still unresolved from earlier draft — e.g., how a draw prediction is classified as favorite/underdog/wrong-side).
- Atomic buy-and-transfer contract function.
- Live valuation function shared between UI display, P2P pricing, and final settlement.
- Time Value Band: ship v1 heuristic first; scope v2 modeled-distribution version (historical goal-rate-by-minute data source needed).
- Rebate pool accounting + cap/backstop logic.
- Score-feed-triggered freeze window implementation.
- Counterparty for guaranteed instant-sell: platform-absorbed, or routed to a matched buyer willing to take bottom-of-band price? Needs a decision before this can be "always available."

### 1.8 Risks

- Thin liquidity at low user counts — degrades gracefully (unfilled listing) rather than "dead on arrival," but still a real early-stage limitation.
- Rebate pool imbalance (see §1.5).
- Added complexity: this is a genuinely new subsystem, not a UI tweak — sequence after core staking volume is proven.

---

## 2. X-Native Reply-to-Stake

### 2.1 Concept

Post a market as a tweet. Users reply with a predicted scoreline. The reply becomes a real stake on Kickoff, tied to their account, without leaving X.

### 2.2 Feasibility / Cost Reality (checked July 2026)

- Real-time streaming access (filtered stream) is effectively closed to new X developers — the tier that included it is no longer open for signup, and Enterprise-level streaming access runs roughly $42,000/month. **Do not architect around streaming.**
- X has moved to pay-per-use pricing: roughly $0.005 per post read, $0.010 per user read, $0.015 per post created.
- Because this only requires monitoring replies on **one specific market tweet's conversation thread**, polling via the recent-search endpoint (not the firehose) is the right approach — reuses the same poll-to-push pattern already built for Kickoff's live charts. A market with a few hundred replies costs low tens of dollars in API usage, not the "$5k/month" figure often quoted for full-platform monitoring.

### 2.3 Architecture

1. **Link (one-time onboarding):** "Sign in with X" OAuth → map `x_user_id` to the user's Privy embedded wallet. User opts into an auto-stake policy (max $ per prediction, daily cap) — reuses the HMAC-signed policy pattern already built for Synesis's money-moving steps.
2. **Post market:** Bot posts the market tweet with an explicit reply format ("Reply with the scoreline, e.g. 2-1, to stake $X"). Store `tweet_id` alongside the market record from the AI listing agent.
3. **Ingest replies:** Poll `GET /2/tweets/search/recent?query=conversation_id:{id}` every 10–30s until market lock. Parse predictions — regex first, LLM fallback for malformed text, reject/ask-to-reformat anything ambiguous.
4. **Route by identity:**
   - Linked + within policy limits → execute stake via the existing Tasks+Steps engine, no extra signature required.
   - Not linked → bot replies with a claim link (connect + fund + confirm). This is the acquisition funnel, not dead weight.
5. **Confirm publicly:** Bot replies "Locked: 2-1, $5 staked ✅" under the user's comment — visible receipts double as marketing.
6. **Settle:** No changes — same Trepa payout pipeline, same take rate.

### 2.4 Open Requirements

- OAuth link flow + storage of `x_user_id ↔ wallet` mapping.
- Reply parser (regex + LLM fallback) with a defined rejection/reformat UX.
- Claim-funnel flow for unlinked repliers (signup + fund + confirm).
- Duplicate/edited-reply handling (first valid reply counts, or last-before-lock — needs a decision).

### 2.5 Risks / Compliance Note

- Auto-staking real money off a public social reply is a step further into "this looks like a betting product" territory than the current wallet-initiated flow — worth a jurisdiction gut-check before wide rollout, not a hackathon blocker.
- Dependency on X API pricing/access tiers, which have changed multiple times in the past year — re-verify before committing build time.

---

## 3. Growth Loop: Waitlist & Referral

### 3.1 Concept

Adapted from Melee's pre-launch "Melee Score" mechanic (§0 of the earlier competitive review), but grounded in real rewards Kickoff already has, rather than an undefined future payout. Two components: a waitlist/points system, and a two-sided referral program.

### 3.2 Waitlist / Kickoff Score

- Pre-launch (or ongoing) task list: connect wallet, follow @0xnecokizz / Kickoff on X, join Discord/Telegram, share a referral link, place a first real stake, correctly call a scoreline.
- Live position counter / leaderboard for social proof — same device Melee uses ("0 predictors in line").
- Unlike Melee's vague "confers advantages later," Kickoff Score should map to mechanisms already speced elsewhere in this doc:
  - Early-bird bonus weighting on newly listed markets (previously flagged idea, not yet formalized — now has a concrete funding source: Kickoff Score tier).
  - Priority access to gated/limited-seat markets.
  - Bonus entries into the Season Accumulator Pool.
  - Small fee-rate discount at higher score tiers.

### 3.3 Referral Program

- Unique referral code/link per user, generated at signup.
- **Two-sided reward, gated on real activity, not signup:** both referrer and referee get a bonus, but only once the referee places a **funded stake above a minimum threshold** — not merely for connecting a wallet or joining the waitlist. This is the key anti-abuse guardrail; reward-on-signup is what gets farmed.
- Suggested structure: referrer earns bonus Kickoff Score (or a small fee rebate on their next stake); referee gets a one-time fee discount or Kickoff Score bonus on their first real market entry.

### 3.4 Anti-Abuse Guardrails

- Reward trigger requires a minimum real stake, not just signup or wallet connection.
- Cap total referral rewards per wallet per day/week.
- Basic self-referral detection (same device fingerprint or wallet cluster heuristics — lightweight checks are enough at this stage, not a full Sybil-resistance system).
- Referral code expiry/reuse limits to prevent link-spamming across unrelated communities.

### 3.5 Architecture Notes

- Waitlist signups stored alongside existing user records (Supabase); can pre-provision a Privy embedded wallet at signup so the user is one step closer to a funded first stake when they convert.
- Referral tracking table: `referral_code → referrer_wallet`, `referee_wallet → referral_code_used`, `status (pending / activated)`, `activated_at`.
- No smart contract changes needed — this is entirely an off-chain rewards/points layer sitting on top of the existing stake flow.

### 3.6 Open Questions

- Exact Kickoff Score point values per task, and the minimum stake threshold that activates a referral reward.
- Whether Kickoff Score converts 1:1 into fee discounts/weighting, or uses tiers (bronze/silver/gold-style thresholds).

---

## 4. Agentic Prediction Infrastructure

### 4.1 Concept

Let users configure automated **prediction agents**: strategies that ingest defined data signals, compute a scoreline prediction (or a probability distribution over scorelines), stake on Kickoff, and can monitor + exit a position mid-match through the P2P marketplace — all according to rules the user sets up front, without manual intervention during the match.

This is not a from-scratch build. It's a recombination of infrastructure already proven elsewhere:

- **Oracle / Pythia** already do the "signal → probability" pipeline (news-to-probability extraction feeding Kelly Criterion sizing) — the same pattern applies here, just fed football-specific signals instead of news sentiment.
- **Delphi's "Scratch Score"** concept (scoring a signal source's track record) maps directly onto scoring a *strategy's* track record.
- **Synesis's Tasks+Steps engine + HMAC-signed spend policies** already solve "let an agent move money within a pre-authorized limit, without a fresh signature per action" — exactly what's needed here.
- **§1's shared `V_i(t)` valuation function and atomic buy/sell contract** (P2P marketplace, above) are the exact same primitives an agent needs to price and exit a position — no separate code path required.

### 4.2 Architecture

1. **Strategy definition (config, not arbitrary code):** a weighted set of approved signals — recent form, head-to-head history, injury/news feed (Pythia-style), live match stats (BALLDONTLIE) — that outputs a probability distribution over scorelines, plus an exit rule (e.g., "sell at the guaranteed instant-sell price if losing after minute 70," or "exit if live valuation drops more than X% below entry").
2. **Execution loop:** reuses the Tasks+Steps model — a Task ("evaluate Market X") runs Steps (pull signals → compute distribution → propose stake), gated behind the same pre-authorized, policy-signed spend limit already built for Synesis. The agent never needs a fresh signature per action, only the standing policy.
3. **Live re-evaluation & auto-exit:** the agent subscribes to the same shared valuation feed as human users (§1.3's `V_i(t)` and Time Value Band). If a position breaches the user's configured exit threshold, the agent lists/sells through the identical atomic buy/sell function real users use.
4. **Strategy marketplace / leaderboard:** track realized performance per strategy the way Delphi tracks Scratch Score. Strategy authors can publish a strategy; other users can subscribe/auto-follow it; the author earns a cut of subscriber activity — Melee's creator-fee-share idea, applied to strategies instead of markets.

### 4.3 Guardrails (agent-specific risks, distinct from human P2P risks)

- **Tag agent-originated stakes/trades visibly** in the UI, so users can tell an agent position from a human one.
- **No privileged data path.** Agents must see the live score/valuation feed on the same cadence as humans — if an agent gets faster or fresher data than the UI shows human traders, it can systematically pick off human sellers before they can react. This makes the freeze window guardrail (§1.4) load-bearing in a way it isn't for pure human-vs-human trading.
- **Sandboxed signal set.** Strategies select from a fixed list of approved data connectors (BALLDONTLIE, a defined news/injury feed) — no arbitrary code execution or unrestricted external API calls. This keeps a user-authored "strategy" from becoming a security or abuse surface.
- **Hard per-agent spend caps**, enforced through the existing policy-signing pattern, so a broken or adversarial strategy can't drain a wallet beyond its configured limit.

### 4.4 Risks / Compliance Note

- Autonomous agents placing real-money predictions is a step further into "automated trading" territory than even the X-native staking feature (§2.5) — the same jurisdiction gut-check applies, with more weight given the lack of a human in the loop per trade.
- **Bot-vs-human fairness in the P2P marketplace is the single biggest open risk of this feature** and needs real adversarial testing before shipping — a fast, well-tuned agent trading against slower human sellers in the same pool is a legitimate fairness problem, not just a technical one.

### 4.5 Open Questions

- Does strategy performance tracking (Scratch Score-style) launch alongside agent trading, or ship later once there's enough real strategy data to make a leaderboard meaningful?
- What's the creator fee-share percentage for a published strategy that others subscribe to?
- Should agents be rate-limited to the same reaction latency as humans (e.g., a mandatory minimum delay before an agent can act on a fresh score update), on top of the shared freeze window?

---

## 5. Sequencing

Updated priority order — waitlist/referral is now the cheapest, lowest-dependency item and can move earliest; agentic infrastructure is now explicitly the most complex, since it depends on the P2P marketplace's shared valuation and settlement paths being built first:

1. **Waitlist + referral** — no dependency on any other feature here, can run before or alongside the next public launch push.
2. Core Trepa staking/settlement flow — validate this first if not already stable.
3. **P2P marketplace** — bigger UX gap (no exit option today), doesn't depend on any external API. Also a hard prerequisite for #5.
4. **X-native staking** — distribution/growth play, depends on external API stability and onboarding volume to justify the integration cost.
5. **Agentic prediction infrastructure** — most complex, builds directly on #3's shared valuation function and atomic settlement path; sequence last.

---

## 6. Open Questions for Next Iteration

- What's the actual production Trepa live-valuation function signature? Needed to replace the placeholder weighting in §1.6.
- What's the right decay shape/coefficient for the v1 Time Value Band heuristic — is `0.5 × (minutes_remaining / 90)` reasonable, or does it need calibration against real match variance data?
- Does Kickoff have (or need to source) historical goal-rate-by-minute data for the v2 modeled band?
- How is "favorite vs. underdog side" formally defined for skew classification — current leaderboard rank? Distance from median? Something else?
- Tiebreak rule for draw predictions in the P2P side-classification logic.
- Rebate pool cap: fixed $ amount per match, % of pot, or dynamically shrinking skew rate?
- X reply dedup/edit policy: first reply wins, or last-before-lock?
- Kickoff Score point values and referral activation threshold (§3.6).
- Agent strategy fee-share rate and whether agent trades need a mandatory reaction-latency floor relative to humans (§4.5).
