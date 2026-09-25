import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { agentOfOwner } from "@/lib/agents";
import { desc, eq } from "drizzle-orm";

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
  return json({ runs });
}
