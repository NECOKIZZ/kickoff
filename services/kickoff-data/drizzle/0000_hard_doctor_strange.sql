CREATE TYPE "public"."fixture_status" AS ENUM('scheduled', 'live', 'ht', 'ft', 'postponed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('pending', 'provisional', 'frozen', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."source_id" AS ENUM('apiFootball', 'fdorg', 'flashscore', 'fsfd', 'admin');--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" text PRIMARY KEY NOT NULL,
	"league" text NOT NULL,
	"season" integer NOT NULL,
	"kickoff_utc" timestamp with time zone NOT NULL,
	"home_slug" text NOT NULL,
	"home_name" text NOT NULL,
	"away_slug" text NOT NULL,
	"away_name" text NOT NULL,
	"status" "fixture_status" DEFAULT 'scheduled' NOT NULL,
	"venue" text,
	"source_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" text NOT NULL,
	"minute" integer NOT NULL,
	"type" text NOT NULL,
	"side" text NOT NULL,
	"player" text,
	"player_in" text,
	"score_after_home" integer,
	"score_after_away" integer,
	"source" "source_id" NOT NULL,
	"raw_payload_id" integer,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_state" (
	"fixture_id" text PRIMARY KEY NOT NULL,
	"minute" integer,
	"period" text DEFAULT 'PRE' NOT NULL,
	"score_home" integer DEFAULT 0 NOT NULL,
	"score_away" integer DEFAULT 0 NOT NULL,
	"last_event_at" timestamp with time zone,
	"source" "source_id" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" text NOT NULL,
	"period" text NOT NULL,
	"home" jsonb NOT NULL,
	"away" jsonb NOT NULL,
	"source" "source_id" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_match_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" text NOT NULL,
	"player_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"team" text NOT NULL,
	"position" text NOT NULL,
	"minutes" integer NOT NULL,
	"started" boolean NOT NULL,
	"sub_on_minute" integer,
	"sub_off_minute" integer,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"own_goals" integer DEFAULT 0 NOT NULL,
	"yellow_cards" integer DEFAULT 0 NOT NULL,
	"red_cards" integer DEFAULT 0 NOT NULL,
	"penalties_won" integer DEFAULT 0 NOT NULL,
	"penalties_conceded" integer DEFAULT 0 NOT NULL,
	"penalties_saved" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"tackles" integer DEFAULT 0 NOT NULL,
	"shots_on_target" integer DEFAULT 0 NOT NULL,
	"conceded_while_on" integer DEFAULT 0 NOT NULL,
	"source" "source_id" NOT NULL,
	"raw_payload_id" integer,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "source_id" NOT NULL,
	"endpoint" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "snapshot_status" NOT NULL,
	"outcome_home" integer,
	"outcome_away" integer,
	"votes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quorum_rule" text,
	"freezes_at" timestamp with time zone,
	"frozen_at" timestamp with time zone,
	"supersedes_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_budget" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" "source_id" NOT NULL,
	"day_utc" date NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_raw_payload_id_raw_payloads_id_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_state" ADD CONSTRAINT "match_state_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_stats" ADD CONSTRAINT "match_stats_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_raw_payload_id_raw_payloads_id_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_snapshots" ADD CONSTRAINT "settlement_snapshots_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fixtures_kickoff_idx" ON "fixtures" USING btree ("kickoff_utc");--> statement-breakpoint
CREATE INDEX "fixtures_status_idx" ON "fixtures" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "fixtures_recon_idx" ON "fixtures" USING btree ("league","kickoff_utc","home_slug","away_slug");--> statement-breakpoint
CREATE INDEX "match_events_fixture_idx" ON "match_events" USING btree ("fixture_id","minute");--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_dedup_idx" ON "match_events" USING btree ("fixture_id","source","minute","type","side","player");--> statement-breakpoint
CREATE UNIQUE INDEX "match_stats_fixture_period_idx" ON "match_stats" USING btree ("fixture_id","period","source");--> statement-breakpoint
CREATE UNIQUE INDEX "pms_fixture_player_idx" ON "player_match_stats" USING btree ("fixture_id","player_id");--> statement-breakpoint
CREATE INDEX "raw_payloads_source_endpoint_idx" ON "raw_payloads" USING btree ("source","endpoint","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_fixture_version_idx" ON "settlement_snapshots" USING btree ("fixture_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "source_budget_day_idx" ON "source_budget" USING btree ("source","day_utc");