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
