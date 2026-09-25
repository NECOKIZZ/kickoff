import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { agentAddressOf, linkTypedData, validateAgentName } from "@/lib/agentLink";
import { LINK_VAULT, agentOfOwner, publicAgent, validateSoulMd } from "@/lib/agents";
import { AGENTS_ON_CHAIN, agentVaultState } from "@/lib/chain";
import { robinhoodTestnet } from "@/lib/chainConfig";
import { eq } from "drizzle-orm";
import type { Hex } from "viem";

/**
 * GET /api/agents/me — the caller's agent (or null) plus what the client
 * needs to create/fund one: the predicted agent address, the typed data to
 * sign, and the live vault balance.
 */
export async function GET(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);

  const agent = await agentOfOwner(caller.userId);
  const human = caller.address as Hex;
  const agentAddress = agentAddressOf(LINK_VAULT, human);
  const vault = agent && AGENTS_ON_CHAIN ? await agentVaultState(agentAddress).catch(() => null) : null;

  return json({
    agent: agent ? { ...publicAgent(agent), soulMd: agent.soulMd } : null,
    agentAddress,
    onChain: AGENTS_ON_CHAIN,
    vault: vault ? { balance: vault.balance, paused: vault.paused } : null,
    // Unsigned template; the client fills a fresh deadline and signs it.
    link: { vault: LINK_VAULT, chainId: robinhoodTestnet.id, typedData: linkTypedData(LINK_VAULT, robinhoodTestnet.id, human, 0n) },
  });
}

/**
 * PATCH /api/agents/me — { name?, mode?, status?, publicIdentity?, soulMd? }.
 * status "paused" takes effect instantly: every placement path checks it
 * before touching the vault (the on-chain pause is the owner's own backstop).
 */
export async function PATCH(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  const agent = await agentOfOwner(caller.userId);
  if (!agent) return jsonError("no agent yet", 404);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const patch: Partial<typeof schema.agents.$inferInsert> = {};
  if (b.name !== undefined) {
    const e = validateAgentName(b.name);
    if (e) return jsonError(e, 400);
    patch.name = (b.name as string).trim();
  }
  if (b.mode !== undefined) {
    if (b.mode !== "byok" && b.mode !== "managed") return jsonError("mode must be 'byok' or 'managed'", 400);
    patch.mode = b.mode;
  }
  if (b.status !== undefined) {
    if (b.status !== "active" && b.status !== "paused") return jsonError("status must be 'active' or 'paused'", 400);
    patch.status = b.status;
  }
  if (b.publicIdentity !== undefined) {
    if (typeof b.publicIdentity !== "boolean") return jsonError("publicIdentity must be true/false", 400);
    patch.publicIdentity = b.publicIdentity;
  }
  if (b.soulMd !== undefined) {
    const e = validateSoulMd(b.soulMd);
    if (e) return jsonError(e, 400);
    patch.soulMd = b.soulMd as string | null;
  }
  if (Object.keys(patch).length === 0) return jsonError("nothing to update", 400);

  const [row] = await db.update(schema.agents).set(patch).where(eq(schema.agents.id, agent.id)).returning();
  await logAdminEvent(caller.address, "agent.update", null, {
    agentId: agent.id,
    ...patch,
    soulMd: patch.soulMd === undefined ? undefined : `(${patch.soulMd?.length ?? 0} chars)`,
  });
  return json({ agent: { ...publicAgent(row), soulMd: row.soulMd } });
}
