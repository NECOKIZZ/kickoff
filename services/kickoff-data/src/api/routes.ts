// Consumer API /v1 — pure request handling (spec §3). No HTTP, no DB here:
// handlers take an ApiStore + a plain ApiRequest and return {status, body},
// so the whole surface is testable with a fake store (same pattern as the
// pure planner). server.ts owns the socket, store.ts owns Drizzle.
//
// Read-only for the markets app, plus ONE admin write (settlement override).
// Every 200 carries source / fetched_at / staleness_seconds (Sourced<T>) so
// the app can render "as of 30s ago" honestly.

import type {
  Fixture,
  MatchEvent,
  MatchState,
  MatchStats,
  PlayerMatchStats,
  SettlementPending,
  SettlementSnapshot,
  SourceId,
  Sourced,
} from "@kickoff/schema";

// ---------------------------------------------------------------------------
// Store contract — everything routes need from the DB, already shaped as
// canonical entities + the metadata the Sourced<T> wrapper needs.
// ---------------------------------------------------------------------------

/** An entity plus where/when it came from (wrapper inputs). */
export interface Stamped<T> {
  data: T;
  source: SourceId;
  fetchedAt: Date;
}

export interface FixtureFilter {
  league?: string;
  from?: Date;
  to?: Date;
}

/** Latest settlement snapshot row, whatever its status. */
export interface SnapshotRow {
  status: "pending" | "provisional" | "frozen" | "disputed";
  snapshot: SettlementSnapshot | null; // non-null iff status === "frozen"
  votesCollected: number;
  freezesAt: Date | null;
}

export interface ApiStore {
  listFixtures(filter: FixtureFilter): Promise<Array<Stamped<Fixture>>>;
  getFixture(id: string): Promise<Stamped<Fixture> | null>;
  getMatchState(fixtureId: string): Promise<Stamped<MatchState> | null>;
  getMatchEvents(fixtureId: string): Promise<Stamped<MatchEvent[]> | null>;
  getMatchStats(fixtureId: string): Promise<Stamped<MatchStats[]> | null>;
  getPlayerStats(fixtureId: string): Promise<Stamped<PlayerMatchStats[]> | null>;
  getLatestSnapshot(fixtureId: string): Promise<SnapshotRow | null>;
  /** Insert version N+1 with quorum_rule "admin-override"; returns it frozen. */
  insertAdminOverride(
    fixtureId: string,
    outcome: { home: number; away: number },
    reason: string,
  ): Promise<SettlementSnapshot>;
}

// ---------------------------------------------------------------------------
// Request/response shapes the server adapts to/from node:http
// ---------------------------------------------------------------------------

export interface ApiRequest {
  method: string;
  /** Path only, no query string, e.g. "/v1/fixtures/epl-2026-.../state". */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>; // lower-cased keys
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ApiConfig {
  /** Markets-app key — required on every route. Fail closed if unset. */
  apiKey: string | undefined;
  /** Separate key for POST /v1/admin/* — never the same as apiKey. */
  adminKey: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourced<T>(s: Stamped<T>, now: Date): Sourced<T> {
  return {
    data: s.data,
    source: s.source,
    fetched_at: s.fetchedAt.toISOString(),
    staleness_seconds: Math.max(0, Math.floor((now.getTime() - s.fetchedAt.getTime()) / 1000)),
  };
}

const err = (status: number, message: string): ApiResponse => ({ status, body: { error: message } });

function bearerKey(req: ApiRequest): string | null {
  const auth = req.headers["authorization"];
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return req.headers["x-api-key"] ?? null;
}

function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Handle one request. `now` is injected for staleness math (tests pin it).
 * Auth: markets-app key on everything; admin key ADDITIONALLY required on
 * /v1/admin/*. Unset keys fail closed — no key configured means no access,
 * never open access.
 */
export async function handleRequest(
  store: ApiStore,
  config: ApiConfig,
  req: ApiRequest,
  now: Date = new Date(),
): Promise<ApiResponse> {
  const segments = req.path.split("/").filter(Boolean); // ["v1", "fixtures", ...]
  if (segments[0] !== "v1") return err(404, "not found");

  const key = bearerKey(req);
  if (segments[1] === "admin") {
    if (!config.adminKey || key !== config.adminKey) return err(401, "unauthorized");
  } else {
    if (!config.apiKey || key !== config.apiKey) return err(401, "unauthorized");
  }

  // GET /v1/fixtures?league=&from=&to=
  if (req.method === "GET" && segments[1] === "fixtures" && segments.length === 2) {
    const rows = await store.listFixtures({
      league: req.query.league,
      from: parseDate(req.query.from),
      to: parseDate(req.query.to),
    });
    return { status: 200, body: rows.map((r) => sourced(r, now)) };
  }

  // GET /v1/fixtures/:id[/state|/events|/stats|/players]
  if (req.method === "GET" && segments[1] === "fixtures" && segments.length >= 3) {
    const id = decodeURIComponent(segments[2]);
    const sub = segments[3];

    if (segments.length === 3) {
      const row = await store.getFixture(id);
      return row ? { status: 200, body: sourced(row, now) } : err(404, "fixture not found");
    }

    const lane: Promise<Stamped<unknown> | null> | null =
      sub === "state"
        ? store.getMatchState(id)
        : sub === "events"
          ? store.getMatchEvents(id)
          : sub === "stats"
            ? store.getMatchStats(id)
            : sub === "players"
              ? store.getPlayerStats(id)
              : null;
    if (!lane || segments.length > 4) return err(404, "not found");

    const row = await lane;
    // Distinguish "unknown fixture" from "known fixture, no data yet": the
    // store returns null only when the fixture itself doesn't exist.
    return row ? { status: 200, body: sourced(row, now) } : err(404, "fixture not found");
  }

  // GET /v1/settlement/:fixtureId → 200 frozen snapshot | 409 pending/disputed
  if (req.method === "GET" && segments[1] === "settlement" && segments.length === 3) {
    const fixtureId = decodeURIComponent(segments[2]);
    const fixture = await store.getFixture(fixtureId);
    if (!fixture) return err(404, "fixture not found");

    const snap = await store.getLatestSnapshot(fixtureId);
    if (snap?.status === "frozen" && snap.snapshot) {
      return { status: 200, body: snap.snapshot };
    }
    const pending: SettlementPending = {
      status: snap?.status === "disputed" ? "disputed" : snap?.status === "provisional" ? "provisional" : "pending",
      votes_collected: snap?.votesCollected ?? 0,
      ...(snap?.freezesAt ? { freezes_at: snap.freezesAt.toISOString() } : {}),
    };
    return { status: 409, body: pending };
  }

  // POST /v1/admin/settlement/:fixtureId/override
  if (
    req.method === "POST" &&
    segments[1] === "admin" &&
    segments[2] === "settlement" &&
    segments[4] === "override" &&
    segments.length === 5
  ) {
    const fixtureId = decodeURIComponent(segments[3]);
    const body = req.body as { home?: unknown; away?: unknown; reason?: unknown } | undefined;
    const home = body?.home;
    const away = body?.away;
    const reason = body?.reason;
    if (
      !Number.isInteger(home) ||
      !Number.isInteger(away) ||
      (home as number) < 0 ||
      (away as number) < 0 ||
      typeof reason !== "string" ||
      reason.trim().length === 0
    ) {
      return err(400, "body must be {home: int>=0, away: int>=0, reason: non-empty string}");
    }
    const fixture = await store.getFixture(fixtureId);
    if (!fixture) return err(404, "fixture not found");

    const snapshot = await store.insertAdminOverride(
      fixtureId,
      { home: home as number, away: away as number },
      reason.trim(),
    );
    return { status: 200, body: snapshot };
  }

  return err(404, "not found");
}
