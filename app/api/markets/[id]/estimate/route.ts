import { db, schema } from "@/db";
import { json, jsonError, parseAmount } from "@/lib/http";
import { computeSettlement } from "@/lib/markets";
import { eq } from "drizzle-orm";

/**
 * GET /api/markets/:id/estimate?home=2&away=1   (scoreline)
 * GET /api/markets/:id/estimate?points=7500000  (player_points, fixed-point)
 *
 * Live mark-to-model: "if this settled right now with this outcome, who wins
 * what." An ESTIMATE — the pool isn't final until lock and the outcome until
 * full time. Later the live-tracking worker calls this with the running score.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return jsonError("invalid market id", 400);

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m || m.status === "draft") return jsonError("market not found", 404);
  if (m.status === "settled" || m.status === "void")
    return jsonError("market already settled — see /api/markets/:id", 409);

  const url = new URL(req.url);
  let outcome: { home?: number; away?: number; points?: bigint };
  if (m.kind === "scoreline") {
    const home = Number(url.searchParams.get("home"));
    const away = Number(url.searchParams.get("away"));
    if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)
      return jsonError("home and away query params required (integers)", 400);
    outcome = { home, away };
  } else {
    const points = parseAmount(url.searchParams.get("points"));
    if (points === null) return jsonError("points query param required (fixed-point ×1e6)", 400);
    outcome = { points };
  }

  const { positions, engine } = await computeSettlement(m, outcome);

  return json({
    estimate: true,
    disclaimer: "Mark-to-model estimate — actual settlement can differ; pool and outcome are not final.",
    outcome,
    void: engine.void,
    medianD: engine.medianD,
    totalPool: engine.totalPool,
    dividendPool: engine.dividendPool,
    positions: positions.map((p, i) => ({
      positionId: p.id,
      stake: p.stake,
      isWinner: engine.outcomes[i]?.isWinner ?? false,
      estimatedPayout: engine.outcomes[i]?.payout ?? 0n,
      estimatedGain: engine.outcomes[i]?.gain ?? 0n,
      capped: engine.outcomes[i]?.capped ?? false,
    })),
  });
}
