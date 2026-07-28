// kickoff-data consumer client — the markets app's ONLY window into football
// data (spec §3). Thin typed fetch over /v1; compile-time dependency is
// @kickoff/schema alone. No football API is ever called from this app.

import type {
  Fixture,
  MatchEvent,
  MatchState,
  MatchStats,
  PlayerMatchStats,
  SettlementPending,
  SettlementSnapshot,
  Sourced,
} from "@kickoff/schema";

const BASE = process.env.KICKOFF_DATA_URL ?? "http://localhost:8787";
const KEY = process.env.KICKOFF_DATA_API_KEY;
const ADMIN_KEY = process.env.KICKOFF_DATA_ADMIN_KEY;

export class DataServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DataServiceError";
  }
}

async function get<T>(path: string, admin = false): Promise<T> {
  const key = admin ? ADMIN_KEY : KEY;
  if (!key) throw new DataServiceError(500, "KICKOFF_DATA_API_KEY not configured");
  const res = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${key}` },
    // Fixture data is time-sensitive; the service already caches upstream.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new DataServiceError(res.status, body.error ?? `kickoff-data ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listFixtures(params: { league?: string; from?: string; to?: string } = {}) {
  const q = new URLSearchParams();
  if (params.league) q.set("league", params.league);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  const qs = q.toString();
  return get<Array<Sourced<Fixture>>>(`/v1/fixtures${qs ? `?${qs}` : ""}`);
}

export const getFixture = (id: string) => get<Sourced<Fixture>>(`/v1/fixtures/${encodeURIComponent(id)}`);
export const getMatchState = (id: string) => get<Sourced<MatchState>>(`/v1/fixtures/${encodeURIComponent(id)}/state`);
export const getMatchEvents = (id: string) =>
  get<Sourced<MatchEvent[]>>(`/v1/fixtures/${encodeURIComponent(id)}/events`);
export const getMatchStats = (id: string) =>
  get<Sourced<MatchStats[]>>(`/v1/fixtures/${encodeURIComponent(id)}/stats`);
export const getPlayerStats = (id: string) =>
  get<Sourced<PlayerMatchStats[]>>(`/v1/fixtures/${encodeURIComponent(id)}/players`);

/** 200 → frozen snapshot; 409 → pending/disputed detail. Anything else throws. */
export async function getSettlement(
  fixtureId: string,
): Promise<{ frozen: true; snapshot: SettlementSnapshot } | { frozen: false; pending: SettlementPending }> {
  if (!KEY) throw new DataServiceError(500, "KICKOFF_DATA_API_KEY not configured");
  const res = await fetch(`${BASE}/v1/settlement/${encodeURIComponent(fixtureId)}`, {
    headers: { authorization: `Bearer ${KEY}` },
    cache: "no-store",
  });
  if (res.status === 200) return { frozen: true, snapshot: (await res.json()) as SettlementSnapshot };
  if (res.status === 409) return { frozen: false, pending: (await res.json()) as SettlementPending };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new DataServiceError(res.status, body.error ?? `kickoff-data ${res.status}`);
}

/** Admin: replay a completed fixture through the data pipeline (S1 numeric id). */
export async function runBacktest(s1FixtureId: number): Promise<unknown> {
  if (!ADMIN_KEY) throw new DataServiceError(500, "KICKOFF_DATA_ADMIN_KEY not configured");
  const res = await fetch(`${BASE}/v1/admin/backtest/${s1FixtureId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${ADMIN_KEY}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new DataServiceError(res.status, body.error ?? `kickoff-data ${res.status}`);
  }
  return res.json();
}
