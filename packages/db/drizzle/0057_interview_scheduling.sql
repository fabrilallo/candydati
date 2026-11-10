CREATE TABLE "calendar_feed" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"url_ciphertext" text NOT NULL,
	"host" text NOT NULL,
	"time_zone" text NOT NULL,
	"working_hours" jsonb NOT NULL,
	"busy" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "interview" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"job_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"status" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"mode" text NOT NULL,
	"location" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"token_hash" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"proposed_by" text NOT NULL,
	"booked_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_interviewer" (
	"organization_id" text NOT NULL,
	"interview_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"email" text,
	"name" text NOT NULL,
	CONSTRAINT "interview_interviewer_interview_id_position_pk" PRIMARY KEY("interview_id","position")
);
--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview" ADD CONSTRAINT "interview_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview" ADD CONSTRAINT "interview_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview" ADD CONSTRAINT "interview_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_interviewer" ADD CONSTRAINT "interview_interviewer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_interviewer" ADD CONSTRAINT "interview_interviewer_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interview_token_hash_uidx" ON "interview" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_open_per_stage_uidx" ON "interview" USING btree ("organization_id","application_id","stage_id") WHERE "interview"."status" in ('proposed', 'booked');--> statement-breakpoint
CREATE INDEX "interview_org_application_idx" ON "interview" USING btree ("organization_id","application_id");--> statement-breakpoint
CREATE INDEX "interview_org_status_starts_idx" ON "interview" USING btree ("organization_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "interview_interviewer_org_user_idx" ON "interview_interviewer" USING btree ("organization_id","user_id");