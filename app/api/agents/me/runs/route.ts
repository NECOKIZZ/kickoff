import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { agentOfOwner } from "@/lib/agents";
import { desc, eq, inArray } from "drizzle-orm";

/** GET /api/agents/me/runs — the owner's managed-agent run log (latest 20). */
export async function GET(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  const agent = await agentOfOwner(caller.userId);
  if (!agent) return jsonError("no agent yet", 404);
  const runs = await db
    .select({
      id: schema.agentRuns.id,
      status: schema.agentRuns.status,
      trigger: schema.agentRuns.trigger,
      picks: schema.agentRuns.picks,
      error: schema.agentRuns.error,
      createdAt: schema.agentRuns.createdAt,
    })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.agentId, agent.id))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(20);

  // Name the matches ("Arsenal vs Leeds", not "#12") for the owner's view.
  type Pick = { marketId?: number } & Record<string, unknown>;
  const ids = [...new Set(runs.flatMap((r) => (r.picks as Pick[]).map((p) => p.marketId).filter((id): id is number => id != null)))];
  const titles = new Map(
    ids.length
      ? (
          await db.select({ id: schema.markets.id, title: schema.markets.title }).from(schema.markets).where(inArray(schema.markets.id, ids))
        ).map((m) => [m.id, m.title])
      : [],
  );
  return json({
    runs: runs.map((r) => ({
      ...r,
      picks: (r.picks as Pick[]).map((p) => (p.marketId != null ? { ...p, title: titles.get(p.marketId) ?? null } : p)),
    })),
  });
}
