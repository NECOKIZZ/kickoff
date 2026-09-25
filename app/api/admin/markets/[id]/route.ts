import { db, schema } from "@/db";
import { lockDueMarkets } from "@/lib/markets";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { updateDraftConfigOnChain } from "@/lib/chain";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/admin/markets/:id — edit knobs on a draft or open market.
 *
 * Escrow-linked markets: drafts are mirrored on-chain (updateDraftConfig);
 * open ones are refused, because the escrow froze their config at open and
 * the DB must never disagree with the contract that pays out.
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
  await lockDueMarkets();

  const [market] = await db.select().from(schema.markets).where(eq(schema.markets.id, id)).limit(1);
  if (!market) return jsonError("market not found", 404);
  if (!["draft", "open"].includes(market.status))
    return jsonError(`cannot edit a ${market.status} market`, 400);
  const linked = market.escrowAddress != null && market.onChainMarketId != null;
  if (linked && market.status === "open")
    return jsonError("knobs are frozen on-chain once a market opens, void and relist to change them", 409);

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

  let updateTxHash: string | null = null;
  if (linked) {
    try {
      updateTxHash = await updateDraftConfigOnChain(market.onChainMarketId!, {
        kind: market.kind,
        stakeMode,
        gamma: patch.gamma ?? market.gamma,
        takeRateBps: patch.takeRateBps ?? market.takeRateBps,
        accumulatorShareBps: market.accumulatorShareBps,
        capMultiple: patch.capMultiple ?? market.capMultiple,
        locksAt: market.locksAt,
        minStake,
        maxStake,
        fixedStake: patch.fixedStake !== undefined ? patch.fixedStake : market.fixedStake,
      });
    } catch (err) {
      return jsonError(`on-chain config update failed, DB untouched: ${err instanceof Error ? err.message : err}`, 502);
    }
  }

  const [updated] = await db
    .update(schema.markets)
    .set(patch)
    .where(eq(schema.markets.id, id))
    .returning();

  await logAdminEvent("admin", "market.patch", id, { ...b, updateTxHash });
  return json({ market: updated });
}

/**
 * DELETE /api/admin/markets/:id — remove a market that holds no live money.
 *
 * Allowed for drafts (nobody can stake before /open) and for voided markets
 * once every on-chain refund has been claimed. Open/locked markets must be
 * voided first; settled markets stay, they feed the leaderboard and PnL.
 * An escrow-linked draft stays on-chain as an unopened market: nothing can
 * be staked into it, so it's inert. The audit trail keeps its rows.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 1) return jsonError("invalid market id", 400);
  await lockDueMarkets();

  const [market] = await db.select().from(schema.markets).where(eq(schema.markets.id, id)).limit(1);
  if (!market) return jsonError("market not found", 404);
  if (market.status === "open" || market.status === "locked" || market.status === "settling")
    return jsonError(`market is '${market.status}', void it first (refunds every stake), then delete`, 409);
  if (market.status === "settled")
    return jsonError("settled markets can't be deleted, they feed the leaderboard and PnL history", 409);

  const positions = await db.select().from(schema.positions).where(eq(schema.positions.marketId, id));
  const linked = market.escrowAddress != null && market.onChainMarketId != null;
  const unclaimed = linked ? positions.filter((p) => p.stakeTxHash != null && p.claimTxHash == null).length : 0;
  if (unclaimed > 0)
    return jsonError(`${unclaimed} on-chain refund(s) not claimed yet, delete would hide them from their owners`, 409);

  await db.transaction(async (tx) => {
    const [settlement] = await tx.select().from(schema.settlements).where(eq(schema.settlements.marketId, id));
    if (settlement)
      await tx.delete(schema.accumulatorEntries).where(eq(schema.accumulatorEntries.settlementId, settlement.id));
    await tx.delete(schema.settlements).where(eq(schema.settlements.marketId, id));
    await tx.delete(schema.pnlSnapshots).where(eq(schema.pnlSnapshots.marketId, id));
    await tx.delete(schema.positions).where(eq(schema.positions.marketId, id));
    await tx.delete(schema.markets).where(eq(schema.markets.id, id));
  });

  await logAdminEvent("admin", "market.delete", id, {
    title: market.title,
    status: market.status,
    positions: positions.length,
    onChainMarketId: market.onChainMarketId?.toString() ?? null,
  });
  return json({ deleted: id });
}
