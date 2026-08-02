import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fixturesDir } from "../src/mockDir";
import {
  isMockMode,
  getBootstrap,
  getEventLive,
  getFplFixtures,
  type FplBootstrap,
} from "../src/fpl";
import {
  fplPosition,
  fplTeamSlugs,
  normalizeFplGameweeks,
  normalizeFplPlayers,
  normalizeFplFixtures,
  normalizeFplLive,
} from "../src/normalize/fpl";

async function loadFixture(name: string): Promise<any> {
  const raw = await readFile(path.join(fixturesDir(), name), "utf8");
  return JSON.parse(raw);
}

const SEASON = 2026;

describe("fpl client (mock mode)", () => {
  it("mock mode is on when KICKOFF_DATA_FPL_LIVE unset", () => {
    expect(process.env.KICKOFF_DATA_FPL_LIVE).toBeUndefined();
    expect(isMockMode()).toBe(true);
  });

  it("routes endpoints to recorded payloads", async () => {
    const boot = await getBootstrap();
    expect(boot.events).toHaveLength(38);
    expect(boot.teams).toHaveLength(20);
    expect(boot.elements.length).toBeGreaterThan(0);

    const live = await getEventLive(1);
    expect(live.elements.length).toBeGreaterThan(0);
    expect(live.elements[0].stats.total_points).toBeTypeOf("number");

    const fx = await getFplFixtures(1);
    expect(fx.length).toBeGreaterThan(0);
    expect(fx[0]).toHaveProperty("finished_provisional");
  });
});

describe("fpl normalizers (recorded payloads)", async () => {
  const boot: FplBootstrap = await loadFixture("fpl-bootstrap.json");

  it("team slugs go through the shared alias table", () => {
    const slugs = fplTeamSlugs(boot);
    const all = [...slugs.values()];
    expect(all).toContain("nottm-forest"); // FPL's "Nott'm Forest"
    expect(all).toContain("manchester-city"); // "Man City"
    expect(all).toContain("manchester-united"); // "Man Utd"
    expect(all).toContain("tottenham"); // "Spurs"
    expect(all).toContain("arsenal");
  });

  it("element_type maps to G/D/M/F and unknown throws", () => {
    expect(fplPosition(1)).toBe("G");
    expect(fplPosition(2)).toBe("D");
    expect(fplPosition(3)).toBe("M");
    expect(fplPosition(4)).toBe("F");
    expect(() => fplPosition(5)).toThrow();
  });

  it("gameweeks carry the finality flags verbatim", () => {
    const gws = normalizeFplGameweeks(boot, SEASON);
    expect(gws).toHaveLength(38);
    const gw1 = gws.find((g) => g.id === 1)!;
    expect(gw1.finished).toBe(true);
    expect(gw1.data_checked).toBe(true);
    const gw2 = gws.find((g) => g.id === 2)!;
    expect(gw2.finished).toBe(true);
    expect(gw2.data_checked).toBe(false); // the provisional stage
    const gw3 = gws.find((g) => g.id === 3)!;
    expect(gw3.is_current).toBe(true);
    expect(gws.every((g) => g.season === SEASON)).toBe(true);
  });

  it("players normalize with resolved team slugs and positions", () => {
    const players = normalizeFplPlayers(boot, SEASON);
    expect(players.length).toBe(boot.elements.length);
    const raya = players.find((p) => p.webName === "Raya")!;
    expect(raya.position).toBe("G");
    expect(raya.teamSlug).toBe("arsenal");
    expect(players.every((p) => !p.teamSlug.startsWith("fpl-team-"))).toBe(true);
  });

  it("fixtures normalize with slugs and finality flags", async () => {
    const rawFx = await loadFixture("fpl-fixtures.json");
    const rows = normalizeFplFixtures(rawFx, fplTeamSlugs(boot), SEASON);
    expect(rows.length).toBe(rawFx.length);
    // recorded mix: [0] fully finished, [1] FT-but-bonus-pending, [2] live
    expect(rows[0].finished).toBe(true);
    expect(rows[1].finishedProvisional).toBe(true);
    expect(rows[1].finished).toBe(false);
    expect(rows[2].started).toBe(true);
    expect(rows[2].finishedProvisional).toBe(false);
    expect(rows.every((r) => r.gw === 1)).toBe(true);
  });

  it("live points normalize; double gameweek keeps aggregated totals", async () => {
    const live = await loadFixture("fpl-event-live.json");
    const players = new Map(
      normalizeFplPlayers(boot, SEASON).map((p) => [
        p.elementId,
        { webName: p.webName, teamSlug: p.teamSlug, position: p.position },
      ]),
    );
    const rows = normalizeFplLive(1, SEASON, live.elements, players);
    expect(rows.length).toBe(live.elements.length);
    expect(rows.every((r) => r.provisional)).toBe(true);

    // element 2 is the recorded double-GW case: two explain entries, 180 min
    const dgwRaw = live.elements.find((e: any) => e.id === 2)!;
    expect(dgwRaw.explain).toHaveLength(2);
    const dgw = rows.find((r) => r.element_id === 2)!;
    expect(dgw.minutes).toBe(180);
    expect(dgw.total_points).toBe(dgwRaw.stats.total_points);

    // identity joined in from bootstrap
    const el1 = rows.find((r) => r.element_id === 1)!;
    expect(el1.player_name).toBe("Raya");
    expect(el1.team_slug).toBe("arsenal");

    // unknown element still produces a row — points are never dropped
    const orphan = normalizeFplLive(1, SEASON, [live.elements[0]], new Map());
    expect(orphan[0].player_name).toBe(`element-${live.elements[0].id}`);
    expect(orphan[0].total_points).toBe(live.elements[0].stats.total_points);
  });
});
