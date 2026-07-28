import { db, schema } from "@/db";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { executeSettlement } from "@/lib/settleExecution";
import { eq } from "drizzle-orm";

/**
 * POST /api/admin/markets/:id/settle — submit the outcome and settle.
 *
 * Body (scoreline):     { home: 2, away: 1 }
 * Body (player_points): { points: "7500000" }  (fixed-point ×1e6)
 *
 * Testnet phase: the admin is the oracle. Settlement execution (engine run,
 * on-chain-first ordering, atomic DB write, audit log) lives in
 * settleExecution.ts, shared byte-identically with the kickoff-data webhook
 * receiver. Engine voids (N<=1, all-equal-D) settle as void with full
 * refunds — same rules the escrow contract enforces on-chain.
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

  const r = await executeSettlement(m, outcome, "admin");
  if (!r.ok) return jsonError(r.error!, r.status);

  const engine = r.engine!;
  return json({
    market: r.market,
    settlement: r.settlement,
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
