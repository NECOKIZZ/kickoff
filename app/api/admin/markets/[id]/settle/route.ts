import { db, schema } from "@/db";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { computeSettlement, positionDistance } from "@/lib/markets";
import { settleOnChain } from "@/lib/chain";
import { eq } from "drizzle-orm";

/**
 * POST /api/admin/markets/:id/settle — submit the outcome and settle.
 *
 * Body (scoreline):     { home: 2, away: 1 }
 * Body (player_points): { points: "7500000" }  (fixed-point ×1e6)
 *
 * Testnet phase: the admin is the oracle. The engine result is written
 * atomically: market outcome, per-position results, settlements row, and the
 * accumulator ledger entry. Engine voids (N<=1, all-equal-D) settle as void
 * with full refunds — same rules the escrow contract will enforce on-chain.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { id } = await ctx.params;
  const marketId = Number(id);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m) return jsonError("market not found", 404);
  if (m.status === "settled" || m.status === "void") return jsonError(`market already '${m.status}'`, 409);
  if (m.status === "draft") return jsonError("market was never opened", 409);
  // Settling an "open" market is allowed (locksAt may have passed without a
  // status transition worker yet) — but never before lock time.
  if (new Date() < m.locksAt) return jsonError("cannot settle before lock time", 409);

  let outcome: { home?: number; away?: number; points?: bigint };
  if (m.kind === "scoreline") {
    const home = Number(b.home);
    const away = Number(b.away);
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)
      return jsonError("home and away (non-negative integers) required", 400);
    outcome = { home, away };
  } else {
    const points = parseAmount(b.points);
    if (points === null) return jsonError("points (fixed-point ×1e6 string) required", 400);
    outcome = { points };
  }

  const { positions, engine } = await computeSettlement(m, outcome);

  // On-chain settlement first (when the market is linked to the escrow and
  // chain wiring is on). The contract runs the same engine byte-identically;
  // the DB write below is the authoritative off-chain mirror. If the chain
  // call fails we abort BEFORE touching the DB so the two never diverge —
  // admin can retry once the RPC/relayer issue is fixed.
  let settleTxHash: string | null = null;
  if (m.escrowAddress && m.onChainMarketId != null) {
    try {
      settleTxHash = await settleOnChain(
        m.onChainMarketId,
        m.kind === "scoreline" ? outcome.home! : Number(outcome.points!),
        m.kind === "scoreline" ? outcome.away! : 0,
      );
    } catch (err) {
      return jsonError(`on-chain settle failed, DB untouched: ${err instanceof Error ? err.message : err}`, 502);
    }
  }

  const result = await db.transaction(async (tx) => {
    // Per-position results.
    for (let i = 0; i < positions.length; i++) {
      const o = engine.outcomes[i];
      await tx
        .update(schema.positions)
        .set({
          distanceD: engine.void ? null : positionDistance(m, positions[i], outcome),
          isWinner: o.isWinner,
          accuracyA: o.a,
          gain: o.gain,
          payout: o.payout,
          capped: o.capped,
        })
        .where(eq(schema.positions.id, positions[i].id));
    }

    const [settlement] = await tx
      .insert(schema.settlements)
      .values({
        marketId,
        voidReason: engine.void,
        medianD: engine.void ? null : engine.medianD,
        coalitionMode: engine.coalitionMode,
        losersStakeSum: engine.losersStakeSum,
        dividendPool: engine.dividendPool,
        accumulatorContribution: engine.accumulatorContribution,
        platformCut: engine.platformCut,
        totalPool: engine.totalPool,
        settleTxHash,
      })
      .returning();

    if (!engine.void && engine.accumulatorContribution > 0n) {
      await tx
        .insert(schema.accumulatorEntries)
        .values({ settlementId: settlement.id, amount: engine.accumulatorContribution });
    }

    const [market] = await tx
      .update(schema.markets)
      .set({
        status: engine.void ? "void" : "settled",
        actualHome: outcome.home ?? null,
        actualAway: outcome.away ?? null,
        actualPoints: outcome.points ?? null,
        settledAt: new Date(),
      })
      .where(eq(schema.markets.id, marketId))
      .returning();

    return { market, settlement };
  });

  await logAdminEvent("admin", "market.settle", marketId, {
    outcome: { home: outcome.home, away: outcome.away, points: outcome.points?.toString() },
    void: engine.void,
    totalPool: engine.totalPool.toString(),
    accumulatorContribution: engine.accumulatorContribution.toString(),
    settleTxHash,
  });

  return json({
    ...result,
    engine: {
      void: engine.void,
      medianD: engine.medianD,
      coalitionMode: engine.coalitionMode,
      losersStakeSum: engine.losersStakeSum,
      dividendPool: engine.dividendPool,
      accumulatorContribution: engine.accumulatorContribution,
      platformCut: engine.platformCut,
      totalPool: engine.totalPool,
      outcomes: engine.outcomes,
    },
  });
}
