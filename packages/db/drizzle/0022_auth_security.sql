CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"first_failure_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_security_setting" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"require_two_factor" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "usage_counter" (
	"scope" text NOT NULL,
	"subject" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counter_scope_subject_day_pk" PRIMARY KEY("scope","subject","day")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization_security_setting" ADD CONSTRAINT "organization_security_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_throttle_last_at_idx" ON "auth_throttle" USING btree ("last_at");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_counter_day_idx" ON "usage_counter" USING btree ("day");