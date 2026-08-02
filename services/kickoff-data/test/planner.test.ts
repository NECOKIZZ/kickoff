import { describe, it, expect } from "vitest";
import { plan, jobKey, type PlannerState, type PlannerFixture } from "../src/scheduler/planner";
import { S1_SETTLEMENT_RESERVE } from "../src/scheduler/cadence";

const T0 = new Date("2026-08-15T10:00:00Z");

function state(overrides: Partial<PlannerState> = {}): PlannerState {
  return {
    now: T0,
    fixtures: [],
    lastRun: new Map(),
    s1Remaining: 100,
    ...overrides,
  };
}

function fx(overrides: Partial<PlannerFixture> = {}): PlannerFixture {
  return {
    id: "epl-arsenal-chelsea-202608151400",
    kickoffUtc: new Date("2026-08-15T14:00:00Z"),
    status: "scheduled",
    ...overrides,
  };
}

const kinds = (s: PlannerState) => plan(s).map((j) => j.kind);

describe("planner: slate syncs", () => {
  it("cold start emits all slate-wide syncs", () => {
    expect(kinds(state())).toEqual(expect.arrayContaining(["s1.fixtureSync", "s2.fixtureSync", "s4.fixtureSync"]));
  });

  it("recently-run syncs are not re-emitted", () => {
    const s = state({ lastRun: new Map([["s1.fixtureSync", new Date(T0.getTime() - 60_000)]]) });
    expect(kinds(s)).not.toContain("s1.fixtureSync");
  });

  it("sync overdue by its cadence re-emits", () => {
    const s = state({ lastRun: new Map([["s1.fixtureSync", new Date(T0.getTime() - 13 * 3600_000)]]) });
    expect(kinds(s)).toContain("s1.fixtureSync");
  });
});

describe("planner: lineup gate (T−1h, once)", () => {
  it("no lineup fetch outside the lead window", () => {
    // Kickoff is 4h away.
    expect(kinds(state({ fixtures: [fx()] }))).not.toContain("s1.lineups");
  });

  it("fetches inside the window, exactly once", () => {
    const s = state({ now: new Date("2026-08-15T13:10:00Z"), fixtures: [fx()] });
    expect(kinds(s)).toContain("s1.lineups");
    s.lastRun.set("s1.lineups:epl-arsenal-chelsea-202608151400", s.now);
    expect(kinds(s)).not.toContain("s1.lineups");
  });
});

describe("planner: S1 hard rules", () => {
  it("S1 NEVER polls live fixtures — only S3 does", () => {
    const jobs = plan(state({ fixtures: [fx({ status: "live" })] }));
    const s1Kinds = jobs.filter((j) => j.kind.startsWith("s1.") && j.fixtureId);
    expect(s1Kinds).toEqual([]);
    expect(jobs.map((j) => j.kind)).toContain("s3.livePoll");
  });

  it("charts/listing spend stops at the settlement reserve; votes run to zero", () => {
    const s = state({
      s1Remaining: S1_SETTLEMENT_RESERVE, // reserve floor reached
      fixtures: [fx({ status: "ft" })],
    });
    const jobs = plan(s);
    expect(jobs.map(jobKey)).not.toContain("s1.postMatch:epl-arsenal-chelsea-202608151400");
    expect(jobs.map((j) => j.kind)).toContain("s1.settlementVote");
  });

  it("with zero S1 budget even settlement votes stop (wait for UTC reset) but S2 still votes", () => {
    const jobs = plan(state({ s1Remaining: 0, fixtures: [fx({ status: "ft" })] }));
    expect(jobs.map((j) => j.kind)).not.toContain("s1.settlementVote");
    expect(jobs.map((j) => j.kind)).toContain("s2.settlementVote");
  });
});

describe("planner: S3 phase cadences", () => {
  it("pre-kickoff window polls at the pre-kickoff cadence", () => {
    const s = state({ now: new Date("2026-08-15T13:50:00Z"), fixtures: [fx()] });
    expect(kinds(s)).toContain("s3.livePoll");
    // Ran 4 min ago at 5-min cadence → not due.
    s.lastRun.set("s3.livePoll:epl-arsenal-chelsea-202608151400", new Date(s.now.getTime() - 4 * 60_000));
    expect(kinds(s)).not.toContain("s3.livePoll");
  });

  it("in-play tightens to 1min when a market is near settlement", () => {
    const s = state({
      fixtures: [fx({ status: "live", nearSettlement: true })],
      lastRun: new Map([["s3.livePoll:epl-arsenal-chelsea-202608151400", new Date(T0.getTime() - 90_000)]]),
    });
    // 90s ago: due at 1-min cadence, not at the 2-min in-play default.
    expect(kinds(s)).toContain("s3.livePoll");
    s.fixtures[0].nearSettlement = false;
    expect(kinds(s)).not.toContain("s3.livePoll");
  });

  it("settled/postponed/abandoned fixtures get no per-fixture jobs at all", () => {
    for (const f of [fx({ settled: true, status: "ft" }), fx({ status: "postponed" }), fx({ status: "abandoned" })]) {
      const jobs = plan(state({ fixtures: [f] })).filter((j) => j.fixtureId);
      expect(jobs).toEqual([]);
    }
  });
});

describe("planner: FT settlement fan-out", () => {
  it("FT emits postMatch + both settlement votes exactly once each", () => {
    const s = state({ fixtures: [fx({ status: "ft" })] });
    const keys = plan(s).filter((j) => j.fixtureId).map(jobKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        "s1.postMatch:epl-arsenal-chelsea-202608151400",
        "s1.settlementVote:epl-arsenal-chelsea-202608151400",
        "s2.settlementVote:epl-arsenal-chelsea-202608151400",
      ]),
    );
    for (const k of keys) s.lastRun.set(k, s.now);
    const again = plan(s).filter((j) => j.fixtureId).map(jobKey);
    // Only the S3 post-FT poll keeps running until the snapshot freezes.
    expect(again.every((k) => k.startsWith("s3.livePoll"))).toBe(true);
  });
});

describe("planner: S5 tie-break gate", () => {
  it("s5.tiebreak fires only for FT fixtures the lane flagged, exactly once", () => {
    // Unflagged FT fixture: never.
    expect(kinds(state({ fixtures: [fx({ status: "ft" })] }))).not.toContain("s5.tiebreak");
    // Flagged: once, then lastRun suppresses it forever.
    const s = state({ fixtures: [fx({ status: "ft", needsTiebreak: true })] });
    expect(kinds(s)).toContain("s5.tiebreak");
    s.lastRun.set("s5.tiebreak:epl-arsenal-chelsea-202608151400", s.now);
    expect(kinds(s)).not.toContain("s5.tiebreak");
  });

  it("a settled fixture never gets a tie-break (short-circuit)", () => {
    const s = state({ fixtures: [fx({ status: "ft", needsTiebreak: true, settled: true })] });
    expect(kinds(s)).not.toContain("s5.tiebreak");
  });
});

// ---------------------------------------------------------------------------
// FPL lane
// ---------------------------------------------------------------------------

import type { PlannerGameweek } from "../src/scheduler/planner";
import { CADENCE } from "../src/scheduler/cadence";

function gw(overrides: Partial<PlannerGameweek> = {}): PlannerGameweek {
  return {
    gw: 3,
    isCurrent: true,
    finished: false,
    dataChecked: false,
    deadlineUtc: new Date("2026-08-14T17:30:00Z"), // in the past vs T0
    anyFixtureActive: false,
    provisionalRecorded: false,
    settled: false,
    ...overrides,
  };
}

describe("planner: FPL bootstrap + finality watch", () => {
  it("cold start emits fpl.bootstrapSync (with or without gameweeks)", () => {
    expect(kinds(state())).toContain("fpl.bootstrapSync");
    expect(kinds(state({ gameweeks: [gw()] }))).toContain("fpl.bootstrapSync");
  });

  it("normal cadence when nothing awaits data_checked", () => {
    const s = state({
      gameweeks: [gw()],
      lastRun: new Map([["fpl.bootstrapSync", new Date(T0.getTime() - (CADENCE.fplBootstrapSync - 60) * 1000)]]),
    });
    expect(kinds(s)).not.toContain("fpl.bootstrapSync");
  });

  it("tightens to the finality watch while a GW is finished-but-unchecked", () => {
    const lastRun = new Map([
      ["fpl.bootstrapSync", new Date(T0.getTime() - (CADENCE.fplFinalityWatch + 60) * 1000)],
    ]);
    // Same lastRun: not due at normal cadence…
    expect(kinds(state({ gameweeks: [gw()], lastRun: new Map(lastRun) }))).not.toContain("fpl.bootstrapSync");
    // …but due at the tightened one when finality is pending.
    const pending = state({ gameweeks: [gw({ finished: true, dataChecked: false })], lastRun: new Map(lastRun) });
    expect(kinds(pending)).toContain("fpl.bootstrapSync");
    // Settled GWs stop tightening it.
    const done = state({ gameweeks: [gw({ finished: true, dataChecked: true, settled: true })], lastRun: new Map(lastRun) });
    expect(kinds(done)).not.toContain("fpl.bootstrapSync");
  });
});

describe("planner: FPL live poll", () => {
  it("polls fast while fixtures are active, gw-scoped key", () => {
    const s = state({ gameweeks: [gw({ anyFixtureActive: true })] });
    const job = plan(s).find((j) => j.kind === "fpl.livePoll");
    expect(job).toBeDefined();
    expect(jobKey(job!)).toBe("fpl.livePoll:gw3");
    // Within the live cadence → suppressed.
    s.lastRun.set("fpl.livePoll:gw3", new Date(T0.getTime() - 60 * 1000));
    expect(kinds(s)).not.toContain("fpl.livePoll");
    // Past it → due again.
    s.lastRun.set("fpl.livePoll:gw3", new Date(T0.getTime() - (CADENCE.fplLivePoll + 30) * 1000));
    expect(kinds(s)).toContain("fpl.livePoll");
  });

  it("keeps a slow post-match cadence until data_checked, only for GWs it polled", () => {
    // Was polled during play, matches over, provisional not yet recorded.
    const polled = new Map([["fpl.livePoll:gw3", new Date(T0.getTime() - (CADENCE.fplPostMatch + 60) * 1000)]]);
    const s = state({ gameweeks: [gw({ finished: true })], lastRun: polled });
    expect(kinds(s)).toContain("fpl.livePoll");
    // Never-polled GW (blank/past) does not start polling post-hoc.
    const cold = state({ gameweeks: [gw({ finished: true })] });
    expect(kinds(cold)).not.toContain("fpl.livePoll");
  });

  it("a settled GW never polls again", () => {
    const polled = new Map([["fpl.livePoll:gw3", new Date(T0.getTime() - 24 * 3600_000)]]);
    const s = state({ gameweeks: [gw({ finished: true, dataChecked: true, settled: true, anyFixtureActive: false })], lastRun: polled });
    expect(kinds(s)).not.toContain("fpl.livePoll");
  });
});

describe("planner: FPL fixture sync", () => {
  it("current GW syncs; a far-future unfinished GW does not", () => {
    const jobs = plan(state({ gameweeks: [
      gw({ gw: 3, isCurrent: true }),
      gw({ gw: 10, isCurrent: false, deadlineUtc: new Date("2026-10-01T17:30:00Z") }),
    ] }));
    const fxGws = jobs.filter((j) => j.kind === "fpl.fixtureSync").map((j) => j.gw);
    expect(fxGws).toContain(3);
    expect(fxGws).not.toContain(10);
  });

  it("next GW joins within 24h of its deadline", () => {
    const jobs = plan(state({ gameweeks: [
      gw({ gw: 4, isCurrent: false, deadlineUtc: new Date("2026-08-16T09:00:00Z") }), // <24h from T0
    ] }));
    expect(jobs.filter((j) => j.kind === "fpl.fixtureSync").map((j) => j.gw)).toContain(4);
  });
});
