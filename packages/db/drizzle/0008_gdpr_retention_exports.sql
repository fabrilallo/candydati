CREATE TABLE "data_export" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"warned" integer DEFAULT 0 NOT NULL,
	"erased" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_run" ADD CONSTRAINT "retention_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_export_org_created_idx" ON "data_export" USING btree ("organization_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "retention_run_org_started_idx" ON "retention_run" USING btree ("organization_id","started_at" desc);