import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { computeSettlement } from "@/lib/markets";
import { asc, eq } from "drizzle-orm";

/**
 * GET /api/markets/:id/timeline — in-match PnL/rank snapshots, oldest first.
 * Feeds the live chart on market detail. Empty list = match hasn't produced
 * ticks yet (pre-kickoff, or the tracking worker isn't running).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return jsonError("invalid market id", 400);

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m || m.status === "draft") return jsonError("market not found", 404);

  const rows = await db
    .select()
    .from(schema.pnlSnapshots)
    .where(eq(schema.pnlSnapshots.marketId, marketId))
    .orderBy(asc(schema.pnlSnapshots.createdAt));

  return json({
    marketId,
    kind: m.kind,
    snapshots: rows.map((r) => ({
      id: r.id,
      matchClock: r.matchClock,
      scoreHome: r.scoreHome,
      scoreAway: r.scoreAway,
      livePoints: r.livePoints,
      positions: r.positions,
      at: r.createdAt,
    })),
  });
}

/**
 * POST /api/markets/:id/timeline — capture a snapshot at the current match
 * state. Body: { matchClock, home?, away? } (scoreline) or
 * { matchClock, points? } (player_points, fixed-point string).
 *
 * Runs the same mark-to-model as /estimate and stores the result, so the
 * chart replays without re-running the engine. Caller: the live-tracking
 * worker on score changes; admin/curl on testnet.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { id } = await ctx.params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return jsonError("invalid market id", 400);

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m || m.status === "draft") return jsonError("market not found", 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (typeof body.matchClock !== "string" || body.matchClock.length === 0)
    return jsonError("matchClock required (e.g. \"37'\", \"HT\", \"FT\")", 400);

  let outcome: { home?: number; away?: number; points?: bigint };
  if (m.kind === "scoreline") {
    const home = Number(body.home);
    const away = Number(body.away);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)
      return jsonError("home and away required (integers)", 400);
    outcome = { home, away };
  } else {
    const points = typeof body.points === "string" || typeof body.points === "number" ? BigInt(body.points) : null;
    if (points === null) return jsonError("points required (fixed-point ×1e6)", 400);
    outcome = { points };
  }

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
      marketId,
      matchClock: body.matchClock,
      scoreHome: m.kind === "scoreline" ? (outcome.home ?? null) : null,
      scoreAway: m.kind === "scoreline" ? (outcome.away ?? null) : null,
      livePoints: m.kind === "player_points" ? (outcome.points ?? null) : null,
      positions: est.map((e) => ({ ...e, rank: rankOf.get(e.positionId) })),
    })
    .returning({ id: schema.pnlSnapshots.id });

  return json({ ok: true, snapshotId: row.id }, { status: 201 });
}
