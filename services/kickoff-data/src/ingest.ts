// Ingest — writes normalized entities into the canonical tables. This is the
// ONLY module that writes listing/charts/Market-B rows; jobs call these, the
// consumer API reads.
//
// Reconciliation on write: an incoming fixture first tries resolveFixtureId
// against fixtures already in the DB (±5min window). Match → merge
// source_refs into the existing row. No match on id AND no resolution →
// insert new. Same id but conflicting teams/kickoff → needs_review, never
// guessed (spec §2).

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Fixture, FixtureStatus, PlayerMatchStats, MatchEvent, MatchState, MatchStats } from "@kickoff/schema";
import { db, schema } from "./db";
import { resolveFixtureId, KICKOFF_TOLERANCE_MS } from "./identity";

// Status-change hook — installed by the worker (same pattern as
// installDbSink/installDbBudgetStore) to fire the fixture.status_changed
// webhook. Never awaited on the ingest path and never allowed to throw into
// it: a dead consumer must not fail a write.
type StatusChangeListener = (fixtureId: string, from: FixtureStatus, to: FixtureStatus) => void;
let onStatusChange: StatusChangeListener | null = null;

export function installStatusChangeListener(fn: StatusChangeListener): void {
  onStatusChange = fn;
}

/**
 * Upsert one normalized fixture. Returns the canonical id it landed under
 * (which may differ from fixture.id when it reconciled to an existing row
 * whose kickoff drifted within tolerance).
 */
export async function upsertFixture(
  fixture: Fixture,
  opts: { statusUnknown?: boolean } = {},
): Promise<string> {
  const kickoff = new Date(fixture.kickoff_utc);

  // Candidate rows for reconciliation: same teams, kickoff within tolerance.
  const windowStart = new Date(kickoff.getTime() - KICKOFF_TOLERANCE_MS);
  const windowEnd = new Date(kickoff.getTime() + KICKOFF_TOLERANCE_MS);
  const candidates = await db
    .select({
      id: schema.fixtures.id,
      league: schema.fixtures.league,
      kickoffUtc: schema.fixtures.kickoffUtc,
      homeSlug: schema.fixtures.homeSlug,
      awaySlug: schema.fixtures.awaySlug,
    })
    .from(schema.fixtures)
    .where(
      and(
        eq(schema.fixtures.league, fixture.league),
        eq(schema.fixtures.homeSlug, fixture.home.slug),
        eq(schema.fixtures.awaySlug, fixture.away.slug),
        gte(schema.fixtures.kickoffUtc, windowStart),
        lte(schema.fixtures.kickoffUtc, windowEnd),
      ),
    );

  const resolved = resolveFixtureId(
    candidates.map((c) => ({ ...c, kickoffUtc: new Date(c.kickoffUtc) })),
    fixture.league,
    kickoff,
    fixture.home.name,
    fixture.away.name,
  );

  const id = resolved ?? fixture.id;
  const needsReview = opts.statusUnknown === true;

  // Old status for the status_changed hook — one cheap PK read per upsert.
  const prev = await db
    .select({ status: schema.fixtures.status })
    .from(schema.fixtures)
    .where(eq(schema.fixtures.id, id))
    .limit(1);

  await db
    .insert(schema.fixtures)
    .values({
      id,
      league: fixture.league,
      season: fixture.season,
      kickoffUtc: kickoff,
      homeSlug: fixture.home.slug,
      homeName: fixture.home.name,
      awaySlug: fixture.away.slug,
      awayName: fixture.away.name,
      status: fixture.status,
      venue: fixture.venue ?? null,
      sourceRefs: fixture.source_refs,
      needsReview,
    })
    .onConflictDoUpdate({
      target: schema.fixtures.id,
      set: {
        // Status advances from any source; source_refs merge (jsonb ||).
        status: fixture.status,
        sourceRefs: sql`${schema.fixtures.sourceRefs} || ${JSON.stringify(fixture.source_refs)}::jsonb`,
        needsReview: needsReview ? sql`true` : schema.fixtures.needsReview,
        updatedAt: sql`now()`,
      },
    });

  const from = prev[0]?.status;
  if (onStatusChange && from !== undefined && from !== fixture.status) {
    try {
      onStatusChange(id, from, fixture.status);
    } catch (e) {
      console.error(`[ingest] status listener threw: ${(e as Error).message}`);
    }
  }

  return id;
}

/** Batch player stats for one fixture — replaces the fixture's rows (S1 is
 *  the sole Market B source; a re-fetch is a full refresh, unique on
 *  (fixture_id, player_id) makes this idempotent). */
export async function upsertPlayerStats(
  rows: PlayerMatchStats[],
  rawPayloadId: number | null,
  fetchedAt: Date,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(schema.playerMatchStats)
    .values(
      rows.map((r) => ({
        fixtureId: r.fixture_id,
        playerId: r.player_id,
        playerName: r.player_name,
        team: r.team,
        position: r.position,
        minutes: r.minutes,
        started: r.started,
        subOnMinute: r.sub_on_minute,
        subOffMinute: r.sub_off_minute,
        goals: r.goals,
        assists: r.assists,
        ownGoals: r.own_goals,
        yellowCards: r.yellow_cards,
        redCards: r.red_cards,
        penaltiesWon: r.penalties_won,
        penaltiesConceded: r.penalties_conceded,
        penaltiesSaved: r.penalties_saved,
        saves: r.saves,
        tackles: r.tackles,
        shotsOnTarget: r.shots_on_target,
        concededWhileOn: r.conceded_while_on,
        source: "apiFootball" as const,
        rawPayloadId,
        fetchedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.playerMatchStats.fixtureId, schema.playerMatchStats.playerId],
      set: {
        minutes: sql`excluded.minutes`,
        position: sql`excluded.position`,
        started: sql`excluded.started`,
        subOnMinute: sql`excluded.sub_on_minute`,
        subOffMinute: sql`excluded.sub_off_minute`,
        goals: sql`excluded.goals`,
        assists: sql`excluded.assists`,
        ownGoals: sql`excluded.own_goals`,
        yellowCards: sql`excluded.yellow_cards`,
        redCards: sql`excluded.red_cards`,
        penaltiesWon: sql`excluded.penalties_won`,
        penaltiesConceded: sql`excluded.penalties_conceded`,
        penaltiesSaved: sql`excluded.penalties_saved`,
        saves: sql`excluded.saves`,
        tackles: sql`excluded.tackles`,
        shotsOnTarget: sql`excluded.shots_on_target`,
        concededWhileOn: sql`excluded.conceded_while_on`,
        rawPayloadId: sql`excluded.raw_payload_id`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

/** Append events idempotently — the dedup index makes re-ingest a no-op. */
export async function insertEvents(events: MatchEvent[], rawPayloadId: number | null): Promise<void> {
  if (events.length === 0) return;
  await db
    .insert(schema.matchEvents)
    .values(
      events.map((e) => ({
        fixtureId: e.fixture_id,
        minute: e.minute,
        type: e.type,
        side: e.side,
        player: e.player,
        playerIn: e.player_in ?? null,
        scoreAfterHome: e.score_after?.home ?? null,
        scoreAfterAway: e.score_after?.away ?? null,
        source: e.source,
        rawPayloadId,
      })),
    )
    .onConflictDoNothing();
}

/** Live match state — one row per fixture, overwritten each poll (chart lane). */
export async function upsertMatchState(state: MatchState, source: "flashscore", fetchedAt: Date): Promise<void> {
  await db
    .insert(schema.matchState)
    .values({
      fixtureId: state.fixture_id,
      minute: state.minute,
      period: state.period,
      scoreHome: state.score.home,
      scoreAway: state.score.away,
      lastEventAt: state.last_event_at ? new Date(state.last_event_at) : null,
      source,
      fetchedAt,
    })
    .onConflictDoUpdate({
      target: schema.matchState.fixtureId,
      set: {
        minute: sql`excluded.minute`,
        period: sql`excluded.period`,
        scoreHome: sql`excluded.score_home`,
        scoreAway: sql`excluded.score_away`,
        lastEventAt: sql`excluded.last_event_at`,
        source: sql`excluded.source`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

/** Chart-lane stat rows — replaced per (fixture, period, source) each poll. */
export async function upsertMatchStats(rows: MatchStats[], source: "flashscore", fetchedAt: Date): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(schema.matchStats)
    .values(
      rows.map((r) => ({
        fixtureId: r.fixture_id,
        period: r.period,
        home: r.home,
        away: r.away,
        source,
        fetchedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.matchStats.fixtureId, schema.matchStats.period, schema.matchStats.source],
      set: { home: sql`excluded.home`, away: sql`excluded.away`, fetchedAt: sql`excluded.fetched_at` },
    });
}

/** Fixtures the planner cares about: near-future + not-yet-settled past. */
export async function loadPlannerFixtures(now: Date, horizonDays = 14): Promise<
  Array<{ id: string; kickoffUtc: Date; status: string; sourceRefs: Record<string, unknown> }>
> {
  const from = new Date(now.getTime() - 2 * 24 * 3600_000); // recent past for FT jobs
  const to = new Date(now.getTime() + horizonDays * 24 * 3600_000);
  const rows = await db
    .select({
      id: schema.fixtures.id,
      kickoffUtc: schema.fixtures.kickoffUtc,
      status: schema.fixtures.status,
      sourceRefs: schema.fixtures.sourceRefs,
    })
    .from(schema.fixtures)
    .where(and(gte(schema.fixtures.kickoffUtc, from), lte(schema.fixtures.kickoffUtc, to)));
  return rows.map((r) => ({ ...r, kickoffUtc: new Date(r.kickoffUtc), sourceRefs: r.sourceRefs as Record<string, unknown> }));
}

/** Which of these fixtures already have a frozen settlement snapshot. */
export async function loadSettledIds(fixtureIds: string[]): Promise<Set<string>> {
  if (fixtureIds.length === 0) return new Set();
  const rows = await db
    .select({ fixtureId: schema.settlementSnapshots.fixtureId })
    .from(schema.settlementSnapshots)
    .where(
      and(
        inArray(schema.settlementSnapshots.fixtureId, fixtureIds),
        eq(schema.settlementSnapshots.status, "frozen"),
      ),
    );
  return new Set(rows.map((r) => r.fixtureId));
}
