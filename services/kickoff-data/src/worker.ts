// kickoff-data worker — the only long-running process. One tick: load
// fixtures, plan, run due jobs, record lastRun. Failures are per-job (a dead
// source never stalls the loop) and logged; lastRun only advances on success
// so failed jobs retry next tick.
//
// Run: pnpm worker   (tsx src/worker.ts)

import { plan, jobKey, type Job, type PlannerFixture } from "./scheduler/planner";
import { runners } from "./jobs";
import { installDbSink } from "./archive";
import { installDbBudgetStore } from "./budget";
import { budgetState, restoreBudget, isMockMode } from "./apiFootball";
import { loadPlannerFixtures, loadSettledIds, installStatusChangeListener } from "./ingest";
import { deliver, webhookConfigFromEnv } from "./api/webhooks";
import { freezeDue, needsTiebreak, escalateStalled, installSettlementEmitter, s3Trusted } from "./settlementLane";

const TICK_SECONDS = Number(process.env.KICKOFF_DATA_TICK_SECONDS ?? 30);

const lastRun = new Map<string, Date>();

async function tick(): Promise<void> {
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

  const jobs = plan({ now, fixtures, lastRun, s1Remaining: budgetState().remaining });

  // s3.livePoll: ONE actor run returns every live match, so N due fixtures
  // collapse into one execution — but lastRun advances for ALL their keys.
  const s3Jobs = jobs.filter((j) => j.kind === "s3.livePoll");
  const rest = jobs.filter((j) => j.kind !== "s3.livePoll");

  if (s3Jobs.length > 0 && runners["s3.livePoll"]) {
    try {
      await runners["s3.livePoll"]!(s3Jobs[0], now);
      for (const j of s3Jobs) lastRun.set(jobKey(j), now);
      console.log(`[worker] ok s3.livePoll (${s3Jobs.length} fixture(s))`);
    } catch (e) {
      console.error(`[worker] FAIL s3.livePoll: ${(e as Error).message}`);
    }
  }

  for (const job of rest) {
    const runner = runners[job.kind];
    if (!runner) {
      // S3/S4 until build step 4 — planner speaks them, worker skips them.
      continue;
    }
    const key = jobKey(job);
    try {
      await runner(job, now);
      lastRun.set(key, now);
      console.log(`[worker] ok ${key}`);
    } catch (e) {
      console.error(`[worker] FAIL ${key}: ${(e as Error).message}`);
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
    console.error(`[worker] settlement sweep error: ${(e as Error).message}`);
  }
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

  console.log(
    `[worker] up — tick=${TICK_SECONDS}s, s1=${JSON.stringify(budgetState())}, mock=${isMockMode()}, s3Trusted=${s3Trusted()}, webhooks=${webhookConfig.url ? "on" : "OFF (KICKOFF_DATA_WEBHOOK_URL unset)"}`,
  );

  // Sequential ticks — never overlap; a slow tick just delays the next.
  for (;;) {
    const started = Date.now();
    try {
      await tick();
    } catch (e) {
      console.error(`[worker] tick error: ${(e as Error).message}`);
    }
    const elapsed = Date.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(0, TICK_SECONDS * 1000 - elapsed)));
  }
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
