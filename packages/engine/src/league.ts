// ETF League settlement engine.
//
// Weekly (or demo-length) rounds where on-chain stock baskets ("ETFs") are
// ranked by the % growth of their stocks. The top half of teams win the bottom
// half's ticket stakes, split by team stake × accuracy. Rules: see
// docs/etf-league/BNB.md (locked rules table).
//
//   - One ETF = one team. Captain = the creator; others are backers.
//   - Distance D = best return − return. k = n//2 + 1, m = k-th smallest D.
//     Win if D < m (exactly the top half, rounded down; boundary ties lose).
//     If at least half the teams tie at the top, those teams win (coalition).
//   - Accuracy a = (1 / (1 + D/m))^gamma (gamma = 6).
//   - Take = 10% of losing stakes: half platform, half season pot.
//   - Thin pot: if the pot is below 5% of winning stakes, the season pot tops
//     it up to that floor (as far as the season pot allows).
//   - Pot split across winning teams by teamStake × a, water-filled under a
//     gain cap of capMultiple × teamStake. Anything left once every winner is
//     capped goes back to the season pot (top-up first), then to the losers
//     pro-rata.
//   - Inside a team: gain split by stake, then the captain takes
//     creatorFeeBps of each backer's gain.
//
// Conservation, always: Σ payouts + platform + seasonIn == Σ stakes + seasonOut.
// The platform cut is derived, so it absorbs all rounding dust.
//
// BigInt only, no floats. Amounts are in stake-token base units (any decimals);
// accuracy weights use the shared SCALE (1e6); returns use RET_SCALE (1e12).

import { SCALE, accuracyWeight } from "./engine";

export { SCALE };

/** Fixed-point scale for basket returns: 1e12 = +100%. */
export const RET_SCALE = 1_000_000_000_000n;

export interface LeagueParams {
  gamma: number;           // accuracy exponent (6)
  takeRateBps: number;     // 1000 = 10% of losing stakes
  seasonShareBps: number;  // 5000 = half the take goes to the season pot
  capMultiple: bigint;     // 100n → max gain = 100× team stake
  creatorFeeBps: number;   // 1000 = captain takes 10% of backers' gains
  thinPotFloorBps: number; // 500 = pot topped up to 5% of winning stakes
  minTeams: number;        // 4 — fewer teams voids the round
}

export const DEFAULT_LEAGUE_PARAMS: LeagueParams = {
  gamma: 6,
  takeRateBps: 1000,
  seasonShareBps: 5000,
  capMultiple: 100n,
  creatorFeeBps: 1000,
  thinPotFloorBps: 500,
  minTeams: 4,
};

export interface LeagueEntry {
  stake: bigint;
  isCaptain: boolean;
}

export interface LeagueTeam {
  /** Basket return, RET_SCALE fixed point (signed). */
  ret: bigint;
  entries: LeagueEntry[];
}

export type LeagueVoidReason = "TooFewTeams" | "AllReturnsEqual";

export interface TeamOutcome {
  d: bigint;          // best return − this return (RET_SCALE)
  isWinner: boolean;
  a: bigint;          // accuracy, SCALE fixed point
  teamStake: bigint;
  weight: bigint;     // teamStake × a
  gain: bigint;       // team gain from the pot, before the in-team split
  capped: boolean;
}

export interface EntryOutcome {
  team: number;
  entry: number;
  stake: bigint;
  gain: bigint;       // after the creator fee (captain: includes fees received)
  creatorFee: bigint; // paid by this backer to the captain
  refund: bigint;     // losers only: share of an unmatched pot
  payout: bigint;
}

export interface LeagueResult {
  void: LeagueVoidReason | null;
  n: number;
  k: number;
  m: bigint;
  coalitionMode: boolean;
  totalStakes: bigint;
  losingStakes: bigint;
  winningStakes: bigint;
  take: bigint;
  pot: bigint;            // dividend pot after take and top-up
  seasonIn: bigint;       // season pot share of the take
  seasonOut: bigint;      // thin-pot top-up drawn from the season pot
  platformCut: bigint;    // derived: absorbs all dust
  refundedToLosers: bigint;
  teams: TeamOutcome[];
  entries: EntryOutcome[];
}

const cmp = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0);
const sum = (xs: bigint[]): bigint => xs.reduce((s, x) => s + x, 0n);

/**
 * Settle one round. `seasonBalance` is the season pot available before this
 * round, used only for the thin-pot top-up.
 */
export function settleLeague(
  teams: LeagueTeam[],
  params: LeagueParams = DEFAULT_LEAGUE_PARAMS,
  seasonBalance = 0n,
): LeagueResult {
  const n = teams.length;
  const teamStakes = teams.map((t) => sum(t.entries.map((e) => e.stake)));
  const totalStakes = sum(teamStakes);

  const entryList = (): EntryOutcome[] =>
    teams.flatMap((t, ti) =>
      t.entries.map((e, ei) => ({ team: ti, entry: ei, stake: e.stake, gain: 0n, creatorFee: 0n, refund: 0n, payout: 0n })),
    );

  const best = teams.reduce((b, t) => (t.ret > b ? t.ret : b), n ? teams[0].ret : 0n);
  const ds = teams.map((t) => best - t.ret);

  const base: LeagueResult = {
    void: null,
    n,
    k: 0,
    m: 0n,
    coalitionMode: false,
    totalStakes,
    losingStakes: 0n,
    winningStakes: 0n,
    take: 0n,
    pot: 0n,
    seasonIn: 0n,
    seasonOut: 0n,
    platformCut: 0n,
    refundedToLosers: 0n,
    teams: teams.map((_, i) => ({ d: ds[i], isWinner: false, a: 0n, teamStake: teamStakes[i], weight: 0n, gain: 0n, capped: false })),
    entries: [],
  };

  // 1. Void: refund everyone, no take.
  const voidWith = (reason: LeagueVoidReason): LeagueResult => ({
    ...base,
    void: reason,
    entries: entryList().map((e) => ({ ...e, payout: e.stake })),
  });
  if (n < params.minTeams) return voidWith("TooFewTeams");
  if (ds.every((d) => d === 0n)) return voidWith("AllReturnsEqual");

  // 2. Gate. min D is always 0 (the best team).
  const sorted = [...ds].sort(cmp);
  const countAtBest = ds.filter((d) => d === 0n).length;
  const coalitionMode = countAtBest * 2 >= n;
  const k = Math.floor(n / 2) + 1;
  const m = sorted[k - 1]; // > 0 whenever not in coalition mode

  const out = base.teams;
  out.forEach((t, i) => {
    t.isWinner = coalitionMode ? ds[i] === 0n : ds[i] < m;
    if (!t.isWinner) return;
    t.a = coalitionMode ? SCALE : accuracyWeight((ds[i] * SCALE) / m, params.gamma);
    t.weight = (t.teamStake * t.a) / SCALE;
  });

  // 3. Pot: take, season share, thin-pot top-up.
  const losingStakes = sum(out.filter((t) => !t.isWinner).map((t) => t.teamStake));
  const winningStakes = totalStakes - losingStakes;
  const take = (losingStakes * BigInt(params.takeRateBps)) / 10_000n;
  const seasonIn = (take * BigInt(params.seasonShareBps)) / 10_000n;
  let pot = losingStakes - take;

  let seasonOut = 0n;
  const floor = (winningStakes * BigInt(params.thinPotFloorBps)) / 10_000n;
  if (pot < floor) {
    const available = seasonBalance + seasonIn;
    seasonOut = floor - pot < available ? floor - pot : available;
    pot += seasonOut;
  }

  // 4. Water-fill the pot over weight = teamStake × a, under the gain cap.
  const winners = out.map((t, i) => (t.isWinner ? i : -1)).filter((i) => i >= 0);
  let remaining = pot;
  for (;;) {
    const open = winners.filter((i) => !out[i].capped);
    const sumW = sum(open.map((i) => out[i].weight));
    if (open.length === 0 || sumW === 0n) break;
    let newlyCapped = false;
    for (const i of open) {
      const cap = out[i].teamStake * params.capMultiple;
      if ((remaining * out[i].weight) / sumW > cap) {
        out[i].gain = cap;
        out[i].capped = true;
        remaining -= cap;
        newlyCapped = true;
      }
    }
    if (!newlyCapped) {
      for (const i of open) out[i].gain = (remaining * out[i].weight) / sumW;
      remaining = 0n; // floor dust goes to the platform cut
      break;
    }
  }

  // 5. Unmatched pot (every winner capped): return the top-up first, then
  //    refund losers pro-rata to stake.
  const entries = entryList();
  let refundedToLosers = 0n;
  if (remaining > 0n) {
    const giveBack = remaining < seasonOut ? remaining : seasonOut;
    seasonOut -= giveBack;
    remaining -= giveBack;
    if (remaining > 0n && losingStakes > 0n) {
      for (const e of entries) {
        if (out[e.team].isWinner) continue;
        e.refund = (remaining * e.stake) / losingStakes;
        refundedToLosers += e.refund;
      }
    }
  }
  pot = pot - remaining + refundedToLosers; // what actually left the pot

  // 6. In-team split by stake, then the creator fee on backers' gains.
  const byTeam: EntryOutcome[][] = teams.map(() => []);
  for (const e of entries) byTeam[e.team].push(e);
  for (const ti of winners) {
    const t = out[ti];
    const members = byTeam[ti];
    for (const e of members) e.gain = (t.gain * e.stake) / t.teamStake;
    const captain = members.find((e) => teams[ti].entries[e.entry].isCaptain);
    if (!captain) continue;
    for (const e of members) {
      if (e === captain) continue;
      const fee = (e.gain * BigInt(params.creatorFeeBps)) / 10_000n;
      e.gain -= fee;
      e.creatorFee = fee;
      captain.gain += fee;
    }
  }

  for (const e of entries) {
    e.payout = out[e.team].isWinner ? e.stake + e.gain : e.refund;
  }

  const paid = sum(entries.map((e) => e.payout));
  const platformCut = totalStakes + seasonOut - paid - seasonIn;

  return {
    ...base,
    k,
    m,
    coalitionMode,
    losingStakes,
    winningStakes,
    take,
    pot,
    seasonIn,
    seasonOut,
    platformCut,
    refundedToLosers,
    entries,
  };
}

/** Σ payouts + platform + seasonIn == Σ stakes + seasonOut. */
export function leagueConserves(r: LeagueResult): boolean {
  const paid = sum(r.entries.map((e) => e.payout));
  return paid + r.platformCut + r.seasonIn === r.totalStakes + r.seasonOut && r.platformCut >= 0n;
}

// ---------------------------------------------------------------------------
// Basket maths
// ---------------------------------------------------------------------------

/**
 * Buy-and-hold return of a basket of fixed token quantities, RET_SCALE fixed
 * point. Quantities and prices may use any (consistent) units: value is
 * Σ qty × price. Returns 0 for an empty or zero-value basket.
 */
export function basketReturn(qty: bigint[], startPrices: bigint[], endPrices: bigint[]): bigint {
  if (qty.length !== startPrices.length || qty.length !== endPrices.length) {
    throw new Error("basketReturn: length mismatch");
  }
  const v0 = sum(qty.map((q, i) => q * startPrices[i]));
  if (v0 === 0n) return 0n;
  const v1 = sum(qty.map((q, i) => q * endPrices[i]));
  return ((v1 - v0) * RET_SCALE) / v0;
}

/** Value weights in basis points (sum ≤ 10 000; the remainder goes to the largest). */
export function basketWeightsBps(values: bigint[]): number[] {
  const total = sum(values);
  if (total === 0n) return values.map(() => 0);
  const w = values.map((v) => Number((v * 10_000n) / total));
  const slack = 10_000 - w.reduce((s, x) => s + x, 0);
  const iMax = w.indexOf(Math.max(...w));
  w[iMax] += slack;
  return w;
}

export interface EligibilityRules {
  minTokens: number;     // 3
  maxWeightBps: number;  // 5000 — no token above 50%
  minValue: bigint;      // $10 in the value units used
}

export type IneligibleReason = "TooFewTokens" | "TooConcentrated" | "TooSmall" | "DuplicateToken";

/** Check a creator's basket (token ids + current values) against the rules. */
export function basketEligibility(tokens: string[], values: bigint[], rules: EligibilityRules): IneligibleReason | null {
  if (new Set(tokens.map((t) => t.toLowerCase())).size !== tokens.length) return "DuplicateToken";
  const nonZero = values.filter((v) => v > 0n).length;
  if (nonZero < rules.minTokens) return "TooFewTokens";
  if (sum(values) < rules.minValue) return "TooSmall";
  if (basketWeightsBps(values).some((w) => w > rules.maxWeightBps)) return "TooConcentrated";
  return null;
}
