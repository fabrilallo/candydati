ALTER TABLE "application" ADD COLUMN "submitted_contact" jsonb;--> statement-breakpoint
-- Security cleanup: only http(s) addresses may be stored where the app renders a link (a `javascript:` LinkedIn URL typed
-- on the public form is script on the recruiter app's origin when clicked). Writes touch only the offending rows.
UPDATE "candidate" SET "linkedin_url" = NULL WHERE "linkedin_url" IS NOT NULL AND "linkedin_url" !~* '^https?://';--> statement-breakpoint
UPDATE "organization" SET "logo" = NULL WHERE "logo" IS NOT NULL AND "logo" !~* '^https://';
