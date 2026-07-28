// S5 — Football Super Fast Data (Apify, macheta). Settlement TIE-BREAKER
// ONLY (spec §1): never scheduled, never charts, never listing. Invoked once
// per fixture when S1/S2(/S3) all voted and disagree.
//
// The actor is untyped until its cheap burn-in test run (spec §6) records a
// real payload; until then this surface is deliberately defensive — it
// extracts (home team, away team, final score) from the common field names
// observed in the actor's README and returns null rather than guessing.
//
// Mock mode mirrors the other Apify clients: fixtures/apify/s5-sample.json.

import { runActor } from "./apify";
import { teamSlug } from "./footballDataOrg";

export const S5_ACTOR = "macheta~football-super-fast-data";

export interface S5Score {
  homeSlug: string;
  awaySlug: string;
  score: { home: number; away: number };
}

/** Pull a final scoreline out of one S5 item, or null if the shape doesn't
 *  carry an unambiguous finished-match score. */
export function extractS5Score(item: Record<string, unknown>): S5Score | null {
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
    return null;
  };

  const home = str(item.home_team) ?? str(item.homeTeam) ?? str((item.home as Record<string, unknown>)?.name);
  const away = str(item.away_team) ?? str(item.awayTeam) ?? str((item.away as Record<string, unknown>)?.name);
  if (!home || !away) return null;

  let h = num(item.home_score) ?? num(item.homeScore);
  let a = num(item.away_score) ?? num(item.awayScore);
  // "2-1" / "2:1" combined-score fallback.
  if (h === null || a === null) {
    const s = str(item.score) ?? str(item.result);
    const m = s?.match(/^(\d+)\s*[-:]\s*(\d+)$/);
    if (m) {
      h = Number(m[1]);
      a = Number(m[2]);
    }
  }
  if (h === null || a === null) return null;

  return { homeSlug: teamSlug(home), awaySlug: teamSlug(away), score: { home: h, away: a } };
}

/** Run the actor and find the finished match for (homeSlug, awaySlug).
 *  Returns null when S5 can't supply an unambiguous answer — the lane then
 *  goes disputed rather than trusting a fuzzy match. */
export async function getTiebreakScore(
  homeSlug: string,
  awaySlug: string,
): Promise<{ home: number; away: number } | null> {
  const items = (await runActor(
    S5_ACTOR,
    { league: "premier-league" },
    { mockFile: "s5-sample.json", source: "fsfd" },
  )) as Array<Record<string, unknown>>;

  for (const item of items) {
    const s = extractS5Score(item);
    if (s && s.homeSlug === homeSlug && s.awaySlug === awaySlug) return s.score;
  }
  return null;
}
