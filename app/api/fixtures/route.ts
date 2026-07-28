import { json, jsonError } from "@/lib/http";
import { listFixtures } from "@/lib/dataService";

/**
 * GET /api/fixtures?from=2026-08-15&to=2026-08-22
 *
 * Upcoming EPL fixtures from kickoff-data (the only football-data source
 * this app talks to). Cross-checking across providers now happens inside
 * the service; `crossChecked` = reconciled by ≥2 sources in source_refs.
 * `crossChecked: false` fixtures can host Player Perps markets but a
 * Scoreline market needs the lower-trust disclosure.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  try {
    const rows = await listFixtures({ league: "EPL", from, to });

    const fixtures = rows.map(({ data: f, staleness_seconds }) => ({
      fixtureId: f.id,
      apiFootballId: f.source_refs.apiFootball ?? null,
      fdOrgMatchId: f.source_refs.fdorg ?? null,
      kickoffAt: f.kickoff_utc,
      status: f.status,
      homeTeam: f.home.name,
      awayTeam: f.away.name,
      crossChecked: Object.keys(f.source_refs).length >= 2,
      stalenessSeconds: staleness_seconds,
    }));

    return json({ fixtures });
  } catch (e) {
    return jsonError(`fixture fetch failed: ${(e as Error).message}`, 502);
  }
}
