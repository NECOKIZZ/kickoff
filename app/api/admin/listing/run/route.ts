import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { runListingAgent } from "@/lib/listingAgent";

export const maxDuration = 300;

/** POST /api/admin/listing/run — "Run listing agent now" from /admin. */
export async function POST(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  return json(await runListingAgent());
}
