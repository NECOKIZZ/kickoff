import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deriveConceded, deriveOwnGoals, scorePlayer } from "@/data/scoring";
import { teamSlug, fixtureKey } from "@/data/footballDataOrg";
import type { AfEvent, AfLineup, AfPlayerStats } from "@/data/apiFootball";

async function loadFixture(name: string): Promise<any> {
  const raw = await readFile(path.join(process.cwd(), "src/data/fixtures", name), "utf8");
  return JSON.parse(raw);
}

describe("scoring rubric (mock Arsenal 2-1 Spurs)", async () => {
  const events: AfEvent[] = (await loadFixture("fixtures-byid-1399001.json")).response[0].events;
  const lineups: AfLineup[] = (await loadFixture("lineups-1399001.json")).response;
  const teams = (await loadFixture("players-1399001.json")).response;
  const players: AfPlayerStats[] = teams.flatMap((t: any) => t.players);
  const conceded = deriveConceded(lineups, events, 90);
  const ownGoals = deriveOwnGoals(events);

  const score = (id: number) => {
    const p = players.find((x) => x.player.id === id)!;
    return scorePlayer(p, conceded.concededBy.get(id) ?? 0, ownGoals.get(id) ?? 0);
  };

  it("FWD scorer with assist: Saka = 1+1+3+5+2 = 12", () => {
    expect(score(1001).basePoints).toBe(12_000_000n);
  });

  it("second-yellow defender stacks −1 and −2: Romero = 2−1−2−1 = −2", () => {
    expect(score(2003).basePoints).toBe(-2_000_000n);
  });

  it("GK conceding 2 with 6 saves: Vicario = 2−1+2 = 3", () => {
    expect(score(2000).basePoints).toBe(3_000_000n);
  });

  it("penalty-conceded defender: Magalhaes = 2−1 = 1 (one-m 'commited' field read)", () => {
    expect(score(1007).basePoints).toBe(1_000_000n);
  });

  it("sub appearing <60min gets 1 appearance point only: Nwaneri = 1", () => {
    expect(score(1005).basePoints).toBe(1_000_000n);
  });

  it("derived conceded matches provider field for every player who played", () => {
    for (const p of players) {
      const provider = p.statistics[0].goals.conceded;
      if (provider == null || (p.statistics[0].games.minutes ?? 0) === 0) continue;
      expect(conceded.concededBy.get(p.player.id) ?? 0, p.player.name).toBe(provider);
    }
  });

  it("substitution pairing: Odegaard off at 70 (conceded 1, not 2), Nwaneri on (conceded 0)", () => {
    expect(conceded.concededBy.get(1002) ?? 0).toBe(1);
    expect(conceded.concededBy.get(1005) ?? 0).toBe(0);
  });
});

describe("cross-provider team matching", () => {
  it("normalizes both providers' names to the same slug", () => {
    expect(teamSlug("Arsenal FC")).toBe(teamSlug("Arsenal"));
    expect(teamSlug("Manchester United FC")).toBe(teamSlug("Man United"));
    expect(teamSlug("Tottenham Hotspur FC")).toBe(teamSlug("Tottenham"));
    expect(teamSlug("Wolverhampton Wanderers FC")).toBe(teamSlug("Wolves"));
    expect(teamSlug("Brighton & Hove Albion FC")).toBe(teamSlug("Brighton"));
  });

  it("fixture keys match across providers for the same real fixture", () => {
    const afKey = fixtureKey("2026-08-15T14:00:00+00:00", "Arsenal", "Chelsea");
    const fdKey = fixtureKey("2026-08-15T14:00:00Z", "Arsenal FC", "Chelsea FC");
    expect(afKey).toBe(fdKey);
  });
});
