import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AfFixture, AfLineup } from "../src/apiFootball";
import type { FdMatch } from "../src/footballDataOrg";
import { fixturesDir } from "../src/mockDir";
import {
  afStatus,
  normalizeAfFixture,
  normalizeAfEvents,
  normalizeAfPlayers,
} from "../src/normalize/apiFootball";
import { fdStatus, normalizeFdMatch } from "../src/normalize/footballDataOrg";
import { canonicalFixtureId, resolveFixtureId } from "../src/identity";

async function loadFixture(name: string): Promise<any> {
  const raw = await readFile(path.join(fixturesDir(), name), "utf8");
  return JSON.parse(raw);
}

describe("S1 normalizers (recorded Arsenal 2-1 Spurs)", async () => {
  const body = await loadFixture("fixtures-byid-1399001.json");
  const raw: AfFixture & { events: any[] } = body.response[0];
  const lineups: AfLineup[] = (await loadFixture("lineups-1399001.json")).response;
  const teams = (await loadFixture("players-1399001.json")).response;
  const HOME_ID = 42; // Arsenal

  const fx = normalizeAfFixture(raw);

  it("fixture normalizes: canonical id, status ft, source_refs carry the S1 id", () => {
    expect(fx.id).toBe("epl-arsenal-tottenham-202605241500");
    expect(fx.status).toBe("ft");
    expect(fx.statusUnknown).toBe(false);
    expect(fx.source_refs.apiFootball).toBe(1399001);
    expect(fx.home.slug).toBe("arsenal");
    expect(fx.away.slug).toBe("tottenham");
  });

  it("unknown status codes flag for review instead of guessing", () => {
    expect(afStatus("SOMETHING_NEW")).toBeNull();
    const weird = normalizeAfFixture({ ...raw, fixture: { ...raw.fixture, status: { short: "??", elapsed: null } } });
    expect(weird.statusUnknown).toBe(true);
  });

  const events = normalizeAfEvents(fx.id, HOME_ID, raw.events, "2026-05-24T17:00:00Z");

  it("events: substitution row carries BOTH players (off→player, on→player_in)", () => {
    const sub = events.find((e) => e.type === "substitution")!;
    expect(sub.player).toBe("M. Odegaard"); // off
    expect(sub.player_in).toBe("E. Nwaneri"); // on
    expect(sub.side).toBe("home");
  });

  it("events: penalty goal typed distinctly, sides assigned by team id", () => {
    const pen = events.find((e) => e.type === "penalty_goal")!;
    expect(pen.player).toBe("H. Son");
    expect(pen.side).toBe("away");
    expect(events.filter((e) => e.type === "goal")).toHaveLength(2);
  });

  const players = normalizeAfPlayers(fx.id, teams, lineups, raw.events, HOME_ID);

  it("players: full §2.1 checklist survives normalization", () => {
    const saka = players.find((p) => p.player_id === 1001)!;
    expect(saka).toMatchObject({
      team: "home",
      position: "F",
      goals: 1,
      assists: 1,
      started: true,
      sub_off_minute: null,
    });
    expect(saka.minutes).toBeGreaterThanOrEqual(60);
  });

  it("second-yellow stacking passes through unfixed: Romero has yellow AND red", () => {
    const romero = players.find((p) => p.player_id === 2003)!;
    expect(romero.yellow_cards).toBe(1);
    expect(romero.red_cards).toBe(1);
  });

  it("one-m 'commited' maps to penalties_conceded: Magalhaes = 1", () => {
    const gabriel = players.find((p) => p.player_id === 1007)!;
    expect(gabriel.penalties_conceded).toBe(1);
  });

  it("derived conceded_while_on: Odegaard off at 70 missed the 2nd goal window", () => {
    const ode = players.find((p) => p.player_id === 1002)!;
    expect(ode.conceded_while_on).toBe(1);
    expect(ode.sub_off_minute).toBe(70);
    const nwaneri = players.find((p) => p.player_id === 1005)!;
    expect(nwaneri.started).toBe(false);
    expect(nwaneri.sub_on_minute).toBe(70);
    expect(nwaneri.conceded_while_on).toBe(0);
  });

  it("GK saves land despite living under `goals` on the wire: Vicario = 6", () => {
    const vicario = players.find((p) => p.player_id === 2000)!;
    expect(vicario.position).toBe("G");
    expect(vicario.saves).toBe(6);
  });
});

describe("S2 normalizers (recorded fd.org matches)", async () => {
  const matches: FdMatch[] = (await loadFixture("fdorg-matches.json")).matches;

  it("scheduled match: canonical id matches what S1 would derive for the same real fixture", () => {
    const m = normalizeFdMatch(matches[0]);
    // "Arsenal FC" (S2) and "Arsenal" (S1) → same slug → same canonical id.
    expect(m.id).toBe(canonicalFixtureId("EPL", new Date("2026-08-15T14:00:00Z"), "Arsenal", "Chelsea"));
    expect(m.status).toBe("scheduled");
    expect(m.finalScore).toBeNull();
    expect(m.source_refs.fdorg).toBe(500001);
  });

  it("season derives from kickoff month (EPL season starts in the year of an Aug kickoff)", () => {
    const m = normalizeFdMatch(matches[0]);
    expect(m.season).toBe(2026);
  });

  it("unknown status flags for review", () => {
    expect(fdStatus("NEW_WEIRD_STATE")).toBeNull();
  });
});

describe("cross-source identity resolution (±5min tolerance)", () => {
  const known = [
    {
      id: "epl-arsenal-chelsea-202608151400",
      league: "EPL",
      kickoffUtc: new Date("2026-08-15T14:00:00Z"),
      homeSlug: "arsenal",
      awaySlug: "chelsea",
    },
  ];

  it("resolves the same fixture when a source reports kickoff 3min off", () => {
    expect(resolveFixtureId(known, "EPL", new Date("2026-08-15T14:03:00Z"), "Arsenal FC", "Chelsea FC"))
      .toBe("epl-arsenal-chelsea-202608151400");
  });

  it("does NOT resolve when drift exceeds 5min — caller flags for review", () => {
    expect(resolveFixtureId(known, "EPL", new Date("2026-08-15T14:06:00Z"), "Arsenal", "Chelsea")).toBeNull();
  });

  it("does NOT resolve a different pairing at the same kickoff", () => {
    expect(resolveFixtureId(known, "EPL", new Date("2026-08-15T14:00:00Z"), "Arsenal", "Spurs")).toBeNull();
  });
});
