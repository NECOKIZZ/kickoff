import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { verifyInviteFromRequest } from "@/lib/inviteGate";
import { logAdminEvent } from "@/lib/admin";
import { CHAIN_ENABLED, dripTestFunds } from "@/lib/chain";
import { and, eq, gt, sql } from "drizzle-orm";

const COOLDOWN_HOURS = 24;

/**
 * POST /api/faucet — testnet top-up for the signed-in wallet: a little gas
 * ETH (if low) + tUSDC (if low), sent from the server wallet. Once per
 * wallet per 24h; invite-gated like staking. Every drip is audit-logged.
 */
export async function POST(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  if ((await verifyInviteFromRequest(req)) === null) return jsonError("invite required", 403);
  if (!CHAIN_ENABLED) return jsonError("chain wiring is off on this deployment", 503);

  const [recent] = await db
    .select({ id: schema.adminEvents.id })
    .from(schema.adminEvents)
    .where(
      and(
        eq(schema.adminEvents.action, "faucet.drip"),
        eq(schema.adminEvents.actor, caller.address),
        gt(schema.adminEvents.createdAt, sql`now() - interval '${sql.raw(String(COOLDOWN_HOURS))} hours'`),
      ),
    )
    .limit(1);
  if (recent) return jsonError(`already topped up in the last ${COOLDOWN_HOURS}h`, 429);

  try {
    const r = await dripTestFunds(caller.address as `0x${string}`);
    await logAdminEvent(caller.address, "faucet.drip", null, r);
    return json({ drip: r });
  } catch (err) {
    return jsonError(`top-up failed: ${err instanceof Error ? err.message : err}`, 502);
  }
}
