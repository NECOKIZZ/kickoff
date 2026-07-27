// Job runners — the side-effectful half of the scheduler. Each runner fetches
// from ONE source, archives raw (client does it), normalizes, ingests.
//
// S3/S4 kinds have no runner yet (Apify clients land at build step 4); the
// worker skips unknown kinds with a log line, so the planner can already
// speak them without breaking.

import type { Job } from "./scheduler/planner";
import {
  getEplFixtures,
  getFixturesByIds,
  getFixtureEvents,
  getFixtureLineups,
  getFixturePlayers,
} from "./apiFootball";
import { getEplMatches } from "./footballDataOrg";
import { normalizeAfFixture, normalizeAfEvents, normalizeAfPlayers } from "./normalize/apiFootball";
import { normalizeFdMatch } from "./normalize/footballDataOrg";
import { upsertFixture, upsertPlayerStats, insertEvents } from "./ingest";
import { db, schema } from "./db";
import { eq } from "drizzle-orm";

function seasonFor(now: Date): number {
  // EPL season = the year it starts in (Aug–May).
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function s1IdFor(fixtureId: string): Promise<number | null> {
  const rows = await db
    .select({ sourceRefs: schema.fixtures.sourceRefs })
    .from(schema.fixtures)
    .where(eq(schema.fixtures.id, fixtureId));
  const ref = (rows[0]?.sourceRefs as Record<string, unknown> | undefined)?.apiFootball;
  return typeof ref === "number" ? ref : null;
}

export type JobRunner = (job: Job, now: Date) => Promise<void>;

export const runners: Partial<Record<Job["kind"], JobRunner>> = {
  /** Morning slate sync — listing lane (2 S1 requests/day flat via cadence). */
  "s1.fixtureSync": async (_job, now) => {
    const from = now.toISOString().slice(0, 10);
    const to = new Date(now.getTime() + 14 * 24 * 3600_000).toISOString().slice(0, 10);
    const raw = await getEplFixtures(seasonFor(now), from, to);
    for (const f of raw) {
      const n = normalizeAfFixture(f);
      await upsertFixture(n, { statusUnknown: n.statusUnknown });
    }
  },

  /** Fixture cross-check from the slow-but-honest confirmer. */
  "s2.fixtureSync": async (_job, now) => {
    const from = now.toISOString().slice(0, 10);
    const to = new Date(now.getTime() + 14 * 24 * 3600_000).toISOString().slice(0, 10);
    const raw = await getEplMatches(from, to);
    for (const m of raw) {
      const n = normalizeFdMatch(m);
      await upsertFixture(n, { statusUnknown: n.statusUnknown });
    }
  },

  /** T−1h confirmed lineups — feeds the T−15min listing gate. */
  "s1.lineups": async (job) => {
    const s1Id = await s1IdFor(job.fixtureId!);
    if (s1Id === null) throw new Error(`no apiFootball ref for ${job.fixtureId}`);
    const lineups = await getFixtureLineups(s1Id);
    // Stored raw-only for now: the lineup gate query reads the archived
    // payload; a first-class lineups table can follow when the consumer API
    // lands. Nothing downstream needs normalization yet.
    void lineups;
  },

  /** FT: player stats + events → Market B scoring inputs. */
  "s1.postMatch": async (job, now) => {
    const s1Id = await s1IdFor(job.fixtureId!);
    if (s1Id === null) throw new Error(`no apiFootball ref for ${job.fixtureId}`);
    const [byId, teams, lineups] = [
      await getFixturesByIds([s1Id]),
      await getFixturePlayers(s1Id),
      await getFixtureLineups(s1Id),
    ];
    const raw = byId[0];
    if (!raw) throw new Error(`S1 returned no fixture for id ${s1Id}`);
    const events = (raw as any).events ?? (await getFixtureEvents(s1Id));
    const homeTeamId = raw.teams.home.id;
    const elapsed = raw.fixture.status.elapsed ?? 90;

    const nowIso = now.toISOString();
    await insertEvents(normalizeAfEvents(job.fixtureId!, homeTeamId, events, nowIso), null);
    await upsertPlayerStats(
      normalizeAfPlayers(job.fixtureId!, teams, lineups, events, homeTeamId, elapsed),
      null,
      now,
    );
  },

  /** Settlement vote reads land in the settlement lane at build step 6 —
   *  until then they only refresh the fixture's final status/score. */
  "s1.settlementVote": async (job) => {
    const s1Id = await s1IdFor(job.fixtureId!);
    if (s1Id === null) throw new Error(`no apiFootball ref for ${job.fixtureId}`);
    const byId = await getFixturesByIds([s1Id]);
    if (byId[0]) {
      const n = normalizeAfFixture(byId[0]);
      await upsertFixture(n, { statusUnknown: n.statusUnknown });
    }
  },

  "s2.settlementVote": async (job, now) => {
    // S2's matches endpoint is windowed; re-sync the day and let the upsert
    // refresh this fixture's final score/status.
    const day = new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const raw = await getEplMatches(day, to);
    for (const m of raw) {
      const n = normalizeFdMatch(m);
      await upsertFixture(n, { statusUnknown: n.statusUnknown });
    }
  },
};
