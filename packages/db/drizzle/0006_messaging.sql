CREATE TABLE "conversation" (
	"application_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"token" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"sender_name" text NOT NULL,
	"from_address" text,
	"domain" text,
	"domain_status" text,
	"domain_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"direction" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"sent_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"raw_text" text,
	"unverified_sender" boolean DEFAULT false NOT NULL,
	"inbound_message_id" text
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_candidate_id_candidate_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_token_uidx" ON "conversation" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "email_template_org_kind_uidx" ON "email_template" USING btree ("organization_id","kind") WHERE "email_template"."kind" <> 'custom';--> statement-breakpoint
CREATE INDEX "message_org_application_created_idx" ON "message" USING btree ("organization_id","application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_org_inbound_message_id_uidx" ON "message" USING btree ("organization_id","inbound_message_id");