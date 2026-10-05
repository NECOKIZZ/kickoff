# ETF League on BSC: build spec

**Target:** BNB Hack: Tokenized Stocks Edition. Submissions lock **Sun 11 Oct 2026, 12:00 UTC**.
**Status (Mon 5 Oct):** the engine, escrow and Binance API client are built and tested. The keeper jobs, database, UI and mainnet deploy are next.
**Earlier work:** `prototype-results.md` (Python stress tests) and `robinhood-colosseum-spec.md` (the Robinhood/EARN version, parked for now).

## 1. The product
On-chain stock ETFs on BSC, built from **bStocks / Ondo / xStocks** tokens, play a weekly league:
- A **creator** builds an ETF by locking a basket of stock tokens (at least 3 tokens, at least $10) and pays one **$5 ticket**. The locked basket *is* the ETF. Its score is the buy-and-hold return of exactly what was locked, so creators have real money in the game.
- **Backers** have two options and can use either or both:
  1. **Buy the ETF.** One tap buys the same tokens in the creator's weights through the Binance Web3 Wallet trading API. The creator earns a **buy fee** (default 1%, at most 2%), paid by Binance's router through the API's `feePercent` + `fromTokenReferrerWalletAddress`. The backer owns the tokens outright in their own wallet.
  2. **Back the team.** Pay a $5 ticket on the creator's team and win or lose with it. The creator takes 10% of a ticket-backer's winnings.
- The **top half of ETFs win the bottom half's tickets.** The pot is split by team stake × accuracy. Peer to peer: the platform never puts money in.

## 2. Locked rules
| Rule | Value |
|---|---|
| Ticket | Fixed **$5 BSC USDT** (18 decimals) per entry |
| Creator basket | ≥ 3 allowlisted stock tokens, ≥ **$10** total, no token above 50%, ≤ 10 tokens. Locked in escrow for the round, then returned whatever the result |
| Score | Buy-and-hold % return of the locked quantities, priced by the Binance RWA price API (reference price by default; on-chain price in demo mode, since bStocks trade 24/7) |
| Teams | One ETF = one team. Captain = its creator. Ticket backers join with $5 only |
| Clone-merging | Same stocks + same weights (to 1%) = one team (`teamKeyOf`). A later clone joins the first team as a member |
| Team cap | 20 members per team (captain excluded) |
| One entry per wallet per round | Yes |
| Gate | D = best return − return. `k = n//2 + 1`, `m` = k-th smallest D. Win if D < m. If ≥ half tie at the top, they all win |
| Accuracy | `a = (1 / (1 + D/m))^6` |
| Pot split | By team stake × a, water-filled under a 100× gain cap. Inside a team: by stake, then the captain takes 10% of backers' gains |
| Take | 10% of losing stakes: 5% platform, 5% season pot |
| Thin-pot top-up | Pot < 5% of winning stakes → season pot tops up to that floor |
| Unmatched pot | If every winner is capped: return the top-up first, then refund losers pro-rata |
| Void + refund | < 4 ETFs, all returns equal, a token paused or with a stale price at a snapshot, or the keeper misses settlement for 3 days (anyone can void) |
| Buy fee | 0–2% of the backer's buy, to the creator, through the Binance API referral fee |

## 3. What's built
| Piece | File | Tests |
|---|---|---|
| Settlement engine (BigInt) | `packages/engine/src/league.ts` | `test/league.test.ts`: voids, gate, ties, coalition, take, equal % return across team sizes, creator fee, thin pot, cap + refunds, 2,000-round Monte Carlo (conservation and payout bounds every round) |
| Escrow (BSC) | `contracts/src/LeagueEscrow.sol` | `contracts/test/LeagueEscrow.t.sol`: basket lock/return, allowlist, clones, team cap, one entry, entry close, conservation, season overdraw, payout cap, keeper-only, void and refunds, permissionless void after 3 days, paused stock token can't block payout, solvency fuzz |
| Binance Web3 API client | `src/lib/league/binanceWeb3.ts` | `test/leagueBsc.test.ts`: signing, headers, error envelope |
| Team keys + buy split | `src/lib/league/basket.ts` | Same file: clone-merging, order and case, buy split, fee clamp |
| BSC deploy | `contracts/script/DeployLeague.s.sol` | — |

**Trust model (say so in the README):** the keeper computes settlement off-chain with the open-source engine and submits it. On-chain, the contract enforces conservation, season-pot solvency, the payout cap, and that baskets always go back to their owners. Inputs are committed by hash, so anyone can recompute the payouts. Team keys and the $10 minimum are checked by the keeper; an invalid entry is refunded.

## 4. Remaining work
| Day | Work |
|---|---|
| Mon 5 | ✅ Engine, escrow, API client, tests. **You:** register for the hackathon, create a Web3 API key, fund a BSC deployer wallet (BNB for gas + some USDT), and start the DX report notes |
| Tue 6 | First live API calls: RWA token list → token allowlist; prices; quote with a referral fee on a bStock (does `feePercent` work on RFQ routes? If not, fall back to a USDT `transfer` to the creator in the same batch). Deploy the escrow to BSC mainnet. DB tables + keeper jobs (open, snapshot, settle) |
| Wed 7 | API routes (round, ETFs, odds, prepare-enter, prepare-buy); league UI: home table, ETF page, create, back and buy flows. First demo round (1 hour, during US market hours) |
| Thu 8 | My league, results with the "verify" link, leaderboard. Demo rounds with 4+ ETFs and backers |
| Fri 9 | Polish, README, record the demo video (≤ 4 min) during market hours |
| Sat 10 | DX report (written by you, from your notes), final checks |
| Sun 11 | Submit before **12:00 UTC** |

## 5. Open questions
- **Eligibility:** the hackathon is closed to residents of the US, Canada, the Netherlands, the UK and Japan. Confirm every team member is outside these.
- **Referral fee on stock tokens:** stock routes are RFQ. Check that the fee parameters are accepted there.
- **bStocks transfer rules:** confirm bStocks can move into a contract (the escrow). If not, creators of bStock ETFs use a balance check instead of a lock.
- **Stake token:** BSC USDT `0x55d398326f99059fF775485246999027B3197955`. Check it on BscScan before deploying.
- **Season pot payout:** still to decide (top creators / backers per season).
