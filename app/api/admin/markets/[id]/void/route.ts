import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { voidOnChain } from "@/lib/chain";
import { sweepAgentPayouts } from "@/lib/agentPlacement";
import { eq } from "drizzle-orm";

/**
 * POST /api/admin/markets/:id/void — refund-all. Body: { reason: string }.
 * Allowed from any pre-settled status (abandoned fixture, bad listing, etc.).
 * Positions get payout = stake; no take, no accumulator contribution.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { id } = await ctx.params;
  const marketId = Number(id);

  let reason = "admin void";
  try {
    const b = await req.json();
    if (typeof b.reason === "string" && b.reason.length > 0) reason = b.reason;
  } catch {
    /* body optional */
  }

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m) return jsonError("market not found", 404);
  if (m.status === "settled" || m.status === "void")
    return jsonError(`market already '${m.status}'`, 409);

  // On-chain void first (escrow-linked markets only) — same order-of-
  // operations rule as settle: chain failure aborts before the DB writes.
  let settleTxHash: string | null = null;
  if (m.escrowAddress && m.onChainMarketId != null) {
    try {
      settleTxHash = await voidOnChain(m.onChainMarketId, reason);
    } catch (err) {
      return jsonError(`on-chain void failed, DB untouched: ${err instanceof Error ? err.message : err}`, 502);
    }
  }

  const result = await db.transaction(async (tx) => {
    const positions = await tx.select().from(schema.positions).where(eq(schema.positions.marketId, marketId));
    let totalPool = 0n;
    for (const p of positions) {
      totalPool += p.stake;
      await tx
        .update(schema.positions)
        .set({ isWinner: false, gain: 0n, payout: p.stake, capped: false })
        .where(eq(schema.positions.id, p.id));
    }
    const [settlement] = await tx
      .insert(schema.settlements)
      .values({ marketId, voidReason: reason, totalPool, settleTxHash })
      .returning();
    const [market] = await tx
      .update(schema.markets)
      .set({ status: "void", settledAt: new Date() })
      .where(eq(schema.markets.id, marketId))
      .returning();
    return { market, settlement, refunded: positions.length };
  });

  await logAdminEvent("admin", "market.void", marketId, { reason, settleTxHash });
  await sweepAgentPayouts(marketId).catch((err) => console.error("agent refund sweep failed", err));
  return json(result);
}
