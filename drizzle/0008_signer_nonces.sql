CREATE TABLE "signer_nonces" (
	"address" text PRIMARY KEY NOT NULL,
	"next_nonce" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
