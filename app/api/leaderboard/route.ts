import { db } from "@/db";
import { json } from "@/lib/http";
import { sql } from "drizzle-orm";
import { rankTraders, precisionScore, LEADERBOARD_PARAMS, type TraderSeasonStats } from "@/lib/leaderboard";

/**
 * GET /api/leaderboard — season rankings: CAR (geometric-mean precision) ×
 * log-dampened volume multiplier, eligibility-gated (§8).
 *
 * a_i is stored on every settled position (win or lose) by the settlement
 * flow, so PS derives straight from the DB — no recompute of the engine.
 */
export async function GET() {
  const rows = await db.execute(sql`
    select u.address,
           count(p.id)::int                 as settled_markets,
           sum(p.stake)::text               as volume,
           array_agg(p.accuracy_a::text)    as accuracy_weights
    from positions p
    join users u   on u.id = p.user_id
    join markets m on m.id = p.market_id
    where m.status = 'settled' and p.accuracy_a is not null
    group by u.address
  `);

  const traders: TraderSeasonStats[] = (rows as unknown as Array<any>).map((r) => ({
    address: r.address,
    settledMarkets: r.settled_markets,
    volume: BigInt(r.volume),
    precisionScores: (r.accuracy_weights as string[]).map((a) => precisionScore(BigInt(a))),
  }));

  const ranked = rankTraders(traders);

  return json({
    params: {
      minSettledMarkets: LEADERBOARD_PARAMS.minSettledMarkets,
      minSeasonVolume: LEADERBOARD_PARAMS.minSeasonVolume,
      beta: LEADERBOARD_PARAMS.beta,
      vRef: LEADERBOARD_PARAMS.vRef,
      vCap: LEADERBOARD_PARAMS.vCap,
    },
    eligibleTraders: ranked.length,
    totalTraders: traders.length,
    leaderboard: ranked.map((r) => ({
      ...r,
      car: Math.round(r.car * 10) / 10,
      volumeMultiplier: Math.round(r.volumeMultiplier * 1000) / 1000,
      score: Math.round(r.score * 10) / 10,
    })),
  });
}
