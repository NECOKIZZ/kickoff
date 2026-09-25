import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { runDueManagedAgents } from "@/lib/managedScheduler";

export const maxDuration = 300;

/** POST /api/admin/agents/run — run the managed-agent scheduler tick now. */
export async function POST(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const r = await runDueManagedAgents("admin");
  await logAdminEvent("admin", "agents.run", null, r);
  return json(r);
}
