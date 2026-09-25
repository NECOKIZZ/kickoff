// Production guard for mock mode. Every source client falls back to recorded
// payloads when its key is unset — right for dev and tests, wrong for a live
// database. KICKOFF_DATA_NO_MOCKS=1 flips that: a source without its key is
// OFF (its jobs are skipped), and fixturesDir() refuses to serve recordings.

import type { SourceId } from "@kickoff/schema";
import type { JobKind } from "./scheduler/planner";
import { isMockMode as s1Mock } from "./apiFootball";
import { isMockMode as s2Mock } from "./footballDataOrg";
import { isMockMode as apifyMock } from "./apify";
import { isMockMode as fplMock } from "./fpl";

export function mocksAllowed(): boolean {
  const v = process.env.KICKOFF_DATA_NO_MOCKS;
  return v !== "1" && v !== "true";
}

type Source = "apiFootball" | "footballDataOrg" | "apify" | "fpl";

function sourceOf(kind: JobKind): Source {
  if (kind.startsWith("s1.")) return "apiFootball";
  if (kind.startsWith("s2.")) return "footballDataOrg";
  if (kind.startsWith("fpl.")) return "fpl";
  return "apify"; // s3 (Flashscore live), s4 (extractor), s5 (FSFD tiebreak)
}

const mockOf: Record<Source, () => boolean> = {
  apiFootball: s1Mock,
  footballDataOrg: s2Mock,
  apify: apifyMock,
  fpl: fplMock,
};

/** False when mocks are off and this job's source has no key. */
export function jobEnabled(kind: JobKind): boolean {
  return mocksAllowed() || !mockOf[sourceOf(kind)]();
}

/** Sources switched off by the guard — logged once at worker start. */
export function disabledSources(): Source[] {
  if (mocksAllowed()) return [];
  return (Object.keys(mockOf) as Source[]).filter((s) => mockOf[s]());
}

// ---------------------------------------------------------------------------
// Source roles — which sources LIST fixtures and which VOTE on settlement.
// Configured per deploy, so swapping or adding a source is an env change
// plus that source's key, not a code change.
//
//   KICKOFF_DATA_LISTING_SOURCES   extra sources allowed to create fixtures
//                                  (apiFootball/fdorg always may). "fpl" lets
//                                  FPL list on its own and follow kickoff/status.
//   KICKOFF_DATA_SETTLEMENT_VOTERS the voter roster, e.g. "fpl" or
//                                  "fpl,fdorg". Unset = S1+S2 (+flashscore
//                                  once trusted), the settlement engine default.
//   KICKOFF_DATA_SETTLEMENT_QUORUM exact agreements needed. Default 2.
// ---------------------------------------------------------------------------

const VOTERS: SourceId[] = ["apiFootball", "fdorg", "flashscore", "fpl"];

function parseSources(name: string): SourceId[] | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const s of list)
    if (!VOTERS.includes(s as SourceId)) throw new Error(`${name}: unknown source "${s}" (known: ${VOTERS.join(", ")})`);
  return [...new Set(list)] as SourceId[];
}

export function listsFixtures(source: SourceId): boolean {
  if (source === "apiFootball" || source === "fdorg") return true;
  return parseSources("KICKOFF_DATA_LISTING_SOURCES")?.includes(source) ?? false;
}

/** Roster + quorum for the settlement engine; {} = its built-in default. */
export function settlementRoster(): { voters?: SourceId[]; quorum?: number } {
  const voters = parseSources("KICKOFF_DATA_SETTLEMENT_VOTERS") ?? undefined;
  const q = process.env.KICKOFF_DATA_SETTLEMENT_QUORUM?.trim();
  const quorum = q ? Number(q) : undefined;
  if (quorum !== undefined && (!Number.isInteger(quorum) || quorum < 1))
    throw new Error("KICKOFF_DATA_SETTLEMENT_QUORUM must be a positive integer");
  // A quorum the roster can never reach would stall every fixture silently.
  if (quorum !== undefined && quorum > (voters?.length ?? 2))
    throw new Error(`KICKOFF_DATA_SETTLEMENT_QUORUM=${quorum} exceeds the ${voters?.length ?? 2} configured voter(s)`);
  if (voters && quorum === undefined && voters.length < 2)
    throw new Error("KICKOFF_DATA_SETTLEMENT_VOTERS has one source: set KICKOFF_DATA_SETTLEMENT_QUORUM=1 to accept single-source settlement");
  return { ...(voters && { voters }), ...(quorum !== undefined && { quorum }) };
}

export function votesInSettlement(source: SourceId): boolean {
  const { voters } = settlementRoster();
  return voters ? voters.includes(source) : source === "apiFootball" || source === "fdorg";
}
