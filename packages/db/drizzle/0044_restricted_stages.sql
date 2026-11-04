CREATE TABLE "job_stage_restriction" (
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"restricted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_stage_restriction_pk" PRIMARY KEY("organization_id","job_id","stage_id")
);
--> statement-breakpoint
ALTER TABLE "candidate_note" ADD COLUMN "stage_id" text;--> statement-breakpoint
ALTER TABLE "job_stage_restriction" ADD CONSTRAINT "job_stage_restriction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_restriction" ADD CONSTRAINT "job_stage_restriction_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;