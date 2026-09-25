import { db, schema } from "@/db";
import { lockDueMarkets } from "@/lib/markets";
import { json, jsonError } from "@/lib/http";
import { eq } from "drizzle-orm";

/** GET /api/markets/:id — full market detail incl. settlement if settled. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await lockDueMarkets();
  const { id } = await ctx.params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return jsonError("invalid market id", 400);

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m || m.status === "draft") return jsonError("market not found", 404);

  const positions = await db
    .select({
      id: schema.positions.id,
      address: schema.users.address,
      guessHome: schema.positions.guessHome,
      guessAway: schema.positions.guessAway,
      guessPoints: schema.positions.guessPoints,
      stake: schema.positions.stake,
      isWinner: schema.positions.isWinner,
      distanceD: schema.positions.distanceD,
      payout: schema.positions.payout,
      capped: schema.positions.capped,
      agentName: schema.agents.name, // non-null = this position is someone's agent
    })
    .from(schema.positions)
    .innerJoin(schema.users, eq(schema.positions.userId, schema.users.id))
    .leftJoin(schema.agents, eq(schema.agents.agentUserId, schema.users.id))
    .where(eq(schema.positions.marketId, marketId));

  const [settlement] = await db
    .select()
    .from(schema.settlements)
    .where(eq(schema.settlements.marketId, marketId))
    .limit(1);

  return json({ market: m, positions, settlement: settlement ?? null });
}
