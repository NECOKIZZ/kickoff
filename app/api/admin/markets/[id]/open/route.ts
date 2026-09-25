import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { openMarket } from "@/lib/marketLifecycle";

/**
 * POST /api/admin/markets/:id/open — draft → open. THE FREEZE POINT: from
 * here the market's knobs (gamma, stake mode/bounds, take, cap) are immutable.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { id } = await ctx.params;
  const r = await openMarket(Number(id), "admin");
  if (!r.ok) return jsonError(r.error, r.status);
  return json({ market: r.value });
}
