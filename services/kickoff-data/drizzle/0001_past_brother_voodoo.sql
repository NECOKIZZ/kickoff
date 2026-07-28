CREATE TABLE "service_heartbeat" (
	"process" text PRIMARY KEY NOT NULL,
	"last_tick_at" timestamp with time zone NOT NULL,
	"last_tick_jobs" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL
);
