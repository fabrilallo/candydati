-- The organization's logo as an image of its careers library. A constant default: no table rewrite (docs/MIGRATIONS.md,
-- rule 2). Its unique index (one logo per organization) is built concurrently by 0040 (rule 4).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "careers_media" ADD COLUMN "is_logo" boolean DEFAULT false NOT NULL;
