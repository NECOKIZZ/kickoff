import { db, schema } from "@/db";
import { lockDueMarkets } from "@/lib/markets";
import { json, jsonError } from "@/lib/http";
import { desc, eq } from "drizzle-orm";

/** GET /api/users/:address/positions — a wallet's positions across markets. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return jsonError("invalid address", 400);
  await lockDueMarkets();

  const rows = await db
    .select({
      position: schema.positions,
      marketTitle: schema.markets.title,
      marketKind: schema.markets.kind,
      marketStatus: schema.markets.status,
      kickoffAt: schema.markets.kickoffAt,
    })
    .from(schema.positions)
    .innerJoin(schema.users, eq(schema.positions.userId, schema.users.id))
    .innerJoin(schema.markets, eq(schema.positions.marketId, schema.markets.id))
    .where(eq(schema.users.address, address.toLowerCase()))
    .orderBy(desc(schema.positions.createdAt))
    .limit(200);

  return json({ positions: rows });
}
