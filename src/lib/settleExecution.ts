// Settlement execution — the one function that settles a market, extracted
// from the admin route so the kickoff-data webhook receiver and the admin
// dashboard run byte-identical logic. Callers differ only in WHERE the
// outcome came from (admin hand-entry vs a frozen SettlementSnapshot).
//
// On-chain first, DB second, never diverging: if the chain call fails we
// abort before touching the DB and the caller can retry.

import { db, schema } from "@/db";
import { computeSettlement, positionDistance, type MarketRow } from "@/lib/markets";
import { settleOnChain } from "@/lib/chain";
import { logAdminEvent } from "@/lib/admin";
import { sweepAgentPayouts } from "@/lib/agentPlacement";
import { eq } from "drizzle-orm";

export type SettleOutcome = { home?: number; away?: number; points?: bigint };

export interface ExecuteResult {
  ok: boolean;
  status: number;
  error?: string;
  market?: MarketRow;
  settlement?: typeof schema.settlements.$inferSelect;
  engine?: Awaited<ReturnType<typeof computeSettlement>>["engine"];
}

/**
 * Settle one market against an outcome. `actor` labels the audit log
 * ("admin" | "kickoff-data"); `evidence` is stored alongside (e.g. the
 * snapshot version the outcome came from).
 */
export async function executeSettlement(
  m: MarketRow,
  outcome: SettleOutcome,
  actor: string,
  evidence: Record<string, unknown> = {},
): Promise<ExecuteResult> {
  if (m.status === "settled" || m.status === "void") {
    return { ok: false, status: 409, error: `market already '${m.status}'` };
  }
  if (m.status === "draft") return { ok: false, status: 409, error: "market was never opened" };
  if (new Date() < m.locksAt) return { ok: false, status: 409, error: "cannot settle before lock time" };

  const { positions, engine } = await computeSettlement(m, outcome);

  let settleTxHash: string | null = null;
  if (m.escrowAddress && m.onChainMarketId != null) {
    try {
      settleTxHash = await settleOnChain(
        m.onChainMarketId,
        m.kind === "scoreline" ? outcome.home! : Number(outcome.points!),
        m.kind === "scoreline" ? outcome.away! : 0,
      );
    } catch (err) {
      return {
        ok: false,
        status: 502,
        error: `on-chain settle failed, DB untouched: ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  const result = await db.transaction(async (tx) => {
    for (let i = 0; i < positions.length; i++) {
      const o = engine.outcomes[i];
      await tx
        .update(schema.positions)
        .set({
          distanceD: engine.void ? null : positionDistance(m, positions[i], outcome),
          isWinner: o.isWinner,
          accuracyA: o.a,
          gain: o.gain,
          payout: o.payout,
          capped: o.capped,
        })
        .where(eq(schema.positions.id, positions[i].id));
    }

    const [settlement] = await tx
      .insert(schema.settlements)
      .values({
        marketId: m.id,
        voidReason: engine.void,
        medianD: engine.void ? null : engine.medianD,
        coalitionMode: engine.coalitionMode,
        losersStakeSum: engine.losersStakeSum,
        dividendPool: engine.dividendPool,
        accumulatorContribution: engine.accumulatorContribution,
        platformCut: engine.platformCut,
        totalPool: engine.totalPool,
        settleTxHash,
      })
      .returning();

    if (!engine.void && engine.accumulatorContribution > 0n) {
      await tx
        .insert(schema.accumulatorEntries)
        .values({ settlementId: settlement.id, amount: engine.accumulatorContribution });
    }

    const [market] = await tx
      .update(schema.markets)
      .set({
        status: engine.void ? "void" : "settled",
        actualHome: outcome.home ?? null,
        actualAway: outcome.away ?? null,
        actualPoints: outcome.points ?? null,
        settledAt: new Date(),
      })
      .where(eq(schema.markets.id, m.id))
      .returning();

    return { market, settlement };
  });

  await logAdminEvent(actor, "market.settle", m.id, {
    outcome: { home: outcome.home, away: outcome.away, points: outcome.points?.toString() },
    void: engine.void,
    totalPool: engine.totalPool.toString(),
    accumulatorContribution: engine.accumulatorContribution.toString(),
    settleTxHash,
    ...evidence,
  });

  // Agents have no key to claim with: sweep their payouts into the vault.
  await sweepAgentPayouts(m.id).catch((err) => console.error("agent payout sweep failed", err));

  return { ok: true, status: 200, market: result.market, settlement: result.settlement, engine };
}
