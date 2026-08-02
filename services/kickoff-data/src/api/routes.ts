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
  Gameweek,
  MatchEvent,
  MatchState,
  MatchStats,
  PlayerGwPoints,
  PlayerMatchStats,
  PlayerPointsPending,
  PlayerPointsSettlement,
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

/** Latest player-points settlement row for a gameweek, whatever its status. */
export interface PlayerPointsSnapshotRow {
  status: "pending" | "provisional" | "frozen" | "disputed";
  settlement: PlayerPointsSettlement | null; // non-null iff status === "frozen"
  dataChecked: boolean;
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
  /** Replay a completed fixture through the pipeline (admin dashboard button).
   *  Takes S1's numeric id — backtest is a source-level tool, pre-reconciliation. */
  runBacktest(s1FixtureId: number): Promise<unknown>;

  // --- FPL lane (player perps settle on official FPL points) ---
  listGameweeks(season?: number): Promise<Stamped<Gameweek[]>>;
  getGameweek(gw: number, season?: number): Promise<Stamped<Gameweek> | null>;
  /** All players' points for one gameweek; null = unknown gameweek. */
  getGwPoints(gw: number, season?: number): Promise<Stamped<PlayerGwPoints[]> | null>;
  /** One player's points for one gameweek; null = no row. */
  getPlayerGwPoints(elementId: number, gw: number, season?: number): Promise<Stamped<PlayerGwPoints> | null>;
  /** Latest player-points settlement; null = unknown gameweek. */
  getPlayerPointsSnapshot(gw: number, season?: number): Promise<PlayerPointsSnapshotRow | null>;
  /** Insert frozen version N+1 (the correction escape hatch — FPL rarely
   *  revises past data_checked, but when it does the admin records it here). */
  insertPlayerPointsOverride(
    gw: number,
    points: Array<{ element_id: number; total_points: number }>,
    reason: string,
    season?: number,
  ): Promise<PlayerPointsSettlement>;
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

  // GET /v1/gameweeks[?season=]
  if (req.method === "GET" && segments[1] === "gameweeks" && segments.length === 2) {
    const season = req.query.season ? Number(req.query.season) : undefined;
    if (season !== undefined && !Number.isInteger(season)) return err(400, "invalid season");
    const rows = await store.listGameweeks(season);
    return { status: 200, body: sourced(rows, now) };
  }

  // GET /v1/gameweeks/:gw[/points|/settlement]
  if (req.method === "GET" && segments[1] === "gameweeks" && segments.length >= 3) {
    const gwNum = Number(segments[2]);
    if (!Number.isInteger(gwNum) || gwNum < 1) return err(400, "invalid gameweek");
    const season = req.query.season ? Number(req.query.season) : undefined;
    if (season !== undefined && !Number.isInteger(season)) return err(400, "invalid season");
    const sub = segments[3];

    if (segments.length === 3) {
      const row = await store.getGameweek(gwNum, season);
      return row ? { status: 200, body: sourced(row, now) } : err(404, "gameweek not found");
    }
    if (segments.length > 4) return err(404, "not found");

    if (sub === "points") {
      const row = await store.getGwPoints(gwNum, season);
      return row ? { status: 200, body: sourced(row, now) } : err(404, "gameweek not found");
    }

    // 200 frozen settlement | 409 pending/provisional — mirrors /v1/settlement.
    if (sub === "settlement") {
      const gwRow = await store.getGameweek(gwNum, season);
      if (!gwRow) return err(404, "gameweek not found");
      const snap = await store.getPlayerPointsSnapshot(gwNum, season);
      if (snap?.status === "frozen" && snap.settlement) {
        return { status: 200, body: snap.settlement };
      }
      const pending: PlayerPointsPending = {
        status: snap?.status === "disputed" ? "disputed" : snap?.status === "provisional" ? "provisional" : "pending",
        data_checked: snap?.dataChecked ?? gwRow.data.data_checked,
      };
      return { status: 409, body: pending };
    }
    return err(404, "not found");
  }

  // GET /v1/players/:elementId/points?gw=N[&season=]
  if (
    req.method === "GET" &&
    segments[1] === "players" &&
    segments[3] === "points" &&
    segments.length === 4
  ) {
    const elementId = Number(segments[2]);
    const gwNum = Number(req.query.gw);
    if (!Number.isInteger(elementId) || elementId < 1) return err(400, "invalid element id");
    if (!Number.isInteger(gwNum) || gwNum < 1) return err(400, "gw query param required");
    const season = req.query.season ? Number(req.query.season) : undefined;
    if (season !== undefined && !Number.isInteger(season)) return err(400, "invalid season");
    const row = await store.getPlayerGwPoints(elementId, gwNum, season);
    return row ? { status: 200, body: sourced(row, now) } : err(404, "no points for that player/gameweek");
  }

  // POST /v1/admin/gameweeks/:gw/points/override
  if (
    req.method === "POST" &&
    segments[1] === "admin" &&
    segments[2] === "gameweeks" &&
    segments[4] === "points" &&
    segments[5] === "override" &&
    segments.length === 6
  ) {
    const gwNum = Number(segments[3]);
    if (!Number.isInteger(gwNum) || gwNum < 1) return err(400, "invalid gameweek");
    const body = req.body as { points?: unknown; reason?: unknown; season?: unknown } | undefined;
    const points = body?.points;
    const reason = body?.reason;
    const season = body?.season;
    const validPoints =
      Array.isArray(points) &&
      points.length > 0 &&
      points.every(
        (p: any) =>
          Number.isInteger(p?.element_id) && p.element_id > 0 && Number.isInteger(p?.total_points),
      );
    if (!validPoints || typeof reason !== "string" || reason.trim().length === 0) {
      return err(400, "body must be {points: [{element_id: int>0, total_points: int}, ...], reason: non-empty string}");
    }
    if (season !== undefined && !Number.isInteger(season)) return err(400, "invalid season");
    const gwRow = await store.getGameweek(gwNum, season as number | undefined);
    if (!gwRow) return err(404, "gameweek not found");
    const settlement = await store.insertPlayerPointsOverride(
      gwNum,
      points as Array<{ element_id: number; total_points: number }>,
      reason.trim(),
      season as number | undefined,
    );
    return { status: 200, body: settlement };
  }

  // POST /v1/admin/backtest/:s1FixtureId
  if (req.method === "POST" && segments[1] === "admin" && segments[2] === "backtest" && segments.length === 4) {
    const id = Number(segments[3]);
    if (!Number.isInteger(id)) return err(400, "invalid fixture id");
    const report = await store.runBacktest(id);
    return { status: 200, body: report };
  }

  return err(404, "not found");
}
