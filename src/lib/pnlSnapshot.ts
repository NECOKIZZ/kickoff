// Live PnL snapshot — the mark-to-model at one match state, stored so the
// market chart replays without re-running the engine. Written by the
// fixture.score_changed webhook (kickoff-data sees a live score change) and
// by the admin timeline POST.

import { db, schema } from "@/db";
import { computeSettlement } from "@/lib/markets";

type Market = typeof schema.markets.$inferSelect;
export type SnapshotOutcome = { home?: number; away?: number; points?: bigint };

export async function recordPnlSnapshot(m: Market, matchClock: string, outcome: SnapshotOutcome): Promise<number> {
  const { positions, engine } = await computeSettlement(m, outcome);

  // Rank by estimated payout (desc) — ties share the earlier rank's order.
  const est = positions.map((p, i) => ({
    positionId: p.id,
    stake: String(p.stake),
    isWinner: engine.outcomes[i]?.isWinner ?? false,
    estimatedPayout: String(engine.outcomes[i]?.payout ?? 0n),
    estimatedGain: String((engine.outcomes[i]?.payout ?? 0n) - p.stake),
  }));
  const ranked = [...est].sort((a, b) => (BigInt(b.estimatedPayout) > BigInt(a.estimatedPayout) ? 1 : -1));
  const rankOf = new Map(ranked.map((e, i) => [e.positionId, i + 1]));

  const [row] = await db
    .insert(schema.pnlSnapshots)
    .values({
      marketId: m.id,
      matchClock,
      scoreHome: m.kind === "scoreline" ? (outcome.home ?? null) : null,
      scoreAway: m.kind === "scoreline" ? (outcome.away ?? null) : null,
      livePoints: m.kind === "player_points" ? (outcome.points ?? null) : null,
      positions: est.map((e) => ({ ...e, rank: rankOf.get(e.positionId) })),
    })
    .returning({ id: schema.pnlSnapshots.id });
  return row.id;
}
