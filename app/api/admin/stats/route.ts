import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { desc, sql } from "drizzle-orm";

/**
 * GET /api/admin/stats — the dashboard numbers.
 * volume, signups, markets by status, take collected, accumulator balance,
 * top traders by staked volume, recent admin events.
 */
export async function GET(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  const [totals] = await db.execute(sql`
    select
      (select count(*) from users)::int                                   as signups,
      (select count(*) from positions)::int                               as total_positions,
      coalesce((select sum(stake) from positions), 0)::text               as total_volume,
      (select count(*) from markets where status = 'open')::int           as open_markets,
      (select count(*) from markets where status in ('locked','settling'))::int as live_markets,
      (select count(*) from markets where status = 'settled')::int        as settled_markets,
      (select count(*) from markets where status = 'void')::int           as void_markets,
      coalesce((select sum(platform_cut) from settlements), 0)::text      as platform_take,
      coalesce((select sum(accumulator_contribution) from settlements), 0)::text as accumulator_balance
  `);

  const topTraders = await db.execute(sql`
    select u.address,
           count(p.id)::int          as positions,
           sum(p.stake)::text        as volume,
           count(p.id) filter (where p.is_winner)::int as wins,
           coalesce(sum(p.gain) filter (where p.is_winner), 0)::text as total_gains
    from positions p join users u on u.id = p.user_id
    group by u.address
    order by sum(p.stake) desc
    limit 20
  `);

  const recentEvents = await db
    .select()
    .from(schema.adminEvents)
    .orderBy(desc(schema.adminEvents.createdAt))
    .limit(50);

  return json({ totals, topTraders, recentEvents });
}
