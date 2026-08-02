ALTER TYPE "public"."source_id" ADD VALUE 'fpl' BEFORE 'admin';--> statement-breakpoint
CREATE TABLE "fpl_fixtures" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"fpl_id" integer NOT NULL,
	"gw" integer,
	"kickoff_utc" timestamp with time zone,
	"home_slug" text NOT NULL,
	"away_slug" text NOT NULL,
	"started" boolean DEFAULT false NOT NULL,
	"finished_provisional" boolean DEFAULT false NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"canonical_fixture_id" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fpl_gameweeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"gw" integer NOT NULL,
	"name" text NOT NULL,
	"deadline_utc" timestamp with time zone NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"data_checked" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fpl_player_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"gw" integer NOT NULL,
	"element_id" integer NOT NULL,
	"total_points" integer NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"bonus" integer DEFAULT 0 NOT NULL,
	"stats" jsonb NOT NULL,
	"explain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"raw_payload_id" integer,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fpl_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"element_id" integer NOT NULL,
	"web_name" text NOT NULL,
	"full_name" text NOT NULL,
	"team_slug" text NOT NULL,
	"position" text NOT NULL,
	"s1_player_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_points_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"gw" integer NOT NULL,
	"version" integer NOT NULL,
	"status" "snapshot_status" NOT NULL,
	"points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_payload_id" integer,
	"frozen_at" timestamp with time zone,
	"supersedes_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fpl_fixtures" ADD CONSTRAINT "fpl_fixtures_canonical_fixture_id_fixtures_id_fk" FOREIGN KEY ("canonical_fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fpl_player_points" ADD CONSTRAINT "fpl_player_points_raw_payload_id_raw_payloads_id_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_points_settlements" ADD CONSTRAINT "player_points_settlements_raw_payload_id_raw_payloads_id_fk" FOREIGN KEY ("raw_payload_id") REFERENCES "public"."raw_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fpl_fixtures_idx" ON "fpl_fixtures" USING btree ("season","fpl_id");--> statement-breakpoint
CREATE INDEX "fpl_fixtures_gw_idx" ON "fpl_fixtures" USING btree ("season","gw");--> statement-breakpoint
CREATE UNIQUE INDEX "fpl_gw_idx" ON "fpl_gameweeks" USING btree ("season","gw");--> statement-breakpoint
CREATE UNIQUE INDEX "fpl_points_idx" ON "fpl_player_points" USING btree ("season","gw","element_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fpl_players_idx" ON "fpl_players" USING btree ("season","element_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pps_gw_version_idx" ON "player_points_settlements" USING btree ("season","gw","version");