// S2 (football-data.org) → canonical schema normalizers. Pure functions.
// S2 is the slow-but-honest confirmer: fixtures + final scores only — it
// never produces events, player stats, or live state.

import type { Fixture, FixtureStatus } from "@kickoff/schema";
import type { FdMatch } from "../footballDataOrg";
import { teamSlug } from "../footballDataOrg";
import { canonicalFixtureId } from "../identity";

/** football-data.org status → canonical. Unknown → null, flag for review. */
export function fdStatus(status: string): FixtureStatus | null {
  switch (status) {
    case "SCHEDULED":
    case "TIMED":
      return "scheduled";
    case "IN_PLAY":
      return "live";
    case "PAUSED":
      return "ht";
    case "FINISHED":
      return "ft";
    case "POSTPONED":
    case "SUSPENDED":
      return "postponed";
    case "CANCELLED":
    case "AWARDED":
      return "abandoned";
    default:
      return null;
  }
}

export function normalizeFdMatch(
  raw: FdMatch,
  league = "EPL",
  season?: number,
): Fixture & { statusUnknown: boolean; finalScore: { home: number; away: number } | null } {
  const kickoff = new Date(raw.utcDate);
  const status = fdStatus(raw.status);
  const ft = raw.score.fullTime;
  return {
    id: canonicalFixtureId(league, kickoff, raw.homeTeam.name, raw.awayTeam.name),
    league,
    // S2's matches payload doesn't carry season per-row; caller passes it or
    // we derive from kickoff (EPL season = year the season starts in).
    season: season ?? (kickoff.getUTCMonth() >= 6 ? kickoff.getUTCFullYear() : kickoff.getUTCFullYear() - 1),
    kickoff_utc: kickoff.toISOString(),
    home: { slug: teamSlug(raw.homeTeam.name), name: raw.homeTeam.name },
    away: { slug: teamSlug(raw.awayTeam.name), name: raw.awayTeam.name },
    status: status ?? "scheduled",
    source_refs: { fdorg: raw.id },
    statusUnknown: status === null,
    // The settlement voter's payload: only meaningful once status is "ft".
    finalScore: ft.home != null && ft.away != null ? { home: ft.home, away: ft.away } : null,
  };
}
