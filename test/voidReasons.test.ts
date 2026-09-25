import { describe, expect, it } from "vitest";
import { explainVoid } from "../src/lib/voidReasons";
import { distanceA, settle } from "@kickoff/engine";

describe("explainVoid", () => {
  it("explains both engine void codes", () => {
    expect(explainVoid("FewerThanTwo")).toMatch(/fewer than 2 positions/);
    expect(explainVoid("AllEqualD")).toMatch(/equally close/);
  });
  it("passes admin free-text reasons through and null stays null", () => {
    expect(explainVoid("fixture postponed")).toBe("fixture postponed");
    expect(explainVoid(null)).toBeNull();
  });
  it("every code the engine can emit has an explanation", () => {
    const S = 10_000_000n;
    const one = settle([{ stake: S, d: 0n }]).void!;
    const same = settle([2, 2].map(() => ({ stake: S, d: distanceA(2, 1, 0, 0) }))).void!;
    expect(explainVoid(one)).not.toBe(one);
    expect(explainVoid(same)).not.toBe(same);
  });
});
