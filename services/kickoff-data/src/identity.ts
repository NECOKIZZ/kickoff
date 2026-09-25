// Canonical fixture identity — owned by this service, never a source's id.
//
// Reconciliation across sources (spec §2): match on (league, UTC kickoff
// ±5min, normalized team slugs via the alias table). The canonical id bakes
// those same components in, so two sources reporting the same real-world
// match derive the same id without any cross-lookup — EXCEPT when kickoff
// times differ slightly between sources; resolveFixtureId handles the ±5min
// window against already-known fixtures.

import { teamSlug } from "./footballDataOrg";

export const KICKOFF_TOLERANCE_MS = 5 * 60 * 1000;

/** e.g. "epl-2026-arsenal-chelsea-202608151400" */
export function canonicalFixtureId(
  league: string,
  kickoffUtc: Date,
  homeName: string,
  awayName: string,
): string {
  const ts = kickoffUtc.toISOString().replace(/[-:T]/g, "").slice(0, 12); // YYYYMMDDHHmm
  return `${league.toLowerCase()}-${teamSlug(homeName)}-${teamSlug(awayName)}-${ts}`;
}

export interface KnownFixture {
  id: string;
  league: string;
  kickoffUtc: Date;
  homeSlug: string;
  awaySlug: string;
}

/**
 * Find the existing canonical fixture this (league, kickoff, teams) tuple
 * refers to, tolerating kickoff drift ≤5min between sources. Returns null
 * when nothing matches — caller creates a new fixture (or flags for review
 * if it matched teams but drifted >5min; that ambiguity is never guessed).
 */
export function resolveFixtureId(
  known: KnownFixture[],
  league: string,
  kickoffUtc: Date,
  homeName: string,
  awayName: string,
): string | null {
  const home = teamSlug(homeName);
  const away = teamSlug(awayName);
  for (const f of known) {
    if (f.league !== league || !sameClub(f.homeSlug, home) || !sameClub(f.awaySlug, away)) continue;
    if (Math.abs(f.kickoffUtc.getTime() - kickoffUtc.getTime()) <= KICKOFF_TOLERANCE_MS) {
      return f.id;
    }
  }
  return null;
}

/**
 * Same club under two naming styles: identical slugs, or one is the other
 * plus a suffix word ("ipswich" / "ipswich-town", "hull" / "hull-city") —
 * sources disagree on whether to include "Town"/"City". A genuinely
 * different club never matches ("man-city" vs "manchester-united").
 */
export function sameClub(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`);
}
