import { describe, it, expect } from "vitest";
import type { SettlementVote, SourceId } from "@kickoff/schema";
import {
  decide,
  transition,
  canonicalVotes,
  latestPerSource,
  EMPTY_WORKING,
  type WorkingState,
} from "../src/settlement";

const T0 = new Date("2026-08-15T16:00:00Z");
const FIFTEEN_MIN = 15 * 60 * 1000;
const OPTS = { s3Trusted: false, finalityDelayMs: FIFTEEN_MIN };
const TRUSTED = { s3Trusted: true, finalityDelayMs: FIFTEEN_MIN };

let seq = 0;
function vote(source: SourceId, home: number, away: number, atOffsetSec = seq++): SettlementVote {
  return {
    source,
    scoreline: { home, away },
    fetched_at: new Date(T0.getTime() + atOffsetSec * 1000).toISOString(),
    raw_payload_ref: `ref-${source}-${atOffsetSec}`,
  };
}

/** Fold votes through transition() in the given order. */
function fold(votes: SettlementVote[], opts = OPTS): WorkingState {
  let state = EMPTY_WORKING;
  for (const v of votes) state = transition(state, v, T0, opts).next;
  return state;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((v, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [v, ...p]));
}

describe("settlement engine: quorum", () => {
  it("S1+S2 exact agreement → quorum (the only pre-burn-in path)", () => {
    const d = decide([vote("apiFootball", 2, 1), vote("fdorg", 2, 1)], { s3Trusted: false });
    expect(d).toEqual({ kind: "quorum", outcome: { home: 2, away: 1 }, rule: "2-of-2 exact agreement" });
  });

  it("one vote alone is never enough", () => {
    expect(decide([vote("apiFootball", 2, 1)], { s3Trusted: false }).kind).toBe("await-votes");
  });

  it("pre-burn-in, S3's vote is recorded but NOT counted toward quorum", () => {
    // S1 + S3 agree, S2 missing: untrusted S3 cannot complete quorum.
    const votes = [vote("apiFootball", 2, 1), vote("flashscore", 2, 1)];
    expect(decide(votes, { s3Trusted: false }).kind).toBe("await-votes");
    // Post-burn-in the same votes settle it.
    expect(decide(votes, { s3Trusted: true }).kind).toBe("quorum");
  });

  it("post-burn-in 2-of-3: S2+S3 outvote a wrong S1", () => {
    const d = decide(
      [vote("apiFootball", 1, 1), vote("fdorg", 2, 1), vote("flashscore", 2, 1)],
      { s3Trusted: true },
    );
    expect(d).toEqual({ kind: "quorum", outcome: { home: 2, away: 1 }, rule: "2-of-3 exact agreement" });
  });

  it("all primaries disagree → need-tiebreak; S5 agreeing with one side settles it", () => {
    const split = [vote("apiFootball", 2, 1), vote("fdorg", 1, 1)];
    expect(decide(split, { s3Trusted: false }).kind).toBe("need-tiebreak");
    const d = decide([...split, vote("fsfd", 2, 1)], { s3Trusted: false });
    expect(d).toEqual({ kind: "quorum", outcome: { home: 2, away: 1 }, rule: "tie-break: fsfd agreement" });
  });

  it("tie-breaker agreeing with NOBODY → disputed", () => {
    const d = decide(
      [vote("apiFootball", 2, 1), vote("fdorg", 1, 1), vote("fsfd", 0, 0)],
      { s3Trusted: false },
    );
    expect(d.kind).toBe("disputed");
  });

  it("admin attestation satisfies quorum alone and beats everything", () => {
    const d = decide(
      [vote("apiFootball", 2, 1), vote("fdorg", 1, 1), vote("admin", 3, 0)],
      { s3Trusted: false },
    );
    expect(d).toEqual({ kind: "quorum", outcome: { home: 3, away: 0 }, rule: "admin-override" });
  });

  it("a source's LATEST vote is its opinion — VAR re-report replaces the old read", () => {
    // S1 first says 2-1, then corrects to 1-1; S2 says 1-1 → quorum on 1-1.
    const votes = [vote("apiFootball", 2, 1, 0), vote("fdorg", 1, 1, 10), vote("apiFootball", 1, 1, 20)];
    const d = decide(votes, { s3Trusted: false });
    expect(d.kind).toBe("quorum");
    expect((d as { outcome: object }).outcome).toEqual({ home: 1, away: 1 });
  });
});

describe("settlement engine: finality-delay state machine", () => {
  it("quorum → provisional with a 15-min freeze window", () => {
    const s = fold([vote("apiFootball", 2, 1), vote("fdorg", 2, 1)]);
    expect(s.status).toBe("provisional");
    expect(s.outcome).toEqual({ home: 2, away: 1 });
    expect(s.freezesAt).toEqual(new Date(T0.getTime() + FIFTEEN_MIN));
  });

  it("a merely-confirming extra vote does NOT reset the window", () => {
    let s = fold([vote("apiFootball", 2, 1), vote("fdorg", 2, 1)]);
    const windowBefore = s.freezesAt;
    // Same-outcome S3 vote (untrusted, shadow) arrives later.
    s = transition(s, vote("flashscore", 2, 1), new Date(T0.getTime() + 60_000), OPTS).next;
    expect(s.status).toBe("provisional");
    expect(s.freezesAt).toEqual(windowBefore);
  });

  it("a source FLIPPING its scoreline resets the window even when the outcome stands", () => {
    let s = fold([vote("apiFootball", 2, 1), vote("fdorg", 2, 1), vote("flashscore", 2, 1)], TRUSTED);
    const later = new Date(T0.getTime() + 5 * 60_000);
    // S3 flips to 1-1: outcome still 2-1 by 2-of-3, but the window resets.
    s = transition(s, vote("flashscore", 1, 1, 100), later, TRUSTED).next;
    expect(s.status).toBe("provisional");
    expect(s.outcome).toEqual({ home: 2, away: 1 });
    expect(s.freezesAt).toEqual(new Date(later.getTime() + FIFTEEN_MIN));
  });

  it("losing quorum mid-window drops back to pending — nothing left to freeze", () => {
    let s = fold([vote("apiFootball", 2, 1), vote("fdorg", 2, 1)]);
    // S2 re-reports a different score → 1-1 vs 2-1 split → tie-break needed.
    s = transition(s, vote("fdorg", 1, 1, 100), new Date(T0.getTime() + 60_000), OPTS).next;
    expect(s.status).toBe("pending");
    expect(s.outcome).toBeNull();
    expect(s.freezesAt).toBeNull();
  });

  it("becameDisputed fires exactly once", () => {
    let s = EMPTY_WORKING;
    let r = transition(s, vote("apiFootball", 2, 1), T0, OPTS);
    expect(r.becameDisputed).toBe(false);
    r = transition(r.next, vote("fdorg", 1, 1), T0, OPTS);
    expect(r.becameDisputed).toBe(false); // need-tiebreak, not disputed
    r = transition(r.next, vote("fsfd", 0, 0), T0, OPTS);
    expect(r.becameDisputed).toBe(true);
    r = transition(r.next, vote("fsfd", 0, 0, 999), T0, OPTS);
    expect(r.becameDisputed).toBe(false); // already disputed
  });

  it("exact duplicate votes are no-ops", () => {
    const v = vote("apiFootball", 2, 1, 0);
    const once = transition(EMPTY_WORKING, v, T0, OPTS).next;
    const twice = transition(once, v, T0, OPTS).next;
    expect(twice).toEqual(once);
  });
});

describe("settlement engine: dead-provider guarantees", () => {
  it("one source alone NEVER settles, no matter how many times it re-reports", () => {
    // S2 is down; S1 keeps re-reporting the same score across an hour.
    const votes = [vote("apiFootball", 2, 1, 0), vote("apiFootball", 2, 1, 600), vote("apiFootball", 2, 1, 3600)];
    const d = decide(votes, { s3Trusted: false });
    expect(d.kind).toBe("await-votes"); // hangs (stall escalation disputes it) — never pays out on one voice
    const s = fold(votes);
    expect(s.status).toBe("pending");
    expect(s.freezesAt).toBeNull();
  });

  it("post-burn-in, one provider dying is survivable: remaining 2 of 3 settle", () => {
    // S2 dead; S1 + trusted S3 agree.
    const d = decide([vote("apiFootball", 2, 1), vote("flashscore", 2, 1)], { s3Trusted: true });
    expect(d.kind).toBe("quorum");
  });

  it("a disputed row recovers if the dead provider comes back and completes quorum", () => {
    // Stall escalation disputed it; then S2 revives agreeing with S1.
    let s: WorkingState = { status: "disputed", outcome: null, votes: [vote("apiFootball", 2, 1, 0)], freezesAt: null };
    s = transition(s, vote("fdorg", 2, 1, 7200), new Date(T0.getTime() + 7200_000), OPTS).next;
    expect(s.status).toBe("provisional");
    expect(s.outcome).toEqual({ home: 2, away: 1 });
  });
});

describe("settlement engine: order independence (spec §8.6 property)", () => {
  it("same votes in ANY arrival order → identical status + outcome + canonical votes", () => {
    const sets: Array<{ votes: SettlementVote[]; opts: typeof OPTS }> = [
      // clean quorum
      { votes: [vote("apiFootball", 2, 1, 0), vote("fdorg", 2, 1, 1), vote("flashscore", 2, 1, 2)], opts: OPTS },
      // split + tiebreak
      { votes: [vote("apiFootball", 2, 1, 0), vote("fdorg", 1, 1, 1), vote("fsfd", 2, 1, 2)], opts: OPTS },
      // disputed
      { votes: [vote("apiFootball", 2, 1, 0), vote("fdorg", 1, 1, 1), vote("fsfd", 0, 0, 2)], opts: OPTS },
      // VAR correction + admin
      {
        votes: [vote("apiFootball", 2, 1, 0), vote("apiFootball", 1, 1, 5), vote("fdorg", 1, 1, 3), vote("admin", 1, 1, 9)],
        opts: TRUSTED,
      },
    ];
    for (const { votes, opts } of sets) {
      const outcomes = permutations(votes).map((perm) => {
        const s = fold(perm, opts);
        return { status: s.status, outcome: s.outcome, votes: canonicalVotes(s.votes) };
      });
      for (const o of outcomes.slice(1)) expect(o).toEqual(outcomes[0]);
    }
  });

  it("decide() itself is order-independent", () => {
    const votes = [vote("apiFootball", 2, 1, 0), vote("fdorg", 1, 1, 1), vote("flashscore", 2, 1, 2), vote("fsfd", 1, 1, 3)];
    const first = decide(votes, { s3Trusted: true });
    for (const perm of permutations(votes)) {
      expect(decide(perm, { s3Trusted: true })).toEqual(first);
    }
  });

  it("latestPerSource picks by fetched_at, not array position", () => {
    const early = vote("apiFootball", 2, 1, 0);
    const late = vote("apiFootball", 1, 1, 60);
    expect(latestPerSource([early, late]).get("apiFootball")).toEqual(late);
    expect(latestPerSource([late, early]).get("apiFootball")).toEqual(late);
  });
});

describe("configurable roster (KICKOFF_DATA_SETTLEMENT_VOTERS/_QUORUM)", () => {
  const fplOnly = { s3Trusted: false, voters: ["fpl" as const], quorum: 1 };

  it("single-source roster: FPL alone reaches quorum", () => {
    const d = decide([vote("fpl", 2, 1, 1)], fplOnly);
    expect(d).toEqual({ kind: "quorum", outcome: { home: 2, away: 1 }, rule: "1-of-1 exact agreement" });
  });

  it("single-source roster ignores votes from sources outside it", () => {
    expect(decide([vote("apiFootball", 2, 1, 1)], fplOnly)).toEqual({ kind: "await-votes", votesCollected: 0 });
  });

  it("adding a second source is config only: fpl+fdorg 2-of-2", () => {
    const opts = { s3Trusted: false, voters: ["fpl" as const, "fdorg" as const], quorum: 2 };
    expect(decide([vote("fpl", 1, 0, 1)], opts)).toEqual({ kind: "await-votes", votesCollected: 1 });
    expect(decide([vote("fpl", 1, 0, 1), vote("fdorg", 1, 0, 2)], opts).kind).toBe("quorum");
    expect(decide([vote("fpl", 1, 0, 1), vote("fdorg", 2, 0, 2)], opts).kind).toBe("need-tiebreak");
  });

  it("quorum 1 with two voters that disagree is NOT quorum (no arbitrary pick)", () => {
    const opts = { s3Trusted: false, voters: ["fpl" as const, "fdorg" as const], quorum: 1 };
    expect(decide([vote("fpl", 1, 0, 1), vote("fdorg", 2, 0, 2)], opts).kind).toBe("need-tiebreak");
    expect(decide([vote("fpl", 1, 0, 1), vote("fdorg", 1, 0, 2)], opts).kind).toBe("quorum");
  });
});
