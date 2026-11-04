CREATE TABLE "job_scorecard_criterion" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"stage_id" text,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_used_at" timestamp with time zone,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD COLUMN "observations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "job_scorecard_criterion" ADD CONSTRAINT "job_scorecard_criterion_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_scorecard_criterion" ADD CONSTRAINT "job_scorecard_criterion_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_scorecard_criterion_org_job_idx" ON "job_scorecard_criterion" USING btree ("organization_id","job_id");