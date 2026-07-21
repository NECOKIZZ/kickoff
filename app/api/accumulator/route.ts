import { db, schema } from "@/db";
import { json } from "@/lib/http";
import { sql } from "drizzle-orm";
import { RANK_WEIGHTS_BPS } from "@/lib/leaderboard";

/**
 * GET /api/accumulator — the season pool: balance, contribution history,
 * and the rank-weight split table (public so traders know what they're
 * competing for — spec §3.2's "reconstructable without trusting a black box").
 */
export async function GET() {
  const [totals] = (await db.execute(sql`
    select coalesce(sum(amount), 0)::text as balance,
           count(*)::int                  as contributions
    from accumulator_entries
  `)) as unknown as Array<{ balance: string; contributions: number }>;

  const recent = (await db.execute(sql`
    select ae.amount::text, ae.created_at, m.title as market_title, m.id as market_id
    from accumulator_entries ae
    join settlements s on s.id = ae.settlement_id
    join markets m     on m.id = s.market_id
    order by ae.created_at desc
    limit 25
  `)) as unknown as Array<any>;

  return json({
    season: "2026-27",
    balance: totals.balance,
    contributions: totals.contributions,
    rankWeightsBps: RANK_WEIGHTS_BPS,
    recentContributions: recent,
  });
}
