CREATE TABLE "application" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"outcome" text,
	"message" text DEFAULT '' NOT NULL,
	"cv_key" text NOT NULL,
	"cv_file_name" text NOT NULL,
	"cv_media_type" text NOT NULL,
	"cv_size_bytes" integer NOT NULL,
	"consent" jsonb NOT NULL,
	"retention_expires_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "candidate" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"linkedin_url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"talent_pool" boolean DEFAULT false NOT NULL,
	"retention_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_note" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"application_id" text,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_extraction" (
	"application_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"status" text NOT NULL,
	"text" text,
	"data" jsonb,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text, ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "privacy_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"version" integer NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"contact_email" text NOT NULL,
	"retention_days" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_note" ADD CONSTRAINT "candidate_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_note" ADD CONSTRAINT "candidate_note_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_note" ADD CONSTRAINT "candidate_note_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_extraction" ADD CONSTRAINT "cv_extraction_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_extraction" ADD CONSTRAINT "cv_extraction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_notice" ADD CONSTRAINT "privacy_notice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_job_candidate_open_uidx" ON "application" USING btree ("job_id","candidate_id") WHERE "application"."outcome" is null;--> statement-breakpoint
CREATE INDEX "application_org_job_idx" ON "application" USING btree ("organization_id","job_id");--> statement-breakpoint
CREATE INDEX "application_org_candidate_idx" ON "application" USING btree ("organization_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_org_email_uidx" ON "candidate" USING btree ("organization_id",lower("email"));--> statement-breakpoint
CREATE INDEX "candidate_org_created_at_idx" ON "candidate" USING btree ("organization_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "candidate_note_org_candidate_idx" ON "candidate_note" USING btree ("organization_id","candidate_id");--> statement-breakpoint
CREATE INDEX "cv_extraction_search_idx" ON "cv_extraction" USING gin ("search");--> statement-breakpoint
CREATE INDEX "cv_extraction_org_idx" ON "cv_extraction" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_notice_org_version_uidx" ON "privacy_notice" USING btree ("organization_id","version");