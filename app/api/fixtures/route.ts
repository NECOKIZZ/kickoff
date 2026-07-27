import { json, jsonError } from "@/lib/http";
// TRANSITIONAL (spec §8 step 5): direct in-process import of the data
// service. Replaced by the /v1 consumer API once kickoff-data serves HTTP.
import { getEplFixtures, budgetState, isMockMode } from "@kickoff/data";
import { getEplMatches, fixtureKey, fdorgIsMockMode as fdMock } from "@kickoff/data";

/**
 * GET /api/fixtures?from=2026-08-15&to=2026-08-22
 *
 * Upcoming EPL fixtures, cross-checked across both providers (§10.1):
 * matched by (date, home, away) via normalized team slugs, never by id.
 * `crossChecked: false` fixtures can host Player Perps markets but a
 * Scoreline market needs the lower-trust disclosure.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const season = Number(url.searchParams.get("season") ?? 2026);

  try {
    const [af, fd] = await Promise.all([getEplFixtures(season, from, to), getEplMatches(from, to)]);

    const fdByKey = new Map(fd.map((m) => [fixtureKey(m.utcDate, m.homeTeam.name, m.awayTeam.name), m]));

    const fixtures = af.map((f) => {
      const key = fixtureKey(f.fixture.date, f.teams.home.name, f.teams.away.name);
      const fdMatch = fdByKey.get(key) ?? null;
      return {
        fixtureId: f.fixture.id,
        fdOrgMatchId: fdMatch?.id ?? null,
        kickoffAt: f.fixture.date,
        status: f.fixture.status.short,
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        round: f.league.round,
        crossChecked: fdMatch !== null,
        goals: f.goals,
      };
    });

    return json({
      mock: isMockMode() || fdMock(),
      apiFootballBudget: budgetState(),
      fixtures,
    });
  } catch (e) {
    return jsonError(`fixture fetch failed: ${(e as Error).message}`, 502);
  }
}
