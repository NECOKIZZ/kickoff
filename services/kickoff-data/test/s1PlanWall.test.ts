import { describe, it, expect, vi, afterEach } from "vitest";
import { getEplFixtures, planBlocked } from "../src/apiFootball";
import { jobEnabled } from "../src/sources";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API-Football plan wall", () => {
  it("a plan error pauses S1 for the day: no more requests, S1 jobs skipped", async () => {
    vi.stubEnv("API_FOOTBALL_KEY", "k");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ errors: { plan: "Free plans do not have access to this season, try from 2022 to 2024." }, response: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(planBlocked()).toBe(false);
    await expect(getEplFixtures(2026)).rejects.toThrow(/plan:/);
    expect(planBlocked()).toBe(true);

    await expect(getEplFixtures(2026)).rejects.toThrow(/paused until tomorrow/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the second call never left the process

    expect(jobEnabled("s1.fixtureSync")).toBe(false);
    expect(jobEnabled("s1.settlementVote")).toBe(false);
    expect(jobEnabled("fpl.livePoll")).toBe(true);
  });
});
