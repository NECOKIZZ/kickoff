import { db, schema } from "@/db";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/admin/markets/:id — edit knobs on a draft or open market.
 *
 * Only gamma, stakeMode, minStake, maxStake, fixedStake, takeRateBps, and
 * capMultiple are patchable. Status transitions use the dedicated sub-routes
 * (/open, /settle, /void). Locked/settling/settled/void markets are read-only.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) return jsonError("invalid market id", 400);

  const [market] = await db.select().from(schema.markets).where(eq(schema.markets.id, id)).limit(1);
  if (!market) return jsonError("market not found", 404);
  if (!["draft", "open"].includes(market.status))
    return jsonError(`cannot edit a ${market.status} market`, 400);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const patch: Partial<typeof schema.markets.$inferInsert> = {};

  if (b.gamma !== undefined) {
    const gamma = Number(b.gamma);
    if (!Number.isInteger(gamma) || gamma < 1 || gamma > 12)
      return jsonError("gamma must be an integer 1-12", 400);
    patch.gamma = gamma;
  }

  if (b.stakeMode !== undefined) {
    if (b.stakeMode !== "variable" && b.stakeMode !== "fixed")
      return jsonError("stakeMode must be 'variable' or 'fixed'", 400);
    patch.stakeMode = b.stakeMode;
  }

  const stakeMode = (patch.stakeMode ?? market.stakeMode) as "variable" | "fixed";

  if (b.minStake !== undefined) {
    const v = parseAmount(b.minStake);
    if (v === null) return jsonError("minStake must be a base-unit amount", 400);
    patch.minStake = v;
  }

  if (b.maxStake !== undefined) {
    const v = parseAmount(b.maxStake);
    if (v === null) return jsonError("maxStake must be a base-unit amount", 400);
    patch.maxStake = v;
  }

  if (b.fixedStake !== undefined) {
    const v = b.fixedStake === null ? null : parseAmount(b.fixedStake);
    if (b.fixedStake !== null && v === null) return jsonError("fixedStake must be a base-unit amount", 400);
    patch.fixedStake = v;
  }

  if (stakeMode === "fixed") {
    const fs = patch.fixedStake ?? market.fixedStake;
    if (!fs || fs === 0n) return jsonError("fixed stakeMode requires a positive fixedStake", 400);
  }

  const minStake = patch.minStake ?? market.minStake;
  const maxStake = patch.maxStake ?? market.maxStake;
  if (minStake > maxStake) return jsonError("minStake cannot exceed maxStake", 400);

  if (b.takeRateBps !== undefined) {
    const v = Number(b.takeRateBps);
    if (!Number.isFinite(v) || v < 0 || v > 3000) return jsonError("takeRateBps out of range (0-3000)", 400);
    patch.takeRateBps = v;
  }

  if (b.capMultiple !== undefined) {
    const v = Number(b.capMultiple);
    if (!Number.isFinite(v) || v < 1 || v > 1000) return jsonError("capMultiple out of range (1-1000)", 400);
    patch.capMultiple = v;
  }

  if (Object.keys(patch).length === 0) return jsonError("no patchable fields provided", 400);

  const [updated] = await db
    .update(schema.markets)
    .set(patch)
    .where(eq(schema.markets.id, id))
    .returning();

  await logAdminEvent("admin", "market.patch", id, b);
  return json({ market: updated });
}
