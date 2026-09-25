// Canonical schema for kickoff-data — the ONLY types the markets app may
// depend on (spec §2). The markets app never imports service internals;
// everything crosses the wire through /v1/* shaped as these entities.
//
// Source-specific ids live in `source_refs` so any entity can be traced back
// to the raw payload that produced it. ID reconciliation across sources =
// (league, UTC kickoff ±5min, normalized team names via alias table);
// unreconciled entities are flagged for admin review, never guessed.

/** Which upstream produced a datum. S3+S4 are both "flashscore" — same
 *  underlying source, ONE settlement vote (spec §1 independence note).
 *  "fpl" is the official Fantasy Premier League API — standalone authority
 *  for player points (documented exception to the no-single-source rule:
 *  the market IS "official FPL points" and the EPL operates FPL). */
export type SourceId =
  | "apiFootball"
  | "fdorg"
  | "flashscore"
  | "fsfd"
  | "fpl"
  | "admin";

export type FixtureStatus =
  | "scheduled"
  | "live"
  | "ht"
  | "ft"
  | "postponed"
  | "abandoned";

/** Per-source native ids for one entity. Keys absent when a source hasn't
 *  been reconciled to this entity yet. */
export interface SourceRefs {
  apiFootball?: number;
  fdorg?: number;
  flashscore?: string;
  fsfd?: string;
  fpl?: number;
}

/** Wrapper every consumer response carries so the app can render
 *  "as of 30s ago" honestly instead of pretending to be realtime. */
export interface Sourced<T> {
  data: T;
  source: SourceId;
  fetched_at: string; // ISO-8601 UTC
  staleness_seconds: number;
}

// ---------------------------------------------------------------------------
// Listing lane
// ---------------------------------------------------------------------------

export interface Team {
  /** Canonical slug after alias-table normalization, e.g. "arsenal". */
  slug: string;
  name: string;
}

export interface Fixture {
  /** Canonical id owned by kickoff-data (NOT any source's id). */
  id: string;
  league: string; // "EPL" for v1
  season: number; // e.g. 2026
  kickoff_utc: string; // ISO-8601
  home: Team;
  away: Team;
  status: FixtureStatus;
  venue?: string;
  source_refs: SourceRefs;
}

// ---------------------------------------------------------------------------
// Charts lane (live, best-effort)
// ---------------------------------------------------------------------------

/** Live, mutable snapshot of a match. Overwritten each poll. */
export interface MatchState {
  fixture_id: string;
  minute: number | null;
  period: "1H" | "HT" | "2H" | "ET" | "FT" | "PRE";
  score: { home: number; away: number };
  last_event_at: string | null;
}

export type MatchEventType =
  | "goal"
  | "own_goal"
  | "penalty_goal"
  | "penalty_missed"
  | "yellow"
  | "second_yellow"
  | "red"
  | "substitution"
  | "var";

/** Append-only event timeline. `score_after` is S3's killer field — the
 *  running score immediately after the event. */
export interface MatchEvent {
  fixture_id: string;
  minute: number;
  type: MatchEventType;
  side: "home" | "away";
  player: string | null;
  /** For substitutions: the player coming ON (API-Football gotcha —
   *  `player` = off, `assist` = on; normalized here). */
  player_in?: string | null;
  score_after: { home: number; away: number } | null;
  source: SourceId;
  ingested_at: string;
}

/** Per-half stat rows for charts (xG, possession, shots…). */
export interface MatchStats {
  fixture_id: string;
  period: "1H" | "2H" | "FULL";
  home: StatLine;
  away: StatLine;
}

export interface StatLine {
  xg?: number;
  possession_pct?: number;
  shots?: number;
  shots_on_target?: number;
  corners?: number;
  fouls?: number;
}

// ---------------------------------------------------------------------------
// Market B lane — player stats feeding the ×1e6 scoring rubric (spec §2.1)
// ---------------------------------------------------------------------------

export type PlayerPosition = "G" | "D" | "M" | "F";

/** Everything the scoring rubric needs, per player per fixture. If a source
 *  can't supply a field it must say so in its capability manifest — the
 *  markets app drops that rubric line from public rules copy rather than
 *  silently substituting. */
export interface PlayerMatchStats {
  fixture_id: string;
  player_id: number;
  player_name: string;
  team: "home" | "away";
  position: PlayerPosition;
  minutes: number;
  started: boolean;
  /** Substitution minute (on or off), null if played whole match or DNP. */
  sub_on_minute: number | null;
  sub_off_minute: number | null;
  goals: number;
  assists: number;
  own_goals: number;
  yellow_cards: number;
  red_cards: number;
  penalties_won: number;
  penalties_conceded: number;
  penalties_saved: number;
  saves: number;
  tackles: number;
  shots_on_target: number;
  /** Goals conceded while this player was on the pitch (clean-sheet input). */
  conceded_while_on: number;
}

// ---------------------------------------------------------------------------
// Settlement lane (the checkbook — spec §5)
// ---------------------------------------------------------------------------

/** One source's opinion of the final outcome, with its evidence. */
export interface SettlementVote {
  source: SourceId;
  scoreline: { home: number; away: number };
  fetched_at: string;
  /** Pointer into the raw-payload archive — the dispute evidence trail. */
  raw_payload_ref: string;
}

export type SettlementStatus = "pending" | "provisional" | "frozen" | "disputed";

/** Immutable, versioned. Corrections create version N+1 with a reason —
 *  they NEVER edit N. The markets app settles against (fixture_id, version),
 *  never against "current" data. */
export interface SettlementSnapshot {
  fixture_id: string;
  version: number;
  outcome: { home: number; away: number };
  votes: SettlementVote[];
  /** e.g. "2-of-3 exact agreement", "admin-override" */
  quorum_rule: string;
  frozen_at: string;
  /** Present on versions >1. */
  supersedes_reason?: string;
}

/** GET /v1/settlement/:fixtureId — 200 with snapshot, or 409 with this. */
export interface SettlementPending {
  status: Exclude<SettlementStatus, "frozen">;
  votes_collected: number;
  /** When the finality-delay window (15 min) ends, if provisional. */
  freezes_at?: string;
}

// ---------------------------------------------------------------------------
// FPL lane — official Fantasy Premier League points (player perps settle on
// these; the custom rubric above stays intact but is NOT a settlement path)
// ---------------------------------------------------------------------------

/** One FPL gameweek ("event"). `data_checked` is FPL's own immutability flag —
 *  the ONLY gate for final player-points settlement. */
export interface Gameweek {
  /** FPL event id, 1..38. Resets each season. */
  id: number;
  season: number;
  name: string; // "Gameweek 12"
  deadline_utc: string;
  is_current: boolean;
  /** All fixtures finished AND bonus points added. */
  finished: boolean;
  /** FPL has verified the data — points are immutable from here. */
  data_checked: boolean;
}

/** A player's official FPL points for one gameweek. Element id is FPL's
 *  player key — the id player-perps markets are written against. */
export interface PlayerGwPoints {
  gw: number;
  season: number;
  element_id: number;
  player_name: string; // FPL web_name
  team_slug: string;
  position: PlayerPosition;
  total_points: number;
  minutes: number;
  bonus: number;
  /** false only once the gameweek's data_checked has been observed. */
  provisional: boolean;
  /** Full FPL stats block (goals_scored, assists, bps, saves, ...). */
  stats: Record<string, number>;
}

/** S1 sanity cross-check discrepancy. Informational ONLY — flags never
 *  block or delay FPL settlement (FPL is the standalone authority). */
export interface PointsCrossCheckFlag {
  element_id: number;
  field: string; // "goals" | "assists" | "minutes" | ...
  fpl: number;
  /** null = S1 has no mapped row for this element. */
  s1: number | null;
}

/** Immutable, versioned — same discipline as SettlementSnapshot but per
 *  gameweek. Standalone FPL authority: no votes, no quorum. */
export interface PlayerPointsSettlement {
  gw: number;
  season: number;
  version: number;
  points: Array<{ element_id: number; player_name: string; total_points: number }>;
  /** The /event/{gw}/live payload the outcome was read from. */
  raw_payload_ref: string;
  /** S1 cross-check diffs — informational only. */
  flags: PointsCrossCheckFlag[];
  frozen_at: string;
  /** Present on versions >1 (admin correction). */
  supersedes_reason?: string;
}

/** GET /v1/gameweeks/:gw/settlement — 200 with settlement, or 409 with this. */
export interface PlayerPointsPending {
  status: "pending" | "provisional" | "disputed";
  data_checked: boolean;
}

// ---------------------------------------------------------------------------
// Webhooks (kickoff-data → markets app)
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | { type: "settlement.ready"; fixture_id: string; snapshot_version: number }
  | { type: "settlement.disputed"; fixture_id: string; votes: SettlementVote[] }
  | {
      type: "fixture.status_changed";
      fixture_id: string;
      from: FixtureStatus;
      to: FixtureStatus;
    }
  | {
      /** A live match's score or status moved (kickoff, goal, full time):
       *  the doorbell for the in-match PnL chart. minute = minutes played. */
      type: "fixture.score_changed";
      fixture_id: string;
      home: number;
      away: number;
      minute: number | null;
      status: FixtureStatus;
    }
  | {
      type: "settlement.player_points_ready";
      gw: number;
      season: number;
      snapshot_version: number;
    }
  | {
      type: "settlement.player_points_flagged";
      gw: number;
      season: number;
      flags: PointsCrossCheckFlag[];
    };
