// Leaderboard math (spec §8) — CAR precision × log-dampened volume multiplier.
//
// PS_i = 100 + 900 × a_i          (a_i from the engine, computed win OR lose)
// CAR  = geometric mean of PS across all settled markets entered
// VolumeMultiplier = 1 + β × min(1, ln(1 + V/V_ref) / ln(1 + V_cap/V_ref))
// Score = CAR × VolumeMultiplier
//
// Floats are fine here: the leaderboard ranks, it never moves money directly.
// (The season-end accumulator split re-derives from these ranks but pays via
// the rank-weight table, so a 1e-12 float wobble can't change a payout unless
// it flips a rank — and ranks are integers.)

export const LEADERBOARD_PARAMS = {
  // Eligibility gate (§8.2): kills the "one lucky $1 stake" case.
  minSettledMarkets: 5,
  minSeasonVolume: 25_000_000n, // $25 base units

  // Volume multiplier (§8.4) — tunable, DON'T change mid-season once locked.
  beta: 0.5,
  vRef: 250, // $ (display units — multiplier math is float)
  vCap: 5000, // $
};

/** Per-settlement precision score from the engine's accuracy weight. */
export function precisionScore(aFixedPoint: bigint): number {
  const a = Number(aFixedPoint) / 1e6; // 0..1
  return 100 + 900 * a;
}

/** Geometric mean of per-settlement precision scores. */
export function car(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sumLn = scores.reduce((s, x) => s + Math.log(Math.max(x, 1)), 0);
  return Math.exp(sumLn / scores.length);
}

export function volumeMultiplier(volumeBaseUnits: bigint): number {
  const { beta, vRef, vCap } = LEADERBOARD_PARAMS;
  const v = Number(volumeBaseUnits) / 1e6;
  const ratio = Math.log(1 + v / vRef) / Math.log(1 + vCap / vRef);
  return 1 + beta * Math.min(1, ratio);
}

export interface TraderSeasonStats {
  address: string;
  settledMarkets: number;
  volume: bigint; // total staked across settled markets, base units
  precisionScores: number[]; // one PS per settled market
}

export interface LeaderboardRow {
  rank: number;
  address: string;
  car: number;
  volume: bigint;
  volumeMultiplier: number;
  score: number;
  settledMarkets: number;
  eligible: true;
}

/** Rank all eligible traders. Ineligible traders are simply absent. */
export function rankTraders(traders: TraderSeasonStats[]): LeaderboardRow[] {
  const { minSettledMarkets, minSeasonVolume } = LEADERBOARD_PARAMS;
  return traders
    .filter((t) => t.settledMarkets >= minSettledMarkets && t.volume >= minSeasonVolume)
    .map((t) => {
      const c = car(t.precisionScores);
      const vm = volumeMultiplier(t.volume);
      return {
        address: t.address,
        car: c,
        volume: t.volume,
        volumeMultiplier: vm,
        score: c * vm,
        settledMarkets: t.settledMarkets,
        eligible: true as const,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ rank: i + 1, ...row }));
}

// ---------------------------------------------------------------------------
// Season-end accumulator split — rank-weight table (locked decision).
// Top 10 split the vault by descending weights; integer math on base units,
// dust goes to rank 1.
// ---------------------------------------------------------------------------

/** Rank weights for the season-end split: rank 1 → 30%, 2 → 20%, ... */
export const RANK_WEIGHTS_BPS: number[] = [3000, 2000, 1400, 1000, 800, 600, 500, 400, 200, 100];

export function accumulatorSplit(
  vaultBalance: bigint,
  rankedAddresses: string[],
): Array<{ address: string; rank: number; amount: bigint }> {
  const winners = rankedAddresses.slice(0, RANK_WEIGHTS_BPS.length);
  if (winners.length === 0) return [];
  // Renormalize over however many winners exist (a short season with 3
  // eligible traders still distributes the whole vault).
  const usedWeights = RANK_WEIGHTS_BPS.slice(0, winners.length);
  const totalBps = usedWeights.reduce((s, w) => s + w, 0);

  const rows = winners.map((address, i) => ({
    address,
    rank: i + 1,
    amount: (vaultBalance * BigInt(usedWeights[i])) / BigInt(totalBps),
  }));
  // Dust (integer division remainder) to rank 1.
  const paid = rows.reduce((s, r) => s + r.amount, 0n);
  rows[0].amount += vaultBalance - paid;
  return rows;
}

// ---------------------------------------------------------------------------
// Season leaderboard query (shared by /api/leaderboard and the agent MCP).
// Humans and agents rank together; agent rows carry their name and, if the
// owner opted in, who runs them.
// ---------------------------------------------------------------------------

export interface AgentLabel {
  name: string;
  owner: string | null; // null = owner chose anonymous
}

export async function computeLeaderboard() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const rows = await db.execute(sql`
    select u.address,
           count(p.id)::int                 as settled_markets,
           sum(p.stake)::text               as volume,
           array_agg(p.accuracy_a::text)    as accuracy_weights,
           a.name                           as agent_name,
           case when a.public_identity then ou.address end as agent_owner
    from positions p
    join users u   on u.id = p.user_id
    join markets m on m.id = p.market_id
    left join agents a on a.agent_user_id = u.id
    left join users ou on ou.id = a.owner_user_id
    where m.status = 'settled' and p.accuracy_a is not null
    group by u.address, a.name, a.public_identity, ou.address
  `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = rows as unknown as Array<any>;
  const agentsByAddress = new Map<string, AgentLabel>();
  const traders: TraderSeasonStats[] = raw.map((r) => {
    if (r.agent_name) agentsByAddress.set(r.address, { name: r.agent_name, owner: r.agent_owner ?? null });
    return {
      address: r.address,
      settledMarkets: r.settled_markets,
      volume: BigInt(r.volume),
      precisionScores: (r.accuracy_weights as string[]).map((a) => precisionScore(BigInt(a))),
    };
  });

  const ranked = rankTraders(traders);
  return {
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
      agent: agentsByAddress.get(r.address) ?? null,
    })),
  };
}
