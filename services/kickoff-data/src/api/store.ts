// Drizzle-backed ApiStore — the only DB-aware half of the consumer API.
// Rows come out of the canonical tables and are shaped into @kickoff/schema
// entities here so routes.ts (and its tests) never see Drizzle.

import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type {
  Fixture,
  Gameweek,
  MatchEvent,
  MatchEventType,
  MatchResult,
  MatchState,
  MatchStats,
  PlayerGwPoints,
  PlayerMatchStats,
  PlayerPointsSettlement,
  PointsCrossCheckFlag,
  SettlementSnapshot,
  SettlementVote,
  SourceId,
  SourceRefs,
  StatLine,
} from "@kickoff/schema";
import { db, schema } from "../db";
import { backtestFixture } from "../backtest";
import type { ApiStore, FixtureFilter, PlayerPointsSnapshotRow, SnapshotRow, Stamped } from "./routes";

/** EPL season = the year it starts in (Aug–May). Default for FPL queries. */
function currentSeason(): number {
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

type FixtureRow = typeof schema.fixtures.$inferSelect;

function toFixture(r: FixtureRow): Fixture {
  return {
    id: r.id,
    league: r.league,
    season: r.season,
    kickoff_utc: new Date(r.kickoffUtc).toISOString(),
    home: { slug: r.homeSlug, name: r.homeName },
    away: { slug: r.awaySlug, name: r.awayName },
    status: r.status,
    ...(r.venue ? { venue: r.venue } : {}),
    source_refs: r.sourceRefs as SourceRefs,
  };
}

/** Listing rows are stamped with the fixture's own updated_at; which source
 *  last advanced it lives in source_refs, so the wrapper says "apiFootball"
 *  only when S1 is the sole ref — otherwise the honest answer is "admin"-less
 *  best effort: report the first reconciled source. */
function fixtureSource(refs: SourceRefs): SourceId {
  if (refs.apiFootball !== undefined) return "apiFootball";
  if (refs.fdorg !== undefined) return "fdorg";
  if (refs.flashscore !== undefined || refs.fsfd !== undefined) return "flashscore";
  if (refs.fpl !== undefined) return "fpl";
  return "admin";
}

function stampFixture(r: FixtureRow): Stamped<Fixture> {
  return {
    data: toFixture(r),
    source: fixtureSource(r.sourceRefs as SourceRefs),
    fetchedAt: new Date(r.updatedAt),
  };
}

export const drizzleStore: ApiStore = {
  async listFixtures(filter: FixtureFilter) {
    const conds = [];
    if (filter.league) conds.push(eq(schema.fixtures.league, filter.league));
    if (filter.from) conds.push(gte(schema.fixtures.kickoffUtc, filter.from));
    if (filter.to) conds.push(lte(schema.fixtures.kickoffUtc, filter.to));
    const rows = await db
      .select()
      .from(schema.fixtures)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(schema.fixtures.kickoffUtc));
    return rows.map(stampFixture);
  },

  async listResults(filter: FixtureFilter) {
    const conds = [
      eq(schema.fixtures.status, "ft"),
      isNotNull(schema.fixtures.homeScore),
      isNotNull(schema.fixtures.awayScore),
    ];
    if (filter.league) conds.push(eq(schema.fixtures.league, filter.league));
    if (filter.from) conds.push(gte(schema.fixtures.kickoffUtc, filter.from));
    if (filter.to) conds.push(lte(schema.fixtures.kickoffUtc, filter.to));
    const rows = await db
      .select()
      .from(schema.fixtures)
      .where(and(...conds))
      .orderBy(desc(schema.fixtures.kickoffUtc))
      .limit(800); // two seasons of EPL
    return rows.map((r): Stamped<MatchResult> => ({
      data: {
        fixture_id: r.id,
        kickoff_utc: new Date(r.kickoffUtc).toISOString(),
        home: { slug: r.homeSlug, name: r.homeName },
        away: { slug: r.awaySlug, name: r.awayName },
        score: { home: r.homeScore!, away: r.awayScore! },
      },
      source: fixtureSource(r.sourceRefs as SourceRefs),
      fetchedAt: new Date(r.updatedAt),
    }));
  },
  async getFixture(id: string) {
    const rows = await db.select().from(schema.fixtures).where(eq(schema.fixtures.id, id)).limit(1);
    return rows[0] ? stampFixture(rows[0]) : null;
  },

  async getMatchState(fixtureId: string) {
    const fx = await this.getFixture(fixtureId);
    if (!fx) return null;
    const rows = await db
      .select()
      .from(schema.matchState)
      .where(eq(schema.matchState.fixtureId, fixtureId))
      .limit(1);
    const r = rows[0];
    if (!r) {
      // Known fixture, no live row yet — an honest PRE state, stamped by the
      // fixture row so staleness reflects "we last touched this when".
      const state: MatchState = {
        fixture_id: fixtureId,
        minute: null,
        period: "PRE",
        score: { home: 0, away: 0 },
        last_event_at: null,
      };
      return { data: state, source: fx.source, fetchedAt: fx.fetchedAt };
    }
    const state: MatchState = {
      fixture_id: r.fixtureId,
      minute: r.minute,
      period: r.period as MatchState["period"],
      score: { home: r.scoreHome, away: r.scoreAway },
      last_event_at: r.lastEventAt ? new Date(r.lastEventAt).toISOString() : null,
    };
    return { data: state, source: r.source, fetchedAt: new Date(r.fetchedAt) };
  },

  async getMatchEvents(fixtureId: string) {
    if (!(await this.getFixture(fixtureId))) return null;
    const rows = await db
      .select()
      .from(schema.matchEvents)
      .where(eq(schema.matchEvents.fixtureId, fixtureId))
      .orderBy(asc(schema.matchEvents.minute), asc(schema.matchEvents.id));
    const events: MatchEvent[] = rows.map((r) => ({
      fixture_id: r.fixtureId,
      minute: r.minute,
      type: r.type as MatchEventType,
      side: r.side as "home" | "away",
      player: r.player,
      ...(r.playerIn !== null ? { player_in: r.playerIn } : {}),
      score_after:
        r.scoreAfterHome !== null && r.scoreAfterAway !== null
          ? { home: r.scoreAfterHome, away: r.scoreAfterAway }
          : null,
      source: r.source,
      ingested_at: new Date(r.ingestedAt).toISOString(),
    }));
    const last = rows[rows.length - 1];
    return {
      data: events,
      source: last?.source ?? "flashscore",
      fetchedAt: last ? new Date(last.ingestedAt) : new Date(0),
    };
  },

  async getMatchStats(fixtureId: string) {
    if (!(await this.getFixture(fixtureId))) return null;
    const rows = await db
      .select()
      .from(schema.matchStats)
      .where(eq(schema.matchStats.fixtureId, fixtureId))
      .orderBy(asc(schema.matchStats.period));
    const stats: MatchStats[] = rows.map((r) => ({
      fixture_id: r.fixtureId,
      period: r.period as MatchStats["period"],
      home: r.home as StatLine,
      away: r.away as StatLine,
    }));
    const newest = rows.reduce<Date | null>((m, r) => {
      const t = new Date(r.fetchedAt);
      return m && m > t ? m : t;
    }, null);
    return { data: stats, source: rows[0]?.source ?? "flashscore", fetchedAt: newest ?? new Date(0) };
  },

  async getPlayerStats(fixtureId: string) {
    if (!(await this.getFixture(fixtureId))) return null;
    const rows = await db
      .select()
      .from(schema.playerMatchStats)
      .where(eq(schema.playerMatchStats.fixtureId, fixtureId))
      .orderBy(asc(schema.playerMatchStats.playerId));
    const players: PlayerMatchStats[] = rows.map((r) => ({
      fixture_id: r.fixtureId,
      player_id: r.playerId,
      player_name: r.playerName,
      team: r.team as "home" | "away",
      position: r.position as PlayerMatchStats["position"],
      minutes: r.minutes,
      started: r.started,
      sub_on_minute: r.subOnMinute,
      sub_off_minute: r.subOffMinute,
      goals: r.goals,
      assists: r.assists,
      own_goals: r.ownGoals,
      yellow_cards: r.yellowCards,
      red_cards: r.redCards,
      penalties_won: r.penaltiesWon,
      penalties_conceded: r.penaltiesConceded,
      penalties_saved: r.penaltiesSaved,
      saves: r.saves,
      tackles: r.tackles,
      shots_on_target: r.shotsOnTarget,
      conceded_while_on: r.concededWhileOn,
    }));
    const newest = rows.reduce<Date | null>((m, r) => {
      const t = new Date(r.fetchedAt);
      return m && m > t ? m : t;
    }, null);
    return { data: players, source: rows[0]?.source ?? "apiFootball", fetchedAt: newest ?? new Date(0) };
  },

  async getLatestSnapshot(fixtureId: string) {
    const rows = await db
      .select()
      .from(schema.settlementSnapshots)
      .where(eq(schema.settlementSnapshots.fixtureId, fixtureId))
      .orderBy(desc(schema.settlementSnapshots.version))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    const row: SnapshotRow = {
      status: r.status,
      votesCollected: Array.isArray(r.votes) ? (r.votes as SettlementVote[]).length : 0,
      freezesAt: r.freezesAt ? new Date(r.freezesAt) : null,
      snapshot:
        r.status === "frozen" && r.outcomeHome !== null && r.outcomeAway !== null
          ? {
              fixture_id: r.fixtureId,
              version: r.version,
              outcome: { home: r.outcomeHome, away: r.outcomeAway },
              votes: r.votes as SettlementVote[],
              quorum_rule: r.quorumRule ?? "unknown",
              frozen_at: new Date(r.frozenAt ?? r.createdAt).toISOString(),
              ...(r.supersedesReason ? { supersedes_reason: r.supersedesReason } : {}),
            }
          : null,
    };
    return row;
  },

  async insertAdminOverride(fixtureId, outcome, reason) {
    // Immutability rule (spec §5): corrections INSERT version N+1, never
    // UPDATE N. Admin override freezes immediately — the human IS the quorum.
    return db.transaction(async (tx) => {
      const latest = await tx
        .select({ version: schema.settlementSnapshots.version })
        .from(schema.settlementSnapshots)
        .where(eq(schema.settlementSnapshots.fixtureId, fixtureId))
        .orderBy(desc(schema.settlementSnapshots.version))
        .limit(1);
      const version = (latest[0]?.version ?? 0) + 1;
      const now = new Date();
      const vote: SettlementVote = {
        source: "admin",
        scoreline: outcome,
        fetched_at: now.toISOString(),
        raw_payload_ref: `admin-override:${fixtureId}:v${version}`,
      };
      await tx.insert(schema.settlementSnapshots).values({
        fixtureId,
        version,
        status: "frozen",
        outcomeHome: outcome.home,
        outcomeAway: outcome.away,
        votes: [vote],
        quorumRule: "admin-override",
        frozenAt: now,
        supersedesReason: version > 1 ? reason : null,
      });
      const snapshot: SettlementSnapshot = {
        fixture_id: fixtureId,
        version,
        outcome,
        votes: [vote],
        quorum_rule: "admin-override",
        frozen_at: now.toISOString(),
        ...(version > 1 ? { supersedes_reason: reason } : {}),
      };
      return snapshot;
    });
  },

  runBacktest(s1FixtureId) {
    return backtestFixture(s1FixtureId);
  },

  // --- FPL lane ---

  async listGameweeks(season) {
    const s = season ?? currentSeason();
    const rows = await db
      .select()
      .from(schema.fplGameweeks)
      .where(eq(schema.fplGameweeks.season, s))
      .orderBy(asc(schema.fplGameweeks.gw));
    const newest = rows.reduce<Date | null>((m, r) => {
      const t = new Date(r.updatedAt);
      return m && m > t ? m : t;
    }, null);
    return {
      data: rows.map(toGameweek),
      source: "fpl",
      fetchedAt: newest ?? new Date(0),
    };
  },

  async getGameweek(gw, season) {
    const s = season ?? currentSeason();
    const rows = await db
      .select()
      .from(schema.fplGameweeks)
      .where(and(eq(schema.fplGameweeks.season, s), eq(schema.fplGameweeks.gw, gw)))
      .limit(1);
    const r = rows[0];
    return r ? { data: toGameweek(r), source: "fpl", fetchedAt: new Date(r.updatedAt) } : null;
  },

  async getGwPoints(gw, season) {
    const s = season ?? currentSeason();
    if (!(await this.getGameweek(gw, s))) return null;
    const rows = await db
      .select()
      .from(schema.fplPlayerPoints)
      .where(and(eq(schema.fplPlayerPoints.season, s), eq(schema.fplPlayerPoints.gw, gw)))
      .orderBy(asc(schema.fplPlayerPoints.elementId));
    const names = await fplIdentityMap(s);
    const newest = rows.reduce<Date | null>((m, r) => {
      const t = new Date(r.fetchedAt);
      return m && m > t ? m : t;
    }, null);
    return {
      data: rows.map((r) => toGwPoints(r, names)),
      source: "fpl",
      fetchedAt: newest ?? new Date(0),
    };
  },

  async getPlayerGwPoints(elementId, gw, season) {
    const s = season ?? currentSeason();
    const rows = await db
      .select()
      .from(schema.fplPlayerPoints)
      .where(
        and(
          eq(schema.fplPlayerPoints.season, s),
          eq(schema.fplPlayerPoints.gw, gw),
          eq(schema.fplPlayerPoints.elementId, elementId),
        ),
      )
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    const names = await fplIdentityMap(s);
    return { data: toGwPoints(r, names), source: "fpl", fetchedAt: new Date(r.fetchedAt) };
  },

  async getPlayerPointsSnapshot(gw, season) {
    const s = season ?? currentSeason();
    const gwRows = await db
      .select({ dataChecked: schema.fplGameweeks.dataChecked })
      .from(schema.fplGameweeks)
      .where(and(eq(schema.fplGameweeks.season, s), eq(schema.fplGameweeks.gw, gw)))
      .limit(1);
    if (!gwRows[0]) return null;
    const rows = await db
      .select()
      .from(schema.playerPointsSettlements)
      .where(and(eq(schema.playerPointsSettlements.season, s), eq(schema.playerPointsSettlements.gw, gw)))
      .orderBy(desc(schema.playerPointsSettlements.version))
      .limit(1);
    const r = rows[0];
    if (!r) return { status: "pending", settlement: null, dataChecked: gwRows[0].dataChecked };
    return {
      status: r.status,
      dataChecked: gwRows[0].dataChecked,
      settlement: r.status === "frozen" ? toPlayerPointsSettlement(r) : null,
    };
  },

  async insertPlayerPointsOverride(gw, points, reason, season) {
    // Same immutability rule as insertAdminOverride: corrections INSERT
    // version N+1 frozen, never touch N. The human is FPL's proxy here.
    const s = season ?? currentSeason();
    return db.transaction(async (tx) => {
      const latest = await tx
        .select({ version: schema.playerPointsSettlements.version })
        .from(schema.playerPointsSettlements)
        .where(and(eq(schema.playerPointsSettlements.season, s), eq(schema.playerPointsSettlements.gw, gw)))
        .orderBy(desc(schema.playerPointsSettlements.version))
        .limit(1);
      const version = (latest[0]?.version ?? 0) + 1;
      const now = new Date();
      const names = await fplIdentityMap(s);
      const outcome = [...points]
        .sort((a, b) => a.element_id - b.element_id)
        .map((p) => ({
          element_id: p.element_id,
          player_name: names.get(p.element_id)?.webName ?? `element-${p.element_id}`,
          total_points: p.total_points,
        }));
      await tx.insert(schema.playerPointsSettlements).values({
        season: s,
        gw,
        version,
        status: "frozen",
        points: outcome,
        flags: [],
        frozenAt: now,
        supersedesReason: version > 1 ? reason : null,
      });
      const settlement: PlayerPointsSettlement = {
        gw,
        season: s,
        version,
        points: outcome,
        raw_payload_ref: `admin-override:gw${gw}:v${version}`,
        flags: [],
        frozen_at: now.toISOString(),
        ...(version > 1 ? { supersedes_reason: reason } : {}),
      };
      return settlement;
    });
  },
};

// --- FPL row → canonical mappers ---

type GameweekRow = typeof schema.fplGameweeks.$inferSelect;
type FplPointsRow = typeof schema.fplPlayerPoints.$inferSelect;
type PlayerPointsSettlementRow = typeof schema.playerPointsSettlements.$inferSelect;

function toGameweek(r: GameweekRow): Gameweek {
  return {
    id: r.gw,
    season: r.season,
    name: r.name,
    deadline_utc: new Date(r.deadlineUtc).toISOString(),
    is_current: r.isCurrent,
    finished: r.finished,
    data_checked: r.dataChecked,
  };
}

async function fplIdentityMap(
  season: number,
): Promise<Map<number, { webName: string; teamSlug: string; position: string }>> {
  const rows = await db
    .select({
      elementId: schema.fplPlayers.elementId,
      webName: schema.fplPlayers.webName,
      teamSlug: schema.fplPlayers.teamSlug,
      position: schema.fplPlayers.position,
    })
    .from(schema.fplPlayers)
    .where(eq(schema.fplPlayers.season, season));
  return new Map(rows.map((r) => [r.elementId, r]));
}

function toGwPoints(
  r: FplPointsRow,
  names: Map<number, { webName: string; teamSlug: string; position: string }>,
): PlayerGwPoints {
  const p = names.get(r.elementId);
  return {
    gw: r.gw,
    season: r.season,
    element_id: r.elementId,
    player_name: p?.webName ?? `element-${r.elementId}`,
    team_slug: p?.teamSlug ?? "unknown",
    position: (p?.position ?? "M") as PlayerGwPoints["position"],
    total_points: r.totalPoints,
    minutes: r.minutes,
    bonus: r.bonus,
    provisional: r.provisional,
    stats: r.stats as Record<string, number>,
  };
}

function toPlayerPointsSettlement(r: PlayerPointsSettlementRow): PlayerPointsSettlement {
  return {
    gw: r.gw,
    season: r.season,
    version: r.version,
    points: r.points as PlayerPointsSettlement["points"],
    raw_payload_ref: r.rawPayloadId !== null ? String(r.rawPayloadId) : "unarchived",
    flags: (r.flags ?? []) as PointsCrossCheckFlag[],
    frozen_at: new Date(r.frozenAt ?? r.createdAt).toISOString(),
    ...(r.supersedesReason ? { supersedes_reason: r.supersedesReason } : {}),
  };
}
