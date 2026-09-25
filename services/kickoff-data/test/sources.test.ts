import { describe, it, expect, afterEach, vi } from "vitest";
import { jobEnabled, disabledSources } from "../src/sources";
import { fixturesDir } from "../src/mockDir";

afterEach(() => vi.unstubAllEnvs());

function keys(k: Partial<Record<"API_FOOTBALL_KEY" | "FOOTBALL_DATA_ORG_KEY" | "APIFY_TOKEN" | "KICKOFF_DATA_FPL_LIVE", string>>) {
  for (const name of ["API_FOOTBALL_KEY", "FOOTBALL_DATA_ORG_KEY", "APIFY_TOKEN", "KICKOFF_DATA_FPL_LIVE"] as const)
    vi.stubEnv(name, k[name] ?? "");
}

describe("KICKOFF_DATA_NO_MOCKS guard", () => {
  it("mocks allowed (default): every job runs, keys or not", () => {
    keys({});
    vi.stubEnv("KICKOFF_DATA_NO_MOCKS", "");
    expect(jobEnabled("s1.fixtureSync")).toBe(true);
    expect(jobEnabled("s3.livePoll")).toBe(true);
    expect(disabledSources()).toEqual([]);
  });

  it("mocks off: a source without its key is switched off, keyed sources run", () => {
    keys({ FOOTBALL_DATA_ORG_KEY: "k", KICKOFF_DATA_FPL_LIVE: "1" });
    vi.stubEnv("KICKOFF_DATA_NO_MOCKS", "1");
    expect(jobEnabled("s1.fixtureSync")).toBe(false);
    expect(jobEnabled("s1.settlementVote")).toBe(false);
    expect(jobEnabled("s2.fixtureSync")).toBe(true);
    expect(jobEnabled("fpl.bootstrapSync")).toBe(true);
    expect(jobEnabled("s3.livePoll")).toBe(false);
    expect(jobEnabled("s5.tiebreak")).toBe(false);
    expect(disabledSources()).toEqual(["apiFootball", "apify"]);
  });

  it("mocks off: recorded payloads can't be read at all", () => {
    vi.stubEnv("KICKOFF_DATA_NO_MOCKS", "1");
    expect(() => fixturesDir()).toThrow(/mock payloads are disabled/);
  });
});

describe("source roles config", () => {
  it("defaults: S1/S2 list and vote, FPL does neither, engine default roster", async () => {
    const { listsFixtures, votesInSettlement, settlementRoster } = await import("../src/sources");
    vi.stubEnv("KICKOFF_DATA_LISTING_SOURCES", "");
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_VOTERS", "");
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_QUORUM", "");
    expect(listsFixtures("fdorg")).toBe(true);
    expect(listsFixtures("fpl")).toBe(false);
    expect(votesInSettlement("apiFootball")).toBe(true);
    expect(votesInSettlement("fpl")).toBe(false);
    expect(settlementRoster()).toEqual({});
  });

  it("FPL as the one source", async () => {
    const { listsFixtures, votesInSettlement, settlementRoster } = await import("../src/sources");
    vi.stubEnv("KICKOFF_DATA_LISTING_SOURCES", "fpl");
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_VOTERS", "fpl");
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_QUORUM", "1");
    expect(listsFixtures("fpl")).toBe(true);
    expect(votesInSettlement("fpl")).toBe(true);
    expect(votesInSettlement("apiFootball")).toBe(false);
    expect(settlementRoster()).toEqual({ voters: ["fpl"], quorum: 1 });
  });

  it("refuses configs that could never settle or name unknown sources", async () => {
    const { settlementRoster } = await import("../src/sources");
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_VOTERS", "fpl");
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_QUORUM", "");
    expect(() => settlementRoster()).toThrow(/QUORUM=1/);
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_QUORUM", "2");
    expect(() => settlementRoster()).toThrow(/exceeds/);
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_VOTERS", "fpl,espn");
    vi.stubEnv("KICKOFF_DATA_SETTLEMENT_QUORUM", "1");
    expect(() => settlementRoster()).toThrow(/unknown source "espn"/);
  });
});

describe("KICKOFF_DATA_DISABLED_JOBS", () => {
  it("switches individual jobs off, leaves the rest of the source running", () => {
    keys({ API_FOOTBALL_KEY: "k" });
    vi.stubEnv("KICKOFF_DATA_NO_MOCKS", "1");
    vi.stubEnv("KICKOFF_DATA_DISABLED_JOBS", "s1.lineups, s1.postMatch");
    expect(jobEnabled("s1.lineups")).toBe(false);
    expect(jobEnabled("s1.postMatch")).toBe(false);
    expect(jobEnabled("s1.fixtureSync")).toBe(true);
    expect(jobEnabled("s1.settlementVote")).toBe(true);
  });
});
