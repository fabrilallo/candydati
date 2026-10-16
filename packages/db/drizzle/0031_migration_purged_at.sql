-- Nullable column, no default: no table rewrite (docs/MIGRATIONS.md).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "migration_batch" ADD COLUMN "purged_at" timestamp with time zone;