import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
// TRANSITIONAL (spec §8 step 5): direct in-process import of the data
// service. Replaced by the /v1 consumer API once kickoff-data serves HTTP.
import { backtestFixture, isMockMode } from "@kickoff/data";

/**
 * POST /api/admin/backtest/:fixtureId — replay a completed fixture through
 * the full pipeline (dashboard button). Returns schema checks + player
 * scores + simulated settlements. ~3 real requests when keys are live.
 */
export async function POST(req: Request, ctx: { params: Promise<{ fixtureId: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { fixtureId } = await ctx.params;
  const id = Number(fixtureId);
  if (!Number.isInteger(id)) return jsonError("invalid fixture id", 400);

  try {
    const report = await backtestFixture(id);
    await logAdminEvent("admin", "backtest.run", null, {
      fixtureId: id,
      mock: isMockMode(),
      checks: report.schemaChecks,
    });
    return json({ mock: isMockMode(), report });
  } catch (e) {
    return jsonError(`backtest failed: ${(e as Error).message}`, 502);
  }
}
