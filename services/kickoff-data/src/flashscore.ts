// Flashscore actors (S3 + S4) — typed surfaces over the REAL payloads
// recorded 2026-07-27 (fixtures/apify/*.json, live runs). Same underlying
// source → ONE settlement vote between them (spec §1).

import { runActor } from "./apify";

export const S3_ACTOR = "extractify-labs~flashscore-live-matches";
export const S4_ACTOR = "extractify-labs~flashscore-extractor";

// ---------------------------------------------------------------------------
// S3 — Flashscore Live Matches. Typed from the recorded run: event `type` is
// a mix of semantic strings ("goal", "yellow_card", "sub_in", "assist") and
// numeric codes ("10" = Penalty per its type_label); minute is a STRING with
// stoppage ("45+4'").
// ---------------------------------------------------------------------------

export interface FsLiveEvent {
  event_id: string;
  side: "home" | "away";
  minute: string; // "7'" | "45+4'"
  type: string; // "goal" | "yellow_card" | "red_card" | "sub_in" | "assist" | "10" (penalty) | ...
  type_label: string; // human label — the reliable discriminator alongside type
  player_name: string | null;
  player_id: string | null;
  extra_info: string | null;
  home_score_after: number | null; // the killer field
  away_score_after: number | null;
}

export interface FsLiveStatRow {
  period: "Match" | "1st Half" | "2nd Half";
  category: string;
  stat_id: number;
  stat_name: string; // "Expected goals (xG)" | "Ball possession" | "Total shots" | "Shots on target" | ...
  home_value: string; // "1.84" | "50%"
  away_value: string;
}

export interface FsLineupPlayer {
  player_id: string;
  name: string;
  surname: string;
  shirt_number: number | null;
  position: string | null; // "Goalkeeper" | "Captain" | ...
  is_starter: boolean;
  rating: string | null;
}

export interface FsLiveMatch {
  match_id: string;
  match_url: string;
  status: string; // "LIVE" | "FINISHED" | ...
  kickoff_time: string; // ISO with offset
  home_team: string;
  away_team: string;
  home_team_id: string;
  away_team_id: string;
  league: string; // "ENGLAND: Premier League"
  league_id: string;
  match_minute: number | null;
  match_period: string | null; // "1st Half" | "Halftime" | "2nd Half" | ...
  home_score: number | null;
  away_score: number | null;
  lineups_confirmed: boolean;
  events: FsLiveEvent[] | null;
  statistics: FsLiveStatRow[] | null;
  lineups: {
    home_formation: string | null;
    away_formation: string | null;
    confirmed: boolean;
    home: FsLineupPlayer[] | null;
    away: FsLineupPlayer[] | null;
  } | null;
  odds: unknown; // geo-dependent, all-null in our region — never depend on it
  scraped_at?: string;
}

/** One poll = all currently-live matches (we filter to our league). Odds
 *  intentionally excluded: probed all-null from this region, chart-only
 *  anyway. */
export async function getLiveMatches(maxItems = 50): Promise<FsLiveMatch[]> {
  return runActor(
    S3_ACTOR,
    { includeStatistics: true, includeLineups: true, includeOdds: false, maxItems },
    { mockFile: "s3-live-sample.json", source: "flashscore" },
  );
}

// ---------------------------------------------------------------------------
// S4 — Flashscore Extractor (score_mode). Flat rows; match_date is a naive
// "YYYY-MM-DD HH:mm:ss" LOCAL-TO-SCRAPER string (no timezone) — treat as UTC
// only after burn-in confirms; until then S4 corroborates existence, S1 owns
// kickoff times.
// ---------------------------------------------------------------------------

export interface FsExtractorMatch {
  match_id: string;
  match_url: string;
  match_date: string; // "2026-07-27 13:00:00" — NO timezone marker
  match_status: "finished" | "live" | "scheduled" | string;
  match_score_home_goals: string | null;
  match_score_away_goals: string | null;
  home_team_name: string;
  away_team_name: string;
  home_team_id: string;
  away_team_id: string;
  tournament_name: string; // "Premier League"
  category_name: string; // "England"
  sport_name: string;
}

/** Fixture window sync (±N days), filtered server-side to a league name as
 *  it appears on Flashscore. */
export async function getFixtureWindow(
  leagues: string[],
  dayOffsets: string[] = ["-1", "0", "1", "2", "3", "4", "5", "6", "7"],
  maxItems?: number,
): Promise<FsExtractorMatch[]> {
  return runActor(
    S4_ACTOR,
    {
      mode: "score_mode",
      sports: ["football"],
      matchStatuses: ["all"],
      leagues,
      dayOffsets,
      ...(maxItems ? { maxItems } : {}),
    },
    { mockFile: "s4-fixtures-sample.json", source: "flashscore" },
  );
}
