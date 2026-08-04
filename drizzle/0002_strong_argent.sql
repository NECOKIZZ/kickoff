CREATE TABLE "pnl_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_id" integer NOT NULL,
	"match_clock" text NOT NULL,
	"score_home" integer,
	"score_away" integer,
	"live_points" bigint,
	"positions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pnl_snapshots" ADD CONSTRAINT "pnl_snapshots_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pnl_snapshots_market_idx" ON "pnl_snapshots" USING btree ("market_id","created_at");