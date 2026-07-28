// Settlement lane — persistence + webhooks around the pure engine
// (settlement.ts decides, this file records). Data flow per fixture:
//
//   vote runners (jobs.ts) → recordVote() → transition() → working row
//   worker sweep → freezeDue() → immutable frozen version → settlement.ready
//
// Two-standards rule (spec §0/§5): while pending/provisional/disputed the
// fixture has ONE working row (version = next version, mutated in place —
// it is a scratchpad, not a snapshot). Freezing rewrites it as `frozen`,
// after which it is IMMUTABLE — corrections insert version N+1 via the
// admin override, never touch N.

import { and, desc, eq, inArray } from "drizzle-orm";
import type { SettlementVote, WebhookEvent } from "@kickoff/schema";
import { db, schema } from "./db";
import { archiveRaw } from "./archive";
import {
  EMPTY_WORKING,
  decide,
  transition,
  type WorkingState,
} from "./settlement";

/** Burn-in gate (spec §6): flip via env after ≥3 clean shadow matchdays. */
export function s3Trusted(): boolean {
  return process.env.KICKOFF_DATA_S3_TRUSTED === "true";
}

const FINALITY_DELAY_MS = Number(process.env.KICKOFF_DATA_FINALITY_DELAY_SECONDS ?? 15 * 60) * 1000;

// Webhook emitter — installed by the worker (same pluggable pattern as the
// archive sink) so this module stays fetch-free and tests can capture events.
type Emitter = (event: WebhookEvent) => void;
let emit: Emitter | null = null;
export function installSettlementEmitter(fn: Emitter): void {
  emit = fn;
}
function fire(event: WebhookEvent): void {
  try {
    emit?.(event);
  } catch (e) {
    console.error(`[settlement] emitter threw: ${(e as Error).message}`);
  }
}

interface WorkingRow {
  id: number;
  version: number;
  state: WorkingState;
}

/** Load the fixture's latest snapshot row split into frozen/working. */
async function loadLatest(fixtureId: string): Promise<{ frozenVersion: number; working: WorkingRow | null }> {
  const rows = await db
    .select()
    .from(schema.settlementSnapshots)
    .where(eq(schema.settlementSnapshots.fixtureId, fixtureId))
    .orderBy(desc(schema.settlementSnapshots.version))
    .limit(1);
  const r = rows[0];
  if (!r) return { frozenVersion: 0, working: null };
  if (r.status === "frozen") return { frozenVersion: r.version, working: null };
  return {
    frozenVersion: r.version - 1,
    working: {
      id: r.id,
      version: r.version,
      state: {
        status: r.status,
        outcome: r.outcomeHome !== null && r.outcomeAway !== null ? { home: r.outcomeHome, away: r.outcomeAway } : null,
        votes: (r.votes ?? []) as SettlementVote[],
        freezesAt: r.freezesAt ? new Date(r.freezesAt) : null,
      },
    },
  };
}

/**
 * Record one source's final-score read. Archives the vote as its own raw
 * payload (the dispute evidence SettlementVote.raw_payload_ref points at),
 * folds it through the pure engine, persists the working row.
 *
 * Once a frozen version exists, further votes are recorded into the archive
 * but change nothing — corrections go through the admin override.
 */
export async function recordVote(
  fixtureId: string,
  source: SettlementVote["source"],
  scoreline: { home: number; away: number },
  now: Date,
): Promise<void> {
  const payloadId = await archiveRaw(source, `settlement-vote:${fixtureId}`, { fixtureId, scoreline });
  const vote: SettlementVote = {
    source,
    scoreline,
    fetched_at: now.toISOString(),
    raw_payload_ref: payloadId !== null ? String(payloadId) : `unarchived:${now.toISOString()}`,
  };

  const { frozenVersion, working } = await loadLatest(fixtureId);
  if (working === null && frozenVersion > 0) return; // already settled — audit archive only

  const prev = working?.state ?? EMPTY_WORKING;
  const { next, becameDisputed } = transition(prev, vote, now, {
    s3Trusted: s3Trusted(),
    finalityDelayMs: FINALITY_DELAY_MS,
  });

  const values = {
    status: next.status,
    outcomeHome: next.outcome?.home ?? null,
    outcomeAway: next.outcome?.away ?? null,
    votes: next.votes,
    quorumRule: null as string | null,
    freezesAt: next.freezesAt,
  };
  if (working) {
    await db.update(schema.settlementSnapshots).set(values).where(eq(schema.settlementSnapshots.id, working.id));
  } else {
    await db.insert(schema.settlementSnapshots).values({ fixtureId, version: frozenVersion + 1, ...values });
  }

  if (becameDisputed) {
    console.error(`[settlement] DISPUTED ${fixtureId} — all primaries disagree, tie-break failed`);
    fire({ type: "settlement.disputed", fixture_id: fixtureId, votes: next.votes });
  }
}

/** Tie-break failed (S5 ran but had no unambiguous answer) → disputed now;
 *  admin decides. Fires settlement.disputed exactly once. */
export async function markDisputed(fixtureId: string): Promise<void> {
  const { frozenVersion, working } = await loadLatest(fixtureId);
  if (!working) {
    if (frozenVersion > 0) return; // already settled
    await db.insert(schema.settlementSnapshots).values({
      fixtureId,
      version: 1,
      status: "disputed",
      votes: [],
    });
    fire({ type: "settlement.disputed", fixture_id: fixtureId, votes: [] });
    return;
  }
  if (working.state.status === "disputed") return;
  await db
    .update(schema.settlementSnapshots)
    .set({ status: "disputed", outcomeHome: null, outcomeAway: null, freezesAt: null })
    .where(eq(schema.settlementSnapshots.id, working.id));
  console.error(`[settlement] DISPUTED ${fixtureId} — tie-break could not answer`);
  fire({ type: "settlement.disputed", fixture_id: fixtureId, votes: working.state.votes });
}

/**
 * Freeze sweep — called each worker tick. Provisional rows whose finality
 * window has elapsed become frozen (immutable) and settlement.ready fires.
 * The quorum rule is recomputed at freeze time from the final vote set.
 */
export async function freezeDue(now: Date): Promise<number> {
  const due = await db
    .select()
    .from(schema.settlementSnapshots)
    .where(and(eq(schema.settlementSnapshots.status, "provisional")));
  let frozen = 0;
  for (const r of due) {
    if (!r.freezesAt || new Date(r.freezesAt) > now) continue;
    if (r.outcomeHome === null || r.outcomeAway === null) continue; // defensive: provisional must carry an outcome
    const decision = decide((r.votes ?? []) as SettlementVote[], { s3Trusted: s3Trusted() });
    if (decision.kind !== "quorum") continue; // engine says no — leave for the next vote to sort out
    await db
      .update(schema.settlementSnapshots)
      .set({ status: "frozen", quorumRule: decision.rule, frozenAt: now })
      .where(eq(schema.settlementSnapshots.id, r.id));
    frozen++;
    console.log(`[settlement] FROZEN ${r.fixtureId} v${r.version} ${r.outcomeHome}-${r.outcomeAway} (${decision.rule})`);
    fire({ type: "settlement.ready", fixture_id: r.fixtureId, snapshot_version: r.version });
  }
  return frozen;
}

/** Fixtures whose primaries disagree and need the S5 tie-breaker — the
 *  planner emits s5.tiebreak for these (S5 is never scheduled otherwise). */
export async function needsTiebreak(fixtureIds: string[]): Promise<Set<string>> {
  if (fixtureIds.length === 0) return new Set();
  const rows = await db
    .select({ fixtureId: schema.settlementSnapshots.fixtureId, votes: schema.settlementSnapshots.votes })
    .from(schema.settlementSnapshots)
    .where(
      and(
        inArray(schema.settlementSnapshots.fixtureId, fixtureIds),
        eq(schema.settlementSnapshots.status, "pending"),
      ),
    );
  const out = new Set<string>();
  for (const r of rows) {
    if (decide((r.votes ?? []) as SettlementVote[], { s3Trusted: s3Trusted() }).kind === "need-tiebreak") {
      out.add(r.fixtureId);
    }
  }
  return out;
}
