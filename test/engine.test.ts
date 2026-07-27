import { describe, it, expect } from "vitest";
import {
  SCALE,
  DEFAULT_DIST_PARAMS,
  DEFAULT_PAYOUT_PARAMS,
  distanceA,
  distanceB,
  accuracyWeight,
  settle,
  conserves,
  type Position,
  type PayoutParams,
} from "@kickoff/engine";

const usd = (n: number): bigint => BigInt(Math.round(n * 1e6));

/** Trepa's own params (γ=6, 20% take) — used to replicate docs.trepa.io examples exactly. */
const TREPA_PARAMS: PayoutParams = { ...DEFAULT_PAYOUT_PARAMS, gamma: 6, takeRateBps: 2000 };

// ---------------------------------------------------------------------------
// distanceA — spec §6.1
// ---------------------------------------------------------------------------

describe("distanceA (scoreline)", () => {
  it("exact guess has distance 0", () => {
    expect(distanceA(2, 1, 2, 1)).toBe(0n);
  });

  it("worked-example distances (actual 2-1)", () => {
    expect(distanceA(3, 1, 2, 1)).toBe(1_500_000n); // dGd=1, dTg=1
    expect(distanceA(2, 0, 2, 1)).toBe(1_750_000n); // + clean-sheet miss 0.25
    expect(distanceA(1, 1, 2, 1)).toBe(5_500_000n); // wrong outcome P=4
    expect(distanceA(1, 2, 2, 1)).toBe(6_000_000n);
  });

  it("fairness guarantee: correct outcome never scores worse than wrong outcome (0..7 grid)", () => {
    for (let ah = 0; ah <= 7; ah++)
      for (let aa = 0; aa <= 7; aa++) {
        let worstCorrect = -1n;
        let bestWrong = -1n;
        for (let gh = 0; gh <= 7; gh++)
          for (let ga = 0; ga <= 7; ga++) {
            const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
            const d = distanceA(gh, ga, ah, aa);
            if (sign(gh - ga) === sign(ah - aa)) {
              if (d > worstCorrect) worstCorrect = d;
            } else if (bestWrong === -1n || d < bestWrong) bestWrong = d;
          }
        expect(worstCorrect).toBeLessThan(bestWrong);
      }
  });
});

describe("distanceB (player points)", () => {
  it("absolute difference, symmetric", () => {
    expect(distanceB(usd(7.5), usd(9))).toBe(usd(1.5));
    expect(distanceB(usd(9), usd(7.5))).toBe(usd(1.5));
    expect(distanceB(usd(4), usd(4))).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// accuracyWeight — Trepa docs reference table (γ=6)
// ---------------------------------------------------------------------------

describe("accuracyWeight", () => {
  it("matches Trepa's published curve", () => {
    // Docs table is rounded to ~2 significant figures (e.g. lists 0.033 where
    // the exact value of (1/1.75)^6 is 0.034816) — compare at doc precision.
    const cases: Array<[number, number]> = [
      [0.0, 1.0],
      [0.1, 0.564],
      [0.25, 0.262],
      [0.5, 0.088],
      [0.75, 0.0348],
    ];
    for (const [r, expected] of cases) {
      const a = Number(accuracyWeight(BigInt(Math.round(r * 1e6)), 6)) / 1e6;
      expect(a).toBeCloseTo(expected, 2);
    }
  });
});

// ---------------------------------------------------------------------------
// Trepa docs 5-player round — equal $1 stakes, 20% take.
// With equal stakes, stake×a weighting reduces EXACTLY to pure Trepa,
// so the docs' payouts ($1.26 / $3.14) must reproduce to the cent.
// ---------------------------------------------------------------------------

describe("Trepa docs example (equal stakes — stake-weighting is a no-op)", () => {
  // Outcome $97,100. Errors: P1 2100, P2 600, P3 100, P4 1100, P5 2400. Median 1100.
  const positions: Position[] = [2100, 600, 100, 1100, 2400].map((e) => ({
    stake: usd(1),
    d: BigInt(e) * SCALE,
  }));
  const res = settle(positions, TREPA_PARAMS);

  it("winners are P2 and P3 only (strict median gate)", () => {
    expect(res.void).toBeNull();
    expect(res.medianD).toBe(1100n * SCALE);
    expect(res.outcomes.map((o) => o.isWinner)).toEqual([false, true, true, false, false]);
  });

  it("payouts match docs to the cent: P2 $1.26, P3 $3.14", () => {
    const cents = (x: bigint) => Number((x + 5_000n) / 10_000n);
    expect(cents(res.outcomes[1].payout)).toBe(126);
    expect(cents(res.outcomes[2].payout)).toBe(314);
  });

  it("conserves", () => {
    expect(conserves(res)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Best-coalition exception (Trepa docs example)
// ---------------------------------------------------------------------------

describe("best-coalition exception", () => {
  it("three players tied at minimum error all win", () => {
    // Errors: 200, 200, 200, 500, 1000 — median 200, nobody strictly below.
    const positions: Position[] = [200, 200, 200, 500, 1000].map((e) => ({
      stake: usd(1),
      d: BigInt(e) * SCALE,
    }));
    const res = settle(positions, TREPA_PARAMS);
    expect(res.coalitionMode).toBe(true);
    expect(res.outcomes.map((o) => o.isWinner)).toEqual([true, true, true, false, false]);
    expect(conserves(res)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Void conditions
// ---------------------------------------------------------------------------

describe("void conditions", () => {
  it("N <= 1 refunds", () => {
    const res = settle([{ stake: usd(10), d: 0n }]);
    expect(res.void).toBe("FewerThanTwo");
    expect(res.outcomes[0].payout).toBe(usd(10));
    expect(res.accumulatorContribution).toBe(0n);
  });

  it("all-equal-D refunds", () => {
    const res = settle([
      { stake: usd(10), d: usd(1) },
      { stake: usd(99), d: usd(1) },
    ]);
    expect(res.void).toBe("AllEqualD");
    expect(res.outcomes[0].payout).toBe(usd(10));
    expect(res.outcomes[1].payout).toBe(usd(99));
  });
});

// ---------------------------------------------------------------------------
// §7.2 FIX — the locked decision. The whole point of this engine.
// ---------------------------------------------------------------------------

describe("§7.2 stake×accuracy split (LOCKED)", () => {
  it("spec worked example: $10 and $100 stakers with identical accuracy get identical ROI", () => {
    // Two perfect guessers (D=0), pool of losers behind them.
    const positions: Position[] = [
      { stake: usd(10), d: 0n },   // X
      { stake: usd(100), d: 0n },  // Y
      { stake: usd(30), d: usd(3) },
      { stake: usd(30), d: usd(4) },
    ];
    const res = settle(positions);
    expect(res.outcomes[0].isWinner).toBe(true);
    expect(res.outcomes[1].isWinner).toBe(true);

    const roiX = Number(res.outcomes[0].gain) / Number(positions[0].stake);
    const roiY = Number(res.outcomes[1].gain) / Number(positions[1].stake);
    expect(roiX).toBeCloseTo(roiY, 4);
    // Dollar gains proportional to stake: Y gains ~10× X.
    expect(Number(res.outcomes[1].gain) / Number(res.outcomes[0].gain)).toBeCloseTo(10, 3);
    expect(conserves(res)).toBe(true);
  });

  it("property: any two winners with equal D always have equal ROI (seeded random pools)", () => {
    // Deterministic LCG so failures reproduce.
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

    for (let trial = 0; trial < 500; trial++) {
      const n = 3 + Math.floor(rand() * 10);
      const positions: Position[] = [];
      for (let i = 0; i < n; i++) {
        positions.push({
          stake: usd(1 + Math.floor(rand() * 500)),
          d: BigInt(Math.floor(rand() * 8)) * SCALE, // small D range forces ties
        });
      }
      const res = settle(positions);
      if (res.void !== null) continue;
      expect(conserves(res)).toBe(true);

      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          if (positions[i].d !== positions[j].d) continue;
          expect(res.outcomes[i].isWinner).toBe(res.outcomes[j].isWinner);
          if (!res.outcomes[i].isWinner || res.outcomes[i].capped || res.outcomes[j].capped) continue;
          const roiI = Number(res.outcomes[i].gain) / Number(positions[i].stake);
          const roiJ = Number(res.outcomes[j].gain) / Number(positions[j].stake);
          expect(roiI).toBeCloseTo(roiJ, 3);
        }
    }
  });

  it("median gate is stake-blind: a whale's D does not weight the median", () => {
    // 5 traders; whale is WORST. Median must be the plain 3rd-smallest D.
    const positions: Position[] = [
      { stake: usd(5), d: usd(1) },
      { stake: usd(5), d: usd(2) },
      { stake: usd(5), d: usd(3) },
      { stake: usd(5), d: usd(4) },
      { stake: usd(100000), d: usd(9) },
    ];
    const res = settle(positions);
    expect(res.medianD).toBe(usd(3));
    expect(res.outcomes.map((o) => o.isWinner)).toEqual([true, true, false, false, false]);
  });
});

// ---------------------------------------------------------------------------
// 100× cap + water-fill
// ---------------------------------------------------------------------------

describe("cap + water-fill", () => {
  it("caps a dominant winner at 100× and absorbs the residual", () => {
    const positions: Position[] = [
      { stake: usd(1), d: 0n },
      { stake: usd(1), d: 0n },
      ...Array.from({ length: 8 }, () => ({ stake: usd(200), d: usd(5) })),
    ];
    const res = settle(positions);
    expect(res.outcomes[0].capped).toBe(true);
    expect(res.outcomes[1].capped).toBe(true);
    expect(res.outcomes[0].gain).toBe(usd(100));
    expect(res.outcomes[1].gain).toBe(usd(100));
    expect(res.undistributed).toBeGreaterThan(0n);
    expect(conserves(res)).toBe(true);
  });

  it("water-fills: capped winner's excess cascades to uncapped winners", () => {
    // Near-perfect $1 winner: weight 1×1 = 1. Modest $50 winner at D=2
    // (median 5 → r=0.4, a≈0.133): weight ≈ 6.66. Losers' pool must be big
    // enough that the $1 winner's naive slice exceeds their $100 cap:
    // dividend = 8×$300×0.9 = $2160, naive $1-winner gain ≈ 2160/7.66 ≈ $282.
    const positions: Position[] = [
      { stake: usd(1), d: 0n },
      { stake: usd(50), d: usd(2) },
      ...Array.from({ length: 8 }, () => ({ stake: usd(300), d: usd(5) })),
    ];
    const res = settle(positions);
    expect(res.outcomes[0].capped).toBe(true);
    expect(res.outcomes[0].gain).toBe(usd(100));
    expect(res.outcomes[1].capped).toBe(false);
    expect(res.outcomes[1].gain).toBeGreaterThan(0n);
    // Everything distributed up to integer-division dust (absorbed by the
    // platform cut per the conservation rule).
    const gains = res.outcomes.reduce((s, o) => s + o.gain, 0n);
    expect(res.dividendPool - gains).toBeLessThan(100n); // < 0.0001 units of dust
    expect(res.undistributed).toBe(0n);
    expect(conserves(res)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fee split — 10% take, 5% accumulator / 5% platform
// ---------------------------------------------------------------------------

describe("fee split", () => {
  it("accumulator gets exactly half the take", () => {
    const positions: Position[] = [
      { stake: usd(50), d: 0n },
      { stake: usd(30), d: usd(3) },
      { stake: usd(20), d: usd(4) },
      { stake: usd(60), d: usd(6) },
    ];
    const res = settle(positions);
    expect(res.losersStakeSum).toBe(usd(110));
    expect(res.dividendPool).toBe(usd(99)); // 110 − 10%
    expect(res.accumulatorContribution).toBe(usd(5.5)); // 5% of losers' pool
    // Platform cut = other 5% + rounding dust.
    expect(res.platformCut).toBeGreaterThanOrEqual(usd(5.5));
    expect(conserves(res)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §7.4 re-run — the spec's worked example under the corrected formula.
// Same 5-staker fixture as Lock In's proven §7 demo (actual 2-1), but with
// 10% take and the stake×accuracy split. Golden integers pinned below.
// ---------------------------------------------------------------------------

describe("§7.4 worked example, corrected formula (golden)", () => {
  const stakers = [
    { name: "A", gh: 2, ga: 1, stake: 50 },
    { name: "C", gh: 3, ga: 1, stake: 40 },
    { name: "B", gh: 2, ga: 0, stake: 30 },
    { name: "D", gh: 1, ga: 1, stake: 20 },
    { name: "E", gh: 1, ga: 2, stake: 60 },
  ];
  const positions: Position[] = stakers.map((s) => ({
    stake: usd(s.stake),
    d: distanceA(s.gh, s.ga, 2, 1, DEFAULT_DIST_PARAMS),
  }));
  const res = settle(positions);

  it("median D = 1.75, winners A & C", () => {
    expect(res.void).toBeNull();
    expect(res.medianD).toBe(1_750_000n);
    expect(res.coalitionMode).toBe(false);
    expect(res.outcomes.map((o) => o.isWinner)).toEqual([true, true, false, false, false]);
  });

  it("pools: losers $110, take $11, accumulator $5.50, dividend $99", () => {
    expect(res.losersStakeSum).toBe(usd(110));
    expect(res.dividendPool).toBe(usd(99));
    expect(res.accumulatorContribution).toBe(usd(5.5));
  });

  it("golden payouts (exact base units)", () => {
    // Pinned from the engine run of 2026-07-21 — if these move, the math moved.
    expect(res.outcomes[0].payout).toBe(GOLDEN_A);
    expect(res.outcomes[1].payout).toBe(GOLDEN_C);
    expect(res.outcomes[2].payout).toBe(0n);
    expect(res.outcomes[3].payout).toBe(0n);
    expect(res.outcomes[4].payout).toBe(0n);
  });

  it("conserves exactly to $200", () => {
    const paid = res.outcomes.reduce((s, o) => s + o.payout, 0n);
    expect(paid + res.platformCut + res.accumulatorContribution).toBe(usd(200));
    expect(conserves(res)).toBe(true);
  });
});

// Golden values — pinned from the engine run of 2026-07-21 under γ=3 (locked).
// For reference: γ=6 gave A=$147.11/C=$41.89; old pure-Trepa γ=6 gave
// A=$146.67/C=$42.35. If these move, the math moved.
const GOLDEN_A = 138_008_050n; // $138.008050 (2.76×)
const GOLDEN_C = 50_991_923n;  // $50.991923 (1.27×)
