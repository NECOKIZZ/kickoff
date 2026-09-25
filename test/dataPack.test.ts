import { describe, it, expect } from "vitest";
import { tableFrom, teamFormFrom } from "../src/lib/dataPack";

const results = [
  { date: "2026-09-20", home: "Fulham", away: "Spurs", score: "1-1" },
  { date: "2026-09-13", home: "Arsenal", away: "Fulham", score: "3-0" },
  { date: "2026-09-06", home: "Spurs", away: "Arsenal", score: "2-1" },
];

describe("data pack derivations", () => {
  it("league table: 3/1/0 points, sorted by points, GD, GF", () => {
    const t = tableFrom(results);
    expect(t.map((r) => [r.position, r.team, r.points, r.goalDifference])).toEqual([
      [1, "Spurs", 4, 1],
      [2, "Arsenal", 3, 2],
      [3, "Fulham", 1, -3],
    ]);
    expect(t[0]).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 3, goalsAgainst: 2 });
  });

  it("form: most recent first, home/away splits", () => {
    const f = teamFormFrom(results);
    expect(f.Fulham.last5).toBe("DL");
    expect(f.Arsenal.atHome).toEqual({ played: 1, goalsFor: 3, goalsAgainst: 0 });
    expect(f.Arsenal.away).toEqual({ played: 1, goalsFor: 1, goalsAgainst: 2 });
  });
});
