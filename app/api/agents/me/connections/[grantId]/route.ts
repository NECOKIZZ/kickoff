import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { agentOfOwner } from "@/lib/agents";
import { and, eq, isNull } from "drizzle-orm";

/** DELETE /api/agents/me/connections/:grantId — disconnect an app instantly (access + refresh). */
export async function DELETE(req: Request, ctx: { params: Promise<{ grantId: string }> }) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  const agent = await agentOfOwner(caller.userId);
  if (!agent) return jsonError("no agent yet", 404);
  const grantId = Number((await ctx.params).grantId);
  const [row] = await db
    .update(schema.oauthGrants)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(schema.oauthGrants.id, grantId), eq(schema.oauthGrants.agentId, agent.id), isNull(schema.oauthGrants.revokedAt)),
    )
    .returning({ id: schema.oauthGrants.id });
  if (!row) return jsonError("connection not found or already removed", 404);
  await logAdminEvent(caller.address, "agent.oauth.revoke", null, { agentId: agent.id, grantId });
  return json({ revoked: row.id });
}
