import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { zeroAddress, type Hex } from "viem";
import { AGENT_VAULT_ADDRESS } from "@/lib/chainConfig";

export type AgentRow = typeof schema.agents.$inferSelect;

/** Vault the link is signed against. Dev mode (no vault) signs against 0x0. */
export const LINK_VAULT: Hex = AGENT_VAULT_ADDRESS ?? zeroAddress;

/** soul.md cap — it's untrusted prompt text on Kickoff's model key. */
export const SOUL_MD_MAX_BYTES = 8 * 1024;

export async function agentOfOwner(userId: number): Promise<AgentRow | null> {
  const [row] = await db.select().from(schema.agents).where(eq(schema.agents.ownerUserId, userId)).limit(1);
  return row ?? null;
}

/** Public shape — never leaks soul.md to anyone but the owner. */
export function publicAgent(a: AgentRow) {
  return {
    id: a.id,
    name: a.name,
    walletAddress: a.walletAddress,
    mode: a.mode,
    status: a.status,
    publicIdentity: a.publicIdentity,
    createdAt: a.createdAt,
  };
}

export function validateSoulMd(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return "soulMd must be text";
  if (new TextEncoder().encode(v).length > SOUL_MD_MAX_BYTES) return `soulMd must be under ${SOUL_MD_MAX_BYTES / 1024} KB`;
  return null;
}
