import { json, jsonError } from "@/lib/http";
import { runDueManagedAgents } from "@/lib/managedScheduler";

export const maxDuration = 300;

/**
 * GET /api/cron/managed-agents — scheduler tick for managed (soul.md) agents.
 * Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends; any
 * external scheduler can send the same). Fails closed when unset.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return jsonError("unauthorized", 401);
  return json(await runDueManagedAgents("cron"));
}
