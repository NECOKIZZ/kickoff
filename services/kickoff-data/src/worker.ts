// kickoff-data worker — the only long-running ingest process. One tick: load
// fixtures, plan, run due jobs, record lastRun. Failures are per-job (a dead
// source never stalls the loop) and logged; lastRun only advances on success
// so failed jobs retry next tick.
//
// Every tick touches the service_heartbeat row — /health reads it, so a
// crashed worker is visible from the API container within one tick.
//
// Run: pnpm worker   (tsx src/worker.ts)

import { sql } from "drizzle-orm";
import { plan, jobKey, type Job, type PlannerFixture, type PlannerGameweek } from "./scheduler/planner";
import { runners, seasonFor } from "./jobs";
import { installDbSink } from "./archive";
import { installDbBudgetStore } from "./budget";
import { budgetState, restoreBudget, isMockMode } from "./apiFootball";
import { isMockMode as fplMockMode } from "./fpl";
import { loadPlannerFixtures, loadSettledIds, installStatusChangeListener } from "./ingest";
import { loadPlannerGameweeks } from "./fplIngest";
import { deliver, webhookConfigFromEnv } from "./api/webhooks";
import { freezeDue, needsTiebreak, escalateStalled, installSettlementEmitter, s3Trusted } from "./settlementLane";
import { sweepPlayerPoints, installPlayerPointsEmitter } from "./fplSettlementLane";
import { db, schema } from "./db";
import { jobEnabled, disabledSources, listsFixtures, settlementRoster } from "./sources";
import { log } from "./log";

const TICK_SECONDS = Number(process.env.KICKOFF_DATA_TICK_SECONDS ?? 30);

const lastRun = new Map<string, Date>();
// Failed jobs wait this long before retrying (per job key). Without it a vote
// job whose source isn't at FT yet retries every tick, and on API-Football
// every retry spends the daily budget. 0 = retry every tick (old behavior).
const RETRY_BACKOFF_MS = Number(process.env.KICKOFF_DATA_RETRY_BACKOFF_SECONDS ?? 0) * 1000;
const failedAt = new Map<string, Date>();
const backingOff = (key: string, now: Date) => {
  const at = failedAt.get(key);
  return at !== undefined && now.getTime() - at.getTime() < RETRY_BACKOFF_MS;
};
const startedAt = new Date();

async function heartbeat(now: Date, jobsRun: number): Promise<void> {
  try {
    await db
      .insert(schema.serviceHeartbeat)
      .values({ process: "worker", lastTickAt: now, lastTickJobs: jobsRun, startedAt })
      .onConflictDoUpdate({
        target: schema.serviceHeartbeat.process,
        set: { lastTickAt: now, lastTickJobs: jobsRun, startedAt: sql`excluded.started_at` },
      });
  } catch (e) {
    log.error("worker", "heartbeat write failed", { error: e as Error });
  }
}

async function tick(): Promise<number> {
  const now = new Date();
  const rows = await loadPlannerFixtures(now);
  const settled = await loadSettledIds(rows.map((r) => r.id));
  const tiebreak = await needsTiebreak(rows.map((r) => r.id));

  const fixtures: PlannerFixture[] = rows.map((r) => ({
    id: r.id,
    kickoffUtc: r.kickoffUtc,
    status: r.status as PlannerFixture["status"],
    settled: settled.has(r.id),
    needsTiebreak: tiebreak.has(r.id),
    // nearSettlement arrives from the markets app via the consumer API later.
  }));

  const gameweeks: PlannerGameweek[] = (await loadPlannerGameweeks(seasonFor(now))).map((g) => ({
    gw: g.gw,
    isCurrent: g.isCurrent,
    finished: g.finished,
    dataChecked: g.dataChecked,
    deadlineUtc: g.deadlineUtc,
    anyFixtureActive: g.anyFixtureActive,
    provisionalRecorded: g.provisionalRecorded,
    settled: g.settled,
  }));

  // Sources switched off by KICKOFF_DATA_NO_MOCKS never run (and never count
  // as failures); lastRun stays unset so they start the moment a key lands.
  const jobs = plan({ now, fixtures, lastRun, s1Remaining: budgetState().remaining, gameweeks }).filter(
    (j) => jobEnabled(j.kind) && !backingOff(jobKey(j), now),
  );
  let jobsRun = 0;

  // s3.livePoll: ONE actor run returns every live match, so N due fixtures
  // collapse into one execution — but lastRun advances for ALL their keys.
  const s3Jobs = jobs.filter((j) => j.kind === "s3.livePoll");
  const rest = jobs.filter((j) => j.kind !== "s3.livePoll");

  if (s3Jobs.length > 0 && runners["s3.livePoll"]) {
    try {
      await runners["s3.livePoll"]!(s3Jobs[0], now);
      for (const j of s3Jobs) lastRun.set(jobKey(j), now);
      jobsRun++;
      log.info("worker", "job ok", { job: "s3.livePoll", fixtures: s3Jobs.length });
    } catch (e) {
      log.error("worker", "job failed", { job: "s3.livePoll", error: e as Error });
    }
  }

  for (const job of rest) {
    const runner = runners[job.kind];
    if (!runner) continue; // planner speaks kinds the worker may not serve yet
    const key = jobKey(job);
    try {
      await runner(job, now);
      lastRun.set(key, now);
      jobsRun++;
      failedAt.delete(key);
      log.info("worker", "job ok", { job: key });
    } catch (e) {
      failedAt.set(key, now);
      log.error("worker", "job failed", { job: key, error: e as Error });
    }
  }

  // Settlement freeze sweep — provisional outcomes whose 15-min finality
  // window elapsed become immutable snapshots (fires settlement.ready).
  // Stall escalation — FT fixtures stuck without quorum past the stall
  // window (dead provider) go disputed so the admin is summoned instead of
  // the market silently hanging.
  try {
    await freezeDue(now);
    await escalateStalled(now);
  } catch (e) {
    log.error("worker", "settlement sweep failed", { error: e as Error });
  }

  // FPL player-points sweep — advances gameweeks through the two-stage
  // finality ladder (provisional at bonus-in, frozen at data_checked).
  try {
    await sweepPlayerPoints(now);
  } catch (e) {
    log.error("worker", "player-points sweep failed", { error: e as Error });
  }

  return jobsRun;
}

async function main(): Promise<void> {
  await installDbSink();
  await installDbBudgetStore();
  await restoreBudget();

  // fixture.status_changed → webhook. Fire-and-forget: deliver() retries
  // internally and a dead consumer never stalls ingest or the tick loop.
  const webhookConfig = webhookConfigFromEnv();
  installStatusChangeListener((fixtureId, from, to) => {
    void deliver(webhookConfig, { type: "fixture.status_changed", fixture_id: fixtureId, from, to });
  });
  // settlement.ready / settlement.disputed — same fire-and-forget contract.
  installSettlementEmitter((event) => {
    void deliver(webhookConfig, event);
  });
  // settlement.player_points_ready / _flagged — same contract, FPL lane.
  installPlayerPointsEmitter((event) => {
    void deliver(webhookConfig, event);
  });

  log.info("worker", "up", {
    tickSeconds: TICK_SECONDS,
    s1: budgetState(),
    mock: isMockMode(),
    fplMock: fplMockMode(),
    s3Trusted: s3Trusted(),
    disabledSources: disabledSources(),
    // Parsed here so a bad KICKOFF_DATA_SETTLEMENT_* config fails at boot, not mid-tick.
    settlement: settlementRoster(),
    fplLists: listsFixtures("fpl"),
    webhooks: webhookConfig.url ? "on" : "OFF (KICKOFF_DATA_WEBHOOK_URL unset)",
  });

  // Sequential ticks — never overlap; a slow tick just delays the next.
  for (;;) {
    const started = Date.now();
    let jobsRun = 0;
    try {
      jobsRun = await tick();
    } catch (e) {
      log.error("worker", "tick failed", { error: e as Error });
    }
    const now = new Date();
    await heartbeat(now, jobsRun);
    // Heartbeat visibility: idle ticks are debug (thousands/day otherwise);
    // /health reads the DB heartbeat for liveness regardless of log level.
    log[jobsRun > 0 ? "info" : "debug"]("worker", "tick", {
      jobs: jobsRun,
      ms: Date.now() - started,
      s1Remaining: budgetState().remaining,
    });
    const elapsed = Date.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(0, TICK_SECONDS * 1000 - elapsed)));
  }
}

main().catch((e) => {
  log.error("worker", "fatal", { error: e as Error });
  process.exit(1);
});
