// Settlement engine (spec §5) — PURE. No DB, no clock reads: decide() and
// transition() take votes + now and return values, so the whole lane is
// testable and — critically — deterministic: the same vote set produces the
// same outcome in ANY arrival order (property-tested). settlementLane.ts
// persists what this file decides.
//
// Voter roster:
//   - S1 apiFootball + S2 fdorg — the only official sources, always voters.
//   - S3/S4 flashscore — ONE vote, and only after burn-in (s3Trusted flag);
//     until then its votes are recorded but excluded (shadow mode — the
//     burn-in diff reads them from the votes array).
//   - S5 fsfd — tie-breaker ONLY, consulted when all primaries disagree.
//   - admin — satisfies quorum alone (signed attestation, audited).

import type { SettlementVote, SourceId } from "@kickoff/schema";

export interface QuorumOpts {
  /** Flashscore counts as a settlement voter only after burn-in passes. */
  s3Trusted: boolean;
}

export type Decision =
  | { kind: "quorum"; outcome: { home: number; away: number }; rule: string }
  | { kind: "await-votes"; votesCollected: number }
  | { kind: "need-tiebreak" }
  | { kind: "disputed" };

const scoreKey = (s: { home: number; away: number }) => `${s.home}-${s.away}`;

/** Deterministic canonical order — makes every downstream fold independent
 *  of arrival order: (fetched_at, source, scoreline). */
export function canonicalVotes(votes: SettlementVote[]): SettlementVote[] {
  return [...votes].sort(
    (a, b) =>
      a.fetched_at.localeCompare(b.fetched_at) ||
      a.source.localeCompare(b.source) ||
      scoreKey(a.scoreline).localeCompare(scoreKey(b.scoreline)),
  );
}

/** A source's CURRENT opinion = its latest vote (a source may re-report
 *  after VAR; the newest read wins, older ones stay as audit trail). */
export function latestPerSource(votes: SettlementVote[]): Map<SourceId, SettlementVote> {
  const latest = new Map<SourceId, SettlementVote>();
  for (const v of canonicalVotes(votes)) latest.set(v.source, v); // canonical order → last write wins deterministically
  return latest;
}

export function decide(votes: SettlementVote[], opts: QuorumOpts): Decision {
  const latest = latestPerSource(votes);

  // Admin attestation satisfies quorum alone (spec §5.7).
  const admin = latest.get("admin");
  if (admin) return { kind: "quorum", outcome: admin.scoreline, rule: "admin-override" };

  const primaries: SourceId[] = opts.s3Trusted
    ? ["apiFootball", "fdorg", "flashscore"]
    : ["apiFootball", "fdorg"];
  const cast = primaries.filter((s) => latest.has(s));

  // ≥2 primaries agree exactly → quorum.
  const groups = new Map<string, SourceId[]>();
  for (const s of cast) {
    const key = scoreKey(latest.get(s)!.scoreline);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  for (const [, sources] of [...groups].sort()) {
    if (sources.length >= 2) {
      return {
        kind: "quorum",
        outcome: latest.get(sources[0]!)!.scoreline,
        rule: `${sources.length}-of-${primaries.length} exact agreement`,
      };
    }
  }

  // Quorum can still form — wait for the missing primaries.
  if (cast.length < primaries.length) return { kind: "await-votes", votesCollected: cast.length };

  // Every primary has voted and they disagree → tie-breaker time (spec §5.3).
  const tb = latest.get("fsfd");
  if (!tb) return { kind: "need-tiebreak" };
  const tbKey = scoreKey(tb.scoreline);
  const agreeing = cast.filter((s) => scoreKey(latest.get(s)!.scoreline) === tbKey);
  if (agreeing.length >= 1) {
    return { kind: "quorum", outcome: tb.scoreline, rule: "tie-break: fsfd agreement" };
  }
  return { kind: "disputed" };
}

// ---------------------------------------------------------------------------
// Working-snapshot transition — the finality-delay state machine
// ---------------------------------------------------------------------------

/** The mutable-until-frozen working row (settlement_snapshots while status
 *  is pending/provisional/disputed — freezing makes it immutable). */
export interface WorkingState {
  status: "pending" | "provisional" | "disputed";
  outcome: { home: number; away: number } | null;
  votes: SettlementVote[];
  freezesAt: Date | null;
}

export const EMPTY_WORKING: WorkingState = { status: "pending", outcome: null, votes: [], freezesAt: null };

export interface Transition {
  next: WorkingState;
  decision: Decision;
  /** True exactly when this vote flipped the row into disputed. */
  becameDisputed: boolean;
}

/**
 * Fold one vote into the working state. Finality-delay rule (spec §5.4): the
 * 15-min window resets when the outcome changes OR a source flips its
 * scoreline — a merely-confirming vote does not reset it.
 */
export function transition(
  prev: WorkingState,
  vote: SettlementVote,
  now: Date,
  opts: QuorumOpts & { finalityDelayMs: number },
): Transition {
  // Exact duplicate (a re-poll seeing the same read) is a no-op.
  const dup = prev.votes.some(
    (v) =>
      v.source === vote.source &&
      v.fetched_at === vote.fetched_at &&
      scoreKey(v.scoreline) === scoreKey(vote.scoreline),
  );
  if (dup) return { next: prev, decision: decide(prev.votes, opts), becameDisputed: false };

  const beforeLatest = latestPerSource(prev.votes);
  const votes = [...prev.votes, vote];
  const decision = decide(votes, opts);

  if (decision.kind === "quorum") {
    const prevVote = beforeLatest.get(vote.source);
    const sourceFlipped = prevVote !== undefined && scoreKey(prevVote.scoreline) !== scoreKey(vote.scoreline);
    const outcomeChanged =
      prev.status !== "provisional" ||
      prev.outcome === null ||
      scoreKey(prev.outcome) !== scoreKey(decision.outcome);
    return {
      next: {
        status: "provisional",
        outcome: decision.outcome,
        votes,
        freezesAt:
          outcomeChanged || sourceFlipped ? new Date(now.getTime() + opts.finalityDelayMs) : prev.freezesAt,
      },
      decision,
      becameDisputed: false,
    };
  }

  if (decision.kind === "disputed") {
    return {
      next: { status: "disputed", outcome: null, votes, freezesAt: null },
      decision,
      becameDisputed: prev.status !== "disputed",
    };
  }

  // await-votes / need-tiebreak — still collecting; drop any stale
  // provisional outcome (a flip out of quorum must not freeze later).
  return {
    next: { status: "pending", outcome: null, votes, freezesAt: null },
    decision,
    becameDisputed: false,
  };
}
