CREATE TABLE "job_view_daily" (
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"day" date NOT NULL,
	"source" text NOT NULL,
	"campaign" text DEFAULT '' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "job_view_daily_pk" PRIMARY KEY("organization_id","job_id","day","source","campaign")
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "origin_campaign" text;--> statement-breakpoint
ALTER TABLE "job_view_daily" ADD CONSTRAINT "job_view_daily_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_view_daily" ADD CONSTRAINT "job_view_daily_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_view_daily_day_idx" ON "job_view_daily" USING btree ("day");