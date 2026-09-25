import { json, jsonError } from "@/lib/http";
import { listingEnabled, runListingAgent } from "@/lib/listingAgent";

export const maxDuration = 300;

/**
 * GET /api/cron/listing — the listing agent's scheduled run (daily, see
 * vercel.json). Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron
 * sends; any external scheduler can send the same). Fails closed when unset.
 * LISTING_AGENT_ENABLED=0 pauses it without a deploy.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return jsonError("unauthorized", 401);
  if (!listingEnabled()) return json({ skipped: "LISTING_AGENT_ENABLED is off" });
  return json(await runListingAgent());
}
