import { describe, it, expect, beforeEach } from "vitest";
import { archiveRaw, setArchiveSink } from "../src/archive";

let stored: Array<{ endpoint: string; payload: unknown }>;

beforeEach(() => {
  stored = [];
  setArchiveSink(async (_source, endpoint, payload) => {
    stored.push({ endpoint, payload });
    return stored.length;
  });
});

describe("archiveRaw", () => {
  it("no sink → null, nothing stored", async () => {
    setArchiveSink(null);
    expect(await archiveRaw("fpl", "/x", { a: 1 })).toBeNull();
  });

  it("identical consecutive payloads are stored once and reuse the row id", async () => {
    const a = await archiveRaw("fpl", "/fixtures/", { a: 1 });
    const b = await archiveRaw("fpl", "/fixtures/", { a: 1 });
    expect(stored).toHaveLength(1);
    expect(b).toBe(a);
  });

  it("changed payloads are stored; dedupe is per endpoint", async () => {
    await archiveRaw("fpl", "/fixtures/", { a: 1 });
    await archiveRaw("fpl", "/fixtures/", { a: 2 });
    await archiveRaw("fpl", "/other/", { a: 2 });
    expect(stored).toHaveLength(3);
  });

  it("minIntervalSeconds rate-limits changed payloads", async () => {
    const t0 = 1_000_000;
    await archiveRaw("fpl", "/event/7/live/", { p: 1 }, { minIntervalSeconds: 1800 }, t0);
    expect(await archiveRaw("fpl", "/event/7/live/", { p: 2 }, { minIntervalSeconds: 1800 }, t0 + 60_000)).toBeNull();
    expect(stored).toHaveLength(1);
    await archiveRaw("fpl", "/event/7/live/", { p: 3 }, { minIntervalSeconds: 1800 }, t0 + 1800_000);
    expect(stored).toHaveLength(2);
  });

  it("sink errors are swallowed", async () => {
    setArchiveSink(async () => {
      throw new Error("db down");
    });
    expect(await archiveRaw("fpl", "/x", {})).toBeNull();
  });
});
