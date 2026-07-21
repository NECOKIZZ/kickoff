import { describe, it, expect } from "vitest";
import {
  precisionScore,
  car,
  volumeMultiplier,
  rankTraders,
  accumulatorSplit,
  LEADERBOARD_PARAMS,
  type TraderSeasonStats,
} from "@/lib/leaderboard";

const usd = (n: number): bigint => BigInt(Math.round(n * 1e6));

describe("precisionScore", () => {
  it("maps a=1 (perfect) to 1000, a=0 to 100", () => {
    expect(precisionScore(1_000_000n)).toBe(1000);
    expect(precisionScore(0n)).toBe(100);
  });
});

describe("CAR (geometric mean)", () => {
  it("Trepa docs example: Carol's one bad round drags CAR below her arithmetic mean", () => {
    // Alice 700/700/700, Bob 400/400/1000, Carol 900/900/300 (docs §11).
    // Note: the deep-dive doc lists Carol as "640" but (900·900·300)^⅓ is
    // exactly 624.03 — the doc's number is a loose rounding, ours is the math.
    expect(car([700, 700, 700])).toBeCloseTo(700, 0);
    expect(car([400, 400, 1000])).toBeCloseTo(543, 0);
    expect(car([900, 900, 300])).toBeCloseTo(624, 0);
    // The property that matters: CAR < arithmetic mean when rounds vary.
    expect(car([900, 900, 300])).toBeLessThan(700);
  });
});

describe("volumeMultiplier", () => {
  it("caps at 1.5 at/above vCap, ~1 at tiny volume", () => {
    expect(volumeMultiplier(usd(5200))).toBeCloseTo(1.5, 3);
    expect(volumeMultiplier(usd(1))).toBeLessThan(1.01);
    // Spec §8.7 reference points
    expect(volumeMultiplier(usd(40))).toBeCloseTo(1.024, 2);
    expect(volumeMultiplier(usd(800))).toBeCloseTo(1.236, 2);
    expect(volumeMultiplier(usd(3000))).toBeCloseTo(1.421, 2);
  });
});

describe("rankTraders (spec §8.7 worked example)", () => {
  // CARs are given in the spec table; feed single-element score arrays so
  // the geometric mean is the CAR itself.
  const traders: TraderSeasonStats[] = [
    { address: "0xC", settledMarkets: 10, volume: usd(5200), precisionScores: [900] },
    { address: "0xA", settledMarkets: 10, volume: usd(40), precisionScores: [850] },
    { address: "0xB", settledMarkets: 10, volume: usd(800), precisionScores: [620] },
    { address: "0xD", settledMarkets: 10, volume: usd(3000), precisionScores: [500] },
  ];

  it("reproduces the spec ranking C > A > B > D with the spec scores", () => {
    const ranked = rankTraders(traders);
    expect(ranked.map((r) => r.address)).toEqual(["0xC", "0xA", "0xB", "0xD"]);
    expect(ranked[0].score).toBeCloseTo(1350.0, 0);
    expect(ranked[1].score).toBeCloseTo(870.7, 0);
    expect(ranked[2].score).toBeCloseTo(766.1, 0);
    expect(ranked[3].score).toBeCloseTo(710.6, 0);
  });

  it("eligibility gate: too few markets or volume → absent", () => {
    const gated = rankTraders([
      { address: "0xLUCKY", settledMarkets: 1, volume: usd(1), precisionScores: [1000] },
      ...traders,
    ]);
    expect(gated.find((r) => r.address === "0xLUCKY")).toBeUndefined();
    expect(gated.length).toBe(4);
  });

  it("whale with mediocre precision cannot out-multiplier a precise small trader", () => {
    const ranked = rankTraders(traders);
    const a = ranked.find((r) => r.address === "0xA")!; // $40, CAR 850
    const d = ranked.find((r) => r.address === "0xD")!; // $3000, CAR 500
    expect(a.rank).toBeLessThan(d.rank);
  });
});

describe("accumulatorSplit (rank-weight table)", () => {
  it("splits by descending weights, dust to rank 1, exact conservation", () => {
    const vault = 100_000_001n; // deliberately indivisible
    const split = accumulatorSplit(vault, ["0x1", "0x2", "0x3", "0x4", "0x5", "0x6", "0x7", "0x8", "0x9", "0x10"]);
    expect(split.length).toBe(10);
    expect(split[0].amount).toBeGreaterThan(split[1].amount);
    expect(split[1].amount).toBeGreaterThan(split[2].amount);
    const total = split.reduce((s, r) => s + r.amount, 0n);
    expect(total).toBe(vault); // every base unit allocated
    // rank 1 = 30% + dust
    expect(split[0].amount).toBeGreaterThanOrEqual((vault * 3000n) / 10000n);
  });

  it("renormalizes when fewer than 10 eligible traders", () => {
    const vault = usd(1000);
    const split = accumulatorSplit(vault, ["0x1", "0x2", "0x3"]);
    expect(split.length).toBe(3);
    const total = split.reduce((s, r) => s + r.amount, 0n);
    expect(total).toBe(vault); // whole vault still distributed
    // weights 3000/2000/1400 of 6400 total
    expect(Number(split[0].amount)).toBeCloseTo((Number(vault) * 3000) / 6400, -4);
  });

  it("empty ranking → nothing to split", () => {
    expect(accumulatorSplit(usd(100), [])).toEqual([]);
  });
});
