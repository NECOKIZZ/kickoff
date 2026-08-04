ALTER TABLE "markets" ADD COLUMN "gameweek" integer;--> statement-breakpoint
CREATE INDEX "markets_gameweek_idx" ON "markets" USING btree ("gameweek");