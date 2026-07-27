// Differential-test fixture generator: runs N random settlement cases through
// the TS engine (src/engine/engine.ts) and dumps positions + expected results
// to contracts/test/fixtures/differential.json. The forge test replays each
// case through KickoffEscrow.settle() and asserts byte-identical payouts.
//
// Deterministic PRNG (mulberry32, fixed seed) so the fixture file is stable —
// regenerate only when the engine changes:  pnpm tsx scripts/gen-differential.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  settle,
  distanceA,
  DEFAULT_DIST_PARAMS,
  DEFAULT_PAYOUT_PARAMS,
  type Position,
} from "../src/engine/engine.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "../contracts/test/fixtures/differential.json");
const N_CASES = 40;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260727);
const ri = (max: number) => Math.floor(rand() * (max + 1)); // 0..max inclusive

interface Case {
  gamma: number;
  actualHome: number;
  actualAway: number;
  stakes: string[]; // base units, decimal strings (JSON-safe bigints)
  guessHome: number[];
  guessAway: number[];
  expectedPayouts: string[];
  expectedPlatformCut: string;
  expectedAcc: string;
  expectedVoid: boolean;
}

const cases: Case[] = [];
for (let c = 0; c < N_CASES; c++) {
  const n = 2 + ri(8); // 2..10 positions
  const gamma = [1, 3, 6, 12][ri(3)];
  const actualHome = ri(5);
  const actualAway = ri(5);

  const stakes: bigint[] = [];
  const gh: number[] = [];
  const ga: number[] = [];
  for (let i = 0; i < n; i++) {
    stakes.push(BigInt(1_000_000 + Math.floor(rand() * 499_000_000))); // $1..$500
    gh.push(ri(5));
    ga.push(ri(5));
  }

  const positions: Position[] = stakes.map((stake, i) => ({
    stake,
    d: distanceA(gh[i], ga[i], actualHome, actualAway, DEFAULT_DIST_PARAMS),
  }));
  const res = settle(positions, { ...DEFAULT_PAYOUT_PARAMS, gamma });

  cases.push({
    gamma,
    actualHome,
    actualAway,
    stakes: stakes.map(String),
    guessHome: gh,
    guessAway: ga,
    expectedPayouts: res.outcomes.map((o) => String(o.payout)),
    expectedPlatformCut: String(res.void ? 0n : res.platformCut),
    expectedAcc: String(res.void ? 0n : res.accumulatorContribution),
    expectedVoid: res.void !== null,
  });
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ cases }, null, 2));
const voids = cases.filter((c) => c.expectedVoid).length;
console.log(`wrote ${cases.length} cases (${voids} void) -> ${OUT}`);
