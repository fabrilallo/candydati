CREATE TABLE "sourcing_risk_acceptance" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text_version" integer NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sourcing_risk_acceptance_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "organization_setting" ADD COLUMN "linkedin_sourcing_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_setting" ADD COLUMN "linkedin_max_per_run" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "sourcing_risk_acceptance" ADD CONSTRAINT "sourcing_risk_acceptance_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;