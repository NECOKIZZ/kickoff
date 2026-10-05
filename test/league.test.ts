import { describe, it, expect } from "vitest";
import {
  RET_SCALE,
  DEFAULT_LEAGUE_PARAMS,
  settleLeague,
  leagueConserves,
  basketReturn,
  basketWeightsBps,
  basketEligibility,
  type LeagueTeam,
  type LeagueResult,
} from "@kickoff/engine/league";

const USD = 10n ** 18n; // BSC USDT has 18 decimals
const STAKE = 5n * USD;
const pct = (x: number): bigint => BigInt(Math.round(x * 1e6)) * (RET_SCALE / 100_000_000n); // x in %

const team = (retPct: number, backers = 0, captain = true): LeagueTeam => ({
  ret: pct(retPct),
  entries: [
    ...(captain ? [{ stake: STAKE, isCaptain: true }] : []),
    ...Array.from({ length: backers }, () => ({ stake: STAKE, isCaptain: false })),
  ],
});

const payoutsOf = (r: LeagueResult, ti: number) => r.entries.filter((e) => e.team === ti).map((e) => e.payout);

const boundsHold = (r: LeagueResult): boolean =>
  r.entries.every((e) =>
    r.void ? e.payout === e.stake : r.teams[e.team].isWinner ? e.payout >= e.stake : e.payout <= e.stake,
  );

function checkInvariants(r: LeagueResult) {
  expect(leagueConserves(r)).toBe(true);
  expect(boundsHold(r)).toBe(true);
}

describe("settleLeague — voids", () => {
  it("voids with fewer than 4 teams", () => {
    const r = settleLeague([team(1), team(2), team(3)]);
    expect(r.void).toBe("TooFewTeams");
    checkInvariants(r);
  });
  it("voids when every return is equal", () => {
    const r = settleLeague([team(1), team(1), team(1), team(1)]);
    expect(r.void).toBe("AllReturnsEqual");
    checkInvariants(r);
  });
});

describe("settleLeague — gate", () => {
  it("top half wins with 4 teams", () => {
    const r = settleLeague([team(3), team(1), team(-1), team(2)]);
    expect(r.teams.map((t) => t.isWinner)).toEqual([true, false, false, true]);
    expect(r.k).toBe(3);
    checkInvariants(r);
  });
  it("top half rounded down with 5 teams; boundary ties lose", () => {
    const r = settleLeague([team(5), team(4), team(3), team(3), team(0)]);
    expect(r.teams.filter((t) => t.isWinner).length).toBe(2);
    const tie = settleLeague([team(5), team(4), team(4), team(1), team(0)]);
    // m = 3rd smallest D = D of the 4% teams, so both tied teams lose.
    expect(tie.teams.map((t) => t.isWinner)).toEqual([true, false, false, false, false]);
    checkInvariants(tie);
  });
  it("coalition: half or more tied at the top all win with a = 1", () => {
    const r = settleLeague([team(2), team(2), team(1), team(0)]);
    expect(r.coalitionMode).toBe(true);
    expect(r.teams.map((t) => t.isWinner)).toEqual([true, true, false, false]);
    expect(r.teams[0].a).toBe(r.teams[1].a);
    checkInvariants(r);
  });
  it("the closer winner gets the bigger share", () => {
    const r = settleLeague([team(4), team(3), team(0), team(-2)]);
    expect(r.teams[0].gain > r.teams[1].gain).toBe(true);
    checkInvariants(r);
  });
});

describe("settleLeague — pot", () => {
  it("takes 10% of losing stakes, half to the season pot", () => {
    const r = settleLeague([team(3), team(2), team(1), team(0)]);
    expect(r.losingStakes).toBe(10n * USD);
    expect(r.take).toBe(1n * USD);
    expect(r.seasonIn).toBe(USD / 2n);
    expect(r.pot).toBe(9n * USD);
    checkInvariants(r);
  });

  it("same skill = same % return, whatever the team size (no creator fee)", () => {
    const params = { ...DEFAULT_LEAGUE_PARAMS, creatorFeeBps: 0 };
    // Two teams tie at the best return: a 21-entry team and a solo.
    const r = settleLeague([team(3, 20), team(3), team(0, 5), team(-1, 10)], params);
    const big = payoutsOf(r, 0);
    const solo = payoutsOf(r, 1)[0];
    for (const p of big) expect(p).toBe(solo);
    checkInvariants(r);
  });

  it("creator takes 10% of each backer's gain", () => {
    const r = settleLeague([team(3, 4), team(1), team(0, 5), team(-1, 5)]);
    const members = r.entries.filter((e) => e.team === 0);
    const captain = members[0];
    const backers = members.slice(1);
    const fees = backers.reduce((s, e) => s + e.creatorFee, 0n);
    expect(fees > 0n).toBe(true);
    for (const b of backers) expect(b.creatorFee).toBe(((b.gain + b.creatorFee) * 1000n) / 10_000n);
    expect(captain.gain).toBe(backers[0].gain + backers[0].creatorFee + fees);
    checkInvariants(r);
  });

  it("thin pot: season pot tops the pot up to 5% of winning stakes", () => {
    // Two full teams (21 each) win, two solos lose: pot 9 vs floor 10.5.
    const r = settleLeague([team(3, 20), team(2, 20), team(0), team(-1)], DEFAULT_LEAGUE_PARAMS, 100n * USD);
    expect(r.winningStakes).toBe(210n * USD);
    expect(r.seasonOut).toBe((210n * USD * 500n) / 10_000n - 9n * USD);
    expect(r.pot).toBe((210n * USD * 500n) / 10_000n);
    checkInvariants(r);
  });

  it("thin pot top-up is limited by the season pot", () => {
    const r = settleLeague([team(3, 20), team(2, 20), team(0), team(-1)], DEFAULT_LEAGUE_PARAMS, 0n);
    expect(r.seasonOut).toBe(r.seasonIn); // only this round's share is available
    checkInvariants(r);
  });

  it("gain cap binds: excess returns the top-up, then refunds losers", () => {
    const params = { ...DEFAULT_LEAGUE_PARAMS, capMultiple: 1n };
    // Solo winners vs big losing teams: the pot far exceeds 1× the winners' stakes.
    const r = settleLeague([team(3), team(2), team(0, 20), team(-1, 20)], params);
    expect(r.teams[0].capped && r.teams[1].capped).toBe(true);
    expect(r.refundedToLosers > 0n).toBe(true);
    expect(payoutsOf(r, 0)[0]).toBe(2n * STAKE);
    checkInvariants(r);
  });
});

describe("settleLeague — Monte Carlo", () => {
  // Deterministic LCG so the test is reproducible.
  let seed = 42n;
  const rand = (): number => {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return Number(seed >> 11n) / 2 ** 53;
  };

  it("2 000 random rounds: conservation and payout bounds always hold", () => {
    let staked = 0n;
    let paid = 0n;
    let season = 0n;
    for (let i = 0; i < 2000; i++) {
      const n = 4 + Math.floor(rand() * 57);
      const teams: LeagueTeam[] = Array.from({ length: n }, () => {
        const ret = (rand() - 0.5) * 10; // −5%..+5%
        return team(Math.round(ret * 100) / 100, Math.floor(rand() * 21));
      });
      const r = settleLeague(teams, DEFAULT_LEAGUE_PARAMS, season);
      if (!leagueConserves(r) || !boundsHold(r)) throw new Error(`invariant broken in round ${i}`);
      season += r.seasonIn - r.seasonOut;
      if (season < 0n) throw new Error(`season pot negative in round ${i}`);
      staked += r.totalStakes;
      paid += r.entries.reduce((s, e) => s + e.payout, 0n);
    }
    // Players as a whole lose at most the 10% take on losing stakes (≈ 5% of all stakes).
    const loss = Number(((staked - paid) * 10_000n) / staked) / 100;
    expect(loss).toBeGreaterThan(0);
    expect(loss).toBeLessThan(6);
  });
});

describe("basket maths", () => {
  it("buy-and-hold return is value weighted", () => {
    // 1 token at 100 → 110 (+10%), 1 token at 300 → 300 (0%): +2.5% overall.
    expect(basketReturn([1n, 1n], [100n, 300n], [110n, 300n])).toBe(RET_SCALE / 40n);
    expect(basketReturn([0n], [1n], [2n])).toBe(0n);
  });
  it("weights sum to 10 000 bps", () => {
    const w = basketWeightsBps([1n, 1n, 1n]);
    expect(w.reduce((s, x) => s + x, 0)).toBe(10_000);
  });
  it("eligibility rules", () => {
    const rules = { minTokens: 3, maxWeightBps: 5000, minValue: 10n * USD };
    expect(basketEligibility(["a", "b", "c"], [4n * USD, 4n * USD, 4n * USD], rules)).toBeNull();
    expect(basketEligibility(["a", "b"], [6n * USD, 6n * USD], rules)).toBe("TooFewTokens");
    expect(basketEligibility(["a", "b", "c"], [2n * USD, 2n * USD, 2n * USD], rules)).toBe("TooSmall");
    expect(basketEligibility(["a", "b", "c"], [8n * USD, 2n * USD, 2n * USD], rules)).toBe("TooConcentrated");
    expect(basketEligibility(["a", "A", "c"], [4n * USD, 4n * USD, 4n * USD], rules)).toBe("DuplicateToken");
  });
});
