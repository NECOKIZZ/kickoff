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
