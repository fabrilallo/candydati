CREATE TABLE "feedback_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"job_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"interviewer_kind" text NOT NULL,
	"interviewer_user_id" text,
	"interviewer_email" text NOT NULL,
	"interviewer_name" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "interview_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"request_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"interviewer_name" text NOT NULL,
	"answers" jsonb NOT NULL,
	"recommendation" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_stage_interviewer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"email" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"title" text NOT NULL,
	"role" text,
	"seniority" text,
	"reason" text NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"salary_min" integer NOT NULL,
	"salary_max" integer NOT NULL,
	"currency" text NOT NULL,
	"work_mode" text,
	"location" jsonb NOT NULL,
	"desired_start" text,
	"process_notes" text DEFAULT '' NOT NULL,
	"interviewers_notes" text DEFAULT '' NOT NULL,
	"language" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_setting" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"require_approval" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "approval_approved_by" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "approval_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "approval_salary_min" integer;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "approval_salary_max" integer;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "approval_currency" text;--> statement-breakpoint
ALTER TABLE "feedback_request" ADD CONSTRAINT "feedback_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_request" ADD CONSTRAINT "feedback_request_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_request" ADD CONSTRAINT "feedback_request_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_request_id_feedback_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."feedback_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_interviewer" ADD CONSTRAINT "job_stage_interviewer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_interviewer" ADD CONSTRAINT "job_stage_interviewer_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_request" ADD CONSTRAINT "job_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_request" ADD CONSTRAINT "job_request_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_setting" ADD CONSTRAINT "organization_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_request_token_hash_uidx" ON "feedback_request" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "feedback_request_org_application_idx" ON "feedback_request" USING btree ("organization_id","application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_feedback_request_uidx" ON "interview_feedback" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "interview_feedback_org_application_idx" ON "interview_feedback" USING btree ("organization_id","application_id");--> statement-breakpoint
CREATE INDEX "job_stage_interviewer_org_job_idx" ON "job_stage_interviewer" USING btree ("organization_id","job_id");--> statement-breakpoint
CREATE INDEX "job_request_org_status_idx" ON "job_request" USING btree ("organization_id","status","created_at");