// FPL player-points settlement lane — persistence + webhooks around the pure
// stage logic (fplSettlement.ts decides the stage, this file records). Same
// working-row discipline as settlementLane.ts:
//
//   worker sweep → sweepPlayerPoints() per unsettled GW:
//     stage provisional → working row (status "provisional") + cross-check
//                         flags; flags fire settlement.player_points_flagged
//                         ONCE but NEVER block or delay freezing
//     stage final       → rewrite working row as "frozen" (immutable),
//                         mark points rows provisional=false,
//                         fire settlement.player_points_ready
//
// Corrections after freeze (near-never: FPL rarely revises past data_checked)
// insert version N+1 through the admin override — they never touch N.

import { and, desc, eq } from "drizzle-orm";
import type { PlayerGwPoints, PointsCrossCheckFlag, PlayerMatchStats, WebhookEvent } from "@kickoff/schema";
import { db, schema } from "./db";
import { log } from "./log";
import { gwStage, crossCheckS1, buildOutcome } from "./fplSettlement";

// Emitter — installed by the worker (same pluggable pattern as
// installSettlementEmitter) so this module stays fetch-free in tests.
type Emitter = (event: WebhookEvent) => void;
let emit: Emitter | null = null;
export function installPlayerPointsEmitter(fn: Emitter): void {
  emit = fn;
}
function fire(event: WebhookEvent): void {
  try {
    emit?.(event);
  } catch (e) {
    log.error("fplSettlement", "emitter threw", { error: e as Error });
  }
}

/** FPL "usually checks within hours" — a longer stall means FPL changed
 *  something and a human should look. Alarm only; nothing is blocked. */
const STALL_SECONDS = Number(process.env.KICKOFF_DATA_FPL_STALL_SECONDS ?? 48 * 3600);

interface LatestRow {
  frozenVersion: number;
  working: { id: number; version: number; status: string; flags: PointsCrossCheckFlag[] } | null;
}

async function loadLatest(season: number, gw: number): Promise<LatestRow> {
  const rows = await db
    .select()
    .from(schema.playerPointsSettlements)
    .where(and(eq(schema.playerPointsSettlements.season, season), eq(schema.playerPointsSettlements.gw, gw)))
    .orderBy(desc(schema.playerPointsSettlements.version))
    .limit(1);
  const r = rows[0];
  if (!r) return { frozenVersion: 0, working: null };
  if (r.status === "frozen") return { frozenVersion: r.version, working: null };
  return {
    frozenVersion: r.version - 1,
    working: { id: r.id, version: r.version, status: r.status, flags: (r.flags ?? []) as PointsCrossCheckFlag[] },
  };
}

async function loadGwPoints(season: number, gw: number): Promise<Array<PlayerGwPoints & { rawPayloadId: number | null }>> {
  const rows = await db
    .select()
    .from(schema.fplPlayerPoints)
    .where(and(eq(schema.fplPlayerPoints.season, season), eq(schema.fplPlayerPoints.gw, gw)));
  return rows.map((r) => ({
    gw: r.gw,
    season: r.season,
    element_id: r.elementId,
    player_name: "", // joined below only where needed
    team_slug: "",
    position: "M" as const,
    total_points: r.totalPoints,
    minutes: r.minutes,
    bonus: r.bonus,
    provisional: r.provisional,
    stats: r.stats as Record<string, number>,
    rawPayloadId: r.rawPayloadId,
  }));
}

/** Join web names in for the outcome payload (markets display them). */
async function nameMap(season: number): Promise<Map<number, string>> {
  const rows = await db
    .select({ elementId: schema.fplPlayers.elementId, webName: schema.fplPlayers.webName })
    .from(schema.fplPlayers)
    .where(eq(schema.fplPlayers.season, season));
  return new Map(rows.map((r) => [r.elementId, r.webName]));
}

/** S1 stats aggregated over the GW's reconciled canonical fixtures. */
async function loadS1Rows(season: number, gw: number): Promise<PlayerMatchStats[]> {
  const fplFx = await db
    .select({ canonicalFixtureId: schema.fplFixtures.canonicalFixtureId })
    .from(schema.fplFixtures)
    .where(and(eq(schema.fplFixtures.season, season), eq(schema.fplFixtures.gw, gw)));
  const ids = fplFx.map((f) => f.canonicalFixtureId).filter((id): id is string => id !== null);
  if (ids.length === 0) return [];
  const out: PlayerMatchStats[] = [];
  for (const id of ids) {
    const rows = await db.select().from(schema.playerMatchStats).where(eq(schema.playerMatchStats.fixtureId, id));
    for (const r of rows) {
      out.push({
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
      });
    }
  }
  return out;
}

async function elementToS1Map(season: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ elementId: schema.fplPlayers.elementId, s1PlayerId: schema.fplPlayers.s1PlayerId })
    .from(schema.fplPlayers)
    .where(eq(schema.fplPlayers.season, season));
  const map = new Map<number, number>();
  for (const r of rows) if (r.s1PlayerId !== null) map.set(r.elementId, r.s1PlayerId);
  return map;
}

/**
 * The sweep — called each worker tick. Walks unsettled gameweeks that have
 * points rows and advances them through the two-stage ladder.
 */
export async function sweepPlayerPoints(now: Date): Promise<{ provisional: number; frozen: number }> {
  const result = { provisional: 0, frozen: 0 };
  const gws = await db.select().from(schema.fplGameweeks);

  for (const g of gws) {
    const fixtures = await db
      .select({ finished: schema.fplFixtures.finished })
      .from(schema.fplFixtures)
      .where(and(eq(schema.fplFixtures.season, g.season), eq(schema.fplFixtures.gw, g.gw)));

    const stage = gwStage({ finished: g.finished, dataChecked: g.dataChecked }, fixtures);
    if (stage === "pending") {
      // Stall alarm: finished long ago but data_checked never landed.
      if (
        g.finished &&
        !g.dataChecked &&
        now.getTime() - new Date(g.updatedAt).getTime() > STALL_SECONDS * 1000
      ) {
        log.error("fplSettlement", "stalled: gw finished without data_checked", {
          gw: g.gw,
          stallSeconds: STALL_SECONDS,
        });
      }
      continue;
    }

    const { frozenVersion, working } = await loadLatest(g.season, g.gw);
    if (frozenVersion > 0 && !working) continue; // settled
    if (stage === "provisional" && working?.status === "provisional") {
      // Stall alarm while waiting on data_checked (working row exists).
      if (now.getTime() - new Date(g.updatedAt).getTime() > STALL_SECONDS * 1000) {
        log.error("fplSettlement", "stalled: gw finished without data_checked", {
          gw: g.gw,
          stallSeconds: STALL_SECONDS,
        });
      }
      continue; // already recorded — nothing to advance until final
    }

    const points = await loadGwPoints(g.season, g.gw);
    if (points.length === 0) continue; // no data yet (blank GW or not polled)
    const names = await nameMap(g.season);
    const outcomeRows = points.map((p) => ({ ...p, player_name: names.get(p.element_id) ?? `element-${p.element_id}` }));
    const outcome = buildOutcome(outcomeRows);
    // Evidence: the newest live payload the points came from.
    const rawPayloadId = points.map((p) => p.rawPayloadId).find((id) => id !== null) ?? null;

    if (stage === "provisional") {
      // Cross-check runs at the provisional stage — S1 postMatch has landed
      // by now. Flags are informational ONLY; they never gate the freeze.
      const flags = crossCheckS1(outcomeRows, await loadS1Rows(g.season, g.gw), await elementToS1Map(g.season));
      await db.insert(schema.playerPointsSettlements).values({
        season: g.season,
        gw: g.gw,
        version: frozenVersion + 1,
        status: "provisional",
        points: outcome,
        flags,
        rawPayloadId,
      });
      result.provisional++;
      log.info("fplSettlement", "provisional", { gw: g.gw, players: outcome.length, flags: flags.length });
      if (flags.length > 0) {
        log.warn("fplSettlement", "cross-check flags (informational)", { gw: g.gw, flags: flags.length });
        fire({ type: "settlement.player_points_flagged", gw: g.gw, season: g.season, flags });
      }
      continue;
    }

    // stage === "final": freeze. Rewrite the working row (or insert directly
    // frozen when data_checked arrived before we ever recorded provisional —
    // e.g. service downtime across the whole window).
    const values = {
      status: "frozen" as const,
      points: outcome,
      rawPayloadId,
      frozenAt: now,
    };
    if (working) {
      await db
        .update(schema.playerPointsSettlements)
        .set(values)
        .where(eq(schema.playerPointsSettlements.id, working.id));
    } else {
      const flags = crossCheckS1(outcomeRows, await loadS1Rows(g.season, g.gw), await elementToS1Map(g.season));
      await db.insert(schema.playerPointsSettlements).values({
        season: g.season,
        gw: g.gw,
        version: frozenVersion + 1,
        flags,
        ...values,
      });
    }
    await db
      .update(schema.fplPlayerPoints)
      .set({ provisional: false })
      .where(and(eq(schema.fplPlayerPoints.season, g.season), eq(schema.fplPlayerPoints.gw, g.gw)));
    result.frozen++;
    log.info("fplSettlement", "frozen", { gw: g.gw, version: working?.version ?? frozenVersion + 1, players: outcome.length });
    fire({
      type: "settlement.player_points_ready",
      gw: g.gw,
      season: g.season,
      snapshot_version: working?.version ?? frozenVersion + 1,
    });
  }

  return result;
}
