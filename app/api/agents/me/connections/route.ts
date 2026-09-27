import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { agentOfOwner } from "@/lib/agents";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

/** GET /api/agents/me/connections — apps connected to the agent over OAuth (live grants only). */
export async function GET(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  const agent = await agentOfOwner(caller.userId);
  if (!agent) return jsonError("no agent yet", 404);
  const rows = await db
    .select({
      id: schema.oauthGrants.id,
      clientName: schema.oauthClients.name,
      createdAt: schema.oauthGrants.createdAt,
      lastUsedAt: schema.oauthGrants.lastUsedAt,
    })
    .from(schema.oauthGrants)
    .innerJoin(schema.oauthClients, eq(schema.oauthClients.id, schema.oauthGrants.clientId))
    .where(
      and(
        eq(schema.oauthGrants.agentId, agent.id),
        isNull(schema.oauthGrants.revokedAt),
        gt(schema.oauthGrants.refreshExpiresAt, new Date()),
      ),
    )
    .orderBy(desc(schema.oauthGrants.createdAt));
  return json({ connections: rows });
}
