import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { voidMarket } from "@/lib/marketLifecycle";

/**
 * POST /api/admin/markets/:id/void — refund-all. Body: { reason: string }.
 * Allowed from any pre-settled status (abandoned fixture, bad listing, etc.).
 * Positions get payout = stake; no take, no accumulator contribution.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { id } = await ctx.params;

  let reason = "admin void";
  try {
    const b = await req.json();
    if (typeof b.reason === "string" && b.reason.length > 0) reason = b.reason;
  } catch {
    /* body optional */
  }

  const r = await voidMarket(Number(id), reason, "admin");
  if (!r.ok) return jsonError(r.error, r.status);
  return json(r.value);
}
