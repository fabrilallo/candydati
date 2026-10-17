CREATE TABLE "instance_email_settings" (
	"slot" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_secure" boolean DEFAULT false NOT NULL,
	"smtp_user" text,
	"secret_ciphertext" text,
	"sending_domain" text NOT NULL,
	"from_local" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "instance_email_settings" ADD CONSTRAINT "instance_email_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;