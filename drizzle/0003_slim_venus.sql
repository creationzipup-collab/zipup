CREATE TABLE "lexicon_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source_lang" text NOT NULL,
	"target_lang" text NOT NULL,
	"source" text NOT NULL,
	"result" jsonb NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "units" integer DEFAULT 0 NOT NULL;