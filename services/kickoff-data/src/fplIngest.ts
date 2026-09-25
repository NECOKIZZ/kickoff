// FPL ingest — writes normalized FPL entities into the fpl_* tables. Kept
// separate from ingest.ts so the scoreline/Market-B lanes stay untouched.
//
// Fixture reconciliation is ATTACH-ONLY by default: an FPL fixture that
// matches a canonical fixture (league EPL, kickoff ±5min, team slugs) gets
// canonical_fixture_id set and {fpl: id} merged into fixtures.source_refs.
// No match → needs_review, never guessed. When FPL is configured as a
// listing source and/or settlement voter (sources.ts), applyFplRoles() below
// additionally creates canonical fixtures and casts FPL's settlement vote.

import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { FixtureStatus, Gameweek, PlayerGwPoints } from "@kickoff/schema";
import type { FplBootstrap, FplFixture } from "./fpl";
import type { FplPlayerRow, FplFixtureRow } from "./normalize/fpl";
import { db, schema } from "./db";
import { KICKOFF_TOLERANCE_MS, canonicalFixtureId } from "./identity";
import { teamSlug } from "./footballDataOrg";
import { upsertFixture, followSourceState, noteLiveScore } from "./ingest";
import { recordVote } from "./settlementLane";
import { listsFixtures, votesInSettlement } from "./sources";
import { log } from "./log";

export async function upsertGameweeks(rows: Gameweek[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(schema.fplGameweeks)
    .values(
      rows.map((g) => ({
        season: g.season,
        gw: g.id,
        name: g.name,
        deadlineUtc: new Date(g.deadline_utc),
        isCurrent: g.is_current,
        finished: g.finished,
        dataChecked: g.data_checked,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.fplGameweeks.season, schema.fplGameweeks.gw],
      set: {
        name: sql`excluded.name`,
        deadlineUtc: sql`excluded.deadline_utc`,
        isCurrent: sql`excluded.is_current`,
        finished: sql`excluded.finished`,
        dataChecked: sql`excluded.data_checked`,
        updatedAt: sql`now()`,
      },
    });
}

export async function upsertFplPlayers(rows: FplPlayerRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(schema.fplPlayers)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.fplPlayers.season, schema.fplPlayers.elementId],
      set: {
        webName: sql`excluded.web_name`,
        fullName: sql`excluded.full_name`,
        teamSlug: sql`excluded.team_slug`,
        position: sql`excluded.position`,
        updatedAt: sql`now()`,
      },
    });
}

/** Upsert FPL fixtures, then attach-only reconcile against canonical rows. */
export async function upsertFplFixtures(rows: FplFixtureRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(schema.fplFixtures)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.fplFixtures.season, schema.fplFixtures.fplId],
      set: {
        gw: sql`excluded.gw`,
        kickoffUtc: sql`excluded.kickoff_utc`,
        started: sql`excluded.started`,
        finishedProvisional: sql`excluded.finished_provisional`,
        finished: sql`excluded.finished`,
        updatedAt: sql`now()`,
      },
    });

  // Reconcile any row not yet attached (idempotent; re-tries every sync so a
  // fixture that lands in the canonical table later still attaches).
  const unattached = await db
    .select({
      id: schema.fplFixtures.id,
      season: schema.fplFixtures.season,
      fplId: schema.fplFixtures.fplId,
      kickoffUtc: schema.fplFixtures.kickoffUtc,
      homeSlug: schema.fplFixtures.homeSlug,
      awaySlug: schema.fplFixtures.awaySlug,
    })
    .from(schema.fplFixtures)
    .where(isNull(schema.fplFixtures.canonicalFixtureId));

  for (const f of unattached) {
    if (!f.kickoffUtc) continue; // unscheduled — nothing to match yet
    const kickoff = new Date(f.kickoffUtc);
    const windowStart = new Date(kickoff.getTime() - KICKOFF_TOLERANCE_MS);
    const windowEnd = new Date(kickoff.getTime() + KICKOFF_TOLERANCE_MS);
    const candidates = await db
      .select({ id: schema.fixtures.id })
      .from(schema.fixtures)
      .where(
        and(
          eq(schema.fixtures.league, "EPL"),
          eq(schema.fixtures.homeSlug, f.homeSlug),
          eq(schema.fixtures.awaySlug, f.awaySlug),
          gte(schema.fixtures.kickoffUtc, windowStart),
          lte(schema.fixtures.kickoffUtc, windowEnd),
        ),
      );
    const match = candidates[0];
    if (match) {
      await db
        .update(schema.fplFixtures)
        .set({ canonicalFixtureId: match.id, needsReview: false, updatedAt: sql`now()` })
        .where(eq(schema.fplFixtures.id, f.id));
      await db
        .update(schema.fixtures)
        .set({
          sourceRefs: sql`${schema.fixtures.sourceRefs} || ${JSON.stringify({ fpl: f.fplId })}::jsonb`,
          updatedAt: sql`now()`,
        })
        .where(eq(schema.fixtures.id, match.id));
    } else if (kickoff.getTime() < Date.now()) {
      // Only flag once kickoff has passed — future fixtures often just
      // haven't been listed by S1/S2 yet, that's not review-worthy.
      await db
        .update(schema.fplFixtures)
        .set({ needsReview: true, updatedAt: sql`now()` })
        .where(eq(schema.fplFixtures.id, f.id));
      log.warn("fplIngest", "fpl fixture unmatched past kickoff — needs review", {
        fplId: f.fplId,
        home: f.homeSlug,
        away: f.awaySlug,
      });
    }
  }
}

/** FPL has no half-time or abandonment flags: scheduled → live → ft. */
function fplStatus(f: FplFixture): FixtureStatus {
  if (!f.kickoff_time) return "postponed"; // FPL clears kickoff (and gw) when a match is postponed
  if (f.finished_provisional) return "ft";
  if (f.started) return "live";
  return "scheduled";
}

/** Only matches this recent get a settlement vote: a season backfill must not
 *  open snapshots (and settlement webhooks) for long-finished fixtures. */
const VOTE_WINDOW_MS = 48 * 3600_000;
/** Score changes are announced for matches this recent (covers stoppage time and the FT flip). */
const LIVE_WINDOW_MS = 4 * 3600_000;

/**
 * FPL's optional roles, run after upsertFplFixtures (so attachment is known):
 *  - listing (KICKOFF_DATA_LISTING_SOURCES has "fpl"): fixtures no other
 *    source listed become canonical fixtures; ones FPL is attached to follow
 *    its kickoff and status.
 *  - settlement (KICKOFF_DATA_SETTLEMENT_VOTERS has "fpl"): the score at
 *    finished_provisional (full time) is FPL's vote.
 */
export async function applyFplRoles(fx: FplFixture[], b: FplBootstrap, season: number, now: Date): Promise<void> {
  const lists = listsFixtures("fpl");
  const votes = votesInSettlement("fpl");
  if ((!lists && !votes) || fx.length === 0) return;

  const names = new Map(b.teams.map((t) => [t.id, t.name]));
  const rows = await db
    .select({ fplId: schema.fplFixtures.fplId, canonicalId: schema.fplFixtures.canonicalFixtureId })
    .from(schema.fplFixtures)
    .where(and(eq(schema.fplFixtures.season, season), inArray(schema.fplFixtures.fplId, fx.map((f) => f.id))));
  const attached = new Map(rows.map((r) => [r.fplId, r.canonicalId]));

  for (const f of fx) {
    let id = attached.get(f.id) ?? null;
    const status = fplStatus(f);

    if (lists) {
      if (id === null && f.kickoff_time) {
        const home = names.get(f.team_h);
        const away = names.get(f.team_a);
        if (!home || !away) continue;
        id = await upsertFixture({
          id: canonicalFixtureId("EPL", new Date(f.kickoff_time), home, away),
          league: "EPL",
          season,
          kickoff_utc: f.kickoff_time,
          home: { slug: teamSlug(home), name: home },
          away: { slug: teamSlug(away), name: away },
          status,
          source_refs: { fpl: f.id },
        });
        await db
          .update(schema.fplFixtures)
          .set({ canonicalFixtureId: id, needsReview: false, updatedAt: sql`now()` })
          .where(and(eq(schema.fplFixtures.season, season), eq(schema.fplFixtures.fplId, f.id)));
      } else if (id !== null) {
        await followSourceState(id, { status, kickoffUtc: f.kickoff_time ? new Date(f.kickoff_time) : null });
      }
    }

    // In-match score for the live PnL chart (matches kicked off in the last
    // few hours only, so a restart doesn't re-announce the whole season).
    const sinceKickoff = f.kickoff_time !== null ? now.getTime() - Date.parse(f.kickoff_time) : -1;
    if (id !== null && f.started && sinceKickoff >= 0 && sinceKickoff <= LIVE_WINDOW_MS && f.team_h_score !== null && f.team_a_score !== null) {
      noteLiveScore(id, f.team_h_score, f.team_a_score, f.minutes ?? null, status);
    }

    const recent = f.kickoff_time !== null && now.getTime() - Date.parse(f.kickoff_time) <= VOTE_WINDOW_MS;
    if (votes && id !== null && recent && f.finished_provisional && f.team_h_score !== null && f.team_a_score !== null) {
      await recordVote(id, "fpl", { home: f.team_h_score, away: f.team_a_score }, now, { skipIfUnchanged: true });
    }
  }
}

/** Points for one gameweek — a re-poll is a full refresh (unique on
 *  (season, gw, element_id) makes this idempotent). */
export async function upsertFplPoints(
  rows: PlayerGwPoints[],
  rawPayloadId: number | null,
  fetchedAt: Date,
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(schema.fplPlayerPoints)
    .values(
      rows.map((r) => ({
        season: r.season,
        gw: r.gw,
        elementId: r.element_id,
        totalPoints: r.total_points,
        minutes: r.minutes,
        bonus: r.bonus,
        stats: r.stats,
        provisional: r.provisional,
        rawPayloadId,
        fetchedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.fplPlayerPoints.season, schema.fplPlayerPoints.gw, schema.fplPlayerPoints.elementId],
      set: {
        totalPoints: sql`excluded.total_points`,
        minutes: sql`excluded.minutes`,
        bonus: sql`excluded.bonus`,
        stats: sql`excluded.stats`,
        provisional: sql`excluded.provisional`,
        rawPayloadId: sql`excluded.raw_payload_id`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

/** Best-effort FPL element → S1 player map, refreshed on bootstrap sync.
 *  Matches on normalized surname within the same team slug against distinct
 *  player_match_stats rows. Unmatched stays null — the cross-check silently
 *  skips (it only flags, so a miss costs nothing). Returns matches made. */
export async function mapS1Players(season: number): Promise<number> {
  const unmapped = await db
    .select({
      id: schema.fplPlayers.id,
      fullName: schema.fplPlayers.fullName,
      webName: schema.fplPlayers.webName,
      teamSlug: schema.fplPlayers.teamSlug,
    })
    .from(schema.fplPlayers)
    .where(and(eq(schema.fplPlayers.season, season), isNull(schema.fplPlayers.s1PlayerId)));
  if (unmapped.length === 0) return 0;

  // Distinct S1 players with the slug of the fixture side they played on.
  const s1 = await db
    .selectDistinct({
      playerId: schema.playerMatchStats.playerId,
      playerName: schema.playerMatchStats.playerName,
      team: schema.playerMatchStats.team,
      homeSlug: schema.fixtures.homeSlug,
      awaySlug: schema.fixtures.awaySlug,
    })
    .from(schema.playerMatchStats)
    .innerJoin(schema.fixtures, eq(schema.playerMatchStats.fixtureId, schema.fixtures.id));

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip diacritics
      .replace(/[^a-z]+/g, " ")
      .trim();

  // (teamSlug, surname) → s1 player id; ambiguous surnames within a team drop out.
  const bySurname = new Map<string, number | null>();
  for (const p of s1) {
    const slug = p.team === "home" ? p.homeSlug : p.awaySlug;
    const words = norm(p.playerName).split(" ");
    const surname = words[words.length - 1];
    if (!surname) continue;
    const key = `${slug}:${surname}`;
    bySurname.set(key, bySurname.has(key) && bySurname.get(key) !== p.playerId ? null : p.playerId);
  }

  let matched = 0;
  for (const f of unmapped) {
    const words = norm(f.fullName).split(" ");
    const surname = words[words.length - 1];
    const s1Id = surname ? bySurname.get(`${f.teamSlug}:${surname}`) : undefined;
    if (typeof s1Id === "number") {
      await db
        .update(schema.fplPlayers)
        .set({ s1PlayerId: s1Id, updatedAt: sql`now()` })
        .where(eq(schema.fplPlayers.id, f.id));
      matched++;
    }
  }
  if (matched > 0) log.info("fplIngest", "mapped fpl elements to S1 players", { matched });
  return matched;
}

/** Player identity map for normalizeFplLive — (elementId → name/team/pos). */
export async function loadFplPlayerMap(
  season: number,
): Promise<Map<number, { webName: string; teamSlug: string; position: "G" | "D" | "M" | "F" }>> {
  const rows = await db
    .select({
      elementId: schema.fplPlayers.elementId,
      webName: schema.fplPlayers.webName,
      teamSlug: schema.fplPlayers.teamSlug,
      position: schema.fplPlayers.position,
    })
    .from(schema.fplPlayers)
    .where(eq(schema.fplPlayers.season, season));
  return new Map(
    rows.map((r) => [
      r.elementId,
      { webName: r.webName, teamSlug: r.teamSlug, position: r.position as "G" | "D" | "M" | "F" },
    ]),
  );
}

/** Gameweeks the planner cares about, with liveness/settlement context. */
export interface PlannerGameweekRow {
  gw: number;
  season: number;
  isCurrent: boolean;
  finished: boolean;
  dataChecked: boolean;
  deadlineUtc: Date;
  /** Any fpl fixture in this GW started && !finished. */
  anyFixtureActive: boolean;
  /** A provisional (or later) settlement row exists. */
  provisionalRecorded: boolean;
  /** Frozen settlement exists — stop polling this GW. */
  settled: boolean;
}

export async function loadPlannerGameweeks(season: number): Promise<PlannerGameweekRow[]> {
  const gws = await db
    .select()
    .from(schema.fplGameweeks)
    .where(eq(schema.fplGameweeks.season, season));
  if (gws.length === 0) return [];

  const fx = await db
    .select({
      gw: schema.fplFixtures.gw,
      started: schema.fplFixtures.started,
      finished: schema.fplFixtures.finished,
    })
    .from(schema.fplFixtures)
    .where(eq(schema.fplFixtures.season, season));
  const activeByGw = new Set<number>();
  for (const f of fx) {
    if (f.gw !== null && f.started && !f.finished) activeByGw.add(f.gw);
  }

  const settlements = await db
    .select({ gw: schema.playerPointsSettlements.gw, status: schema.playerPointsSettlements.status })
    .from(schema.playerPointsSettlements)
    .where(eq(schema.playerPointsSettlements.season, season));
  const provisionalGws = new Set<number>();
  const settledGws = new Set<number>();
  for (const s of settlements) {
    if (s.status === "provisional" || s.status === "frozen") provisionalGws.add(s.gw);
    if (s.status === "frozen") settledGws.add(s.gw);
  }

  return gws.map((g) => ({
    gw: g.gw,
    season: g.season,
    isCurrent: g.isCurrent,
    finished: g.finished,
    dataChecked: g.dataChecked,
    deadlineUtc: new Date(g.deadlineUtc),
    anyFixtureActive: activeByGw.has(g.gw),
    provisionalRecorded: provisionalGws.has(g.gw),
    settled: settledGws.has(g.gw),
  }));
}
