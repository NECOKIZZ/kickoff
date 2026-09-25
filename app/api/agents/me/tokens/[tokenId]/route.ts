import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { agentOfOwner } from "@/lib/agents";
import { and, eq, isNull } from "drizzle-orm";

/** DELETE /api/agents/me/tokens/:tokenId — revoke instantly. */
export async function DELETE(req: Request, ctx: { params: Promise<{ tokenId: string }> }) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  const agent = await agentOfOwner(caller.userId);
  if (!agent) return jsonError("no agent yet", 404);
  const tokenId = Number((await ctx.params).tokenId);
  const [row] = await db
    .update(schema.agentTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(schema.agentTokens.id, tokenId), eq(schema.agentTokens.agentId, agent.id), isNull(schema.agentTokens.revokedAt)),
    )
    .returning({ id: schema.agentTokens.id });
  if (!row) return jsonError("token not found or already revoked", 404);
  await logAdminEvent(caller.address, "agent.token.revoke", null, { agentId: agent.id, tokenId });
  return json({ revoked: row.id });
}
