// S3/S4 (Flashscore) → canonical schema normalizers. Pure functions, typed
// from REAL recorded payloads (fixtures/apify/, runs of 2026-07-27).
//
// Burn-in notes baked in as behavior (spec §6):
//   - Event `type` values are heterogeneous ("goal", "yellow_card", "10"
//     with type_label "Penalty", "sub_in", "assist"). Unknown combos are
//     DROPPED, never guessed into the timeline.
//   - The recorded live run shows goal increments arriving on rows labeled
//     "Assistance" (score_after 2-0 on an assist row) — so score_after is
//     read from ANY row that carries it, while the event-type mapping stays
//     conservative. MatchState score comes from the top-level fields anyway.
//   - S4 match_date has NO timezone marker; until burn-in proves it UTC, S4
//     corroborates fixture EXISTENCE only — S1 owns kickoff times. We still
//     have to parse it to reconcile identity (±5min window absorbs drift).

import type { Fixture, FixtureStatus, MatchEvent, MatchEventType, MatchState, MatchStats, StatLine } from "@kickoff/schema";
import { teamSlug } from "../footballDataOrg";
import { canonicalFixtureId } from "../identity";
import type { FsExtractorMatch, FsLiveMatch, FsLiveStatRow } from "../flashscore";

/** "7'" → 7, "45+4'" → 49 (spec's timeline uses absolute minutes; ±2 min
 *  tolerance in burn-in diffs makes stoppage arithmetic safe). */
export function parseMinute(m: string): number | null {
  const match = /^(\d+)(?:\+(\d+))?'?$/.exec(m.trim());
  if (!match) return null;
  return Number(match[1]) + (match[2] ? Number(match[2]) : 0);
}

export function fsPeriod(period: string | null, status: string): MatchState["period"] {
  if (status === "FINISHED" || period === "Finished") return "FT";
  switch (period) {
    case "1st Half":
      return "1H";
    case "Halftime":
      return "HT";
    case "2nd Half":
      return "2H";
    case "Extra Time":
      return "ET";
    default:
      return status === "LIVE" ? "2H" : "PRE"; // conservative fallback for charts
  }
}

export function fsStatus(m: FsLiveMatch): FixtureStatus | null {
  if (m.status === "FINISHED") return "ft";
  if (m.status === "LIVE") return m.match_period === "Halftime" ? "ht" : "live";
  if (m.status === "SCHEDULED" || m.status === "NOT_STARTED") return "scheduled";
  if (m.status === "POSTPONED") return "postponed";
  if (m.status === "CANCELLED" || m.status === "ABANDONED") return "abandoned";
  return null;
}

/** Conservative event mapping — (type, type_label) → canonical, else null. */
export function fsEventType(type: string, label: string): MatchEventType | null {
  if (type === "goal") return "goal";
  if (type === "own_goal" || label === "Own Goal") return "own_goal";
  if (label === "Penalty") return "penalty_goal";
  if (label === "Missed Penalty" || label === "Penalty Missed") return "penalty_missed";
  if (type === "yellow_card") return "yellow";
  if (label === "Second Yellow Card" || label === "Yellow Card / Red Card") return "second_yellow";
  if (type === "red_card") return "red";
  if (type === "sub_in" || type === "sub_out") return "substitution";
  return null; // "assist" rows and unknown codes: not timeline events
}

const EPL_S3_LEAGUE = "ENGLAND: Premier League";

export function isEplLive(m: FsLiveMatch): boolean {
  return m.league === EPL_S3_LEAGUE;
}

export function normalizeFsLiveFixture(m: FsLiveMatch, league = "EPL"): (Fixture & { statusUnknown: boolean }) | null {
  const status = fsStatus(m);
  const kickoff = new Date(m.kickoff_time);
  if (Number.isNaN(kickoff.getTime())) return null;
  return {
    id: canonicalFixtureId(league, kickoff, m.home_team, m.away_team),
    league,
    season: kickoff.getUTCMonth() >= 6 ? kickoff.getUTCFullYear() : kickoff.getUTCFullYear() - 1,
    kickoff_utc: kickoff.toISOString(),
    home: { slug: teamSlug(m.home_team), name: m.home_team },
    away: { slug: teamSlug(m.away_team), name: m.away_team },
    status: status ?? "scheduled",
    source_refs: { flashscore: m.match_id },
    statusUnknown: status === null,
  };
}

export function normalizeFsMatchState(fixtureId: string, m: FsLiveMatch, fetchedAt: string): MatchState {
  return {
    fixture_id: fixtureId,
    minute: m.match_minute,
    period: fsPeriod(m.match_period, m.status),
    score: { home: m.home_score ?? 0, away: m.away_score ?? 0 },
    last_event_at: m.scraped_at ?? fetchedAt,
  };
}

export function normalizeFsEvents(fixtureId: string, m: FsLiveMatch, ingestedAt: string): MatchEvent[] {
  const out: MatchEvent[] = [];
  for (const ev of m.events ?? []) {
    const type = fsEventType(ev.type, ev.type_label);
    if (type === null) continue;
    const minute = parseMinute(ev.minute);
    if (minute === null) continue;
    out.push({
      fixture_id: fixtureId,
      minute,
      type,
      side: ev.side,
      player: ev.player_name,
      score_after:
        ev.home_score_after != null && ev.away_score_after != null
          ? { home: ev.home_score_after, away: ev.away_score_after }
          : null,
      source: "flashscore",
      ingested_at: ingestedAt,
    });
  }
  return out;
}

/** Chart-lane stat lines from S3's per-period rows. Only the StatLine
 *  fields; everything else in the 115-row payload stays in the raw archive. */
export function normalizeFsStats(fixtureId: string, m: FsLiveMatch): MatchStats[] {
  const byPeriod = new Map<MatchStats["period"], { home: StatLine; away: StatLine }>();
  const periodKey = (p: FsLiveStatRow["period"]): MatchStats["period"] | null =>
    p === "Match" ? "FULL" : p === "1st Half" ? "1H" : p === "2nd Half" ? "2H" : null;

  const num = (v: string): number | undefined => {
    const n = Number(v.replace("%", ""));
    return Number.isFinite(n) ? n : undefined;
  };

  for (const row of m.statistics ?? []) {
    const period = periodKey(row.period);
    if (!period) continue;
    if (!byPeriod.has(period)) byPeriod.set(period, { home: {}, away: {} });
    const { home, away } = byPeriod.get(period)!;
    const set = (k: keyof StatLine) => {
      home[k] = num(row.home_value);
      away[k] = num(row.away_value);
    };
    switch (row.stat_name) {
      case "Expected goals (xG)":
        set("xg");
        break;
      case "Ball possession":
        set("possession_pct");
        break;
      case "Total shots":
        set("shots");
        break;
      case "Shots on target":
        set("shots_on_target");
        break;
      case "Corner kicks":
        set("corners");
        break;
      case "Fouls":
        set("fouls");
        break;
    }
  }

  return [...byPeriod.entries()].map(([period, sides]) => ({
    fixture_id: fixtureId,
    period,
    home: sides.home,
    away: sides.away,
  }));
}

// ---------------------------------------------------------------------------
// S4 — listing redundancy only
// ---------------------------------------------------------------------------

export function s4Status(s: string): FixtureStatus | null {
  if (s === "scheduled") return "scheduled";
  if (s === "live") return "live";
  if (s === "finished") return "ft";
  if (s === "postponed") return "postponed";
  if (s === "cancelled" || s === "abandoned") return "abandoned";
  return null;
}

export function isEplExtractor(m: FsExtractorMatch): boolean {
  return m.category_name === "England" && m.tournament_name === "Premier League";
}

export function normalizeFsExtractorMatch(
  m: FsExtractorMatch,
  league = "EPL",
): (Fixture & { statusUnknown: boolean }) | null {
  // No timezone marker on match_date — parse AS UTC for identity resolution
  // (±5min window), but S4 never overwrites kickoff times (upsert keeps the
  // existing row's kickoff; S4 only merges its source_ref + status).
  const kickoff = new Date(m.match_date.replace(" ", "T") + "Z");
  if (Number.isNaN(kickoff.getTime())) return null;
  const status = s4Status(m.match_status);
  return {
    id: canonicalFixtureId(league, kickoff, m.home_team_name, m.away_team_name),
    league,
    season: kickoff.getUTCMonth() >= 6 ? kickoff.getUTCFullYear() : kickoff.getUTCFullYear() - 1,
    kickoff_utc: kickoff.toISOString(),
    home: { slug: teamSlug(m.home_team_name), name: m.home_team_name },
    away: { slug: teamSlug(m.away_team_name), name: m.away_team_name },
    status: status ?? "scheduled",
    source_refs: { flashscore: m.match_id },
    statusUnknown: status === null,
  };
}
