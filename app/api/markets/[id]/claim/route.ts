import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { verifyClaimTx } from "@/lib/chain";
import { and, eq } from "drizzle-orm";

/**
 * POST /api/markets/:id/claim — record that the caller pulled their payout
 * (or void refund) out of the escrow. Body: { claimTxHash }. The claim itself
 * happens wallet → escrow; this only verifies the Claimed event and stamps
 * the position so the UI stops offering the button.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);

  const { id } = await ctx.params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return jsonError("invalid market id", 400);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  const claimTxHash = typeof body.claimTxHash === "string" ? body.claimTxHash : "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(claimTxHash)) return jsonError("claimTxHash required", 400);

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m || m.onChainMarketId == null) return jsonError("market not found or not on-chain", 404);
  if (m.status !== "settled" && m.status !== "void") return jsonError("market has not settled", 409);

  const v = await verifyClaimTx(claimTxHash as `0x${string}`, m.onChainMarketId, caller.address as `0x${string}`);
  if (v === false) return jsonError("claimTxHash is not a successful escrow claim for this market/address", 400);

  const [row] = await db
    .update(schema.positions)
    .set({ claimTxHash })
    .where(and(eq(schema.positions.marketId, marketId), eq(schema.positions.userId, caller.userId)))
    .returning();
  if (!row) return jsonError("no position in this market", 404);
  return json({ position: row });
}
