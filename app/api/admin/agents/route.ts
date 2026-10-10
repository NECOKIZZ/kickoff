import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { agentStakingHalted } from "@/lib/chain";
import { MANAGED_ENABLED, MANAGED_MODEL } from "@/lib/managedAgent";
import { sql } from "drizzle-orm";

// $ per million tokens (input, output) for the run-cost estimate, at
// OpenRouter's list prices. Estimates only: cache reads are billed lower, so
// real spend is at or below this.
const PRICES: Record<string, [number, number]> = {
  "anthropic/claude-opus-5.5": [4, 20],
  "anthropic/claude-opus-5": [5, 25],
  "anthropic/claude-sonnet-5.5": [2, 10],
  "anthropic/claude-sonnet-5": [2, 10],
  "anthropic/claude-haiku-5.5": [0.1, 0.5],
};

/**
 * GET /api/admin/agents — agent monitoring: who's running, run health and
 * cost over 7 days, and per open market how much of the pool is agents and
 * how concentrated their picks are (herding → coalition/void risk).
 */
export async function GET(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  const agents = await db.execute(sql`
    select a.id, a.name, a.mode, a.status, a.wallet_address, ou.address as owner, a.created_at,
           (select count(*) from positions p where p.user_id = a.agent_user_id)::int as positions
    from agents a join users ou on ou.id = a.owner_user_id
    order by a.created_at desc`);

  const [runs] = (await db.execute(sql`
    select count(*)::int as runs,
           count(*) filter (where status = 'error')::int as errors,
           count(*) filter (where status = 'refused')::int as refused,
           coalesce(sum(input_tokens), 0)::bigint as input_tokens,
           coalesce(sum(output_tokens), 0)::bigint as output_tokens,
           coalesce(sum(cache_read_tokens), 0)::bigint as cache_read_tokens
    from agent_runs where created_at > now() - interval '7 days'`)) as unknown as Array<Record<string, number>>;
  const [pin, pout] = PRICES[MANAGED_MODEL] ?? [0, 0];
  const estCostUsd = (Number(runs.input_tokens) * pin + Number(runs.output_tokens) * pout) / 1e6;

  const herding = await db.execute(sql`
    select m.id as market_id, m.title,
           count(p.id)::int as positions,
           count(a.id)::int as agent_positions,
           (select max(c) from (
              select count(*) as c from positions p2 join agents a2 on a2.agent_user_id = p2.user_id
              where p2.market_id = m.id group by p2.guess_home, p2.guess_away) t)::int as top_agent_pick_count
    from markets m
    left join positions p on p.market_id = m.id
    left join agents a on a.agent_user_id = p.user_id
    where m.status in ('open', 'locked') and m.kind = 'scoreline'
    group by m.id, m.title
    order by m.kickoff_at`);

  const recentErrors = await db
    .select({ id: schema.agentRuns.id, agentId: schema.agentRuns.agentId, status: schema.agentRuns.status, error: schema.agentRuns.error, createdAt: schema.agentRuns.createdAt })
    .from(schema.agentRuns)
    .where(sql`${schema.agentRuns.status} <> 'ok' and ${schema.agentRuns.createdAt} > now() - interval '7 days'`)
    .orderBy(sql`${schema.agentRuns.createdAt} desc`)
    .limit(20);

  return json({
    managedEnabled: MANAGED_ENABLED,
    model: MANAGED_MODEL,
    stakingHalted: await agentStakingHalted().catch(() => null),
    agents,
    runs7d: { ...runs, estCostUsd: Math.round(estCostUsd * 100) / 100 },
    herding,
    recentErrors,
  });
}
