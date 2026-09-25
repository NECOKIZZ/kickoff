// The data pack: everything Kickoff gives an agent to predict from, in one
// payload. Managed (soul.md) agents get ONLY this; BYOK agents get it via
// MCP and may bring their own data on top.
//
// Sources: open fixtures come from Kickoff's markets table; results come
// from kickoff-data's /v1/results (every EPL match this season, FPL scores),
// falling back to the results Kickoff's own settlements recorded if the data
// service is unreachable. Form and the league table are derived from those.
//
// Deliberately EXCLUDED: pool sizes, pick concentration and other agents'
// guesses. Managed agents share a model; showing them the crowd would herd
// them onto the same scoreline (coalition/void risk) — and no agent gets a
// data path humans don't.

import { db, schema } from "@/db";
import { and, asc, desc, eq, gt, isNotNull } from "drizzle-orm";
import { lockDueMarkets } from "@/lib/markets";
import { listResults } from "@/lib/dataService";

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

export interface TableRow {
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface DataPack {
  generatedAt: string;
  competition: "Premier League";
  scoring: string;
  openFixtures: PackFixture[];
  recentResults: PackResult[];
  teamForm: Record<string, TeamForm>;
  table: TableRow[];
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

/** Season results from kickoff-data; null when it's unreachable/unconfigured. */
async function seasonResults(now: Date): Promise<PackResult[] | null> {
  // EPL season starts in August: from 1 Aug of the current season's year.
  const seasonYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  try {
    const rows = await listResults({ league: "EPL", from: `${seasonYear}-08-01` });
    return rows.map(({ data: r }) => ({
      date: r.kickoff_utc.slice(0, 10),
      home: r.home.name,
      away: r.away.name,
      score: `${r.score.home}-${r.score.away}`,
    }));
  } catch {
    return null;
  }
}

export async function buildDataPack(): Promise<DataPack> {
  const openFixtures = await openScoreFixtures();
  const season = await seasonResults(new Date());
  // Empty = scores not backfilled yet (or a data-service gap): fall back too.
  const fromDataService = season !== null && season.length > 0;
  const recentResults = fromDataService ? season : await settledResults();

  return {
    generatedAt: new Date().toISOString(),
    competition: "Premier League",
    scoring: SCORING,
    openFixtures,
    recentResults: recentResults.slice(0, 120),
    teamForm: teamFormFrom(recentResults),
    table: tableFrom(recentResults),
    notes: [
      fromDataService
        ? "Results cover every Premier League match played so far this season (most recent first); form and table are built from all of them."
        : "Results cover only matches Kickoff has settled (the full-season feed was unavailable); history may be thin.",
      "Only fixed-stake Score markets are listed. The stake is set by the market; you only choose the scoreline.",
    ],
  };
}

/** Fallback: results Kickoff's own settlements recorded, one per fixture. */
async function settledResults(): Promise<PackResult[]> {
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
  const results: PackResult[] = [];
  for (const r of settled) {
    const key = `${r.home}|${r.away}|${r.kickoffAt.toISOString().slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ date: r.kickoffAt.toISOString().slice(0, 10), home: r.home!, away: r.away!, score: `${r.h}-${r.a}` });
  }
  return results;
}

/** Pure: league table from results (3 pts a win, 1 a draw; GD then GF break ties). */
export function tableFrom(results: PackResult[]): TableRow[] {
  const rows = new Map<string, Omit<TableRow, "position">>();
  const get = (t: string) =>
    rows.get(t) ??
    rows
      .set(t, { team: t, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 })
      .get(t)!;
  for (const r of results) {
    const [h, a] = r.score.split("-").map(Number);
    for (const [team, gf, ga] of [
      [r.home, h, a],
      [r.away, a, h],
    ] as const) {
      const row = get(team);
      row.played++;
      row.goalsFor += gf;
      row.goalsAgainst += ga;
      row.goalDifference = row.goalsFor - row.goalsAgainst;
      if (gf > ga) {
        row.won++;
        row.points += 3;
      } else if (gf === ga) {
        row.drawn++;
        row.points += 1;
      } else row.lost++;
    }
  }
  return [...rows.values()]
    .sort((x, y) => y.points - x.points || y.goalDifference - x.goalDifference || y.goalsFor - x.goalsFor || x.team.localeCompare(y.team))
    .map((row, i) => ({ position: i + 1, ...row }));
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
