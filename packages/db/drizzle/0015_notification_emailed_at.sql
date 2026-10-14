ALTER TABLE "notification" ADD COLUMN "emailed_at" timestamp with time zone;
--> statement-breakpoint
-- Existing notifications were already handled by the old digest: only new ones are still to send.
UPDATE "notification" SET "emailed_at" = "created_at";
