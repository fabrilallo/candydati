CREATE TABLE "application_stage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"job_id" text NOT NULL,
	"from_stage_id" text,
	"to_stage_id" text,
	"outcome" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_type" text NOT NULL,
	"backfilled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_promise" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"job_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"status" text NOT NULL,
	"backfilled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "origin" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_stage_event" ADD CONSTRAINT "application_stage_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_event" ADD CONSTRAINT "application_stage_event_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stage_event" ADD CONSTRAINT "application_stage_event_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_promise" ADD CONSTRAINT "response_promise_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_promise" ADD CONSTRAINT "response_promise_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_promise" ADD CONSTRAINT "response_promise_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_stage_event_org_occurred_idx" ON "application_stage_event" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "application_stage_event_application_idx" ON "application_stage_event" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "response_promise_application_idx" ON "response_promise" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "response_promise_org_due_idx" ON "response_promise" USING btree ("organization_id","due_at");--> statement-breakpoint
CREATE INDEX "response_promise_open_due_idx" ON "response_promise" USING btree ("due_at") WHERE "response_promise"."status" = 'open';--> statement-breakpoint
-- BACKFILL: best effort, rebuilt from audit_log and the current rows. Every rebuilt row is marked backfilled = true.
UPDATE "application" SET "origin" = CASE "source" WHEN 'import' THEN 'import' WHEN 'manual' THEN 'manual' ELSE 'direct' END;--> statement-breakpoint
INSERT INTO "application_stage_event" ("id", "organization_id", "application_id", "job_id", "from_stage_id", "to_stage_id", "outcome", "occurred_at", "actor_type", "backfilled")
SELECT gen_random_uuid()::text, a."organization_id", a."id", a."job_id", NULL, 'received', NULL, a."created_at", 'system', true
FROM "application" a WHERE a."source" <> 'import';--> statement-breakpoint
INSERT INTO "application_stage_event" ("id", "organization_id", "application_id", "job_id", "from_stage_id", "to_stage_id", "outcome", "occurred_at", "actor_type", "backfilled")
SELECT gen_random_uuid()::text, l."organization_id", a."id", a."job_id", l."metadata" ->> 'from', l."metadata" ->> 'to', NULL, l."occurred_at", l."actor_type", true
FROM "audit_log" l JOIN "application" a ON a."id" = l."target_id" AND a."organization_id" = l."organization_id"
WHERE l."action" = 'application.moved' AND l."metadata" ->> 'to' IS NOT NULL;--> statement-breakpoint
INSERT INTO "application_stage_event" ("id", "organization_id", "application_id", "job_id", "from_stage_id", "to_stage_id", "outcome", "occurred_at", "actor_type", "backfilled")
SELECT gen_random_uuid()::text, a."organization_id", a."id", a."job_id", NULL, a."stage_id", NULL, a."stage_changed_at", 'system', true
FROM "application" a
WHERE a."stage_id" <> 'received' AND a."stage_changed_at" > a."created_at"
  AND NOT EXISTS (SELECT 1 FROM "application_stage_event" e WHERE e."application_id" = a."id" AND e."to_stage_id" = a."stage_id" AND e."occurred_at" >= a."stage_changed_at");--> statement-breakpoint
INSERT INTO "application_stage_event" ("id", "organization_id", "application_id", "job_id", "from_stage_id", "to_stage_id", "outcome", "occurred_at", "actor_type", "backfilled")
SELECT gen_random_uuid()::text, l."organization_id", a."id", a."job_id", NULL, NULL, l."metadata" ->> 'outcome', l."occurred_at", l."actor_type", true
FROM "audit_log" l JOIN "application" a ON a."id" = l."target_id" AND a."organization_id" = l."organization_id"
WHERE l."action" = 'application.decided' AND l."metadata" ->> 'outcome' IN ('hired', 'not_selected', 'withdrawn');--> statement-breakpoint
INSERT INTO "application_stage_event" ("id", "organization_id", "application_id", "job_id", "from_stage_id", "to_stage_id", "outcome", "occurred_at", "actor_type", "backfilled")
SELECT gen_random_uuid()::text, a."organization_id", a."id", a."job_id", NULL, NULL, a."outcome", COALESCE(a."closed_at", a."updated_at"), 'system', true
FROM "application" a
WHERE a."outcome" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "application_stage_event" e WHERE e."application_id" = a."id" AND e."outcome" IS NOT NULL);--> statement-breakpoint
INSERT INTO "response_promise" ("id", "organization_id", "application_id", "job_id", "stage_id", "started_at", "due_at", "responded_at", "status", "backfilled")
SELECT gen_random_uuid()::text, s."organization_id", s."application_id", s."job_id", s."stage_id", s."started_at", s."due_at", s."responded_at",
  CASE WHEN s."responded_at" IS NOT NULL THEN (CASE WHEN s."responded_at" <= s."due_at" THEN 'kept' ELSE 'missed' END)
       WHEN s."due_at" < now() THEN 'missed' ELSE 'open' END,
  true
FROM (
  SELECT e."organization_id", e."application_id", e."job_id", e."to_stage_id" AS "stage_id", e."occurred_at" AS "started_at",
    e."occurred_at" + make_interval(days => (j."content" ->> 'responseDays')::int) AS "due_at",
    (SELECT min(t) FROM (
      SELECT min(ev."occurred_at") AS t FROM "application_stage_event" ev WHERE ev."application_id" = e."application_id" AND ev."occurred_at" > e."occurred_at"
      UNION ALL
      SELECT min(m."sent_at") FROM "message" m WHERE m."application_id" = e."application_id" AND m."direction" = 'outbound' AND m."status" = 'sent'
        AND m."sent_by" IS NOT NULL AND m."sent_by" <> 'system' AND m."created_at" >= e."occurred_at" AND m."sent_at" IS NOT NULL
    ) x) AS "responded_at"
  FROM "application_stage_event" e JOIN "job" j ON j."id" = e."job_id"
  WHERE e."to_stage_id" IS NOT NULL AND j."content" ->> 'responseDays' IS NOT NULL
) s;
