-- Keys created before every key had an expiry: creation date plus the default TTL (90 days), never later than a year
-- from now. A key that old is expired from now on, as the documented lifetime says.
UPDATE "api_key" SET "expires_at" = least("created_at" + interval '90 days', now() + interval '365 days') WHERE "expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "api_key" ALTER COLUMN "expires_at" SET NOT NULL;
