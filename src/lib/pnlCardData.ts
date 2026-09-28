import { db, schema } from "@/db";
import { buildPnlCardView, type PnlCardView } from "@/lib/pnlCard";
import { clubFor } from "@/ui/markets/clubs";
import { eq } from "drizzle-orm";

export type PnlCardLoad =
  | { ok: true; view: PnlCardView; marketId: number; agentName: string | null }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Loads a position's PnL card view. Only settled markets have one: open or
 * locked have no PnL yet, and void is a refund, not a result.
 */
export async function loadPnlCard(positionId: number): Promise<PnlCardLoad> {
  const [row] = await db
    .select({ position: schema.positions, market: schema.markets, agentName: schema.agents.name })
    .from(schema.positions)
    .innerJoin(schema.markets, eq(schema.positions.marketId, schema.markets.id))
    .leftJoin(schema.agents, eq(schema.agents.agentUserId, schema.positions.userId))
    .where(eq(schema.positions.id, positionId))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "position not found" };
  if (row.market.status !== "settled") return { ok: false, status: 409, error: "market not settled" };

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
  return { ok: true, view, marketId: m.id, agentName: row.agentName };
}
