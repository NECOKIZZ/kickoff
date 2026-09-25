// Production guard for mock mode. Every source client falls back to recorded
// payloads when its key is unset — right for dev and tests, wrong for a live
// database. KICKOFF_DATA_NO_MOCKS=1 flips that: a source without its key is
// OFF (its jobs are skipped), and fixturesDir() refuses to serve recordings.

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
