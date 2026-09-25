import { createHash, randomBytes } from "node:crypto";
import { db, schema } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import type { AgentRow } from "@/lib/agents";

// Agent-scoped API tokens for BYOK agents (MCP). The raw token is shown to
// the owner exactly once; only its sha256 is stored. A token can act for
// ONE agent only, and never for the human's own wallet.

export const TOKEN_PREFIX = "kagt_";
const MAX_ACTIVE_TOKENS = 3;

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export async function mintAgentToken(agentId: number): Promise<{ raw: string; id: number } | { error: string }> {
  const active = await db
    .select({ id: schema.agentTokens.id })
    .from(schema.agentTokens)
    .where(and(eq(schema.agentTokens.agentId, agentId), isNull(schema.agentTokens.revokedAt)));
  if (active.length >= MAX_ACTIVE_TOKENS) return { error: `at most ${MAX_ACTIVE_TOKENS} active tokens, revoke one first` };

  const raw = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(schema.agentTokens)
    .values({ agentId, tokenHash: hashToken(raw), tokenPrefix: raw.slice(0, TOKEN_PREFIX.length + 6) })
    .returning({ id: schema.agentTokens.id });
  return { raw, id: row.id };
}

/**
 * Resolve `Authorization: Bearer kagt_…` to its agent. Null for missing,
 * unknown or revoked tokens. Stamps last_used_at (best effort).
 */
export async function agentFromToken(req: Request): Promise<AgentRow | null> {
  const auth = req.headers.get("authorization");
  const raw = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
  const [hit] = await db
    .select({ token: schema.agentTokens, agent: schema.agents })
    .from(schema.agentTokens)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.agentTokens.agentId))
    .where(and(eq(schema.agentTokens.tokenHash, hashToken(raw)), isNull(schema.agentTokens.revokedAt)))
    .limit(1);
  if (!hit) return null;
  db.update(schema.agentTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.agentTokens.id, hit.token.id))
    .catch(() => {});
  return hit.agent;
}
