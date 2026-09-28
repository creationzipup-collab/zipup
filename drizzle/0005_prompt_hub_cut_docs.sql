CREATE TABLE "prompt_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preset_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preset_id" uuid NOT NULL,
	"from_user_id" text NOT NULL,
	"target" text NOT NULL,
	"to_user_id" text,
	"to_team_id" uuid,
	"message" text,
	"asset_id" uuid,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "prompt_version_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD COLUMN "cut_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_messages" ADD CONSTRAINT "prompt_messages_preset_id_prompt_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."prompt_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_messages" ADD CONSTRAINT "prompt_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_shares" ADD CONSTRAINT "prompt_shares_preset_id_prompt_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."prompt_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_shares" ADD CONSTRAINT "prompt_shares_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_shares" ADD CONSTRAINT "prompt_shares_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_shares" ADD CONSTRAINT "prompt_shares_to_team_id_teams_id_fk" FOREIGN KEY ("to_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_shares" ADD CONSTRAINT "prompt_shares_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_messages_preset_id_created_at_index" ON "prompt_messages" USING btree ("preset_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_shares_preset_id_index" ON "prompt_shares" USING btree ("preset_id");--> statement-breakpoint
CREATE INDEX "prompt_shares_to_user_id_created_at_index" ON "prompt_shares" USING btree ("to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_shares_to_team_id_created_at_index" ON "prompt_shares" USING btree ("to_team_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_shares_from_user_id_created_at_index" ON "prompt_shares" USING btree ("from_user_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_shares_target_created_at_index" ON "prompt_shares" USING btree ("target","created_at");--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD CONSTRAINT "prompt_presets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD CONSTRAINT "prompt_presets_cut_id_cuts_id_fk" FOREIGN KEY ("cut_id") REFERENCES "public"."cuts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generations_prompt_version_id_index" ON "generations" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX "prompt_presets_project_id_cut_id_kind_index" ON "prompt_presets" USING btree ("project_id","cut_id","kind");--> statement-breakpoint
-- 예전 게시판에 올라가 있던 프롬프트를 공유 기록으로 옮겨요 (팀이 없으면 전사)
INSERT INTO "prompt_shares" ("preset_id", "from_user_id", "target", "to_team_id", "asset_id", "created_at")
SELECT p."id",
       coalesce(p."shared_by", p."user_id"),
       CASE WHEN p."visibility" = 'team' AND p."team_id" IS NOT NULL THEN 'team' ELSE 'company' END,
       CASE WHEN p."visibility" = 'team' AND p."team_id" IS NOT NULL THEN p."team_id" ELSE NULL END,
       p."source_asset_id",
       p."shared_at"
FROM "prompt_presets" p
WHERE p."shared_at" IS NOT NULL;
