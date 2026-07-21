import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { eq } from "drizzle-orm";

/**
 * POST /api/admin/markets/:id/open — draft → open. THE FREEZE POINT: from
 * here the market's knobs (gamma, stake mode/bounds, take, cap) are immutable.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { id } = await ctx.params;
  const marketId = Number(id);

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m) return jsonError("market not found", 404);
  if (m.status !== "draft") return jsonError(`market is '${m.status}', only drafts can be opened`, 409);
  if (m.stakeMode === "fixed" && m.fixedStake == null)
    return jsonError("cannot open: fixed stakeMode without fixedStake", 409);
  if (new Date() >= m.locksAt) return jsonError("cannot open: locksAt is already in the past", 409);

  const [row] = await db
    .update(schema.markets)
    .set({ status: "open", openedAt: new Date() })
    .where(eq(schema.markets.id, marketId))
    .returning();

  await logAdminEvent("admin", "market.open", marketId, { paramsFrozen: true });
  return json({ market: row });
}
