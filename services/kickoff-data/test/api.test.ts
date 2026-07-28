import { describe, it, expect } from "vitest";
import type { Fixture, MatchState, SettlementSnapshot } from "@kickoff/schema";
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

/** Fake store: FX_ID exists; everything else 404s. */
function makeStore(overrides: Partial<ApiStore> = {}): ApiStore {
  const known = <T>(id: string, v: Stamped<T>) => Promise.resolve(id === FX_ID ? v : null);
  return {
    listFixtures: () => Promise.resolve([stamped(FIXTURE)]),
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
