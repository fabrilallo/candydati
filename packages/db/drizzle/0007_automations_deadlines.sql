CREATE TABLE "automation_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"action" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"application_id" text,
	"job_id" text,
	"task_id" text,
	"dedupe_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text,
	"job_id" text,
	"title" text NOT NULL,
	"assignee_id" text NOT NULL,
	"due_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"response_code" integer,
	"attempt" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_rule_org_job_stage_idx" ON "automation_rule" USING btree ("organization_id","job_id","stage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_org_user_dedupe_uidx" ON "notification" USING btree ("organization_id","user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_org_user_created_idx" ON "notification" USING btree ("organization_id","user_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "outbox_event_unpublished_idx" ON "outbox_event" USING btree ("occurred_at") WHERE "outbox_event"."published_at" is null;--> statement-breakpoint
CREATE INDEX "outbox_event_org_idx" ON "outbox_event" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "task_org_assignee_idx" ON "task" USING btree ("organization_id","assignee_id","completed_at");--> statement-breakpoint
CREATE INDEX "task_org_application_idx" ON "task" USING btree ("organization_id","application_id");--> statement-breakpoint
CREATE INDEX "task_open_due_idx" ON "task" USING btree ("due_at") WHERE "task"."completed_at" is null and "task"."due_at" is not null;--> statement-breakpoint
CREATE INDEX "webhook_delivery_endpoint_created_idx" ON "webhook_delivery" USING btree ("organization_id","endpoint_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "webhook_endpoint_org_idx" ON "webhook_endpoint" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "application_awaiting_response_idx" ON "application" USING btree ("organization_id","response_due_at") WHERE "application"."outcome" is null and "application"."response_due_at" is not null;
--> statement-breakpoint
-- Backfill: every open application gets the deadline of its current stage (stage_changed_at + the job's responseDays).
UPDATE "application" AS a
SET "response_due_at" = a."stage_changed_at" + make_interval(days => (j."content" ->> 'responseDays')::int)
FROM "job" AS j
WHERE j."id" = a."job_id"
  AND a."outcome" IS NULL
  AND jsonb_typeof(j."content" -> 'responseDays') = 'number';
--> statement-breakpoint
-- Already answered in the current stage: a person sent a message (not the automatic receipt) after the last stage change.
UPDATE "application" AS a
SET "responded_at" = answered."sent_at", "response_due_at" = NULL
FROM (
  SELECT m."application_id", max(m."sent_at") AS "sent_at"
  FROM "message" AS m
  JOIN "application" AS ap ON ap."id" = m."application_id"
  WHERE m."direction" = 'outbound' AND m."status" = 'sent' AND m."sent_by" IS DISTINCT FROM 'system'
    AND m."sent_at" >= ap."stage_changed_at"
  GROUP BY m."application_id"
) AS answered
WHERE answered."application_id" = a."id" AND a."outcome" IS NULL;
--> statement-breakpoint
-- Decided applications count as answered at the moment they were closed.
UPDATE "application" SET "responded_at" = "closed_at" WHERE "outcome" IS NOT NULL AND "closed_at" IS NOT NULL;
