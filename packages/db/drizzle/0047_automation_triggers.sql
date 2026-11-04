DROP INDEX "automation_execution_entry_uq";--> statement-breakpoint
ALTER TABLE "automation_execution" ADD COLUMN "occurrence" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD COLUMN "trigger" text DEFAULT 'stage_entered' NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD COLUMN "trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD COLUMN "conditions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_execution_occurrence_uq" ON "automation_execution" USING btree ("rule_id","application_id","stage_id","stage_entered_at","occurrence");--> statement-breakpoint
CREATE INDEX "automation_rule_enabled_trigger_idx" ON "automation_rule" USING btree ("trigger") WHERE "automation_rule"."enabled";