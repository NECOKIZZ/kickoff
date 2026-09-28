import { jsonError } from "@/lib/http";
import { loadPnlCard } from "@/lib/pnlCardData";
import { renderPnlCard } from "@/lib/pnlCardImage";

export const runtime = "nodejs";

/**
 * GET /api/positions/:id/card[?w=1200] — the PnL share card as a PNG.
 *
 * Only for settled markets (open/locked have no PnL yet; void is a refund,
 * not a result). Positions are already public per market, so no auth.
 * `w` is the output width in px (600–2000, default 1200; height is 16:9).
 * The share page /card/:id uses this as its og:image.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const positionId = Number(id);
  if (!Number.isInteger(positionId) || positionId <= 0) return jsonError("invalid position id", 400);

  const card = await loadPnlCard(positionId);
  if (!card.ok) return jsonError(card.error, card.status);

  const w = Number(new URL(req.url).searchParams.get("w"));
  const width = Number.isFinite(w) && w > 0 ? Math.min(2000, Math.max(600, Math.round(w))) : 1200;
  return renderPnlCard(card.view, width, { agentName: card.agentName });
}
