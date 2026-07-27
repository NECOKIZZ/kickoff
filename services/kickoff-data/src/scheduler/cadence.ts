// Polling cadences (spec §4) — CONFIG, NOT CODE. v1 defaults below; tuned
// during burn-in against observed latency + cost. Every number here can be
// overridden via env (KICKOFF_DATA_CADENCE_<NAME>_SECONDS) without a deploy.
//
// Hard rules that are NOT config (encoded in the planner instead):
//   - S1 does NO live in-play polling, ever. Live is S3's job.
//   - S1 settlement votes come from reserved headroom; charts never borrow it.

function envSeconds(name: string, fallback: number): number {
  const v = process.env[`KICKOFF_DATA_CADENCE_${name}_SECONDS`];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const CADENCE = {
  // --- S1 API-Football (daily-budget bound, §4 table) ---
  /** Morning fixture sync — 2/day flat. */
  s1FixtureSync: envSeconds("S1_FIXTURE_SYNC", 12 * 3600),
  /** Lineups fetch window opens this long before kickoff (~1h). */
  s1LineupLeadTime: envSeconds("S1_LINEUP_LEAD", 3600),
  /** Post-match player stats + events: fetch once fixture hits FT. */
  s1PostMatchDelay: envSeconds("S1_POSTMATCH_DELAY", 5 * 60),

  // --- S2 football-data.org ---
  /** Fixture cross-check sync. */
  s2FixtureSync: envSeconds("S2_FIXTURE_SYNC", 24 * 3600),
  /** Settlement vote read at FT + this delay. */
  s2SettlementDelay: envSeconds("S2_SETTLEMENT_DELAY", 5 * 60),

  // --- S3 Flashscore Live (phase-dependent, §4 table) ---
  s3PreKickoff: envSeconds("S3_PRE_KICKOFF", 5 * 60),
  s3PreKickoffWindow: envSeconds("S3_PRE_KICKOFF_WINDOW", 15 * 60),
  s3InPlay: envSeconds("S3_IN_PLAY", 2 * 60),
  s3InPlayNearSettlement: envSeconds("S3_NEAR_SETTLEMENT", 60),
  s3HalfTime: envSeconds("S3_HALF_TIME", 5 * 60),
  s3PostFt: envSeconds("S3_POST_FT", 60),

  // --- S4 Flashscore Extractor: 2×/day fixture window sync ---
  s4FixtureSync: envSeconds("S4_FIXTURE_SYNC", 12 * 3600),

  // S5 FSFD: never scheduled — invoked on-demand by settlement quorum only.
} as const;

/** S1 budget envelope (§4): keep this many requests free for settlement
 *  votes + retries. Charts/listing may never spend into the reserve. */
export const S1_SETTLEMENT_RESERVE = 15;
