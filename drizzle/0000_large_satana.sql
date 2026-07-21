CREATE TYPE "public"."market_kind" AS ENUM('scoreline', 'player_points');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('draft', 'open', 'locked', 'settling', 'settled', 'void');--> statement-breakpoint
CREATE TYPE "public"."stake_mode" AS ENUM('variable', 'fixed');--> statement-breakpoint
CREATE TABLE "accumulator_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"settlement_id" integer NOT NULL,
	"amount" bigint NOT NULL,
	"season" text DEFAULT '2026-27' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"market_id" integer,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "market_kind" NOT NULL,
	"status" "market_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"fixture_id" integer,
	"fd_org_match_id" integer,
	"home_team" text,
	"away_team" text,
	"player_id" integer,
	"player_name" text,
	"kickoff_at" timestamp with time zone NOT NULL,
	"locks_at" timestamp with time zone NOT NULL,
	"gamma" integer DEFAULT 3 NOT NULL,
	"stake_mode" "stake_mode" DEFAULT 'variable' NOT NULL,
	"min_stake" bigint DEFAULT '1000000' NOT NULL,
	"max_stake" bigint DEFAULT '500000000' NOT NULL,
	"fixed_stake" bigint,
	"take_rate_bps" integer DEFAULT 1000 NOT NULL,
	"accumulator_share_bps" integer DEFAULT 5000 NOT NULL,
	"cap_multiple" integer DEFAULT 100 NOT NULL,
	"escrow_address" text,
	"chain_id" integer DEFAULT 46630 NOT NULL,
	"actual_home" integer,
	"actual_away" integer,
	"actual_points" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"guess_home" integer,
	"guess_away" integer,
	"guess_points" bigint,
	"stake" bigint NOT NULL,
	"stake_tx_hash" text,
	"distance_d" bigint,
	"is_winner" boolean,
	"accuracy_a" bigint,
	"gain" bigint,
	"payout" bigint,
	"capped" boolean,
	"claim_tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_id" integer NOT NULL,
	"void_reason" text,
	"median_d" bigint,
	"coalition_mode" boolean DEFAULT false NOT NULL,
	"losers_stake_sum" bigint DEFAULT '0' NOT NULL,
	"dividend_pool" bigint DEFAULT '0' NOT NULL,
	"accumulator_contribution" bigint DEFAULT '0' NOT NULL,
	"platform_cut" bigint DEFAULT '0' NOT NULL,
	"total_pool" bigint DEFAULT '0' NOT NULL,
	"settle_tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_market_id_unique" UNIQUE("market_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"privy_did" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accumulator_entries" ADD CONSTRAINT "accumulator_entries_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_events_market_idx" ON "admin_events" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "markets_status_idx" ON "markets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "markets_kickoff_idx" ON "markets" USING btree ("kickoff_at");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_market_user_idx" ON "positions" USING btree ("market_id","user_id");--> statement-breakpoint
CREATE INDEX "positions_user_idx" ON "positions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_address_idx" ON "users" USING btree ("address");