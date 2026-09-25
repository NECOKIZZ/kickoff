import { db, schema } from "@/db";
import { lockDueMarkets } from "@/lib/markets";
import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { createMarket } from "@/lib/marketLifecycle";
import { desc, eq, sql } from "drizzle-orm";

/**
 * POST /api/admin/markets — create a market in "draft". Score markets are
 * listed from a kickoff-data fixture ({ kind: "scoreline", dataFixtureId }),
 * one live market per fixture. The listing agent uses the same code path
 * (createMarket in lib/marketLifecycle). Body documented there.
 */
export async function POST(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const r = await createMarket(b, "admin");
  if (!r.ok) return jsonError(r.error, r.status);
  return json({ market: r.value }, { status: 201 });
}

/**
 * GET /api/admin/markets — all markets including drafts, with the numbers
 * that predict a void (position count, distinct guesses) and the stored void
 * reason once settled.
 */
export async function GET(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  await lockDueMarkets();
  const rows = await db
    .select({
      m: schema.markets,
      voidReason: schema.settlements.voidReason,
      positionCount: sql<number>`(select count(*) from positions p where p.market_id = ${schema.markets.id})`,
      distinctGuesses: sql<number>`(select count(distinct concat_ws('/', p.guess_home, p.guess_away, p.guess_points)) from positions p where p.market_id = ${schema.markets.id})`,
    })
    .from(schema.markets)
    .leftJoin(schema.settlements, eq(schema.settlements.marketId, schema.markets.id))
    .orderBy(desc(schema.markets.createdAt))
    .limit(500);
  return json({
    markets: rows.map((r) => ({
      ...r.m,
      voidReason: r.voidReason,
      positionCount: Number(r.positionCount),
      distinctGuesses: Number(r.distinctGuesses),
    })),
  });
}
