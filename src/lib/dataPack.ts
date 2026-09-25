// The data pack: everything Kickoff gives an agent to predict from, in one
// payload. Managed (soul.md) agents get ONLY this; BYOK agents get it via
// MCP and may bring their own data on top.
//
// Source today: Kickoff's own markets table (open fixtures + results the
// settlement recorded). kickoff-data is not hosted yet; when it is, richer
// history (full-season results, table) plugs in here without changing the
// shape agents see.
//
// Deliberately EXCLUDED: pool sizes, pick concentration and other agents'
// guesses. Managed agents share a model; showing them the crowd would herd
// them onto the same scoreline (coalition/void risk) — and no agent gets a
// data path humans don't.

import { db, schema } from "@/db";
import { and, asc, desc, eq, gt, isNotNull } from "drizzle-orm";
import { lockDueMarkets } from "@/lib/markets";

export interface PackFixture {
  marketId: number;
  home: string;
  away: string;
  kickoffAt: string;
  locksAt: string;
  gameweek: number | null;
  stakeUsdc: number;
}

export interface PackResult {
  date: string;
  home: string;
  away: string;
  score: string; // "2-1"
}

export interface TeamForm {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  last5: string; // most recent first, e.g. "WWDLW"
  atHome: { played: number; goalsFor: number; goalsAgainst: number };
  away: { played: number; goalsFor: number; goalsAgainst: number };
}

export interface DataPack {
  generatedAt: string;
  competition: "Premier League";
  scoring: string;
  openFixtures: PackFixture[];
  recentResults: PackResult[];
  teamForm: Record<string, TeamForm>;
  notes: string[];
}

const SCORING =
  "Closest scoreline wins a share of the losers' pool. Distance counts: getting the result (win/draw/loss) " +
  "wrong costs most; then goal difference, total goals, and each clean-sheet call. Beat the median guess to win.";

export async function openScoreFixtures(): Promise<PackFixture[]> {
  await lockDueMarkets();
  const rows = await db
    .select()
    .from(schema.markets)
    .where(and(eq(schema.markets.status, "open"), eq(schema.markets.kind, "scoreline"), gt(schema.markets.locksAt, new Date())))
    .orderBy(asc(schema.markets.kickoffAt))
    .limit(60);
  return rows
    .filter((m) => m.stakeMode === "fixed" && m.fixedStake != null)
    .map((m) => ({
      marketId: m.id,
      home: m.homeTeam ?? m.title,
      away: m.awayTeam ?? "",
      kickoffAt: m.kickoffAt.toISOString(),
      locksAt: m.locksAt.toISOString(),
      gameweek: m.gameweek,
      stakeUsdc: Number(m.fixedStake) / 1e6,
    }));
}

export async function buildDataPack(): Promise<DataPack> {
  const openFixtures = await openScoreFixtures();

  const settled = await db
    .select({
      home: schema.markets.homeTeam,
      away: schema.markets.awayTeam,
      kickoffAt: schema.markets.kickoffAt,
      h: schema.markets.actualHome,
      a: schema.markets.actualAway,
    })
    .from(schema.markets)
    .where(
      and(
        eq(schema.markets.kind, "scoreline"),
        eq(schema.markets.status, "settled"),
        isNotNull(schema.markets.actualHome),
        isNotNull(schema.markets.homeTeam),
        isNotNull(schema.markets.awayTeam),
      ),
    )
    .orderBy(desc(schema.markets.kickoffAt))
    .limit(400);

  // One result per fixture even if several markets listed it.
  const seen = new Set<string>();
  const recentResults: PackResult[] = [];
  for (const r of settled) {
    const key = `${r.home}|${r.away}|${r.kickoffAt.toISOString().slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recentResults.push({ date: r.kickoffAt.toISOString().slice(0, 10), home: r.home!, away: r.away!, score: `${r.h}-${r.a}` });
  }

  return {
    generatedAt: new Date().toISOString(),
    competition: "Premier League",
    scoring: SCORING,
    openFixtures,
    recentResults: recentResults.slice(0, 120),
    teamForm: teamFormFrom(recentResults),
    notes: [
      "Results cover matches Kickoff has settled so far this season; early in the season history is thin.",
      "Only fixed-stake Score markets are listed. The stake is set by the market; you only choose the scoreline.",
    ],
  };
}

/** Pure: per-team form from results (most recent first). */
export function teamFormFrom(results: PackResult[]): Record<string, TeamForm> {
  const form: Record<string, TeamForm> = {};
  const get = (t: string) =>
    (form[t] ??= {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      last5: "",
      atHome: { played: 0, goalsFor: 0, goalsAgainst: 0 },
      away: { played: 0, goalsFor: 0, goalsAgainst: 0 },
    });
  for (const r of results) {
    const [h, a] = r.score.split("-").map(Number);
    for (const side of ["home", "away"] as const) {
      const t = get(side === "home" ? r.home : r.away);
      const gf = side === "home" ? h : a;
      const ga = side === "home" ? a : h;
      t.played++;
      t.goalsFor += gf;
      t.goalsAgainst += ga;
      const res = gf > ga ? "W" : gf < ga ? "L" : "D";
      if (res === "W") t.won++;
      else if (res === "L") t.lost++;
      else t.drawn++;
      if (t.last5.length < 5) t.last5 += res;
      const split = side === "home" ? t.atHome : t.away;
      split.played++;
      split.goalsFor += gf;
      split.goalsAgainst += ga;
    }
  }
  return form;
}
