ALTER TABLE "prompt_presets" ADD COLUMN "origin_project_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD COLUMN "origin_cut_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD CONSTRAINT "prompt_presets_origin_project_id_projects_id_fk" FOREIGN KEY ("origin_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD CONSTRAINT "prompt_presets_origin_cut_id_cuts_id_fk" FOREIGN KEY ("origin_cut_id") REFERENCES "public"."cuts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_presets_origin_project_id_origin_cut_id_index" ON "prompt_presets" USING btree ("origin_project_id","origin_cut_id");--> statement-breakpoint
-- 예전 라이브러리 프롬프트의 출처: 함께 보낸 클립의 프로젝트·컷
UPDATE "prompt_presets" p
SET "origin_project_id" = a."project_id", "origin_cut_id" = a."cut_id"
FROM "assets" a
WHERE a."id" = p."source_asset_id" AND p."origin_project_id" IS NULL AND p."project_id" IS NULL;
