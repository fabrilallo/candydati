-- Parts of a connector fetch (ADR 0009, Phase 6). Nullable columns with no default: no table rewrite. The check is added
-- NOT VALID (no scan under the lock) and validated by 0036 (docs/MIGRATIONS.md, rules 2 and 5).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "migration_batch" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "migration_batch" ADD COLUMN "part" integer;--> statement-breakpoint
ALTER TABLE "migration_batch" ADD CONSTRAINT "migration_batch_part_check" CHECK (("migration_batch"."group_id" is null) = ("migration_batch"."part" is null) and ("migration_batch"."part" is null or "migration_batch"."part" >= 1)) NOT VALID;
