// Kickoff proximity-markets settlement engine.
//
// Ported from Lock In's proven fixed-point engine (Player Perps, Solana) with
// three deliberate changes, per the master build spec:
//
//   1. §7.2 FIX (LOCKED 2026-07-21): the dividend pool is split by
//      weight_i = stake_i × a_i, not a_i alone. Equal accuracy ⇒ equal ROI%,
//      regardless of stake size ("N unit tickets" model). The median win/lose
//      gate stays UNWEIGHTED — one trader, one vote — so a whale can't drag
//      the median toward their own guess.
//   2. Take is 10% of the losers' pool (Trepa's is 20%), split 50/50:
//      5% platform reserve, 5% Season Accumulator Pool.
//   3. Market B (player-points) distance added alongside Market A (scoreline).
//
// All arithmetic is BigInt fixed-point (SCALE = 1e6, matching USDC's 6
// decimals) so this module can later be mirrored byte-identically in the
// Solidity escrow contract. No floats anywhere.

export const SCALE = 1_000_000n; // 6 decimals — matches USDC base units

// ---------------------------------------------------------------------------
// Distance — Market A (scoreline)
// ---------------------------------------------------------------------------

export interface DistParams {
  p: bigint;      // wrong-outcome penalty, fixed-point
  wGd: bigint;    // goal-difference weight, fixed-point
  wTg: bigint;    // total-goals weight, fixed-point
  wCs: bigint;    // clean-sheet-call weight, fixed-point
  capGd: number;  // integer goals
  capTg: number;  // integer goals
}

export const DEFAULT_DIST_PARAMS: DistParams = {
  p: 4n * SCALE,     // 4.0
  wGd: SCALE,        // 1.0
  wTg: SCALE / 2n,   // 0.5
  wCs: SCALE / 4n,   // 0.25
  capGd: 3,
  capTg: 4,
};

const outcomeSign = (gd: number): number => (gd > 0 ? 1 : gd < 0 ? -1 : 0);
const absU = (a: bigint): bigint => (a < 0n ? -a : a);
const minB = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** Market A distance D for a guess (gh,ga) vs actual (ah,aa). Fixed-point. */
export function distanceA(
  gh: number,
  ga: number,
  ah: number,
  aa: number,
  p: DistParams = DEFAULT_DIST_PARAMS,
): bigint {
  const gdGuess = gh - ga;
  const gdActual = ah - aa;
  const tgGuess = gh + ga;
  const tgActual = ah + aa;

  const correct = outcomeSign(gdGuess) === outcomeSign(gdActual) ? 1n : 0n;
  const dGd = minB(BigInt(Math.abs(gdGuess - gdActual)), BigInt(p.capGd));
  const dTg = minB(BigInt(Math.abs(tgGuess - tgActual)), BigInt(p.capTg));

  const csHomeGuess = ga === 0 ? 1n : 0n;
  const csHomeActual = aa === 0 ? 1n : 0n;
  const csAwayGuess = gh === 0 ? 1n : 0n;
  const csAwayActual = ah === 0 ? 1n : 0n;
  const csTerm = absU(csHomeGuess - csHomeActual) + absU(csAwayGuess - csAwayActual);

  return (1n - correct) * p.p + p.wGd * dGd + p.wTg * dTg + p.wCs * csTerm;
}

// ---------------------------------------------------------------------------
// Distance — Market B (player points)
// ---------------------------------------------------------------------------

/**
 * Market B distance: |guess − actual|, both in fixed-point points
 * (e.g. a guess of 7.5 points is 7_500_000n).
 */
export function distanceB(guess: bigint, actual: bigint): bigint {
  return absU(guess - actual);
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

export interface PayoutParams {
  gamma: number;              // accuracy exponent (6)
  takeRateBps: number;        // 1000 = 10% of losers' pool
  accumulatorShareBps: number;// 5000 = 50% of the take (i.e. 5% of losers' pool)
  capMultiple: bigint;        // 100n → max gain = 100× stake
}

export const DEFAULT_PAYOUT_PARAMS: PayoutParams = {
  // γ=3 (LOCKED 2026-07-21, softer than Trepa's 6): Kickoff settles once per
  // matchday, not every 60s — barely-winners should still feel a visible
  // profit. Per-market override via admin dashboard at listing time; frozen
  // on-chain once a market opens for staking.
  gamma: 3,
  takeRateBps: 1000,
  accumulatorShareBps: 5000,
  capMultiple: 100n,
};

/** a = (1/(1+r))^gamma in fixed-point — no general pow(). */
export function accuracyWeight(r: bigint, gamma: number): bigint {
  const base = (SCALE * SCALE) / (SCALE + r);
  let result = SCALE;
  for (let i = 0; i < gamma; i++) result = (result * base) / SCALE;
  return result;
}

export interface Position {
  stake: bigint; // stake-token base units (6 decimals)
  d: bigint;     // fixed-point distance
}

export type VoidReason = "FewerThanTwo" | "AllEqualD";

export interface PositionOutcome {
  isWinner: boolean;
  a: bigint;      // accuracy weight, fixed-point
  weight: bigint; // stake × a — the §7.2 split weight, stake base units
  gain: bigint;
  payout: bigint;
  capped: boolean;
}

export interface SettleResult {
  void: VoidReason | null;
  medianD: bigint;
  minD: bigint;
  countAtMin: number;
  coalitionMode: boolean;
  k: number;
  losersStakeSum: bigint;
  dividendPool: bigint;
  /** 5% of losers' pool (at defaults) — swept to the Season Accumulator Vault. */
  accumulatorContribution: bigint;
  /** Platform reserve — absorbs rounding dust + any undistributed residual. */
  platformCut: bigint;
  undistributed: bigint;
  totalPool: bigint;
  outcomes: PositionOutcome[];
}

/**
 * Full settlement: Trepa median gate (unweighted) + stake×accuracy split
 * (§7.2 fix) + 100× cap with water-filling + 10% take split 5/5 between
 * platform and accumulator.
 */
export function settle(positions: Position[], params: PayoutParams = DEFAULT_PAYOUT_PARAMS): SettleResult {
  const n = positions.length;
  const totalPool = positions.reduce((s, p) => s + p.stake, 0n);

  const voidResult = (reason: VoidReason): SettleResult => ({
    void: reason,
    medianD: 0n,
    minD: 0n,
    countAtMin: 0,
    coalitionMode: false,
    k: 0,
    losersStakeSum: 0n,
    dividendPool: 0n,
    accumulatorContribution: 0n,
    platformCut: 0n,
    undistributed: 0n,
    totalPool,
    outcomes: positions.map((p) => ({ isWinner: false, a: 0n, weight: 0n, gain: 0n, payout: p.stake, capped: false })),
  });

  // 1. Void checks — refund everyone, no take.
  if (n <= 1) return voidResult("FewerThanTwo");
  const ds = positions.map((p) => p.d).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (ds[0] === ds[n - 1]) return voidResult("AllEqualD");

  // 2. Best-coalition exception (unweighted — head-count, not stake).
  const minD = ds[0];
  const countAtMin = positions.filter((p) => p.d === minD).length;
  const coalitionMode = countAtMin * 2 >= n;

  // 3. Median gate (unweighted — one trader, one vote).
  const k = Math.floor((n + 1) / 2);
  const medianD = ds[k - 1];

  const outcomes: PositionOutcome[] = positions.map((p) => ({
    isWinner: coalitionMode ? p.d === minD : p.d < medianD,
    a: 0n,
    weight: 0n,
    gain: 0n,
    payout: 0n,
    capped: false,
  }));

  // 4. Accuracy weights + §7.2 split weights (winners only).
  positions.forEach((p, i) => {
    if (outcomes[i].isWinner) {
      const r = medianD === 0n ? 0n : (p.d * SCALE) / medianD;
      outcomes[i].a = accuracyWeight(r, params.gamma);
      outcomes[i].weight = (p.stake * outcomes[i].a) / SCALE; // stake × a
    }
  });

  // 5. Pools. take = 10% of losers' stakes; half of the take accumulates.
  const losersStakeSum = positions.filter((_, i) => !outcomes[i].isWinner).reduce((s, p) => s + p.stake, 0n);
  const take = (losersStakeSum * BigInt(params.takeRateBps)) / 10_000n;
  const accumulatorContribution = (take * BigInt(params.accumulatorShareBps)) / 10_000n;
  const dividendPool = losersStakeSum - take;

  // 6. Cap + water-fill over weight = stake × a.
  const winners = outcomes.map((o, i) => (o.isWinner ? i : -1)).filter((i) => i >= 0);
  const capped = new Array(n).fill(false);
  let remaining = dividendPool;
  let undistributed = 0n;

  for (let round = 0; round < 10; round++) {
    const uncapped = winners.filter((i) => !capped[i]);
    const sumW = uncapped.reduce((s, i) => s + outcomes[i].weight, 0n);
    if (uncapped.length === 0 || sumW === 0n) {
      undistributed = remaining;
      remaining = 0n;
      break;
    }
    const alpha = (remaining * SCALE) / sumW;
    let anyCapped = false;
    for (const i of uncapped) {
      const naive = (alpha * outcomes[i].weight) / SCALE;
      const cap = positions[i].stake * params.capMultiple;
      if (naive > cap) {
        outcomes[i].gain = cap;
        outcomes[i].capped = true;
        capped[i] = true;
        remaining -= cap;
        anyCapped = true;
      }
    }
    if (!anyCapped) {
      for (const i of uncapped) outcomes[i].gain = (alpha * outcomes[i].weight) / SCALE;
      remaining = 0n;
      break;
    }
  }
  if (remaining > undistributed) undistributed = remaining;

  // 7. Payouts + exact conservation. Platform cut is DERIVED so it absorbs
  //    rounding dust and any undistributed residual:
  //    Σ payout + platformCut + accumulatorContribution === totalPool, always.
  let winnersGainSum = 0n;
  for (const i of winners) {
    winnersGainSum += outcomes[i].gain;
    outcomes[i].payout = positions[i].stake + outcomes[i].gain;
  }
  const platformCut = losersStakeSum - winnersGainSum - accumulatorContribution;

  return {
    void: null,
    medianD,
    minD,
    countAtMin,
    coalitionMode,
    k,
    losersStakeSum,
    dividendPool,
    accumulatorContribution,
    platformCut,
    undistributed,
    totalPool,
    outcomes,
  };
}

/** Σ payout + platformCut + accumulatorContribution == totalPool — the conservation invariant. */
export function conserves(r: SettleResult): boolean {
  const paid = r.outcomes.reduce((s, o) => s + o.payout, 0n);
  return paid + r.platformCut + r.accumulatorContribution === r.totalPool;
}
