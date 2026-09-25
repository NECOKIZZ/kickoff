// The ONE path by which an agent's prediction becomes a position. Both brains
// use it: BYOK agents via the MCP server, managed agents via the soul.md
// runner. It enforces the same market rules as the human UI plus the agent
// rules (active agent, fixed-stake Score markets only), stakes through the
// AgentVault on-chain first, then records the position under the agent's
// own trader row.

import { db, schema } from "@/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Hex } from "viem";
import { logAdminEvent } from "@/lib/admin";
import type { AgentRow } from "@/lib/agents";
import { AGENTS_ON_CHAIN, CHAIN_ENABLED, agentClaimOnChain, agentStakeOnChain, agentVaultState } from "@/lib/chain";

export type PlacementSource = "mcp" | "managed";

export type PlacementResult =
  | { ok: true; marketId: number; home: number; away: number; stake: bigint; restake: boolean; txHash: string | null }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): PlacementResult => ({ ok: false, status, error });

export async function placeAgentPrediction(
  agent: AgentRow,
  marketId: number,
  home: number,
  away: number,
  source: PlacementSource,
): Promise<PlacementResult> {
  if (agent.status !== "active") return fail(423, "agent is paused by its owner");
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 20 || away > 20)
    return fail(400, "home and away must be whole numbers between 0 and 20");

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m || m.status === "draft") return fail(404, "market not found");
  if (m.kind !== "scoreline") return fail(400, "agents only play Score markets");
  if (m.status !== "open" || new Date() >= m.locksAt) return fail(409, "market is not open (locked or finished)");
  if (m.stakeMode !== "fixed" || m.fixedStake == null) return fail(409, "agents only play fixed-stake markets");

  const [existing] = await db
    .select()
    .from(schema.positions)
    .where(and(eq(schema.positions.marketId, marketId), eq(schema.positions.userId, agent.agentUserId)))
    .limit(1);

  // On-chain first. A market on the escrow with no AgentVault configured
  // would give the agent an unbacked DB position, so refuse instead.
  const linked = m.escrowAddress != null && m.onChainMarketId != null;
  let txHash: string | null = null;
  if (CHAIN_ENABLED && linked) {
    if (!AGENTS_ON_CHAIN) return fail(503, "agent staking isn't configured on this deployment");
    if (!existing) {
      const vault = await agentVaultState(agent.walletAddress as Hex);
      if (!vault || vault.balance < m.fixedStake)
        return fail(402, `agent balance too low: needs ${Number(m.fixedStake) / 1e6} tUSDC, ask the owner to fund it`);
    }
    try {
      txHash = await agentStakeOnChain(agent.walletAddress as Hex, m.onChainMarketId!, home, away);
    } catch (err) {
      return fail(502, `on-chain stake failed, nothing recorded: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    }
  }

  await db
    .insert(schema.positions)
    .values({
      marketId,
      userId: agent.agentUserId,
      guessHome: home,
      guessAway: away,
      stake: m.fixedStake,
      stakeTxHash: txHash,
    })
    .onConflictDoUpdate({
      target: [schema.positions.marketId, schema.positions.userId],
      set: { guessHome: home, guessAway: away, stakeTxHash: txHash },
    });

  await logAdminEvent(agent.walletAddress, "agent.predict", marketId, {
    agentId: agent.id,
    agentName: agent.name,
    source,
    guess: `${home}-${away}`,
    restake: !!existing,
    txHash,
  });

  return { ok: true, marketId, home, away, stake: m.fixedStake, restake: !!existing, txHash };
}

/**
 * After a market settles or voids on-chain, sweep every agent's payout back
 * into its vault balance (humans pull their own; agents have no key to).
 * Best effort per agent: a failure is logged and retried on the next sweep,
 * never blocks settlement.
 */
export async function sweepAgentPayouts(marketId: number): Promise<void> {
  if (!AGENTS_ON_CHAIN) return;
  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m || m.onChainMarketId == null || (m.status !== "settled" && m.status !== "void")) return;

  const owed = await db
    .select({ position: schema.positions, agent: schema.agents })
    .from(schema.positions)
    .innerJoin(schema.agents, eq(schema.agents.agentUserId, schema.positions.userId))
    .where(
      and(eq(schema.positions.marketId, marketId), isNull(schema.positions.claimTxHash), isNotNull(schema.positions.payout)),
    );

  for (const { position, agent } of owed) {
    if (position.payout === 0n) continue;
    try {
      const hash = await agentClaimOnChain(agent.walletAddress as Hex, m.onChainMarketId);
      await db.update(schema.positions).set({ claimTxHash: hash }).where(eq(schema.positions.id, position.id));
    } catch (err) {
      await logAdminEvent("system", "agent.claim_failed", marketId, {
        agentId: agent.id,
        error: err instanceof Error ? err.message.split("\n")[0] : String(err),
      });
    }
  }
}
