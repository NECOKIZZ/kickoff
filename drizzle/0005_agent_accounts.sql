CREATE TYPE "public"."agent_mode" AS ENUM('byok', 'managed');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TABLE "agent_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"owner_wallet" text NOT NULL,
	"signature" text NOT NULL,
	"signed_message" jsonb NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scopes" text[] DEFAULT ARRAY['predict','read']::text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer NOT NULL,
	"agent_user_id" integer NOT NULL,
	"name" text NOT NULL,
	"wallet_address" text NOT NULL,
	"mode" "agent_mode" NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"public_identity" boolean DEFAULT true NOT NULL,
	"soul_md" text,
	"register_tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_links" ADD CONSTRAINT "agent_links_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_agent_user_id_users_id_fk" FOREIGN KEY ("agent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tokens_hash_idx" ON "agent_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "agent_tokens_agent_idx" ON "agent_tokens" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_owner_idx" ON "agents" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_agent_user_idx" ON "agents" USING btree ("agent_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_wallet_idx" ON "agents" USING btree ("wallet_address");