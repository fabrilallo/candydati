CREATE TABLE "distribution_setting" (
	"organization_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_setting_organization_id_channel_id_pk" PRIMARY KEY("organization_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "job_distribution" (
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"status" text NOT NULL,
	"external_id" text,
	"url" text,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_distribution_organization_id_job_id_channel_id_pk" PRIMARY KEY("organization_id","job_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "distribution_setting" ADD CONSTRAINT "distribution_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_distribution" ADD CONSTRAINT "job_distribution_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_distribution" ADD CONSTRAINT "job_distribution_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_distribution_org_channel_idx" ON "job_distribution" USING btree ("organization_id","channel_id");