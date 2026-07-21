import { db } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { sql } from "drizzle-orm";
import {
  rankTraders,
  precisionScore,
  accumulatorSplit,
  type TraderSeasonStats,
} from "@/lib/leaderboard";

/**
 * POST /api/admin/accumulator/finalize — season-end dry run / preview.
 *
 * Computes the final leaderboard and the rank-weight split of the current
 * vault balance. Body: { dryRun?: boolean } — defaults TRUE; the real
 * finalization (writing claimable amounts / calling the on-chain vault's
 * finalizeSeason) is wired when the escrow contracts deploy. Until then this
 * is the dashboard's "what would the season pay today" button.
 */
export async function POST(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  let dryRun = true;
  try {
    const b = await req.json();
    if (b.dryRun === false) dryRun = false;
  } catch {
    /* body optional */
  }
  if (!dryRun)
    return jsonError("real finalization lands with the on-chain vault; only dryRun:true is supported for now", 501);

  const [{ balance }] = (await db.execute(sql`
    select coalesce(sum(amount), 0)::text as balance from accumulator_entries
  `)) as unknown as Array<{ balance: string }>;

  const rows = (await db.execute(sql`
    select u.address,
           count(p.id)::int              as settled_markets,
           sum(p.stake)::text            as volume,
           array_agg(p.accuracy_a::text) as accuracy_weights
    from positions p
    join users u   on u.id = p.user_id
    join markets m on m.id = p.market_id
    where m.status = 'settled' and p.accuracy_a is not null
    group by u.address
  `)) as unknown as Array<any>;

  const traders: TraderSeasonStats[] = rows.map((r) => ({
    address: r.address,
    settledMarkets: r.settled_markets,
    volume: BigInt(r.volume),
    precisionScores: (r.accuracy_weights as string[]).map((a) => precisionScore(BigInt(a))),
  }));

  const ranked = rankTraders(traders);
  const split = accumulatorSplit(BigInt(balance), ranked.map((r) => r.address));

  await logAdminEvent("admin", "accumulator.finalize.dryrun", null, {
    balance,
    eligibleTraders: ranked.length,
  });

  return json({ dryRun: true, vaultBalance: balance, split });
}
