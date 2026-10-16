-- Online-safe: CONCURRENTLY runs outside a transaction (see docs/MIGRATIONS.md), so every statement is idempotent.
-- The caps index gains `historical = false`: the new one is built under a temporary name, then swapped in.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_org_candidate_outbound_live_idx" ON "message" USING btree ("organization_id","candidate_id","created_at") WHERE "message"."direction" = 'outbound' and "message"."historical" = false;--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS "message_org_candidate_outbound_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "message_org_candidate_outbound_live_idx" RENAME TO "message_org_candidate_outbound_idx";--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "job_migration_batch_idx" ON "job" USING btree ("migration_batch_id") WHERE "job"."migration_batch_id" is not null;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "application_migration_batch_idx" ON "application" USING btree ("migration_batch_id") WHERE "application"."migration_batch_id" is not null;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidate_migration_batch_idx" ON "candidate" USING btree ("migration_batch_id") WHERE "candidate"."migration_batch_id" is not null;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidate_note_migration_batch_idx" ON "candidate_note" USING btree ("migration_batch_id") WHERE "candidate_note"."migration_batch_id" is not null;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_migration_batch_idx" ON "message" USING btree ("migration_batch_id") WHERE "message"."migration_batch_id" is not null;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "application_stage_event_migration_batch_idx" ON "application_stage_event" USING btree ("migration_batch_id") WHERE "application_stage_event"."migration_batch_id" is not null;