import { describe, it, expect } from "vitest";
import { extractS5Score, getTiebreakScore } from "../src/fsfd";

describe("S5 FSFD: defensive score extraction", () => {
  it("snake_case numeric fields", () => {
    expect(extractS5Score({ home_team: "Arsenal", away_team: "Chelsea", home_score: 2, away_score: 1 })).toEqual({
      homeSlug: "arsenal",
      awaySlug: "chelsea",
      score: { home: 2, away: 1 },
    });
  });

  it("camelCase + combined \"1-1\" score string", () => {
    expect(extractS5Score({ homeTeam: "Manchester City", awayTeam: "Liverpool", score: "1-1" })?.score).toEqual({
      home: 1,
      away: 1,
    });
  });

  it("numeric strings parse; junk does not", () => {
    expect(extractS5Score({ home_team: "A", away_team: "B", home_score: "2", away_score: "0" })?.score).toEqual({
      home: 2,
      away: 0,
    });
    expect(extractS5Score({ home_team: "A", away_team: "B", home_score: "2.5", away_score: "0" })).toBeNull();
    expect(extractS5Score({ home_team: "A", away_team: "B", score: "postponed" })).toBeNull();
    expect(extractS5Score({ home_team: "A", away_team: "B" })).toBeNull();
    expect(extractS5Score({ home_score: 1, away_score: 0 })).toBeNull(); // teams missing
  });

  it("mock run resolves the recorded sample by slug pair; unknown pair → null", async () => {
    expect(await getTiebreakScore("arsenal", "chelsea")).toEqual({ home: 2, away: 1 });
    expect(await getTiebreakScore("manchester-city", "liverpool")).toEqual({ home: 1, away: 1 });
    expect(await getTiebreakScore("everton", "fulham")).toBeNull();
  });
});
