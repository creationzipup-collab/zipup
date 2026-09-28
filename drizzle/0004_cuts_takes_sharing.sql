CREATE TABLE "cuts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text,
	"note" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"assignee_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"take_seq" integer DEFAULT 0 NOT NULL,
	"cover_asset_id" uuid,
	"created_by" text NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prompt_presets" ALTER COLUMN "visibility" SET DEFAULT 'private';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "cut_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "take" integer;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "cut_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD COLUMN "shared_by" text;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD COLUMN "source_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "cuts" ADD CONSTRAINT "cuts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuts" ADD CONSTRAINT "cuts_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuts" ADD CONSTRAINT "cuts_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cuts_project_id_position_index" ON "cuts" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "cuts_project_code_uq" ON "cuts" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "cuts_assignee_id_index" ON "cuts" USING btree ("assignee_id");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_cut_id_cuts_id_fk" FOREIGN KEY ("cut_id") REFERENCES "public"."cuts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD CONSTRAINT "prompt_presets_shared_by_user_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD CONSTRAINT "prompt_presets_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_cut_id_take_index" ON "assets" USING btree ("cut_id","take");--> statement-breakpoint
CREATE INDEX "generations_cut_id_status_index" ON "generations" USING btree ("cut_id","status");--> statement-breakpoint
CREATE INDEX "prompt_presets_shared_at_index" ON "prompt_presets" USING btree ("shared_at");