import { db, schema } from "@/db";
import { lockDueMarkets } from "@/lib/markets";
import { json } from "@/lib/http";
import { desc, eq, inArray, sql } from "drizzle-orm";

/**
 * GET /api/markets?status=open|live|settled|all
 * Public market list. "live" = locked or settling (match in progress).
 * "all" leaves out void markets; "settled" still includes them.
 * Draft markets are admin-only and never appear here.
 */
export async function GET(req: Request) {
  await lockDueMarkets();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";

  const statusFilter =
    status === "open"
      ? inArray(schema.markets.status, ["open"] as const)
      : status === "live"
        ? inArray(schema.markets.status, ["locked", "settling"] as const)
        : status === "settled"
          ? inArray(schema.markets.status, ["settled", "void"] as const)
          : // Voided markets are cancelled listings, not results: kept off the
            // public board. Stakers still find their refund on /positions.
            inArray(schema.markets.status, ["open", "locked", "settling", "settled"] as const);

  const rows = await db
    .select({
      m: schema.markets,
      positionCount: sql<number>`(select count(*) from positions p where p.market_id = markets.id)`,
      totalPool: sql<string>`coalesce((select sum(p.stake) from positions p where p.market_id = markets.id), 0)::text`,
    })
    .from(schema.markets)
    .where(statusFilter)
    .orderBy(desc(schema.markets.kickoffAt))
    .limit(200);

  return json({
    markets: rows.map(({ m, positionCount, totalPool }) => ({
      id: m.id,
      kind: m.kind,
      status: m.status,
      title: m.title,
      gameweek: m.gameweek,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      playerName: m.playerName,
      kickoffAt: m.kickoffAt,
      locksAt: m.locksAt,
      params: {
        gamma: m.gamma,
        stakeMode: m.stakeMode,
        minStake: m.minStake,
        maxStake: m.maxStake,
        fixedStake: m.fixedStake,
        takeRateBps: m.takeRateBps,
        capMultiple: m.capMultiple,
      },
      escrowAddress: m.escrowAddress,
      chainId: m.chainId,
      positionCount: Number(positionCount),
      totalPool,
      actual:
        m.status === "settled"
          ? m.kind === "scoreline"
            ? { home: m.actualHome, away: m.actualAway }
            : { points: m.actualPoints }
          : null,
    })),
  });
}
