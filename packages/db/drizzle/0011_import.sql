CREATE TABLE "consent_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_analysis" (
	"batch_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"counts" jsonb NOT NULL,
	"mapping" jsonb,
	"headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"position" integer NOT NULL,
	"included" boolean NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"confidence" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "consent_status" text DEFAULT 'given' NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "import_batch_id" text;--> statement-breakpoint
ALTER TABLE "candidate" ADD COLUMN "import_batch_id" text;--> statement-breakpoint
ALTER TABLE "consent_token" ADD CONSTRAINT "consent_token_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_token" ADD CONSTRAINT "consent_token_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_analysis" ADD CONSTRAINT "import_analysis_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_analysis" ADD CONSTRAINT "import_analysis_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_item" ADD CONSTRAINT "import_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_item" ADD CONSTRAINT "import_item_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_token_application_idx" ON "consent_token" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "import_batch_org_created_idx" ON "import_batch" USING btree ("organization_id","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "import_item_batch_position_uidx" ON "import_item" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX "import_item_org_idx" ON "import_item" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_import_batch_idx" ON "application" USING btree ("import_batch_id");