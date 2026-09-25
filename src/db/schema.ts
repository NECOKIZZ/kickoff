import {
  pgTable,
  serial,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Kickoff — proximity markets schema.
//
// Money amounts are BIGINT stake-token base units (6 decimals, matches USDC /
// the engine's SCALE). Distances/weights are BIGINT fixed-point ×1e6. Never
// floats — the DB mirrors the engine's integer discipline so a settlement can
// be replayed byte-exactly from stored rows.
// ---------------------------------------------------------------------------

export const marketKind = pgEnum("market_kind", ["scoreline", "player_points"]);

export const marketStatus = pgEnum("market_status", [
  "draft",     // created by admin/agent, knobs still editable
  "open",      // staking live — params FROZEN from here on
  "locked",    // kickoff reached, no new positions
  "settling",  // outcome submitted, settlement in flight
  "settled",   // payouts computed + recorded
  "void",      // refund-all (N<=1, all-equal-D, abandoned fixture, admin void)
]);

export const stakeMode = pgEnum("stake_mode", ["variable", "fixed"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    // Wallet address is the canonical identity (Privy embedded or external).
    address: text("address").notNull(),
    privyDid: text("privy_did"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_address_idx").on(t.address)],
);

export const markets = pgTable(
  "markets",
  {
    id: serial("id").primaryKey(),
    kind: marketKind("kind").notNull(),
    status: marketStatus("status").notNull().default("draft"),

    title: text("title").notNull(), // e.g. "Arsenal vs Chelsea — final score"
    // Fixture linkage (API-Football id is source of truth; fdOrg id for cross-check).
    fixtureId: integer("fixture_id"),
    fdOrgMatchId: integer("fd_org_match_id"),
    // FPL gameweek (1–38) — batches score markets on the hub. Resolved from
    // kickoff-data's /v1/gameweeks at creation; null when unresolvable.
    gameweek: integer("gameweek"),
    homeTeam: text("home_team"),
    awayTeam: text("away_team"),
    // player_points markets only:
    playerId: integer("player_id"),
    playerName: text("player_name"),

    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    locksAt: timestamp("locks_at", { withTimezone: true }).notNull(),

    // --- Per-market knobs (testnet-phase instruments; FROZEN once status
    // leaves "draft"). Mirrors the future escrow contract's config struct. ---
    gamma: integer("gamma").notNull().default(3),
    stakeMode: stakeMode("stake_mode").notNull().default("variable"),
    minStake: bigint("min_stake", { mode: "bigint" }).notNull().default(sql`'1000000'`), // $1
    maxStake: bigint("max_stake", { mode: "bigint" }).notNull().default(sql`'500000000'`), // $500
    fixedStake: bigint("fixed_stake", { mode: "bigint" }), // required when stakeMode = fixed
    takeRateBps: integer("take_rate_bps").notNull().default(1000),
    accumulatorShareBps: integer("accumulator_share_bps").notNull().default(5000),
    capMultiple: integer("cap_multiple").notNull().default(100),

    // On-chain linkage (testnet escrow). The deployed KickoffEscrow is a
    // single multi-market contract, so a market is addressed by
    // (escrowAddress, onChainMarketId) — ids are the contract's own counter
    // and need not match this table's serial id.
    escrowAddress: text("escrow_address"),
    onChainMarketId: bigint("onchain_market_id", { mode: "bigint" }),
    chainId: integer("chain_id").notNull().default(46630),

    // Outcome (set at settlement time).
    actualHome: integer("actual_home"),
    actualAway: integer("actual_away"),
    actualPoints: bigint("actual_points", { mode: "bigint" }), // fixed-point ×1e6

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    index("markets_status_idx").on(t.status),
    index("markets_kickoff_idx").on(t.kickoffAt),
    index("markets_gameweek_idx").on(t.gameweek),
  ],
);

export const positions = pgTable(
  "positions",
  {
    id: serial("id").primaryKey(),
    marketId: integer("market_id")
      .notNull()
      .references(() => markets.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),

    // The guess: scoreline uses guessHome/guessAway; player_points uses guessPoints.
    guessHome: integer("guess_home"),
    guessAway: integer("guess_away"),
    guessPoints: bigint("guess_points", { mode: "bigint" }), // fixed-point ×1e6

    stake: bigint("stake", { mode: "bigint" }).notNull(), // base units
    // On-chain proof of the stake landing in escrow.
    stakeTxHash: text("stake_tx_hash"),

    // Settlement results (filled when market settles; replayable from engine).
    distanceD: bigint("distance_d", { mode: "bigint" }),
    isWinner: boolean("is_winner"),
    accuracyA: bigint("accuracy_a", { mode: "bigint" }),
    gain: bigint("gain", { mode: "bigint" }),
    payout: bigint("payout", { mode: "bigint" }),
    capped: boolean("capped"),
    claimTxHash: text("claim_tx_hash"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One position per user per market — repeat stakes update the row pre-lock.
    uniqueIndex("positions_market_user_idx").on(t.marketId, t.userId),
    index("positions_user_idx").on(t.userId),
  ],
);

export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  marketId: integer("market_id")
    .notNull()
    .references(() => markets.id)
    .unique(),
  voidReason: text("void_reason"), // null = settled normally
  medianD: bigint("median_d", { mode: "bigint" }),
  coalitionMode: boolean("coalition_mode").notNull().default(false),
  losersStakeSum: bigint("losers_stake_sum", { mode: "bigint" }).notNull().default(sql`'0'`),
  dividendPool: bigint("dividend_pool", { mode: "bigint" }).notNull().default(sql`'0'`),
  accumulatorContribution: bigint("accumulator_contribution", { mode: "bigint" }).notNull().default(sql`'0'`),
  platformCut: bigint("platform_cut", { mode: "bigint" }).notNull().default(sql`'0'`),
  totalPool: bigint("total_pool", { mode: "bigint" }).notNull().default(sql`'0'`),
  settleTxHash: text("settle_tx_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * In-match mark-to-model snapshots — the PnL/rank timeline on market detail.
 * One row per (market, score-change or tick). Written by the live-tracking
 * worker as the match state moves (and by admin backfill on testnet); each row
 * stores the full estimate so the chart replays without re-running the engine.
 */
export const pnlSnapshots = pgTable(
  "pnl_snapshots",
  {
    id: serial("id").primaryKey(),
    marketId: integer("market_id")
      .notNull()
      .references(() => markets.id),
    // Match clock label ("12'", "45+2'", "HT", "FT") + running score at capture.
    matchClock: text("match_clock").notNull(),
    scoreHome: integer("score_home"),
    scoreAway: integer("score_away"),
    // fixed-point points for player_points markets
    livePoints: bigint("live_points", { mode: "bigint" }),
    // Per-position estimate at this instant:
    // [{ positionId, isWinner, estimatedPayout, estimatedGain, rank }]
    positions: jsonb("positions").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pnl_snapshots_market_idx").on(t.marketId, t.createdAt)],
);

/** Season accumulator ledger — one row per settlement contribution. */export const accumulatorEntries = pgTable("accumulator_entries", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id")
    .notNull()
    .references(() => settlements.id),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  season: text("season").notNull().default("2026-27"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Audit trail — every admin/agent action, proposal and execution separately. */
export const adminEvents = pgTable(
  "admin_events",
  {
    id: serial("id").primaryKey(),
    actor: text("actor").notNull(), // "admin" | "agent" | signer address
    action: text("action").notNull(), // e.g. "market.create", "market.settle", "market.void"
    marketId: integer("market_id"),
    detail: jsonb("detail"), // full request payload for replay/debugging
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_events_market_idx").on(t.marketId)],
);

// ---------------------------------------------------------------------------
// Launch gate — waitlist + single-use invite codes.
//
// Landing stays public; /markets, /leaderboard, /positions require a redeemed
// invite (signed cookie now; the code row carries userId so redemptions bind
// to Privy accounts the moment Privy lands).
// ---------------------------------------------------------------------------

export const waitlistSignups = pgTable(
  "waitlist_signups",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(), // stored lowercased
    // Stamped when an admin mints a code against this signup — the funnel
    // metric is signups vs invited vs redeemed.
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("waitlist_email_idx").on(t.email)],
);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // KICK-XXXX-XXXX, strictly single-use
    note: text("note"), // admin label: wave name, partner, etc.
    // Set when minted for a specific waitlist signup (email-targeted invite).
    waitlistId: integer("waitlist_id").references(() => waitlistSignups.id),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    // Bound at redemption when the caller has an account (Privy later; dev
    // wallet header today if present). Null for anonymous cookie redemptions.
    redeemedByUserId: integer("redeemed_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invite_codes_code_idx").on(t.code)],
);

// ---------------------------------------------------------------------------
// Agent accounts — one optional prediction agent per human.
//
// The agent trades as its own KEYLESS address held in the on-chain
// AgentVault (contracts/src/AgentVault.sol). It also gets its own `users`
// row (address = agent address), so positions, settlement and the
// leaderboard treat it as an ordinary trader: one position, one vote.
// ---------------------------------------------------------------------------

export const agentMode = pgEnum("agent_mode", ["byok", "managed"]);
export const agentStatus = pgEnum("agent_status", ["active", "paused"]);

export const agents = pgTable(
  "agents",
  {
    id: serial("id").primaryKey(),
    // The human. UNIQUE = one agent per human, enforced by the database.
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => users.id),
    // The agent's own trader row (users.address = agent wallet address).
    agentUserId: integer("agent_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    walletAddress: text("wallet_address").notNull(), // AgentVault.agentOf(owner), lowercased
    mode: agentMode("mode").notNull(),
    status: agentStatus("status").notNull().default("active"),
    // Show "by <owner>" next to the agent on the leaderboard. The Agent
    // badge itself always shows.
    publicIdentity: boolean("public_identity").notNull().default(true),
    // Managed mode: the user's soul.md (untrusted — never executed, only
    // passed to a tool-less model call whose output is schema-validated).
    soulMd: text("soul_md"),
    registerTxHash: text("register_tx_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agents_owner_idx").on(t.ownerUserId),
    uniqueIndex("agents_agent_user_idx").on(t.agentUserId),
    uniqueIndex("agents_wallet_idx").on(t.walletAddress),
  ],
);

/** The human's signed authorization linking their agent (EIP-712 LinkAgent). */
export const agentLinks = pgTable("agent_links", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id),
  ownerWallet: text("owner_wallet").notNull(),
  signature: text("signature").notNull(),
  signedMessage: jsonb("signed_message").notNull(), // full typed data that was signed
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Agent-scoped API tokens (MCP / BYOK). Only the hash is stored. */
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id),
    tokenHash: text("token_hash").notNull(), // sha256 hex of the full token
    tokenPrefix: text("token_prefix").notNull(), // first chars, for display ("kagt_3f9a…")
    scopes: text("scopes").array().notNull().default(sql`ARRAY['predict','read']::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_tokens_hash_idx").on(t.tokenHash), index("agent_tokens_agent_idx").on(t.agentId)],
);

/**
 * Managed-agent runs: one row per soul.md run (one model call → picks).
 * The audit trail for what the model returned, what was placed, what was
 * rejected and what it cost.
 */
export const agentRunStatus = pgEnum("agent_run_status", ["ok", "error", "refused"]);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id),
    status: agentRunStatus("status").notNull(),
    trigger: text("trigger").notNull(), // "cron" | "admin" | "owner"
    model: text("model"),
    // Markets offered to the model this run (so the scheduler doesn't re-ask).
    marketIds: integer("market_ids").array().notNull().default(sql`ARRAY[]::integer[]`),
    // [{marketId, home, away, placed: bool, error?}]
    picks: jsonb("picks").notNull().default(sql`'[]'::jsonb`),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_runs_agent_idx").on(t.agentId, t.createdAt)],
);
