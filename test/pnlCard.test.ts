import { describe, expect, it } from "vitest";
import { buildPnlCardView, fmtCardUsd, pnlRank, type PnlCardInput } from "@/lib/pnlCard";

const $ = (d: number) => BigInt(Math.round(d * 1e6));
const codes: Record<string, string> = { Arsenal: "ARS", Chelsea: "CHE" };
const codeFor = (n: string) => codes[n] ?? null;

const field = [
  { id: 1, stake: $(100), payout: $(290) }, // +190
  { id: 2, stake: $(50), payout: $(80) }, // +30
  { id: 3, stake: $(190), payout: 0n }, // -190
  { id: 4, stake: $(20), payout: null }, // -20
];

const input = (id: number, guess: [number, number]): PnlCardInput => {
  const p = field.find((f) => f.id === id)!;
  return {
    kind: "scoreline",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    playerName: null,
    actualHome: 2,
    actualAway: 1,
    actualPoints: null,
    position: { ...p, guessHome: guess[0], guessAway: guess[1], guessPoints: null },
    field,
  };
};

describe("buildPnlCardView", () => {
  it("renders a winning card: payout minus stake, rank 1", () => {
    expect(buildPnlCardView(input(1, [2, 1]), codeFor)).toEqual({
      tone: "win",
      sign: "+",
      amount: "$190",
      headline: "ARS/CHE",
      home: "Arsenal",
      away: "Chelsea",
      result: "2 - 1",
      prediction: "2 - 1",
      rank: 1,
      of: 4,
    });
  });

  it("renders a losing card: whole stake lost, ranked last", () => {
    const v = buildPnlCardView(input(3, [0, 1]), codeFor);
    expect(v).toMatchObject({ tone: "loss", sign: "-", amount: "$190", prediction: "0 - 1", rank: 4, of: 4 });
  });

  it("treats a null payout as zero", () => {
    expect(buildPnlCardView(input(4, [1, 1]), codeFor)).toMatchObject({ amount: "$20", rank: 3 });
  });

  it("ties share the higher rank", () => {
    const tied = { ...input(2, [2, 1]), field: [...field, { id: 5, stake: $(30), payout: $(60) }] };
    expect(buildPnlCardView(tied, codeFor).rank).toBe(2);
  });

  it("player markets headline the player and show points", () => {
    const v = buildPnlCardView(
      {
        ...input(2, [0, 0]),
        kind: "player_points",
        playerName: "Haaland",
        actualHome: null,
        actualAway: null,
        actualPoints: $(13),
        position: { ...field[1], guessHome: null, guessAway: null, guessPoints: $(6.5) },
      },
      codeFor,
    );
    expect(v).toMatchObject({ headline: "HAALAND", result: "13", prediction: "6.5" });
  });

  it("falls back to letters for unknown clubs", () => {
    const v = buildPnlCardView({ ...input(1, [2, 1]), homeTeam: "Luton Town" }, codeFor);
    expect(v.headline).toBe("LUT/CHE");
  });
});

describe("fmtCardUsd", () => {
  it("keeps whole dollars clean and shows cents otherwise", () => {
    expect(fmtCardUsd($(190))).toBe("$190");
    expect(fmtCardUsd(-$(2.5))).toBe("$2.50");
    expect(fmtCardUsd($(12480.5))).toBe("$12,480.50");
  });
});

describe("pnlRank", () => {
  it("ranks string amounts (client rows) the same as bigint ones", () => {
    const rows = field.map((f) => ({ stake: f.stake.toString(), payout: f.payout?.toString() ?? null }));
    expect(rows.map((r) => pnlRank(rows, r))).toEqual([1, 2, 4, 3]);
  });

  it("ranks by PnL, not payout: a bigger payout on a bigger stake can rank lower", () => {
    const a = { stake: $(500), payout: $(560) }; // +60
    const b = { stake: $(10), payout: $(100) }; // +90
    expect(pnlRank([a, b], a)).toBe(2);
    expect(pnlRank([a, b], b)).toBe(1);
  });
});
