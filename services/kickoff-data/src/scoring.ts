// Player-points scoring engine — the spec §5 rubric mapped to API-Football
// fields. Returns fixed-point (×1e6) totals so Market B distances feed the
// settlement engine without float drift.
//
// Rubric lines EXCLUDED from v1 (no field on the free tier — say so in
// public rules copy, never silently substitute): "big chances created",
// "direct free-kick goal bonus".

import type { AfEvent, AfLineup, AfPlayerStats } from "./apiFootball";

export const POINTS_SCALE = 1_000_000n;

const pts = (n: number): bigint => BigInt(Math.round(n * 1e6));

export type Pos = "G" | "D" | "M" | "F";

export interface ScoreBreakdownLine {
  rule: string;
  points: number;
}

export interface PlayerScore {
  playerId: number;
  playerName: string;
  position: Pos | null;
  /** Base score BEFORE the scouting bonus (bonus computed platform-side). */
  basePoints: bigint;
  breakdown: ScoreBreakdownLine[];
}

/** Minutes each player was on the pitch when each goal was conceded — derived
 *  from lineups + substitution events (spec §5.3). */
export interface ConcededInfo {
  minutesOn: Map<number, { from: number; to: number }>; // playerId → window
  concededBy: Map<number, number>; // playerId → goals conceded while on pitch
}

/**
 * Derive on-pitch windows and goals-conceded per player.
 *
 * Substitution rows on API-Football: type "subst", `player` = the player
 * COMING OFF, `assist` = the player COMING ON (one row carries both — the
 * §5.3 open question; the backtest harness asserts this against a real
 * payload and fails loudly if the pairing is different).
 */
export function deriveConceded(
  lineups: AfLineup[],
  events: AfEvent[],
  fullTimeMinutes: number,
): ConcededInfo {
  const minutesOn = new Map<number, { from: number; to: number }>();
  const teamOf = new Map<number, number>(); // playerId → teamId

  for (const lineup of lineups) {
    for (const { player } of lineup.startXI) {
      minutesOn.set(player.id, { from: 0, to: fullTimeMinutes });
      teamOf.set(player.id, lineup.team.id);
    }
    for (const { player } of lineup.substitutes) teamOf.set(player.id, lineup.team.id);
  }

  for (const ev of events) {
    if (ev.type !== "subst") continue;
    const off = ev.player.id;
    const on = ev.assist.id;
    const minute = ev.time.elapsed;
    if (off != null && minutesOn.has(off)) minutesOn.get(off)!.to = minute;
    if (on != null) {
      minutesOn.set(on, { from: minute, to: fullTimeMinutes });
      if (!teamOf.has(on)) teamOf.set(on, ev.team.id);
    }
  }

  const concededBy = new Map<number, number>();
  for (const ev of events) {
    if (ev.type !== "Goal" || ev.detail === "Missed Penalty") continue;
    // Own goals count FOR the event's team on API-Football (team = benefiting
    // side), so the conceding team is the other one either way.
    const scoringTeam = ev.team.id;
    const minute = ev.time.elapsed;
    for (const [playerId, window] of minutesOn) {
      const playerTeam = teamOf.get(playerId);
      if (playerTeam == null || playerTeam === scoringTeam) continue;
      if (minute > window.from && minute <= Math.max(window.to, window.from)) {
        concededBy.set(playerId, (concededBy.get(playerId) ?? 0) + 1);
      }
    }
  }

  return { minutesOn, concededBy };
}

/** Own-goal counts per player, derived from events (no direct stat field). */
export function deriveOwnGoals(events: AfEvent[]): Map<number, number> {
  const ownGoals = new Map<number, number>();
  for (const ev of events) {
    if (ev.type === "Goal" && ev.detail === "Own Goal" && ev.player.id != null) {
      ownGoals.set(ev.player.id, (ownGoals.get(ev.player.id) ?? 0) + 1);
    }
  }
  return ownGoals;
}

/**
 * Score one player per the §5.1 mapping table.
 * `conceded`/`ownGoals` come from the derive helpers above.
 */
export function scorePlayer(
  stats: AfPlayerStats,
  conceded: number,
  ownGoals: number,
): PlayerScore {
  const s = stats.statistics[0];
  const breakdown: ScoreBreakdownLine[] = [];
  let total = 0;
  const add = (rule: string, points: number) => {
    if (points !== 0) {
      breakdown.push({ rule, points });
      total += points;
    }
  };

  const minutes = s.games.minutes ?? 0;
  const position = (s.games.position as Pos | null) ?? null;

  // Appearance
  if (minutes > 0) add("appearance", 1);
  if (minutes >= 60) add("appearance-60plus", 1);

  // Assists
  const assists = s.goals.assists ?? 0;
  if (assists > 0) add(`assists ×${assists}`, 3 * assists);

  // Cards — 🔴 risk log #5: second-yellow may increment BOTH yellow and red;
  // the backtest harness checks a real second-yellow match before launch.
  if (s.cards.yellow > 0) add(`yellow ×${s.cards.yellow}`, -1 * s.cards.yellow);
  if (s.cards.red > 0) add(`red ×${s.cards.red}`, -2 * s.cards.red);

  // Own goals (derived)
  if (ownGoals > 0) add(`own-goal ×${ownGoals}`, -2 * ownGoals);

  // Penalties won/conceded — note the API's one-m "commited" spelling.
  const penWon = s.penalty.won ?? 0;
  const penConceded = s.penalty.commited ?? 0;
  if (penWon > 0) add(`penalty-won ×${penWon}`, 2 * penWon);
  if (penConceded > 0) add(`penalty-conceded ×${penConceded}`, -1 * penConceded);

  // Goals by position
  const goals = s.goals.total ?? 0;
  if (goals > 0) {
    const per = position === "G" ? 9 : position === "D" ? 7 : position === "M" ? 6 : 5;
    add(`goals ×${goals} (${position ?? "F"})`, per * goals);
  }

  // Clean sheet / conceded (derived)
  if (minutes >= 60 && conceded === 0) {
    if (position === "G" || position === "D") add("clean-sheet", 5);
    else if (position === "M") add("clean-sheet", 1);
  }
  if ((position === "G" || position === "D") && conceded > 1) {
    // First goal conceded free, then −1 each.
    add(`conceded ×${conceded}`, -(conceded - 1));
  }

  // GK extras
  if (position === "G") {
    const saves = s.goals.saves ?? 0; // lives under `goals` despite the name
    if (saves >= 3) add(`saves ×${saves}`, Math.floor(saves / 3));
    const penSaved = s.penalty.saved ?? 0;
    if (penSaved > 0) add(`penalty-saved ×${penSaved}`, 3 * penSaved);
  }

  // MID tackles
  if (position === "M") {
    const tackles = s.tackles.total ?? 0;
    if (tackles >= 3) add(`tackles ×${tackles}`, Math.floor(tackles / 3));
  }

  // FWD shots on target
  if (position === "F") {
    const shotsOn = s.shots.on ?? 0;
    if (shotsOn >= 2) add(`shots-on-target ×${shotsOn}`, Math.floor(shotsOn / 2));
  }

  return {
    playerId: stats.player.id,
    playerName: stats.player.name,
    position,
    basePoints: pts(total),
    breakdown,
  };
}
