// FPL → canonical/DB-row normalizers. Pure functions.
// FPL is gameweek-scoped in element-id space; these produce Gameweek /
// PlayerGwPoints canonical types plus row shapes for the fpl_* tables.

import type { Gameweek, PlayerGwPoints, PlayerPosition } from "@kickoff/schema";
import type { FplBootstrap, FplFixture, FplLiveElement } from "../fpl";
import { teamSlug } from "../footballDataOrg";

/** element_type 1..4 → canonical position. Unknown → "M" is never guessed;
 *  FPL has exactly four types, so anything else throws loudly. */
export function fplPosition(elementType: number): PlayerPosition {
  switch (elementType) {
    case 1:
      return "G";
    case 2:
      return "D";
    case 3:
      return "M";
    case 4:
      return "F";
    default:
      throw new Error(`unknown FPL element_type ${elementType}`);
  }
}

/** FPL team id → canonical slug, through the shared alias table
 *  ("Nott'm Forest" → nottm-forest, "Man City" → manchester-city, ...). */
export function fplTeamSlugs(bootstrap: FplBootstrap): Map<number, string> {
  const map = new Map<number, string>();
  for (const t of bootstrap.teams) map.set(t.id, teamSlug(t.name));
  return map;
}

export function normalizeFplGameweeks(b: FplBootstrap, season: number): Gameweek[] {
  return b.events.map((e) => ({
    id: e.id,
    season,
    name: e.name,
    deadline_utc: new Date(e.deadline_time).toISOString(),
    is_current: e.is_current,
    finished: e.finished,
    data_checked: e.data_checked,
  }));
}

/** Row shape for fpl_players. */
export interface FplPlayerRow {
  season: number;
  elementId: number;
  webName: string;
  fullName: string;
  teamSlug: string;
  position: PlayerPosition;
}

export function normalizeFplPlayers(b: FplBootstrap, season: number): FplPlayerRow[] {
  const slugs = fplTeamSlugs(b);
  return b.elements.map((el) => ({
    season,
    elementId: el.id,
    webName: el.web_name,
    fullName: `${el.first_name} ${el.second_name}`.trim(),
    teamSlug: slugs.get(el.team) ?? `fpl-team-${el.team}`,
    position: fplPosition(el.element_type),
  }));
}

/** Row shape for fpl_fixtures (reconciliation fields filled at ingest). */
export interface FplFixtureRow {
  season: number;
  fplId: number;
  gw: number | null;
  kickoffUtc: Date | null;
  homeSlug: string;
  awaySlug: string;
  started: boolean;
  finishedProvisional: boolean;
  finished: boolean;
}

export function normalizeFplFixtures(
  fx: FplFixture[],
  slugs: Map<number, string>,
  season: number,
): FplFixtureRow[] {
  return fx.map((f) => ({
    season,
    fplId: f.id,
    gw: f.event,
    kickoffUtc: f.kickoff_time ? new Date(f.kickoff_time) : null,
    homeSlug: slugs.get(f.team_h) ?? `fpl-team-${f.team_h}`,
    awaySlug: slugs.get(f.team_a) ?? `fpl-team-${f.team_a}`,
    started: f.started,
    finishedProvisional: f.finished_provisional,
    finished: f.finished,
  }));
}

/** Live points → canonical PlayerGwPoints. Player identity (name/team/pos)
 *  joins in from the bootstrap-fed fpl_players rows; elements missing from
 *  the map still produce a row (points must never be dropped) with fallback
 *  identity fields. Double gameweeks: stats are already aggregated by FPL
 *  across the explain entries — total_points is the gameweek total. */
export function normalizeFplLive(
  gw: number,
  season: number,
  elements: FplLiveElement[],
  players: Map<number, { webName: string; teamSlug: string; position: PlayerPosition }>,
): PlayerGwPoints[] {
  return elements.map((el) => {
    const p = players.get(el.id);
    return {
      gw,
      season,
      element_id: el.id,
      player_name: p?.webName ?? `element-${el.id}`,
      team_slug: p?.teamSlug ?? "unknown",
      position: p?.position ?? "M",
      total_points: el.stats.total_points,
      minutes: el.stats.minutes,
      bonus: el.stats.bonus,
      provisional: true, // flipped only when the gameweek's data_checked lands
      stats: { ...el.stats },
    };
  });
}
