ALTER TABLE "application" ADD COLUMN "reconfirmation_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "dead_at" timestamp with time zone;--> statement-breakpoint
-- Imported people already asked before this column existed: the first system email that went out to them.
UPDATE "application" AS a SET "reconfirmation_sent_at" = m."sent_at"
FROM (
  SELECT "application_id", min("sent_at") AS "sent_at" FROM "message"
  WHERE "direction" = 'outbound' AND "sent_by" = 'system' AND "status" = 'sent' AND "sent_at" IS NOT NULL
  GROUP BY "application_id"
) AS m
WHERE a."id" = m."application_id" AND a."consent_status" = 'to_renew';
