import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  date,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// kickoff-data — canonical schema (spec §2) + raw archive + budget mirror.
//
// Separate DATABASE from the markets app (kickoff_data vs kickoff): the app
// consumes this service over HTTP only, so the DBs must not be joinable.
//
// Two standards, one service (spec §0): listing/charts rows are mutable
// best-effort; settlement_snapshots are immutable and versioned — corrections
// INSERT version N+1, they never UPDATE N.
// ---------------------------------------------------------------------------

export const fixtureStatus = pgEnum("fixture_status", [
  "scheduled",
  "live",
  "ht",
  "ft",
  "postponed",
  "abandoned",
]);

/** S3+S4 are both "flashscore" — same underlying source, ONE settlement vote. */
export const sourceId = pgEnum("source_id", [
  "apiFootball",
  "fdorg",
  "flashscore",
  "fsfd",
  "admin",
]);

export const snapshotStatus = pgEnum("snapshot_status", [
  "pending",
  "provisional",
  "frozen",
  "disputed",
]);

// ---------------------------------------------------------------------------
// Raw payload archive — EVERY source response lands here BEFORE normalization
// (spec §4 global rules). Reprocessable forever; the evidence trail for
// disputes. SettlementVote.raw_payload_ref points at raw_payloads.id.
// ---------------------------------------------------------------------------

export const rawPayloads = pgTable(
  "raw_payloads",
  {
    id: serial("id").primaryKey(),
    source: sourceId("source").notNull(),
    endpoint: text("endpoint").notNull(), // e.g. "/fixtures/players?fixture=1399001"
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("raw_payloads_source_endpoint_idx").on(t.source, t.endpoint, t.fetchedAt)],
);

// ---------------------------------------------------------------------------
// Listing lane
// ---------------------------------------------------------------------------

export const fixtures = pgTable(
  "fixtures",
  {
    /** Canonical id owned by this service (NOT any source's id). */
    id: text("id").primaryKey(), // e.g. "epl-2026-arsenal-chelsea-20260815T1400"
    league: text("league").notNull(),
    season: integer("season").notNull(),
    kickoffUtc: timestamp("kickoff_utc", { withTimezone: true }).notNull(),
    homeSlug: text("home_slug").notNull(),
    homeName: text("home_name").notNull(),
    awaySlug: text("away_slug").notNull(),
    awayName: text("away_name").notNull(),
    status: fixtureStatus("status").notNull().default("scheduled"),
    venue: text("venue"),
    /** Per-source native ids: { apiFootball: 1399001, fdorg: 497xxx, flashscore: "..." } */
    sourceRefs: jsonb("source_refs").notNull().default({}),
    /** Unreconciled across sources → flagged for admin review, never guessed. */
    needsReview: boolean("needs_review").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fixtures_kickoff_idx").on(t.kickoffUtc),
    index("fixtures_status_idx").on(t.status),
    // Reconciliation key: (league, kickoff ±5min, slugs) — enforced in code,
    // this index makes the lookup cheap.
    uniqueIndex("fixtures_recon_idx").on(t.league, t.kickoffUtc, t.homeSlug, t.awaySlug),
  ],
);

// ---------------------------------------------------------------------------
// Charts lane (live, best-effort)
// ---------------------------------------------------------------------------

/** Mutable — one row per fixture, overwritten each poll. */
export const matchState = pgTable("match_state", {
  fixtureId: text("fixture_id")
    .primaryKey()
    .references(() => fixtures.id),
  minute: integer("minute"),
  period: text("period").notNull().default("PRE"), // 1H|HT|2H|ET|FT|PRE
  scoreHome: integer("score_home").notNull().default(0),
  scoreAway: integer("score_away").notNull().default(0),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  source: sourceId("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

/** Append-only. `score_after` is S3's killer field. */
export const matchEvents = pgTable(
  "match_events",
  {
    id: serial("id").primaryKey(),
    fixtureId: text("fixture_id")
      .notNull()
      .references(() => fixtures.id),
    minute: integer("minute").notNull(),
    type: text("type").notNull(), // goal|own_goal|penalty_goal|penalty_missed|yellow|second_yellow|red|substitution|var
    side: text("side").notNull(), // home|away
    player: text("player"),
    /** substitutions: player coming ON (S1 gotcha: `player`=off, `assist`=on — normalized). */
    playerIn: text("player_in"),
    scoreAfterHome: integer("score_after_home"),
    scoreAfterAway: integer("score_after_away"),
    source: sourceId("source").notNull(),
    rawPayloadId: integer("raw_payload_id").references(() => rawPayloads.id),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("match_events_fixture_idx").on(t.fixtureId, t.minute),
    // Idempotent re-ingest: same source re-reporting the same event upserts.
    uniqueIndex("match_events_dedup_idx").on(t.fixtureId, t.source, t.minute, t.type, t.side, t.player),
  ],
);

/** Per-half stat rows for charts (xG, possession, shots…). */
export const matchStats = pgTable(
  "match_stats",
  {
    id: serial("id").primaryKey(),
    fixtureId: text("fixture_id")
      .notNull()
      .references(() => fixtures.id),
    period: text("period").notNull(), // 1H|2H|FULL
    home: jsonb("home").notNull(), // StatLine
    away: jsonb("away").notNull(),
    source: sourceId("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("match_stats_fixture_period_idx").on(t.fixtureId, t.period, t.source)],
);

// ---------------------------------------------------------------------------
// Market B lane — the §2.1 checklist, one row per player per fixture
// ---------------------------------------------------------------------------

export const playerMatchStats = pgTable(
  "player_match_stats",
  {
    id: serial("id").primaryKey(),
    fixtureId: text("fixture_id")
      .notNull()
      .references(() => fixtures.id),
    playerId: integer("player_id").notNull(), // S1's player id (its stats feed the rubric)
    playerName: text("player_name").notNull(),
    team: text("team").notNull(), // home|away
    position: text("position").notNull(), // G|D|M|F
    minutes: integer("minutes").notNull(),
    started: boolean("started").notNull(),
    subOnMinute: integer("sub_on_minute"),
    subOffMinute: integer("sub_off_minute"),
    goals: integer("goals").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    ownGoals: integer("own_goals").notNull().default(0),
    yellowCards: integer("yellow_cards").notNull().default(0),
    redCards: integer("red_cards").notNull().default(0),
    penaltiesWon: integer("penalties_won").notNull().default(0),
    penaltiesConceded: integer("penalties_conceded").notNull().default(0),
    penaltiesSaved: integer("penalties_saved").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    tackles: integer("tackles").notNull().default(0),
    shotsOnTarget: integer("shots_on_target").notNull().default(0),
    /** Goals conceded while on the pitch (clean-sheet input, derived from lineups+events). */
    concededWhileOn: integer("conceded_while_on").notNull().default(0),
    source: sourceId("source").notNull(),
    rawPayloadId: integer("raw_payload_id").references(() => rawPayloads.id),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("pms_fixture_player_idx").on(t.fixtureId, t.playerId)],
);

// ---------------------------------------------------------------------------
// Settlement lane (spec §5) — immutable, versioned
// ---------------------------------------------------------------------------

export const settlementSnapshots = pgTable(
  "settlement_snapshots",
  {
    id: serial("id").primaryKey(),
    fixtureId: text("fixture_id")
      .notNull()
      .references(() => fixtures.id),
    version: integer("version").notNull(),
    status: snapshotStatus("status").notNull(),
    outcomeHome: integer("outcome_home"),
    outcomeAway: integer("outcome_away"),
    /** SettlementVote[] — each with source, scoreline, fetched_at, raw_payload_ref. */
    votes: jsonb("votes").notNull().default([]),
    quorumRule: text("quorum_rule"), // e.g. "2-of-3 exact agreement" | "admin-override"
    /** Finality-delay window end (15 min); any vote change during it resets it. */
    freezesAt: timestamp("freezes_at", { withTimezone: true }),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    /** Present on versions >1 — why this version supersedes N-1. */
    supersedesReason: text("supersedes_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("snapshots_fixture_version_idx").on(t.fixtureId, t.version)],
);

// ---------------------------------------------------------------------------
// Per-source budget mirror (spec §4 global rules) — the in-process counter in
// apiFootball.ts gets the DB mirror its comment promises. One row per source
// per UTC day; restart-safe.
// ---------------------------------------------------------------------------

export const sourceBudget = pgTable(
  "source_budget",
  {
    id: serial("id").primaryKey(),
    source: sourceId("source").notNull(),
    dayUtc: date("day_utc").notNull(),
    used: integer("used").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("source_budget_day_idx").on(t.source, t.dayUtc)],
);

// ---------------------------------------------------------------------------
// Service heartbeat — one row per process ("worker"), touched every tick.
// The /health endpoint reads it: a stale heartbeat = the worker died even
// though the API container is fine (they are separate processes on Railway).
// ---------------------------------------------------------------------------

export const serviceHeartbeat = pgTable("service_heartbeat", {
  process: text("process").primaryKey(), // "worker"
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }).notNull(),
  /** Jobs run in the last tick — quick visual that the planner is planning. */
  lastTickJobs: integer("last_tick_jobs").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
});
