-- Online-safe: CONCURRENTLY runs outside a transaction (see docs/MIGRATIONS.md), so every statement is idempotent.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_log_org_action_occurred_at_idx" ON "audit_log" USING btree ("organization_id","action","occurred_at" desc);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "application_careers_created_idx" ON "application" USING btree ("organization_id","created_at") WHERE "application"."source" = 'careers_page';--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "application_retention_idx" ON "application" USING btree ("retention_expires_at","id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidate_org_last_applied_idx" ON "candidate" USING btree ("organization_id","last_applied_at" desc nulls last,"id");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidate_name_trgm_idx" ON "candidate" USING gin (("first_name" || ' ' || "last_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidate_email_trgm_idx" ON "candidate" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "candidate_tags_trgm_idx" ON "candidate" USING gin (candidate_tags_text("tags") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "message_org_candidate_outbound_idx" ON "message" USING btree ("organization_id","candidate_id","created_at") WHERE "message"."direction" = 'outbound';--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notification_unemailed_idx" ON "notification" USING btree ("created_at") WHERE "notification"."emailed_at" is null;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notification_unread_idx" ON "notification" USING btree ("organization_id","user_id") WHERE "notification"."read_at" is null;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "outbox_event_org_candidate_idx" ON "outbox_event" USING btree ("organization_id",("data" ->> 'candidateId'));--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "outbox_event_org_application_idx" ON "outbox_event" USING btree ("organization_id",("data" ->> 'applicationId'));--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "webhook_delivery_success_uidx" ON "webhook_delivery" USING btree ("endpoint_id","event_id") WHERE "webhook_delivery"."status" = 'success';
