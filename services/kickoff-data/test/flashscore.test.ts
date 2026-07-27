import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fixturesDir } from "../src/mockDir";
import type { FsLiveMatch, FsExtractorMatch } from "../src/flashscore";
import {
  parseMinute,
  fsPeriod,
  fsStatus,
  fsEventType,
  normalizeFsLiveFixture,
  normalizeFsMatchState,
  normalizeFsEvents,
  normalizeFsStats,
  normalizeFsExtractorMatch,
  s4Status,
} from "../src/normalize/flashscore";

async function loadApify(name: string): Promise<any> {
  return JSON.parse(await readFile(path.join(fixturesDir(), "apify", name), "utf8"));
}

describe("S3 normalizers (REAL recorded run, 2026-07-27)", async () => {
  const items: FsLiveMatch[] = await loadApify("s3-live-sample.json");
  const m = items[0]; // Ivory Coast W 0-3 Burkina Faso W, live 2H 38'

  it("minute strings parse incl. stoppage", () => {
    expect(parseMinute("7'")).toBe(7);
    expect(parseMinute("45+4'")).toBe(49);
    expect(parseMinute("garbage")).toBeNull();
  });

  it("live fixture normalizes with flashscore source_ref", () => {
    const fx = normalizeFsLiveFixture(m, "AFCON-W")!;
    expect(fx.status).toBe("live");
    expect(fx.source_refs.flashscore).toBe("8pzrmjup");
    expect(fx.home.name).toBe("Ivory Coast W");
  });

  it("match state carries minute, period, live score", () => {
    const st = normalizeFsMatchState("fx-1", m, "2026-07-27T20:40:00Z");
    expect(st).toMatchObject({ minute: 38, period: "2H", score: { home: 0, away: 3 } });
  });

  it("events: penalty via numeric type + label; score_after preserved; assist rows dropped", () => {
    const evs = normalizeFsEvents("fx-1", m, "2026-07-27T20:40:00Z");
    const pen = evs.find((e) => e.type === "penalty_goal")!;
    expect(pen.minute).toBe(7);
    expect(pen.score_after).toEqual({ home: 1, away: 0 });
    // The two "assist"-typed rows must NOT enter the timeline.
    expect(evs.every((e) => (e.type as string) !== "assist")).toBe(true);
    expect(evs.find((e) => e.type === "yellow")).toBeTruthy();
  });

  it("unknown event types are dropped, never guessed", () => {
    expect(fsEventType("999", "Some Future Thing")).toBeNull();
  });

  it("statistics → chart StatLines per period (xG, possession %, shots)", () => {
    const stats = normalizeFsStats("fx-1", m);
    const full = stats.find((s) => s.period === "FULL")!;
    expect(full.home.xg).toBe(1.84);
    expect(full.home.possession_pct).toBe(50);
    expect(full.home.shots_on_target).toBe(5);
    // per-half rows exist too
    expect(stats.some((s) => s.period === "1H")).toBe(true);
  });

  it("period/status mapping is conservative on unknowns", () => {
    expect(fsPeriod("1st Half", "LIVE")).toBe("1H");
    expect(fsPeriod("Halftime", "LIVE")).toBe("HT");
    expect(fsStatus({ ...m, status: "SOMETHING_NEW" })).toBeNull();
  });

  it("second item: stoppage-time goals parse to absolute minutes", () => {
    const evs = normalizeFsEvents("fx-2", items[1], "2026-07-27T20:40:00Z");
    expect(evs.map((e) => e.minute)).toEqual([49, 52]); // 45+4', 45+7'
  });
});

describe("S4 normalizers (REAL recorded run, 2026-07-27)", async () => {
  const items: FsExtractorMatch[] = await loadApify("s4-fixtures-sample.json");

  it("statuses map: finished/live/scheduled; unknowns null", () => {
    expect(s4Status("finished")).toBe("ft");
    expect(s4Status("live")).toBe("live");
    expect(s4Status("weird")).toBeNull();
  });

  it("naive match_date parses as UTC for identity, source_ref carried", () => {
    const m = items.find((i) => i.match_id === "8pzrmjup")!; // same match as S3
    const n = normalizeFsExtractorMatch(m, "AFCON-W")!;
    expect(n.kickoff_utc).toBe("2026-07-27T20:00:00.000Z");
    expect(n.source_refs.flashscore).toBe("8pzrmjup");
  });

  it("cross-actor identity: S3 and S4 rows for the same real match derive the same canonical id", async () => {
    const s3fx = normalizeFsLiveFixture(
      (await loadApify("s3-live-sample.json"))[0] as FsLiveMatch,
      "AFCON-W",
    )!;
    const s4m = items.find((i) => i.match_id === "8pzrmjup")!;
    const s4fx = normalizeFsExtractorMatch(s4m, "AFCON-W")!;
    expect(s4fx.id).toBe(s3fx.id);
  });
});
