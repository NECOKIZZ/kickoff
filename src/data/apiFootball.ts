// API-Football (api-sports.io) client — Market B's sole data source and the
// authoritative fixture list. Free tier: 100 req/day HARD WALL (resets
// midnight UTC), ~10/min. Every request goes through the budget guard; the
// polling worker widens its cadence as the budget tightens (§12.1 circuit
// breaker) rather than discovering the wall mid-match.
//
// MOCK MODE: until API_FOOTBALL_KEY is set, requests are served from
// fixtures/ recorded payloads so the whole pipeline (scoring engine, backtest
// harness, listing flow) runs today. Shapes follow the real v3 API.

import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://v3.football.api-sports.io";

// EPL league id on API-Football (stable across seasons).
export const EPL_LEAGUE_ID = 39;

// ---------------------------------------------------------------------------
// Request budget — persisted in-process; the worker also mirrors it to the DB
// later so restarts don't forget the day's spend.
// ---------------------------------------------------------------------------

const DAILY_LIMIT = 100;
/** Widen polling when fewer than this many requests remain (§12.1). */
export const CIRCUIT_BREAKER_THRESHOLD = 15;

interface Budget {
  dayUtc: string;
  used: number;
}

let budget: Budget = { dayUtc: today(), used: 0 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function budgetState(): { used: number; remaining: number; breakerTripped: boolean } {
  if (budget.dayUtc !== today()) budget = { dayUtc: today(), used: 0 };
  const remaining = DAILY_LIMIT - budget.used;
  return { used: budget.used, remaining, breakerTripped: remaining < CIRCUIT_BREAKER_THRESHOLD };
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

export function isMockMode(): boolean {
  return !process.env.API_FOOTBALL_KEY;
}

async function apiGet(endpoint: string, params: Record<string, string>): Promise<any> {
  if (isMockMode()) return mockGet(endpoint, params);

  const state = budgetState();
  if (state.remaining <= 0) throw new Error("API-Football daily budget exhausted (100/day)");

  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY! },
  });
  budget.used += 1;

  if (!res.ok) throw new Error(`API-Football ${endpoint} → HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors && Object.keys(body.errors).length > 0)
    throw new Error(`API-Football ${endpoint} → ${JSON.stringify(body.errors)}`);
  return body;
}

async function mockGet(endpoint: string, params: Record<string, string>): Promise<any> {
  // Recorded payloads live in src/data/fixtures/<name>.json. Naming:
  //   /fixtures?ids=X            → fixtures-byid-<X>.json
  //   /fixtures?league&season&…  → fixtures-epl.json
  //   /fixtures/players?fixture= → players-<fixtureId>.json
  //   /fixtures/lineups?fixture= → lineups-<fixtureId>.json
  const dir = path.join(process.cwd(), "src/data/fixtures");
  let name: string;
  if (endpoint === "/fixtures/players") name = `players-${params.fixture}.json`;
  else if (endpoint === "/fixtures/lineups") name = `lineups-${params.fixture}.json`;
  else if (endpoint === "/fixtures" && params.ids) name = `fixtures-byid-${params.ids}.json`;
  else if (endpoint === "/fixtures") name = "fixtures-epl.json";
  else throw new Error(`no mock recorded for ${endpoint}`);
  const raw = await readFile(path.join(dir, name), "utf8");
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Typed surface — only the fields the scoring engine reads (spec §5.1).
// ---------------------------------------------------------------------------

export interface AfFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null } };
  league: { id: number; season: number; round: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
}

export interface AfPlayerStats {
  player: { id: number; name: string };
  statistics: Array<{
    games: { minutes: number | null; position: string | null; rating: string | null };
    goals: { total: number | null; assists: number | null; saves: number | null; conceded: number | null };
    cards: { yellow: number; red: number };
    penalty: {
      won: number | null;
      // ⚠️ Real API spells it "commited" (one m). Verify on a live payload
      // before mainnet (risk log #7) — mapped defensively below either way.
      commited: number | null;
      scored: number | null;
      missed: number | null;
      saved: number | null;
    };
    tackles: { total: number | null };
    shots: { total: number | null; on: number | null };
  }>;
}

export interface AfEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string; // "Normal Goal" | "Own Goal" | "Penalty" | "Yellow Card" | "Red Card" | "Substitution N"...
}

export interface AfLineupPlayer {
  player: { id: number; name: string; pos: string | null };
}

export interface AfLineup {
  team: { id: number; name: string };
  startXI: AfLineupPlayer[];
  substitutes: AfLineupPlayer[];
}

/** Upcoming/any EPL fixtures for a date window (1 request). */
export async function getEplFixtures(season: number, from?: string, to?: string): Promise<AfFixture[]> {
  const params: Record<string, string> = { league: String(EPL_LEAGUE_ID), season: String(season) };
  if (from) params.from = from;
  if (to) params.to = to;
  const body = await apiGet("/fixtures", params);
  return body.response as AfFixture[];
}

/** Batched fixture fetch — up to 20 ids in ONE request (the §4.3 bulk trick). */
export async function getFixturesByIds(ids: number[]): Promise<AfFixture[]> {
  if (ids.length === 0) return [];
  if (ids.length > 20) throw new Error("API-Football batches at most 20 fixture ids per request");
  const body = await apiGet("/fixtures", { ids: ids.join("-") });
  return body.response as AfFixture[];
}

/** Every player's full stat line for a fixture — ONE request. */
export async function getFixturePlayers(fixtureId: number): Promise<Array<{ team: { id: number; name: string }; players: AfPlayerStats[] }>> {
  const body = await apiGet("/fixtures/players", { fixture: String(fixtureId) });
  return body.response;
}

/** Fixture events (goals, cards, substitutions) — used for derived scoring. */
export async function getFixtureEvents(fixtureId: number): Promise<AfEvent[]> {
  const body = await apiGet("/fixtures", { ids: String(fixtureId) });
  // events ride along on the fixture-by-id response
  return (body.response[0]?.events ?? []) as AfEvent[];
}

/** Confirmed lineups (~15-40 min pre-kickoff) — the listing agent's gate. */
export async function getFixtureLineups(fixtureId: number): Promise<AfLineup[]> {
  const body = await apiGet("/fixtures/lineups", { fixture: String(fixtureId) });
  return body.response as AfLineup[];
}
