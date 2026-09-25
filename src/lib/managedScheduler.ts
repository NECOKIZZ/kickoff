// Decides WHEN managed agents run. No always-on worker on the app host, so a
// cron hits /api/cron/managed-agents; each tick runs every active managed
// agent that has open markets locking soon which it hasn't been shown yet.
// That's ~one model call per agent per batch of fixtures, with hard caps.

import { db, schema } from "@/db";
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { buildDataPack } from "@/lib/dataPack";
import { MANAGED_ENABLED, runManagedAgent, type ModelCaller, type RunResult } from "@/lib/managedAgent";

const LOOKAHEAD_HOURS = Number(process.env.MANAGED_AGENT_LOOKAHEAD_HOURS ?? 12);
const MAX_RUNS_PER_AGENT_PER_DAY = Number(process.env.MANAGED_AGENT_MAX_RUNS_PER_DAY ?? 4);
const MAX_AGENTS_PER_TICK = Number(process.env.MANAGED_AGENT_MAX_PER_TICK ?? 25);

/** Pure: should this agent run now? */
export function isDue(
  dueMarketIds: number[],
  recentRuns: Array<{ marketIds: number[] }>, // this agent's runs in the last 24h
  maxRunsPerDay = MAX_RUNS_PER_AGENT_PER_DAY,
): boolean {
  if (dueMarketIds.length === 0 || recentRuns.length >= maxRunsPerDay) return false;
  const seen = new Set(recentRuns.flatMap((r) => r.marketIds));
  return dueMarketIds.some((id) => !seen.has(id));
}

export interface TickSummary {
  dueMarkets: number;
  considered: number;
  ran: Array<{ agentId: number } & RunResult>;
  skipped: number;
  capped: boolean;
}

export async function runDueManagedAgents(
  trigger: "cron" | "admin",
  caller?: ModelCaller,
): Promise<TickSummary | { disabled: string }> {
  if (!MANAGED_ENABLED && !caller) return { disabled: "ANTHROPIC_API_KEY is not set" };

  const pack = await buildDataPack();
  const horizon = Date.now() + LOOKAHEAD_HOURS * 3_600_000;
  const due = pack.openFixtures.filter((f) => new Date(f.locksAt).getTime() <= horizon).map((f) => f.marketId);
  const summary: TickSummary = { dueMarkets: due.length, considered: 0, ran: [], skipped: 0, capped: false };
  if (due.length === 0) return summary;

  const agents = await db
    .select()
    .from(schema.agents)
    .where(and(eq(schema.agents.mode, "managed"), eq(schema.agents.status, "active"), isNotNull(schema.agents.soulMd)));
  summary.considered = agents.length;

  const since = new Date(Date.now() - 24 * 3_600_000);
  for (const agent of agents) {
    if (summary.ran.length >= MAX_AGENTS_PER_TICK) {
      summary.capped = true; // the rest go next tick
      break;
    }
    const recent = await db
      .select({ marketIds: schema.agentRuns.marketIds })
      .from(schema.agentRuns)
      .where(and(eq(schema.agentRuns.agentId, agent.id), gt(schema.agentRuns.createdAt, since)))
      .orderBy(desc(schema.agentRuns.createdAt));
    if (!isDue(due, recent)) {
      summary.skipped++;
      continue;
    }
    // Sequential on purpose: the first call writes the data-pack cache, the
    // rest read it; and a bad tick can't fan out into a burst of spend.
    const r = await runManagedAgent(agent, { trigger, pack, caller });
    summary.ran.push({ agentId: agent.id, ...r });
  }
  return summary;
}
