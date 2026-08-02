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
import {
  isEplLive,
  isEplExtractor,
  normalizeFsLiveFixture,
  normalizeFsMatchState,
  normalizeFsEvents,
  normalizeFsStats,
  normalizeFsExtractorMatch,
} from "./normalize/flashscore";
import { getLiveMatches, getFixtureWindow } from "./flashscore";
import { fsStatus } from "./normalize/flashscore";
import { getTiebreakScore } from "./fsfd";
import { getBootstrap, getEventLive, getFplFixtures } from "./fpl";
import {
  fplTeamSlugs,
  normalizeFplGameweeks,
  normalizeFplPlayers,
  normalizeFplFixtures,
  normalizeFplLive,
} from "./normalize/fpl";
import {
  upsertGameweeks,
  upsertFplPlayers,
  upsertFplFixtures,
  upsertFplPoints,
  mapS1Players,
  loadFplPlayerMap,
} from "./fplIngest";
import { recordVote, markDisputed } from "./settlementLane";
import {
  upsertFixture,
  upsertPlayerStats,
  insertEvents,
  upsertMatchState,
  upsertMatchStats,
} from "./ingest";
import { db, schema } from "./db";
import { eq } from "drizzle-orm";
import { log } from "./log";

export function seasonFor(now: Date): number {
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

  /** Settlement vote: S1's final-score read → the settlement lane, plus a
   *  status/score refresh of the fixture row. */
  "s1.settlementVote": async (job, now) => {
    const s1Id = await s1IdFor(job.fixtureId!);
    if (s1Id === null) throw new Error(`no apiFootball ref for ${job.fixtureId}`);
    const byId = await getFixturesByIds([s1Id]);
    const raw = byId[0];
    if (!raw) throw new Error(`S1 returned no fixture for id ${s1Id}`);
    const n = normalizeAfFixture(raw);
    await upsertFixture(n, { statusUnknown: n.statusUnknown });
    if (n.status !== "ft") throw new Error(`S1 says ${job.fixtureId} not FT yet — retry next tick`);
    if (raw.goals.home === null || raw.goals.away === null) {
      throw new Error(`S1 FT read has null goals for ${job.fixtureId}`);
    }
    await recordVote(job.fixtureId!, "apiFootball", { home: raw.goals.home, away: raw.goals.away }, now);
  },

  "s2.settlementVote": async (job, now) => {
    // S2's matches endpoint is windowed; re-sync the day, refresh every
    // fixture, and cast the vote for the one this job is about.
    const day = new Date(now.getTime() - 24 * 3600_000).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const raw = await getEplMatches(day, to);
    let voted = false;
    for (const m of raw) {
      const n = normalizeFdMatch(m);
      const id = await upsertFixture(n, { statusUnknown: n.statusUnknown });
      if (id === job.fixtureId && n.status === "ft" && n.finalScore) {
        await recordVote(id, "fdorg", n.finalScore, now);
        voted = true;
      }
    }
    if (!voted) throw new Error(`S2 has no FT score for ${job.fixtureId} yet — retry next tick`);
  },

  /** S3 live poll — the chart engine. ONE actor run returns ALL live
   *  matches, so this runner ignores job.fixtureId and serves every live
   *  EPL fixture at once (the planner may emit several s3.livePoll jobs per
   *  tick; the worker dedupes same-kind jobs to one run — see worker.ts). */
  "s3.livePoll": async (_job, now) => {
    const all = await getLiveMatches();
    const nowIso = now.toISOString();
    for (const m of all) {
      if (!isEplLive(m)) continue;
      const fx = normalizeFsLiveFixture(m);
      if (!fx) continue;
      const id = await upsertFixture(fx, { statusUnknown: fx.statusUnknown });
      await upsertMatchState(normalizeFsMatchState(id, m, nowIso), "flashscore", now);
      await insertEvents(normalizeFsEvents(id, m, nowIso), null);
      await upsertMatchStats(normalizeFsStats(id, m), "flashscore", now);
      // FT → cast the Flashscore settlement vote (S3+S4 = ONE vote). Recorded
      // even pre-burn-in: the engine excludes untrusted votes from quorum but
      // keeps them in the array — that's the shadow-mode diff for spec §6.
      if (fsStatus(m) === "ft" && m.home_score !== null && m.away_score !== null) {
        await recordVote(id, "flashscore", { home: m.home_score, away: m.away_score }, now);
      }
    }
  },

  /** S4 fixture window sync — listing redundancy. Corroborates existence +
   *  status; never overwrites S1's kickoff times (upsert semantics). */
  "s4.fixtureSync": async () => {
    const raw = await getFixtureWindow(["Premier League"]);
    for (const m of raw) {
      if (!isEplExtractor(m)) continue;
      const n = normalizeFsExtractorMatch(m);
      if (!n) continue;
      await upsertFixture(n, { statusUnknown: n.statusUnknown });
    }
  },

  /** S5 tie-break — once per fixture, only when the settlement lane reports
   *  the primaries disagree. No unambiguous answer → no vote → the lane goes
   *  disputed on the next decide() rather than trusting a fuzzy match. */
  "s5.tiebreak": async (job, now) => {
    const rows = await db
      .select({ homeSlug: schema.fixtures.homeSlug, awaySlug: schema.fixtures.awaySlug })
      .from(schema.fixtures)
      .where(eq(schema.fixtures.id, job.fixtureId!));
    const fx = rows[0];
    if (!fx) throw new Error(`unknown fixture ${job.fixtureId}`);
    const score = await getTiebreakScore(fx.homeSlug, fx.awaySlug);
    if (score === null) {
      log.error("jobs", "s5.tiebreak: no unambiguous score, disputing", { fixtureId: job.fixtureId });
      await markDisputed(job.fixtureId!);
      return;
    }
    await recordVote(job.fixtureId!, "fsfd", score, now);
  },

  // --- FPL lane — standalone authority for player points ---

  /** Gameweeks + players + teams from bootstrap-static. Doubles as the
   *  finality watch: data_checked only lives here. */
  "fpl.bootstrapSync": async (_job, now) => {
    const b = await getBootstrap();
    const season = seasonFor(now);
    await upsertGameweeks(normalizeFplGameweeks(b, season));
    await upsertFplPlayers(normalizeFplPlayers(b, season));
    // FPL fixture lists need team-id→slug from bootstrap; sync the full list
    // here (it's one request and covers gw reassignments/postponements).
    const fx = await getFplFixtures();
    await upsertFplFixtures(normalizeFplFixtures(fx, fplTeamSlugs(b), season));
    await mapS1Players(season); // refresh element→S1 map (cross-check input)
  },

  /** Per-gameweek fixture refresh — liveness/finality flags move fast on
   *  matchdays; the full-list sync above is too slow for that. */
  "fpl.fixtureSync": async (job, now) => {
    const b = await getBootstrap();
    const season = seasonFor(now);
    const fx = await getFplFixtures(job.gw);
    await upsertFplFixtures(normalizeFplFixtures(fx, fplTeamSlugs(b), season));
  },

  /** Live points for one gameweek — a single call covers every player.
   *  Also refreshes the GW's fixture flags so the planner/settlement lane
   *  see started/finished move without waiting for fixtureSync. */
  "fpl.livePoll": async (job, now) => {
    if (job.gw === undefined) throw new Error("fpl.livePoll needs a gw");
    const season = seasonFor(now);
    const live = await getEventLive(job.gw);
    const players = await loadFplPlayerMap(season);
    await upsertFplPoints(normalizeFplLive(job.gw, season, live.elements, players), null, now);
    const b = await getBootstrap();
    const fx = await getFplFixtures(job.gw);
    await upsertFplFixtures(normalizeFplFixtures(fx, fplTeamSlugs(b), season));
    // Keep the gameweek's finished/data_checked flags fresh too — the sweep
    // reads them and bootstrapSync may be hours away.
    await upsertGameweeks(normalizeFplGameweeks(b, season));
  },
};
