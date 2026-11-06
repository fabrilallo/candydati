CREATE TABLE "automation_pack" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_pack_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"stage_anchor" text NOT NULL,
	"trigger" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_template_pack" (
	"organization_id" text NOT NULL,
	"template_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "job_template_pack_template_id_pack_id_pk" PRIMARY KEY("template_id","pack_id")
);
--> statement-breakpoint
ALTER TABLE "automation_rule" ADD COLUMN "pack_id" text;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD COLUMN "pack_rule_id" text;--> statement-breakpoint
ALTER TABLE "automation_pack" ADD CONSTRAINT "automation_pack_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_pack_rule" ADD CONSTRAINT "automation_pack_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_pack_rule" ADD CONSTRAINT "automation_pack_rule_pack_id_automation_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."automation_pack"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template_pack" ADD CONSTRAINT "job_template_pack_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template_pack" ADD CONSTRAINT "job_template_pack_template_id_job_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."job_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template_pack" ADD CONSTRAINT "job_template_pack_pack_id_automation_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."automation_pack"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_pack_org_name_uidx" ON "automation_pack" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "automation_pack_rule_org_pack_idx" ON "automation_pack_rule" USING btree ("organization_id","pack_id");--> statement-breakpoint
CREATE INDEX "job_template_pack_org_pack_idx" ON "job_template_pack" USING btree ("organization_id","pack_id");--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_pack_id_automation_pack_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."automation_pack"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_pack_rule_id_automation_pack_rule_id_fk" FOREIGN KEY ("pack_rule_id") REFERENCES "public"."automation_pack_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_rule_job_pack_idx" ON "automation_rule" USING btree ("organization_id","job_id","pack_id") WHERE "automation_rule"."pack_id" is not null;