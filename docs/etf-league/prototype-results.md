# ETF League — settlement prototype

A Python model of the ETF League payout rules (`league.py`) and an extreme-condition and fairness test suite (`stress.py`). Run `python3 stress.py`; the full output is in `stress_output.txt`.

Money is integer micro-dollars. Every settlement asserts **conservation**: payouts + platform + season pot = stakes (+ any season top-up).

## What was tested
**Edge cases**
- Fewer than 4 ETFs; all returns equal; tied best group.
- Thin pots (crowded winners vs solo losers); season-pot top-up.
- Solo winner vs full losing teams; winnings caps and refunds.
- Four maxed teams (84 players); 200-ETF rounds.

**Exploits**
- Cloning an ETF instead of backing it.
- Junk ETFs to push the median.
- A creator backing their own ETF with fake wallets.

**Monte Carlo:** 20,000 random rounds (4–60 ETFs, 0–20 backers each, skill + luck returns, backers crowding toward skilled ETFs).

## Results (all checks pass)
| Finding | Effect on the design |
|---|---|
| **"One team, one share" pot split is exploitable:** 21 people copying an ETF won $27 vs $17.96 backing it; with the median held fixed, $87 vs $41 | **Changed:** split the pot by **stake × accuracy** (Kickoff's rule). Same skill = same % return, whatever the team size |
| Copies still beat backing a bit, because each copy is its own ETF in the median gate ($87 vs $77) | **Added: clone-merging.** An ETF with the same basket as an existing one joins that team. After merging: $77.26 = $77.26 |
| The Kickoff/Trepa gate `k = (n+1)/2` makes only 1 of 4 ETFs win | **Changed:** `k = n//2 + 1`, so exactly the top half wins (rounded down). Boundary ties lose |
| With $5 stakes and teams of ≤ 21, the 100× gain cap can't bind | Cap kept as a safety rail. If lowered (e.g. 10×), excess flows to other winners first, then is refunded to losers (tested: $98.89 refunded) |
| Junk-ETF median attack: net −$24 / −$49 / −$98 for 5 / 10 / 20 junk ETFs | Unprofitable. No extra rule needed |
| Creator self-backing with fake wallets: per-stake return falls (+$59 → +$11 → +$6) | Just more capital at the same odds. Not an exploit |
| Thin pot (2 full teams win, 2 solos lose): winners still +2–7%; season top-up adds the floor | Works. Show live odds so people spread out |
| **Monte Carlo per $5 staked:** all stakes −4.34% (= the take); creators +1.67%, backers −5.79% (7.5-point gap = 10% creator fee); skilled ETFs +42%, unskilled −68%; win rate ≈ 49% creators | Skill is rewarded strongly. The house take is the only systematic loss. Backers pay creators about 1.5 points over the house edge |
| Season pot grows by ~2% of stakes and is only drawn for top-ups | **To decide:** season prizes (top creators / scouts) so the pot is paid back to players |
