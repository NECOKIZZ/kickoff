// football-data.org client — Market A's settlement source + cross-check.
// Free tier: 12 competitions (EPL included), 10 req/min, NO daily cap.
// Scores are delayed, which is fine — Market A settles at full time only.
//
// MOCK MODE mirrors apiFootball.ts: recorded payloads until the token lands.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fixturesDir } from "./mockDir";
import { archiveRaw } from "./archive";
import { log } from "./log";

const BASE = "https://api.football-data.org/v4";

/** EPL competition code on football-data.org. */
export const EPL_CODE = "PL";

export function isMockMode(): boolean {
  return !process.env.FOOTBALL_DATA_ORG_KEY;
}

async function apiGet(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  if (isMockMode()) {
    const dir = fixturesDir();
    const name = endpoint.startsWith("/competitions") ? "fdorg-matches.json" : `fdorg-${endpoint.replaceAll("/", "_")}.json`;
    const raw = await readFile(path.join(dir, name), "utf8");
    return JSON.parse(raw);
  }
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_ORG_KEY! } });
  } catch (e) {
    log.error("fdorg", "fetch failed", { endpoint, error: e as Error });
    throw e;
  }
  if (res.status === 429) {
    log.warn("fdorg", "rate limited", { status: 429, endpoint });
    throw new Error(`football-data.org ${endpoint} → HTTP 429 (10/min limit; retried next tick)`);
  }
  if (!res.ok) {
    log.error("fdorg", "http error", { status: res.status, endpoint });
    throw new Error(`football-data.org ${endpoint} → HTTP ${res.status}`);
  }
  const body = await res.json();
  log.debug("fdorg", "ok", { endpoint });
  // Archive BEFORE normalization (spec §4) — evidence trail for disputes.
  await archiveRaw("fdorg", `${endpoint}?${new URLSearchParams(params)}`, body);
  return body;
}

export interface FdMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED | ...
  homeTeam: { id: number; name: string; shortName: string | null };
  awayTeam: { id: number; name: string; shortName: string | null };
  score: {
    fullTime: { home: number | null; away: number | null };
  };
}

/** All EPL matches in a date window — one request covers the whole slate. */
export async function getEplMatches(dateFrom?: string, dateTo?: string): Promise<FdMatch[]> {
  const params: Record<string, string> = {};
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;
  const body = await apiGet(`/competitions/${EPL_CODE}/matches`, params);
  return body.matches as FdMatch[];
}

// ---------------------------------------------------------------------------
// Cross-provider fixture matching (spec §10.1): match by (date, home, away),
// NEVER by id — the two providers use unrelated id spaces. Team names differ
// ("Man United" vs "Manchester United FC") so both sides normalize through
// the same slug.
// ---------------------------------------------------------------------------

const TEAM_ALIASES: Record<string, string> = {
  // slug-level aliases: alias → canonical slug
  "man-united": "manchester-united",
  "man-utd": "manchester-united",
  "man-city": "manchester-city",
  "spurs": "tottenham",
  "tottenham-hotspur": "tottenham",
  "wolverhampton-wanderers": "wolves",
  "wolverhampton": "wolves",
  "brighton-hove-albion": "brighton",
  "brighton-and-hove-albion": "brighton",
  "west-ham-united": "west-ham",
  "newcastle-united": "newcastle",
  "nottingham-forest": "nottm-forest",
  "nott-m-forest": "nottm-forest", // FPL renders it "Nott'm Forest"
  "leeds-united": "leeds",
  "afc-bournemouth": "bournemouth",
};

/** Normalize a team name from either provider to a canonical slug. */
export function teamSlug(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/\b(fc|afc|cf)\b/g, "") // strip club suffixes
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return TEAM_ALIASES[s] ?? s;
}

/** Key for cross-provider matching: UTC date + canonical team slugs. */
export function fixtureKey(utcDate: string, home: string, away: string): string {
  return `${utcDate.slice(0, 10)}:${teamSlug(home)}:${teamSlug(away)}`;
}
