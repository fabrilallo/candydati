CREATE TABLE "sourced_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"headline" text,
	"location" text,
	"source" text NOT NULL,
	"profile_url" text NOT NULL,
	"profile_key" text NOT NULL,
	"email" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'found' NOT NULL,
	"notice_token_hash" text NOT NULL,
	"notice_sent_at" timestamp with time zone,
	"contacted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sourcing_objection" (
	"organization_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sourcing_objection_organization_id_fingerprint_pk" PRIMARY KEY("organization_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "organization_setting" ADD COLUMN "sourcing_notice_by_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sourced_contact" ADD CONSTRAINT "sourced_contact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourced_contact" ADD CONSTRAINT "sourced_contact_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_objection" ADD CONSTRAINT "sourcing_objection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sourced_contact_job_profile_uidx" ON "sourced_contact" USING btree ("organization_id","job_id","profile_key");--> statement-breakpoint
CREATE INDEX "sourced_contact_org_profile_idx" ON "sourced_contact" USING btree ("organization_id","profile_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sourced_contact_notice_uidx" ON "sourced_contact" USING btree ("notice_token_hash");--> statement-breakpoint
CREATE INDEX "sourced_contact_expires_idx" ON "sourced_contact" USING btree ("expires_at");