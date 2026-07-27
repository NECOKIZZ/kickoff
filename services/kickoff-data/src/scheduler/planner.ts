// The planner — pure function from (clock, fixtures, last-run times, budget)
// to the list of jobs due right now. No fetch, no DB, no timers: the worker
// loop owns side effects, tests own the clock.
//
// Job identity: (kind, fixtureId?) — the worker records lastRun per key, the
// planner compares against cadence. A job the planner emits repeatedly until
// its lastRun advances is fine: the worker runs each key at most once per tick.

import { CADENCE, S1_SETTLEMENT_RESERVE } from "./cadence";

export type JobKind =
  // S1 (budget-guarded)
  | "s1.fixtureSync" // morning slate, listing lane
  | "s1.lineups" // T−1h per fixture — the lineup gate
  | "s1.postMatch" // player stats + events at FT (Market B scoring)
  | "s1.settlementVote" // final score read from reserve headroom
  // S2
  | "s2.fixtureSync"
  | "s2.settlementVote"
  // S3/S4 (Apify — clients land at build step 4; planner already speaks them)
  | "s3.livePoll"
  | "s4.fixtureSync";

export interface Job {
  kind: JobKind;
  /** Canonical fixture id (absent for slate-wide syncs). */
  fixtureId?: string;
}

export function jobKey(j: Job): string {
  return j.fixtureId ? `${j.kind}:${j.fixtureId}` : j.kind;
}

export interface PlannerFixture {
  id: string;
  kickoffUtc: Date;
  status: "scheduled" | "live" | "ht" | "ft" | "postponed" | "abandoned";
  /** Any dependent market inside its final settlement window (markets app
   *  tells us via consumer API later; false until then). */
  nearSettlement?: boolean;
  /** Settlement snapshot already frozen — stop polling for this fixture. */
  settled?: boolean;
}

export interface PlannerState {
  now: Date;
  fixtures: PlannerFixture[];
  /** jobKey → last successful run. Missing key = never ran. */
  lastRun: Map<string, Date>;
  /** S1 requests remaining today (from the budget guard). */
  s1Remaining: number;
}

function due(state: PlannerState, job: Job, intervalSeconds: number): boolean {
  const last = state.lastRun.get(jobKey(job));
  if (!last) return true;
  return state.now.getTime() - last.getTime() >= intervalSeconds * 1000;
}

function ranEver(state: PlannerState, job: Job): boolean {
  return state.lastRun.has(jobKey(job));
}

/** S1 spend gate: charts/listing jobs stop when only the settlement reserve
 *  remains; settlement votes run down to zero. */
function s1CanSpend(state: PlannerState, isSettlement: boolean): boolean {
  return isSettlement ? state.s1Remaining > 0 : state.s1Remaining > S1_SETTLEMENT_RESERVE;
}

export function plan(state: PlannerState): Job[] {
  const jobs: Job[] = [];
  const { now } = state;

  // --- Slate-wide syncs ---
  if (s1CanSpend(state, false) && due(state, { kind: "s1.fixtureSync" }, CADENCE.s1FixtureSync)) {
    jobs.push({ kind: "s1.fixtureSync" });
  }
  if (due(state, { kind: "s2.fixtureSync" }, CADENCE.s2FixtureSync)) {
    jobs.push({ kind: "s2.fixtureSync" });
  }
  if (due(state, { kind: "s4.fixtureSync" }, CADENCE.s4FixtureSync)) {
    jobs.push({ kind: "s4.fixtureSync" });
  }

  // --- Per-fixture jobs ---
  for (const f of state.fixtures) {
    if (f.settled || f.status === "postponed" || f.status === "abandoned") continue;
    const msToKickoff = f.kickoffUtc.getTime() - now.getTime();

    // S1 lineups: once, inside the lead window before kickoff (the T−15min
    // listing gate reads the stored lineup; we fetch at T−1h to have it).
    const lineupJob: Job = { kind: "s1.lineups", fixtureId: f.id };
    if (
      f.status === "scheduled" &&
      msToKickoff > 0 &&
      msToKickoff <= CADENCE.s1LineupLeadTime * 1000 &&
      !ranEver(state, lineupJob) &&
      s1CanSpend(state, false)
    ) {
      jobs.push(lineupJob);
    }

    // S3 live poll: phase-dependent cadence. (No-op until step 4 lands the
    // Apify client — the worker skips kinds it has no runner for.)
    const s3Job: Job = { kind: "s3.livePoll", fixtureId: f.id };
    let s3Interval: number | null = null;
    if (f.status === "scheduled" && msToKickoff > 0 && msToKickoff <= CADENCE.s3PreKickoffWindow * 1000) {
      s3Interval = CADENCE.s3PreKickoff;
    } else if (f.status === "live") {
      s3Interval = f.nearSettlement ? CADENCE.s3InPlayNearSettlement : CADENCE.s3InPlay;
    } else if (f.status === "ht") {
      s3Interval = CADENCE.s3HalfTime;
    } else if (f.status === "ft") {
      // Until snapshot frozen (settled=true short-circuits above).
      s3Interval = CADENCE.s3PostFt;
    }
    if (s3Interval !== null && due(state, s3Job, s3Interval)) jobs.push(s3Job);

    // Post-match + settlement reads, once each at FT.
    if (f.status === "ft") {
      const postMatch: Job = { kind: "s1.postMatch", fixtureId: f.id };
      if (!ranEver(state, postMatch) && s1CanSpend(state, false)) jobs.push(postMatch);

      const s1Vote: Job = { kind: "s1.settlementVote", fixtureId: f.id };
      if (!ranEver(state, s1Vote) && s1CanSpend(state, true)) jobs.push(s1Vote);

      const s2Vote: Job = { kind: "s2.settlementVote", fixtureId: f.id };
      if (!ranEver(state, s2Vote)) jobs.push(s2Vote);
    }
  }

  return jobs;
}
