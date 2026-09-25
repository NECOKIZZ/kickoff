import { describe, expect, it, vi } from "vitest";

// isDue is pure; stub the DB module the scheduler imports so no DATABASE_URL is needed.
vi.mock("@/db", () => ({ db: {}, schema: {} }));
const { isDue } = await import("../src/lib/managedScheduler");

describe("isDue", () => {
  it("runs when there are due markets it hasn't seen", () => {
    expect(isDue([1, 2], [])).toBe(true);
    expect(isDue([1, 2, 3], [{ marketIds: [1, 2] }])).toBe(true);
  });
  it("doesn't re-run for markets it was already shown", () => {
    expect(isDue([1, 2], [{ marketIds: [1] }, { marketIds: [2] }])).toBe(false);
  });
  it("nothing due, nothing to do", () => {
    expect(isDue([], [])).toBe(false);
  });
  it("respects the daily cap even with new markets", () => {
    expect(isDue([9], [{ marketIds: [1] }, { marketIds: [2] }], 2)).toBe(false);
  });
});
