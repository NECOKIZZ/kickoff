// FPL client — the official Fantasy Premier League API. Standalone authority
// for player points (player perps settle on official FPL points by decision,
// 2026-08-01): the EPL operates FPL, so the market IS this feed. Documented
// exception to the no-single-source rule — scoreline settlement is untouched.
//
// Free, unauthenticated, no documented rate limit — we stay polite anyway
// (one /event/{gw}/live call covers every player in the league).
//
// MOCK MODE inverts the "key unset → mock" convention since FPL has no key:
// live only when KICKOFF_DATA_FPL_LIVE=1|true, recorded payloads otherwise —
// vitest/CI/fresh checkouts stay network-free by default.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fixturesDir } from "./mockDir";
import { archiveRaw } from "./archive";
import { mirrorSpend } from "./budget";
import { log } from "./log";

const BASE = "https://fantasy.premierleague.com/api";

// FPL 403s default fetch user agents sometimes — send a real-looking one.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export function isMockMode(): boolean {
  const v = process.env.KICKOFF_DATA_FPL_LIVE;
  return v !== "1" && v !== "true";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function mockFileFor(endpoint: string): string {
  if (endpoint.startsWith("/bootstrap-static")) return "fpl-bootstrap.json";
  if (/^\/event\/\d+\/live/.test(endpoint)) return "fpl-event-live.json";
  if (endpoint.startsWith("/fixtures")) return "fpl-fixtures.json";
  return `fpl-${endpoint.replaceAll("/", "_")}.json`;
}

async function apiGet(endpoint: string): Promise<any> {
  if (isMockMode()) {
    const raw = await readFile(path.join(fixturesDir(), mockFileFor(endpoint)), "utf8");
    return JSON.parse(raw);
  }
  let res: Response;
  try {
    res = await fetch(BASE + endpoint, { headers: { "User-Agent": USER_AGENT } });
  } catch (e) {
    log.error("fpl", "fetch failed", { endpoint, error: e as Error });
    throw e;
  }
  if (res.status === 429) {
    log.warn("fpl", "rate limited", { status: 429, endpoint });
    throw new Error(`fpl ${endpoint} → HTTP 429 (retried next tick)`);
  }
  if (!res.ok) {
    log.error("fpl", "http error", { status: res.status, endpoint });
    throw new Error(`fpl ${endpoint} → HTTP ${res.status}`);
  }
  const body = await res.json();
  log.debug("fpl", "ok", { endpoint });
  // No hard budget wall (free API) — the mirror gives politeness observability.
  mirrorSpend("fpl", today());
  // Archive BEFORE normalization (spec §4) — the settlement evidence trail.
  await archiveRaw("fpl", endpoint, body);
  return body;
}

// ---------------------------------------------------------------------------
// Raw shapes — only the fields we read. FPL ids reset each season.
// ---------------------------------------------------------------------------

export interface FplEvent {
  id: number; // gameweek 1..38
  name: string; // "Gameweek 12"
  deadline_time: string; // ISO-8601
  is_current: boolean;
  /** All fixtures finished AND bonus added. */
  finished: boolean;
  /** FPL has verified the data — points immutable from here (settlement gate). */
  data_checked: boolean;
}

export interface FplTeam {
  id: number;
  name: string; // "Nott'm Forest", "Man City", ...
  short_name: string;
}

export interface FplElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number; // FplTeam.id
  element_type: number; // 1 GKP, 2 DEF, 3 MID, 4 FWD
  total_points: number; // season total
}

export interface FplBootstrap {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
}

export interface FplExplainStat {
  identifier: string; // "minutes" | "goals_scored" | "bonus" | ...
  points: number;
  value: number;
}

export interface FplLiveElement {
  id: number; // element id
  stats: Record<string, number> & {
    minutes: number;
    total_points: number;
    bonus: number;
  };
  /** Per-fixture breakdown — two entries on double gameweeks. */
  explain: Array<{ fixture: number; stats: FplExplainStat[] }>;
}

export interface FplFixture {
  id: number;
  event: number | null; // gameweek; null when unscheduled (postponed)
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  started: boolean;
  /** Full time reached, bonus NOT yet in. Never a settlement gate. */
  finished_provisional: boolean;
  /** Bonus added — the provisional-settlement gate. */
  finished: boolean;
  /** Running score while live; the final score once finished_provisional. */
  team_h_score: number | null;
  team_a_score: number | null;
  /** Minutes played so far (0 before kickoff, ~90 at full time). */
  minutes: number;
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/** Players + teams + gameweeks. Also the ONLY place data_checked lives, so
 *  this doubles as the finality watch. */
export async function getBootstrap(): Promise<FplBootstrap> {
  return (await apiGet("/bootstrap-static/")) as FplBootstrap;
}

/** Every player's live points for one gameweek — a single call. */
export async function getEventLive(gw: number): Promise<{ elements: FplLiveElement[] }> {
  return (await apiGet(`/event/${gw}/live/`)) as { elements: FplLiveElement[] };
}

/** FPL's fixture list, optionally scoped to one gameweek. */
export async function getFplFixtures(gw?: number): Promise<FplFixture[]> {
  const endpoint = gw !== undefined ? `/fixtures/?event=${gw}` : "/fixtures/";
  return (await apiGet(endpoint)) as FplFixture[];
}
