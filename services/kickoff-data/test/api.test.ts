import { describe, it, expect } from "vitest";
import type { Fixture, Gameweek, MatchState, PlayerGwPoints, SettlementSnapshot } from "@kickoff/schema";
import {
  handleRequest,
  type ApiConfig,
  type ApiRequest,
  type ApiStore,
  type SnapshotRow,
  type Stamped,
} from "../src/api/routes";

const NOW = new Date("2026-08-15T15:00:00Z");
const FX_ID = "epl-2026-arsenal-chelsea-20260815T1400";

const FIXTURE: Fixture = {
  id: FX_ID,
  league: "EPL",
  season: 2026,
  kickoff_utc: "2026-08-15T14:00:00.000Z",
  home: { slug: "arsenal", name: "Arsenal" },
  away: { slug: "chelsea", name: "Chelsea" },
  status: "live",
  source_refs: { apiFootball: 1399001 },
};

const STATE: MatchState = {
  fixture_id: FX_ID,
  minute: 61,
  period: "2H",
  score: { home: 2, away: 1 },
  last_event_at: "2026-08-15T14:58:00.000Z",
};

const FROZEN: SettlementSnapshot = {
  fixture_id: FX_ID,
  version: 1,
  outcome: { home: 2, away: 1 },
  votes: [],
  quorum_rule: "2-of-2 exact agreement",
  frozen_at: "2026-08-15T16:15:00.000Z",
};

function stamped<T>(data: T, secondsAgo = 30): Stamped<T> {
  return { data, source: "flashscore", fetchedAt: new Date(NOW.getTime() - secondsAgo * 1000) };
}

const GW: Gameweek = {
  id: 1,
  season: 2026,
  name: "Gameweek 1",
  deadline_utc: "2026-08-21T17:30:00.000Z",
  is_current: true,
  finished: false,
  data_checked: false,
};

const GW_POINTS: PlayerGwPoints = {
  gw: 1,
  season: 2026,
  element_id: 100,
  player_name: "Saka",
  team_slug: "arsenal",
  position: "M",
  total_points: 8,
  minutes: 90,
  bonus: 1,
  provisional: true,
  stats: { goals_scored: 1 },
};

const fplStamped = <T>(data: T): Stamped<T> => ({ ...stamped(data), source: "fpl" as const });

/** Fake store: FX_ID exists; everything else 404s. */
function makeStore(overrides: Partial<ApiStore> = {}): ApiStore {
  const known = <T>(id: string, v: Stamped<T>) => Promise.resolve(id === FX_ID ? v : null);
  return {
    listFixtures: () => Promise.resolve([stamped(FIXTURE)]),
    listResults: () =>
      Promise.resolve([
        fplStamped({
          fixture_id: FX_ID,
          kickoff_utc: FIXTURE.kickoff_utc,
          home: FIXTURE.home,
          away: FIXTURE.away,
          score: { home: 2, away: 1 },
        }),
      ]),
    getFixture: (id) => known(id, { ...stamped(FIXTURE), source: "apiFootball" as const }),
    getMatchState: (id) => known(id, stamped(STATE)),
    getMatchEvents: (id) => known(id, stamped([])),
    getMatchStats: (id) => known(id, stamped([])),
    getPlayerStats: (id) => known(id, stamped([])),
    getLatestSnapshot: () => Promise.resolve(null),
    insertAdminOverride: (fixtureId, outcome, reason) =>
      Promise.resolve({
        fixture_id: fixtureId,
        version: 2,
        outcome,
        votes: [],
        quorum_rule: "admin-override",
        frozen_at: NOW.toISOString(),
        supersedes_reason: reason,
      }),
    runBacktest: (id) => Promise.resolve({ fixtureId: id, schemaChecks: [] }),
    // FPL lane: gameweek 1 exists; everything else 404s.
    listGameweeks: () => Promise.resolve(fplStamped([GW])),
    getGameweek: (gw) => Promise.resolve(gw === 1 ? fplStamped(GW) : null),
    getGwPoints: (gw) => Promise.resolve(gw === 1 ? fplStamped([GW_POINTS]) : null),
    getPlayerGwPoints: (elementId, gw) =>
      Promise.resolve(elementId === 100 && gw === 1 ? fplStamped(GW_POINTS) : null),
    getPlayerPointsSnapshot: () =>
      Promise.resolve({ status: "pending" as const, settlement: null, dataChecked: false }),
    insertPlayerPointsOverride: (gw, points, reason) =>
      Promise.resolve({
        gw,
        season: 2026,
        version: 2,
        points: points.map((p) => ({ ...p, player_name: "Saka" })),
        raw_payload_ref: "admin-override:gw1:v2",
        flags: [],
        frozen_at: NOW.toISOString(),
        supersedes_reason: reason,
      }),
    ...overrides,
  };
}

const CONFIG: ApiConfig = { apiKey: "app-key", adminKey: "admin-key" };

function req(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    method: "GET",
    path: `/v1/fixtures/${FX_ID}`,
    query: {},
    headers: { authorization: "Bearer app-key" },
    ...overrides,
  };
}

const call = (r: Partial<ApiRequest>, store = makeStore(), config = CONFIG) =>
  handleRequest(store, config, req(r), NOW);

describe("consumer API: auth fails closed", () => {
  it("401 without a key", async () => {
    expect((await call({ headers: {} })).status).toBe(401);
  });

  it("401 with the wrong key", async () => {
    expect((await call({ headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("401 on EVERY route when no key is configured (unset ≠ open)", async () => {
    const res = await call({}, makeStore(), { apiKey: undefined, adminKey: undefined });
    expect(res.status).toBe(401);
  });

  it("x-api-key header works too", async () => {
    const res = await call({ headers: { "x-api-key": "app-key" } });
    expect(res.status).toBe(200);
  });

  it("admin route rejects the app key — separate credential", async () => {
    const res = await call({
      method: "POST",
      path: `/v1/admin/settlement/${FX_ID}/override`,
      body: { home: 1, away: 0, reason: "test" },
    });
    expect(res.status).toBe(401);
  });
});

describe("consumer API: listing + fixture lanes", () => {
  it("GET /v1/fixtures returns Sourced<Fixture>[] with staleness", async () => {
    const res = await call({ path: "/v1/fixtures" });
    expect(res.status).toBe(200);
    const [row] = res.body as Array<{ data: Fixture; staleness_seconds: number; source: string }>;
    expect(row.data.id).toBe(FX_ID);
    expect(row.staleness_seconds).toBe(30);
    expect(row.source).toBe("flashscore");
  });

  it("passes league/from/to filters through to the store", async () => {
    let seen: unknown;
    const store = makeStore({
      listFixtures: (f) => {
        seen = f;
        return Promise.resolve([]);
      },
    });
    await call({ path: "/v1/fixtures", query: { league: "EPL", from: "2026-08-15", to: "2026-08-16" } }, store);
    expect(seen).toEqual({
      league: "EPL",
      from: new Date("2026-08-15"),
      to: new Date("2026-08-16"),
    });
  });

  it("GET /v1/results returns finished matches with final scores", async () => {
    const res = await call({ path: "/v1/results" });
    expect(res.status).toBe(200);
    const [row] = res.body as Array<{ data: { fixture_id: string; score: { home: number; away: number } }; source: string }>;
    expect(row.data.fixture_id).toBe(FX_ID);
    expect(row.data.score).toEqual({ home: 2, away: 1 });
    expect(row.source).toBe("fpl");
  });

  it("GET /v1/fixtures/:id → 200, unknown id → 404", async () => {
    expect((await call({})).status).toBe(200);
    expect((await call({ path: "/v1/fixtures/epl-nope" })).status).toBe(404);
  });

  it("state/events/stats/players sub-lanes resolve; junk sub-path 404s", async () => {
    for (const sub of ["state", "events", "stats", "players"]) {
      const res = await call({ path: `/v1/fixtures/${FX_ID}/${sub}` });
      expect(res.status, sub).toBe(200);
    }
    expect((await call({ path: `/v1/fixtures/${FX_ID}/odds` })).status).toBe(404);
  });

  it("staleness clamps at 0 for fetched_at in the future (clock skew)", async () => {
    const store = makeStore({ getMatchState: () => Promise.resolve(stamped(STATE, -10)) });
    const res = await call({ path: `/v1/fixtures/${FX_ID}/state` }, store);
    expect((res.body as { staleness_seconds: number }).staleness_seconds).toBe(0);
  });
});

describe("consumer API: settlement semantics", () => {
  it("no snapshot yet → 409 {status: pending, votes_collected: 0}", async () => {
    const res = await call({ path: `/v1/settlement/${FX_ID}` });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ status: "pending", votes_collected: 0 });
  });

  it("provisional → 409 with freezes_at", async () => {
    const snap: SnapshotRow = {
      status: "provisional",
      snapshot: null,
      votesCollected: 2,
      freezesAt: new Date("2026-08-15T16:10:00Z"),
    };
    const store = makeStore({ getLatestSnapshot: () => Promise.resolve(snap) });
    const res = await call({ path: `/v1/settlement/${FX_ID}` }, store);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      status: "provisional",
      votes_collected: 2,
      freezes_at: "2026-08-15T16:10:00.000Z",
    });
  });

  it("disputed → 409 {status: disputed}", async () => {
    const snap: SnapshotRow = { status: "disputed", snapshot: null, votesCollected: 2, freezesAt: null };
    const store = makeStore({ getLatestSnapshot: () => Promise.resolve(snap) });
    const res = await call({ path: `/v1/settlement/${FX_ID}` }, store);
    expect(res.status).toBe(409);
    expect((res.body as { status: string }).status).toBe("disputed");
  });

  it("frozen → 200 with the snapshot itself (no wrapper — it's immutable)", async () => {
    const snap: SnapshotRow = { status: "frozen", snapshot: FROZEN, votesCollected: 2, freezesAt: null };
    const store = makeStore({ getLatestSnapshot: () => Promise.resolve(snap) });
    const res = await call({ path: `/v1/settlement/${FX_ID}` }, store);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(FROZEN);
  });

  it("unknown fixture → 404, not 409", async () => {
    expect((await call({ path: "/v1/settlement/epl-nope" })).status).toBe(404);
  });
});

describe("consumer API: admin override", () => {
  const admin = (body: unknown, fixtureId = FX_ID) =>
    call({
      method: "POST",
      path: `/v1/admin/settlement/${fixtureId}/override`,
      headers: { authorization: "Bearer admin-key" },
      body,
    });

  it("valid override → 200 frozen snapshot version N+1", async () => {
    const res = await admin({ home: 2, away: 1, reason: "VAR correction after S2 outage" });
    expect(res.status).toBe(200);
    const snap = res.body as SettlementSnapshot;
    expect(snap.version).toBe(2);
    expect(snap.quorum_rule).toBe("admin-override");
    expect(snap.outcome).toEqual({ home: 2, away: 1 });
  });

  it("rejects negative, non-integer, and reason-less bodies", async () => {
    expect((await admin({ home: -1, away: 0, reason: "x" })).status).toBe(400);
    expect((await admin({ home: 1.5, away: 0, reason: "x" })).status).toBe(400);
    expect((await admin({ home: 1, away: 0 })).status).toBe(400);
    expect((await admin({ home: 1, away: 0, reason: "  " })).status).toBe(400);
    expect((await admin(undefined)).status).toBe(400);
  });

  it("unknown fixture → 404", async () => {
    expect((await admin({ home: 1, away: 0, reason: "x" }, "epl-nope")).status).toBe(404);
  });

  it("POST /v1/admin/backtest/:id needs the admin key and an integer id", async () => {
    const bt = (id: string, key = "admin-key") =>
      call({ method: "POST", path: `/v1/admin/backtest/${id}`, headers: { authorization: `Bearer ${key}` } });
    expect((await bt("1399001")).status).toBe(200);
    expect((await bt("abc")).status).toBe(400);
    expect((await bt("1399001", "app-key")).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// FPL lane routes
// ---------------------------------------------------------------------------

describe("consumer API: FPL gameweeks + points", () => {
  it("GET /v1/gameweeks returns Sourced<Gameweek[]> from fpl", async () => {
    const res = await call({ path: "/v1/gameweeks" });
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.source).toBe("fpl");
    expect(body.data[0].data_checked).toBe(false);
  });

  it("GET /v1/gameweeks/:gw 200 known, 404 unknown, 400 garbage", async () => {
    expect((await call({ path: "/v1/gameweeks/1" })).status).toBe(200);
    expect((await call({ path: "/v1/gameweeks/9" })).status).toBe(404);
    expect((await call({ path: "/v1/gameweeks/abc" })).status).toBe(400);
  });

  it("GET /v1/gameweeks/:gw/points carries provisional rows", async () => {
    const res = await call({ path: "/v1/gameweeks/1/points" });
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.data[0].provisional).toBe(true);
    expect(body.data[0].total_points).toBe(8);
  });

  it("GET /v1/players/:id/points?gw= 200 known, 404 unknown, 400 without gw", async () => {
    expect((await call({ path: "/v1/players/100/points", query: { gw: "1" } })).status).toBe(200);
    expect((await call({ path: "/v1/players/999/points", query: { gw: "1" } })).status).toBe(404);
    expect((await call({ path: "/v1/players/100/points" })).status).toBe(400);
  });
});

describe("consumer API: FPL settlement — two-stage finality over the wire", () => {
  it("409 pending with data_checked=false before anything lands", async () => {
    const res = await call({ path: "/v1/gameweeks/1/settlement" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ status: "pending", data_checked: false });
  });

  it("409 provisional while awaiting data_checked", async () => {
    const store = makeStore({
      getPlayerPointsSnapshot: () =>
        Promise.resolve({ status: "provisional" as const, settlement: null, dataChecked: false }),
    });
    const res = await call({ path: "/v1/gameweeks/1/settlement" }, store);
    expect(res.status).toBe(409);
    expect((res.body as any).status).toBe("provisional");
  });

  it("200 with the frozen settlement once data_checked", async () => {
    const settlement = {
      gw: 1,
      season: 2026,
      version: 1,
      points: [{ element_id: 100, player_name: "Saka", total_points: 8 }],
      raw_payload_ref: "42",
      flags: [],
      frozen_at: NOW.toISOString(),
    };
    const store = makeStore({
      getPlayerPointsSnapshot: () =>
        Promise.resolve({ status: "frozen" as const, settlement, dataChecked: true }),
    });
    const res = await call({ path: "/v1/gameweeks/1/settlement" }, store);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(settlement);
  });

  it("404 for an unknown gameweek", async () => {
    expect((await call({ path: "/v1/gameweeks/9/settlement" })).status).toBe(404);
  });
});

describe("consumer API: FPL admin override", () => {
  const admin = { authorization: "Bearer admin-key" };

  it("valid override inserts version N+1", async () => {
    const res = await call({
      method: "POST",
      path: "/v1/admin/gameweeks/1/points/override",
      headers: admin,
      body: { points: [{ element_id: 100, total_points: 9 }], reason: "fpl revised" },
    });
    expect(res.status).toBe(200);
    expect((res.body as any).version).toBe(2);
    expect((res.body as any).supersedes_reason).toBe("fpl revised");
  });

  it("400 on malformed points or empty reason", async () => {
    const bad = [
      { points: [], reason: "x" },
      { points: [{ element_id: 0, total_points: 1 }], reason: "x" },
      { points: [{ element_id: 100, total_points: 1.5 }], reason: "x" },
      { points: [{ element_id: 100, total_points: 1 }], reason: "  " },
    ];
    for (const body of bad) {
      const res = await call({ method: "POST", path: "/v1/admin/gameweeks/1/points/override", headers: admin, body });
      expect(res.status).toBe(400);
    }
  });

  it("requires the admin key, not the app key", async () => {
    const res = await call({
      method: "POST",
      path: "/v1/admin/gameweeks/1/points/override",
      body: { points: [{ element_id: 100, total_points: 9 }], reason: "x" },
    });
    expect(res.status).toBe(401);
  });
});
