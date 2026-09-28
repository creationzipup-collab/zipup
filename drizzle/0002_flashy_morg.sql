CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_translations" (
	"hash" text PRIMARY KEY NOT NULL,
	"source_lang" text NOT NULL,
	"target_lang" text NOT NULL,
	"source" text NOT NULL,
	"segments" jsonb NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"prompt" text NOT NULL,
	"note" text,
	"model_id" text,
	"params" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "draft_id" text;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "draft_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "seed" bigint;--> statement-breakpoint
ALTER TABLE "model_settings" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD COLUMN "latest_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_preset_id_prompt_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."prompt_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_at_index" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_id_index" ON "ai_usage" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_preset_version_uq" ON "prompt_versions" USING btree ("preset_id","version");--> statement-breakpoint
-- 기존 프롬프트를 v1으로 기록
INSERT INTO "prompt_versions" ("preset_id", "version", "prompt", "model_id", "params", "created_by", "created_at")
SELECT "id", 1, "prompt", "model_id", "params", "user_id", "created_at" FROM "prompt_presets";
