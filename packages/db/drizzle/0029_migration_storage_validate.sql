-- Validates the constraints 0028 added NOT VALID. VALIDATE takes a SHARE UPDATE EXCLUSIVE lock: reads and writes go on.
ALTER TABLE "job" VALIDATE CONSTRAINT "job_migration_batch_id_migration_batch_id_fk";--> statement-breakpoint
ALTER TABLE "application" VALIDATE CONSTRAINT "application_migration_batch_id_migration_batch_id_fk";--> statement-breakpoint
ALTER TABLE "candidate" VALIDATE CONSTRAINT "candidate_migration_batch_id_migration_batch_id_fk";--> statement-breakpoint
ALTER TABLE "candidate_note" VALIDATE CONSTRAINT "candidate_note_migration_batch_id_migration_batch_id_fk";--> statement-breakpoint
ALTER TABLE "message" VALIDATE CONSTRAINT "message_migration_batch_id_migration_batch_id_fk";--> statement-breakpoint
ALTER TABLE "application_stage_event" VALIDATE CONSTRAINT "application_stage_event_migration_batch_id_migration_batch_id_fk";--> statement-breakpoint
ALTER TABLE "job" VALIDATE CONSTRAINT "job_origin_check";--> statement-breakpoint
ALTER TABLE "application" VALIDATE CONSTRAINT "application_cv_check";--> statement-breakpoint
ALTER TABLE "candidate_note" VALIDATE CONSTRAINT "candidate_note_author_check";--> statement-breakpoint
ALTER TABLE "message" VALIDATE CONSTRAINT "message_historical_check";