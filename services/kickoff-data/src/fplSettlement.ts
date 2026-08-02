// FPL player-points settlement — the PURE half (fplSettlementLane.ts
// persists). Standalone authority by decision (2026-08-01): the market IS
// "official FPL points" and the EPL operates FPL, so there are no votes and
// no quorum — the documented exception to the no-single-source rule. The
// scoreline engine (settlement.ts) is untouched.
//
// Two-stage finality, driven entirely by FPL's own flags:
//   provisional ⇐ every fixture in the GW `finished` (bonus IN — never
//                 `finished_provisional`) AND the gameweek's own `finished`
//   final       ⇐ provisional AND the gameweek's `data_checked`
//
// The S1 cross-check compares raw stat categories and can only FLAG —
// a flag fires a webhook for human eyes; settlement proceeds regardless.

import type { PointsCrossCheckFlag, PlayerGwPoints, PlayerMatchStats } from "@kickoff/schema";

export type GwStage = "pending" | "provisional" | "final";

/**
 * Where a gameweek sits in the finality ladder. `fixtures` is the GW's FPL
 * fixture list; an empty list defers to the GW flags alone (blank GWs exist).
 * gw.finished is required even when all fixtures read finished — FPL's own
 * flag is authoritative and also covers fixtures we failed to ingest.
 */
export function gwStage(
  gw: { finished: boolean; dataChecked: boolean },
  fixtures: Array<{ finished: boolean }>,
): GwStage {
  const allFixturesDone = fixtures.every((f) => f.finished);
  const provisional = gw.finished && allFixturesDone;
  if (!provisional) return "pending";
  return gw.dataChecked ? "final" : "provisional";
}

/** FPL stats key → the player_match_stats field it must agree with. */
const CHECK_FIELDS: Array<{
  field: string;
  fpl: (p: PlayerGwPoints) => number;
  s1: (s: S1Totals) => number;
  tolerance: number;
}> = [
  { field: "goals", fpl: (p) => p.stats.goals_scored ?? 0, s1: (s) => s.goals, tolerance: 0 },
  { field: "assists", fpl: (p) => p.stats.assists ?? 0, s1: (s) => s.assists, tolerance: 0 },
  { field: "yellow_cards", fpl: (p) => p.stats.yellow_cards ?? 0, s1: (s) => s.yellowCards, tolerance: 0 },
  { field: "red_cards", fpl: (p) => p.stats.red_cards ?? 0, s1: (s) => s.redCards, tolerance: 0 },
  // Providers time substitutions differently — exact minutes never agree.
  { field: "minutes", fpl: (p) => p.minutes, s1: (s) => s.minutes, tolerance: 5 },
];

interface S1Totals {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutes: number;
}

/**
 * Aggregate S1 per-fixture rows over the gameweek and diff against FPL.
 * Elements without an S1 mapping are skipped silently — the check only
 * flags, so a missing mapping costs nothing. Output is informational ONLY:
 * callers must never let it block or delay settlement.
 */
export function crossCheckS1(
  fplRows: PlayerGwPoints[],
  s1Rows: PlayerMatchStats[],
  elementToS1: Map<number, number>,
): PointsCrossCheckFlag[] {
  // Sum S1 rows per player id (double gameweeks = multiple fixtures).
  const totals = new Map<number, S1Totals>();
  for (const r of s1Rows) {
    const t = totals.get(r.player_id) ?? { goals: 0, assists: 0, yellowCards: 0, redCards: 0, minutes: 0 };
    t.goals += r.goals;
    t.assists += r.assists;
    t.yellowCards += r.yellow_cards;
    t.redCards += r.red_cards;
    t.minutes += r.minutes;
    totals.set(r.player_id, t);
  }

  const flags: PointsCrossCheckFlag[] = [];
  for (const p of fplRows) {
    const s1Id = elementToS1.get(p.element_id);
    if (s1Id === undefined) continue; // unmapped — skip, never flag
    const t = totals.get(s1Id);
    if (!t) {
      // Mapped but S1 has no rows: only notable when FPL says they played.
      if (p.minutes > 0) {
        flags.push({ element_id: p.element_id, field: "minutes", fpl: p.minutes, s1: null });
      }
      continue;
    }
    for (const c of CHECK_FIELDS) {
      const fplVal = c.fpl(p);
      const s1Val = c.s1(t);
      if (Math.abs(fplVal - s1Val) > c.tolerance) {
        flags.push({ element_id: p.element_id, field: c.field, fpl: fplVal, s1: s1Val });
      }
    }
  }
  return flags;
}

/** The settlement outcome payload, sorted for deterministic snapshots. */
export function buildOutcome(
  rows: PlayerGwPoints[],
): Array<{ element_id: number; player_name: string; total_points: number }> {
  return [...rows]
    .sort((a, b) => a.element_id - b.element_id)
    .map((r) => ({ element_id: r.element_id, player_name: r.player_name, total_points: r.total_points }));
}
