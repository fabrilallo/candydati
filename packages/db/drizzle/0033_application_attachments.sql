-- Application attachments and form answers (migrations from another ATS, ADR 0009). A new, empty table (its indexes
-- and foreign keys cost nothing to build) and a nullable column with no default (no rewrite). The check on the existing
-- `application` table is added NOT VALID and validated by 0034 (docs/MIGRATIONS.md, rule 5).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "application_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"migration_batch_id" text,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_attachment_kind_check" CHECK ("application_attachment"."kind" in ('cover_letter', 'other')),
	CONSTRAINT "application_attachment_media_type_check" CHECK ("application_attachment"."media_type" in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/plain', 'image/png', 'image/jpeg')),
	CONSTRAINT "application_attachment_size_check" CHECK ("application_attachment"."size_bytes" >= 0 and "application_attachment"."size_bytes" <= 10485760),
	CONSTRAINT "application_attachment_key_check" CHECK ("application_attachment"."storage_key" = 'organizations/' || "application_attachment"."organization_id" || '/applications/' || "application_attachment"."application_id" || '/attachments/' || "application_attachment"."id")
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "answers" jsonb;--> statement-breakpoint
ALTER TABLE "application_attachment" ADD CONSTRAINT "application_attachment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_attachment" ADD CONSTRAINT "application_attachment_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_attachment" ADD CONSTRAINT "application_attachment_migration_batch_id_migration_batch_id_fk" FOREIGN KEY ("migration_batch_id") REFERENCES "public"."migration_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_attachment_org_application_idx" ON "application_attachment" USING btree ("organization_id","application_id");--> statement-breakpoint
CREATE INDEX "application_attachment_migration_batch_idx" ON "application_attachment" USING btree ("migration_batch_id") WHERE "application_attachment"."migration_batch_id" is not null;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_answers_check" CHECK ("application"."answers" is null or (jsonb_typeof("application"."answers") = 'array' and octet_length("application"."answers"::text) <= 1048576)) NOT VALID;