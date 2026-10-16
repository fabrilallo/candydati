-- Migration storage (ADR 0009). New tables, nullable columns and constant defaults: no table rewrite.
-- Constraints on existing tables are added NOT VALID (cheap) and validated by 0029; indexes on existing tables are
-- built by 0030 outside a transaction (docs/MIGRATIONS.md, rules 4 and 5).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "migration_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"status" text NOT NULL,
	"source_system" text NOT NULL,
	"producer" text NOT NULL,
	"connector_maturity" text NOT NULL,
	"created_by" text NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stage_mapping" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_jobs" text[] DEFAULT '{}'::text[] NOT NULL,
	"declarations" jsonb,
	"package_key" text NOT NULL,
	"credentials_ciphertext" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	CONSTRAINT "migration_batch_status_check" CHECK ("migration_batch"."status" in ('uploaded', 'fetching', 'analyzing', 'ready', 'importing', 'done', 'failed', 'undone')),
	CONSTRAINT "migration_batch_maturity_check" CHECK ("migration_batch"."connector_maturity" in ('beta', 'stable', 'package'))
);--> statement-breakpoint
CREATE TABLE "migration_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"level" text NOT NULL,
	"code" text NOT NULL,
	"ref" text,
	"detail" text,
	CONSTRAINT "migration_issue_level_check" CHECK ("migration_issue"."level" in ('error', 'warning', 'info'))
);--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "cv_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "cv_file_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "cv_media_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "cv_size_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_note" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "origin" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "migration_batch_id" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "migration_batch_id" text;--> statement-breakpoint
ALTER TABLE "candidate" ADD COLUMN "migration_batch_id" text;--> statement-breakpoint
ALTER TABLE "candidate_note" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "candidate_note" ADD COLUMN "migration_batch_id" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "historical" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "migration_batch_id" text;--> statement-breakpoint
ALTER TABLE "application_stage_event" ADD COLUMN "migration_batch_id" text;--> statement-breakpoint
ALTER TABLE "migration_batch" ADD CONSTRAINT "migration_batch_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_issue" ADD CONSTRAINT "migration_issue_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migration_issue" ADD CONSTRAINT "migration_issue_batch_id_migration_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."migration_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "migration_batch_org_created_idx" ON "migration_batch" USING btree ("organization_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "migration_issue_org_batch_level_idx" ON "migration_issue" USING btree ("organization_id","batch_id","level");--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_migration_batch_id_migration_batch_id_fk" FOREIGN KEY ("migration_batch_id") REFERENCES "public"."migration_batch"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_migration_batch_id_migration_batch_id_fk" FOREIGN KEY ("migration_batch_id") REFERENCES "public"."migration_batch"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_migration_batch_id_migration_batch_id_fk" FOREIGN KEY ("migration_batch_id") REFERENCES "public"."migration_batch"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "candidate_note" ADD CONSTRAINT "candidate_note_migration_batch_id_migration_batch_id_fk" FOREIGN KEY ("migration_batch_id") REFERENCES "public"."migration_batch"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_migration_batch_id_migration_batch_id_fk" FOREIGN KEY ("migration_batch_id") REFERENCES "public"."migration_batch"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "application_stage_event" ADD CONSTRAINT "application_stage_event_migration_batch_id_migration_batch_id_fk" FOREIGN KEY ("migration_batch_id") REFERENCES "public"."migration_batch"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_origin_check" CHECK ("job"."origin" in ('app', 'migration')) NOT VALID;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_cv_check" CHECK (("application"."cv_key" is not null and "application"."cv_file_name" is not null and "application"."cv_media_type" is not null and "application"."cv_size_bytes" is not null) or ("application"."migration_batch_id" is not null and "application"."cv_key" is null and "application"."cv_file_name" is null and "application"."cv_media_type" is null and "application"."cv_size_bytes" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "candidate_note" ADD CONSTRAINT "candidate_note_author_check" CHECK ("candidate_note"."author_id" is not null or coalesce(length(btrim("candidate_note"."author_name")), 0) > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_historical_check" CHECK (not "message"."historical" or "message"."status" in ('sent', 'received')) NOT VALID;