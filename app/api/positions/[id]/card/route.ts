import { db, schema } from "@/db";
import { jsonError } from "@/lib/http";
import { buildPnlCardView } from "@/lib/pnlCard";
import { renderPnlCard } from "@/lib/pnlCardImage";
import { clubFor } from "@/ui/markets/clubs";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/positions/:id/card[?w=1200] — the PnL share card as a PNG.
 *
 * Only for settled markets (open/locked have no PnL yet; void is a refund,
 * not a result). Positions are already public per market, so no auth.
 * `w` is the output width in px (600–2000, default 1200; height is 16:9).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const positionId = Number(id);
  if (!Number.isInteger(positionId) || positionId <= 0) return jsonError("invalid position id", 400);

  const [row] = await db
    .select({ position: schema.positions, market: schema.markets })
    .from(schema.positions)
    .innerJoin(schema.markets, eq(schema.positions.marketId, schema.markets.id))
    .where(eq(schema.positions.id, positionId))
    .limit(1);
  if (!row) return jsonError("position not found", 404);
  if (row.market.status !== "settled") return jsonError("market not settled", 409);

  const field = await db
    .select({ id: schema.positions.id, stake: schema.positions.stake, payout: schema.positions.payout })
    .from(schema.positions)
    .where(eq(schema.positions.marketId, row.market.id));

  const m = row.market;
  const view = buildPnlCardView(
    {
      kind: m.kind,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      playerName: m.playerName,
      actualHome: m.actualHome,
      actualAway: m.actualAway,
      actualPoints: m.actualPoints,
      position: row.position,
      field,
    },
    (name) => clubFor(name)?.code ?? null,
  );

  const w = Number(new URL(req.url).searchParams.get("w"));
  const width = Number.isFinite(w) && w > 0 ? Math.min(2000, Math.max(600, Math.round(w))) : 1200;
  return renderPnlCard(view, width);
}
