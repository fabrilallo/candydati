CREATE TABLE "job_template_automation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text NOT NULL,
	"stage_id" text NOT NULL,
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
CREATE TABLE "move_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"job_id" text NOT NULL,
	"rule_id" text,
	"from_stage_id" text NOT NULL,
	"to_stage_id" text NOT NULL,
	"proposed_by" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "job_template_automation" ADD CONSTRAINT "job_template_automation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_template_automation" ADD CONSTRAINT "job_template_automation_template_id_job_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."job_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_proposal" ADD CONSTRAINT "move_proposal_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_proposal" ADD CONSTRAINT "move_proposal_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_proposal" ADD CONSTRAINT "move_proposal_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_proposal" ADD CONSTRAINT "move_proposal_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_template_automation_org_template_idx" ON "job_template_automation" USING btree ("organization_id","template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "move_proposal_open_application_uidx" ON "move_proposal" USING btree ("organization_id","application_id") WHERE "move_proposal"."status" = 'open';--> statement-breakpoint
CREATE INDEX "move_proposal_org_job_status_idx" ON "move_proposal" USING btree ("organization_id","job_id","status");--> statement-breakpoint
CREATE INDEX "move_proposal_open_expires_idx" ON "move_proposal" USING btree ("expires_at") WHERE "move_proposal"."status" = 'open';