CREATE TABLE "job_team_member" (
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"added_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_team_member_pk" PRIMARY KEY("organization_id","job_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "organization_setting" ADD COLUMN "restrict_recruiters_to_team" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_team_member" ADD CONSTRAINT "job_team_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_team_member" ADD CONSTRAINT "job_team_member_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_team_member_org_user_idx" ON "job_team_member" USING btree ("organization_id","user_id");--> statement-breakpoint
-- Backfill (small and bounded: one row per job and referenced person; MIGRATIONS.md rule 3 allows it inline).
-- Existing data keeps working: the creator of each job, and every hiring manager or interviewer referenced by a job
-- (feedback asked of them, a task assigned to them about the job, the request the job was made from), joins its team.
-- Stage interviewers need no row: they are team members implicitly (job_stage_interviewer is read with the team).
-- Only current members of the organization are added; the team role follows their organization role.
INSERT INTO "job_team_member" ("organization_id", "job_id", "user_id", "role", "added_by", "created_at")
SELECT DISTINCT ON (ref."organization_id", ref."job_id", ref."user_id")
  ref."organization_id", ref."job_id", ref."user_id",
  CASE m."role" WHEN 'hiring_manager' THEN 'hiring_manager' WHEN 'interviewer' THEN 'interviewer' ELSE 'recruiter' END,
  'system', now()
FROM (
  SELECT "organization_id", "id" AS "job_id", "created_by" AS "user_id", false AS "restricted_only" FROM "job"
  UNION ALL
  SELECT "organization_id", "job_id", "interviewer_user_id", true FROM "feedback_request" WHERE "interviewer_user_id" IS NOT NULL
  UNION ALL
  SELECT "organization_id", "job_id", "assignee_id", true FROM "task" WHERE "job_id" IS NOT NULL
  UNION ALL
  SELECT "organization_id", "job_id", "requested_by", true FROM "job_request" WHERE "job_id" IS NOT NULL
) ref
JOIN "member" m ON m."organization_id" = ref."organization_id" AND m."user_id" = ref."user_id"
WHERE NOT ref."restricted_only" OR m."role" IN ('hiring_manager', 'interviewer')
ON CONFLICT DO NOTHING;
