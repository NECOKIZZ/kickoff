import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { setAgentStakingHalted } from "@/lib/chain";

/** POST /api/admin/agents/halt — { halted: boolean }. Kill switch for all agent staking. */
export async function POST(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  let b: { halted?: unknown };
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (typeof b.halted !== "boolean") return jsonError("halted must be true/false", 400);
  try {
    const txHash = await setAgentStakingHalted(b.halted);
    await logAdminEvent("admin", b.halted ? "agents.halt" : "agents.resume", null, { txHash });
    return json({ halted: b.halted, txHash });
  } catch (err) {
    return jsonError(`on-chain halt failed: ${err instanceof Error ? err.message.split("\n")[0] : err}`, 502);
  }
}
