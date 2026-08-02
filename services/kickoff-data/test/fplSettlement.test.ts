import { describe, it, expect } from "vitest";
import type { PlayerGwPoints, PlayerMatchStats } from "@kickoff/schema";
import { gwStage, crossCheckS1, buildOutcome } from "../src/fplSettlement";

// ---------------------------------------------------------------------------
// gwStage — the two-stage finality ladder. The invariants that matter:
//   never `final` without data_checked; never `provisional` off
//   finished_provisional alone (bonus must be in: fixture.finished).
// ---------------------------------------------------------------------------

describe("gwStage: two-stage finality", () => {
  it("pending while any fixture lacks bonus (finished=false)", () => {
    expect(
      gwStage({ finished: false, dataChecked: false }, [{ finished: true }, { finished: false }]),
    ).toBe("pending");
  });

  it("gw.finished alone is not enough — fixtures must agree", () => {
    // FPL flag races the fixture list; trust the AND of both.
    expect(gwStage({ finished: true, dataChecked: false }, [{ finished: false }])).toBe("pending");
  });

  it("fixtures done but gw flag not set → still pending (FPL flag is authoritative)", () => {
    expect(gwStage({ finished: false, dataChecked: false }, [{ finished: true }])).toBe("pending");
  });

  it("provisional when gw.finished AND all fixtures finished", () => {
    expect(gwStage({ finished: true, dataChecked: false }, [{ finished: true }])).toBe("provisional");
  });

  it("final ONLY with data_checked", () => {
    expect(gwStage({ finished: true, dataChecked: true }, [{ finished: true }])).toBe("final");
  });

  it("property: never final without data_checked, for all flag combinations", () => {
    for (const finished of [true, false]) {
      for (const fxFinished of [true, false]) {
        const stage = gwStage({ finished, dataChecked: false }, [{ finished: fxFinished }]);
        expect(stage).not.toBe("final");
      }
    }
  });

  it("property: data_checked never demotes — final requires the provisional gates too", () => {
    // data_checked=true but a fixture still unfinished: stage stays pending —
    // an inconsistent FPL read must not leapfrog the ladder.
    expect(gwStage({ finished: true, dataChecked: true }, [{ finished: false }])).toBe("pending");
    expect(gwStage({ finished: false, dataChecked: true }, [{ finished: true }])).toBe("pending");
  });

  it("blank gameweek (no fixtures) defers to the GW flags", () => {
    expect(gwStage({ finished: true, dataChecked: true }, [])).toBe("final");
    expect(gwStage({ finished: false, dataChecked: false }, [])).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// crossCheckS1 — informational flags only
// ---------------------------------------------------------------------------

function fplRow(overrides: Partial<PlayerGwPoints> = {}): PlayerGwPoints {
  return {
    gw: 1,
    season: 2026,
    element_id: 100,
    player_name: "Saka",
    team_slug: "arsenal",
    position: "M",
    total_points: 8,
    minutes: 90,
    bonus: 1,
    provisional: true,
    stats: { goals_scored: 1, assists: 0, yellow_cards: 0, red_cards: 0, minutes: 90 },
    ...overrides,
  };
}

function s1Row(overrides: Partial<PlayerMatchStats> = {}): PlayerMatchStats {
  return {
    fixture_id: "epl-arsenal-chelsea-202608151400",
    player_id: 55,
    player_name: "B. Saka",
    team: "home",
    position: "M",
    minutes: 90,
    started: true,
    sub_on_minute: null,
    sub_off_minute: null,
    goals: 1,
    assists: 0,
    own_goals: 0,
    yellow_cards: 0,
    red_cards: 0,
    penalties_won: 0,
    penalties_conceded: 0,
    penalties_saved: 0,
    saves: 0,
    tackles: 3,
    shots_on_target: 2,
    conceded_while_on: 1,
    ...overrides,
  };
}

const MAP = new Map([[100, 55]]);

describe("crossCheckS1", () => {
  it("agreement produces no flags", () => {
    expect(crossCheckS1([fplRow()], [s1Row()], MAP)).toEqual([]);
  });

  it("goal disagreement flags with both values", () => {
    const flags = crossCheckS1([fplRow()], [s1Row({ goals: 0 })], MAP);
    expect(flags).toEqual([{ element_id: 100, field: "goals", fpl: 1, s1: 0 }]);
  });

  it("minutes tolerate ±5 (sub-timing noise), flag beyond", () => {
    expect(crossCheckS1([fplRow()], [s1Row({ minutes: 86 })], MAP)).toEqual([]);
    const flags = crossCheckS1([fplRow()], [s1Row({ minutes: 60 })], MAP);
    expect(flags).toEqual([{ element_id: 100, field: "minutes", fpl: 90, s1: 60 }]);
  });

  it("unmapped elements are skipped silently — never flagged", () => {
    expect(crossCheckS1([fplRow()], [s1Row({ goals: 0 })], new Map())).toEqual([]);
  });

  it("mapped but missing S1 rows flags null only when FPL says they played", () => {
    expect(crossCheckS1([fplRow()], [], MAP)).toEqual([
      { element_id: 100, field: "minutes", fpl: 90, s1: null },
    ]);
    expect(crossCheckS1([fplRow({ minutes: 0, stats: { minutes: 0 } })], [], MAP)).toEqual([]);
  });

  it("double gameweek: S1 rows aggregate across fixtures before the diff", () => {
    const dgw = fplRow({ minutes: 180, stats: { goals_scored: 2, assists: 0, yellow_cards: 0, red_cards: 0 } });
    const flags = crossCheckS1(
      [dgw],
      [
        s1Row({ fixture_id: "fx-a", goals: 1, minutes: 90 }),
        s1Row({ fixture_id: "fx-b", goals: 1, minutes: 90 }),
      ],
      MAP,
    );
    expect(flags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildOutcome — deterministic snapshot payloads
// ---------------------------------------------------------------------------

describe("buildOutcome", () => {
  it("sorts by element id and carries name + points only", () => {
    const out = buildOutcome([
      fplRow({ element_id: 200, player_name: "Haaland", total_points: 13 }),
      fplRow({ element_id: 100, total_points: 8 }),
    ]);
    expect(out).toEqual([
      { element_id: 100, player_name: "Saka", total_points: 8 },
      { element_id: 200, player_name: "Haaland", total_points: 13 },
    ]);
  });

  it("is input-order independent (deterministic snapshots)", () => {
    const rows = [
      fplRow({ element_id: 3 }),
      fplRow({ element_id: 1 }),
      fplRow({ element_id: 2 }),
    ];
    const a = buildOutcome(rows);
    const b = buildOutcome([...rows].reverse());
    expect(a).toEqual(b);
  });
});
