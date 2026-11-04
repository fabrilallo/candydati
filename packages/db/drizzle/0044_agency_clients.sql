CREATE TABLE "client" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"logo_url" text,
	"contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_shortlist" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"job_id" text NOT NULL,
	"client_id" text NOT NULL,
	"recipient_contact_id" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"first_opened_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_shortlist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shortlist_id" text NOT NULL,
	"application_id" text NOT NULL,
	"position" integer NOT NULL,
	"share_cv" boolean DEFAULT false NOT NULL,
	"shared_note_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answer" text,
	"answer_reason" text,
	"answered_at" timestamp with time zone,
	"candidate_notified_at" timestamp with time zone,
	CONSTRAINT "client_shortlist_item_answer_check" CHECK ("client_shortlist_item"."answer" is null or "client_shortlist_item"."answer" in ('meet', 'not_for_us'))
);
--> statement-breakpoint
CREATE TABLE "job_client" (
	"job_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" text NOT NULL,
	"display" text DEFAULT 'named' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_client_display_check" CHECK ("job_client"."display" in ('named', 'confidential'))
);
--> statement-breakpoint
ALTER TABLE "organization_setting" ADD COLUMN "recruits_for_clients" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_setting" ADD COLUMN "agency_authorization" text;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_shortlist" ADD CONSTRAINT "client_shortlist_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_shortlist" ADD CONSTRAINT "client_shortlist_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_shortlist" ADD CONSTRAINT "client_shortlist_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_shortlist_item" ADD CONSTRAINT "client_shortlist_item_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_shortlist_item" ADD CONSTRAINT "client_shortlist_item_shortlist_id_client_shortlist_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."client_shortlist"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_shortlist_item" ADD CONSTRAINT "client_shortlist_item_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_client" ADD CONSTRAINT "job_client_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_client" ADD CONSTRAINT "job_client_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_client" ADD CONSTRAINT "job_client_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_org_name_uidx" ON "client" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "client_shortlist_token_hash_uidx" ON "client_shortlist" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "client_shortlist_org_job_idx" ON "client_shortlist" USING btree ("organization_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_shortlist_item_shortlist_application_uidx" ON "client_shortlist_item" USING btree ("shortlist_id","application_id");--> statement-breakpoint
CREATE INDEX "client_shortlist_item_org_application_idx" ON "client_shortlist_item" USING btree ("organization_id","application_id");--> statement-breakpoint
CREATE INDEX "job_client_org_client_idx" ON "job_client" USING btree ("organization_id","client_id");