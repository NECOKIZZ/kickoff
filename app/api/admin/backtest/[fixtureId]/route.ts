import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { runBacktest } from "@/lib/dataService";

/**
 * POST /api/admin/backtest/:fixtureId — replay a completed fixture through
 * the data service's pipeline (dashboard button). Proxies to kickoff-data's
 * admin API; takes S1's numeric fixture id.
 */
export async function POST(req: Request, ctx: { params: Promise<{ fixtureId: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { fixtureId } = await ctx.params;
  const id = Number(fixtureId);
  if (!Number.isInteger(id)) return jsonError("invalid fixture id", 400);

  try {
    const report = (await runBacktest(id)) as { schemaChecks?: unknown };
    await logAdminEvent("admin", "backtest.run", null, {
      fixtureId: id,
      checks: report.schemaChecks,
    });
    return json({ report });
  } catch (e) {
    return jsonError(`backtest failed: ${(e as Error).message}`, 502);
  }
}
