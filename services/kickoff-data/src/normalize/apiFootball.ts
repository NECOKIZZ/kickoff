// S1 (API-Football) → canonical schema normalizers. Pure functions: raw
// payload shapes in, @kickoff/schema entities out — no DB, no fetch, so the
// recorded fixtures test them directly.
//
// Ingest gotchas handled here (spec §2, carried from the client comments):
//   - `penalty.commited` one-m spelling
//   - substitution rows carry BOTH players (`player`=off, `assist`=on)
//   - own goals derived from events (no direct stat field)
//   - second-yellow: yellow AND red both set — passes through as-is; the
//     rubric stacks them (scoring.ts), normalization must not "fix" it

import type {
  Fixture,
  FixtureStatus,
  MatchEvent,
  MatchEventType,
  PlayerMatchStats,
  PlayerPosition,
} from "@kickoff/schema";
import type { AfEvent, AfFixture, AfLineup, AfPlayerStats } from "../apiFootball";
import { teamSlug } from "../footballDataOrg";
import { canonicalFixtureId } from "../identity";
import { deriveConceded, deriveOwnGoals } from "../scoring";

/** API-Football status.short → canonical status. Unknown codes → "scheduled"
 *  is WRONG for settlement, so unknowns map to null and the caller flags for
 *  review instead of guessing. */
export function afStatus(short: string): FixtureStatus | null {
  switch (short) {
    case "TBD":
    case "NS":
      return "scheduled";
    case "1H":
    case "2H":
    case "ET":
    case "BT":
    case "P":
    case "LIVE":
      return "live";
    case "HT":
      return "ht";
    case "FT":
    case "AET":
    case "PEN":
      return "ft";
    case "PST":
      return "postponed";
    case "CANC":
    case "ABD":
    case "AWD":
    case "WO":
      return "abandoned";
    default:
      return null;
  }
}

export function normalizeAfFixture(raw: AfFixture, league = "EPL"): Fixture & { statusUnknown: boolean } {
  const kickoff = new Date(raw.fixture.date);
  const status = afStatus(raw.fixture.status.short);
  return {
    id: canonicalFixtureId(league, kickoff, raw.teams.home.name, raw.teams.away.name),
    league,
    season: raw.league.season,
    kickoff_utc: kickoff.toISOString(),
    home: { slug: teamSlug(raw.teams.home.name), name: raw.teams.home.name },
    away: { slug: teamSlug(raw.teams.away.name), name: raw.teams.away.name },
    status: status ?? "scheduled",
    source_refs: { apiFootball: raw.fixture.id },
    statusUnknown: status === null,
  };
}

/** Map one S1 event row to the canonical type, or null for rows we don't
 *  model (e.g. "Goal cancelled" VAR sub-details keep type "var"). */
export function afEventType(ev: AfEvent): MatchEventType | null {
  if (ev.type === "Goal") {
    if (ev.detail === "Own Goal") return "own_goal";
    if (ev.detail === "Penalty") return "penalty_goal";
    if (ev.detail === "Missed Penalty") return "penalty_missed";
    return "goal";
  }
  if (ev.type === "Card") {
    if (ev.detail === "Yellow Card") return "yellow";
    if (ev.detail === "Second Yellow card") return "second_yellow";
    if (ev.detail === "Red Card") return "red";
    return null;
  }
  if (ev.type === "subst") return "substitution";
  if (ev.type === "Var") return "var";
  return null;
}

export function normalizeAfEvents(
  fixtureId: string,
  homeTeamId: number,
  events: AfEvent[],
  ingestedAt: string,
): MatchEvent[] {
  const out: MatchEvent[] = [];
  for (const ev of events) {
    const type = afEventType(ev);
    if (type === null) continue;
    out.push({
      fixture_id: fixtureId,
      minute: ev.time.elapsed,
      type,
      side: ev.team.id === homeTeamId ? "home" : "away",
      player: ev.player.name,
      // S1 substitution gotcha: `player`=off, `assist`=on → canonical
      // player (off) / player_in (on).
      ...(type === "substitution" ? { player_in: ev.assist.name } : {}),
      score_after: null, // S1 events don't carry running score (S3's field)
      source: "apiFootball",
      ingested_at: ingestedAt,
    });
  }
  return out;
}

const POSITIONS: ReadonlySet<string> = new Set(["G", "D", "M", "F"]);

/**
 * Full §2.1 checklist per player. Needs the events + lineups alongside the
 * player payload because own_goals, conceded_while_on, and sub timings are
 * DERIVED — S1 has no direct fields for them.
 */
export function normalizeAfPlayers(
  fixtureId: string,
  teams: Array<{ team: { id: number; name: string }; players: AfPlayerStats[] }>,
  lineups: AfLineup[],
  events: AfEvent[],
  homeTeamId: number,
  fullTimeMinutes = 90,
): PlayerMatchStats[] {
  const conceded = deriveConceded(lineups, events, fullTimeMinutes);
  const ownGoals = deriveOwnGoals(events);

  const starters = new Set<number>();
  for (const l of lineups) for (const { player } of l.startXI) starters.add(player.id);

  // Sub timings from the on-pitch windows deriveConceded already computed.
  const windows = conceded.minutesOn;

  const out: PlayerMatchStats[] = [];
  for (const { team, players } of teams) {
    for (const p of players) {
      const s = p.statistics[0];
      if (!s) continue;
      const minutes = s.games.minutes ?? 0;
      const posRaw = s.games.position;
      const started = starters.has(p.player.id);
      const w = windows.get(p.player.id);
      out.push({
        fixture_id: fixtureId,
        player_id: p.player.id,
        player_name: p.player.name,
        team: team.id === homeTeamId ? "home" : "away",
        // Position gate: G/D/M/F only. Anything else would mis-price goals
        // (spec §2.1) — default "F" matches scoring.ts's fallback.
        position: (POSITIONS.has(posRaw ?? "") ? posRaw : "F") as PlayerPosition,
        minutes,
        started,
        sub_on_minute: !started && w ? w.from : null,
        sub_off_minute: started && w && w.to < fullTimeMinutes ? w.to : null,
        goals: s.goals.total ?? 0,
        assists: s.goals.assists ?? 0,
        own_goals: ownGoals.get(p.player.id) ?? 0,
        yellow_cards: s.cards.yellow,
        red_cards: s.cards.red,
        penalties_won: s.penalty.won ?? 0,
        // One-m "commited" — the field mapping the whole risk-log entry is about.
        penalties_conceded: s.penalty.commited ?? 0,
        penalties_saved: s.penalty.saved ?? 0,
        saves: s.goals.saves ?? 0, // lives under `goals` despite the name
        tackles: s.tackles.total ?? 0,
        shots_on_target: s.shots.on ?? 0,
        conceded_while_on: conceded.concededBy.get(p.player.id) ?? 0,
      });
    }
  }
  return out;
}
