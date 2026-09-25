import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { agentOfOwner } from "@/lib/agents";
import { mintAgentToken } from "@/lib/agentTokens";
import { desc, eq } from "drizzle-orm";

/** GET /api/agents/me/tokens — the owner's agent tokens (prefix only, never the secret). */
export async function GET(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  const agent = await agentOfOwner(caller.userId);
  if (!agent) return jsonError("no agent yet", 404);
  const rows = await db
    .select({
      id: schema.agentTokens.id,
      tokenPrefix: schema.agentTokens.tokenPrefix,
      createdAt: schema.agentTokens.createdAt,
      lastUsedAt: schema.agentTokens.lastUsedAt,
      revokedAt: schema.agentTokens.revokedAt,
    })
    .from(schema.agentTokens)
    .where(eq(schema.agentTokens.agentId, agent.id))
    .orderBy(desc(schema.agentTokens.createdAt));
  return json({ tokens: rows });
}

/** POST /api/agents/me/tokens — mint a token. The raw value is returned ONCE. */
export async function POST(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  const agent = await agentOfOwner(caller.userId);
  if (!agent) return jsonError("no agent yet", 404);
  const r = await mintAgentToken(agent.id);
  if ("error" in r) return jsonError(r.error, 409);
  await logAdminEvent(caller.address, "agent.token.create", null, { agentId: agent.id, tokenId: r.id });
  return json({ token: r.raw, id: r.id }, { status: 201 });
}
