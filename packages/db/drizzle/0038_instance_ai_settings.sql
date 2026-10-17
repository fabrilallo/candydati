CREATE TABLE "instance_ai_settings" (
	"slot" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"secret_ciphertext" text,
	"assistant_model" text,
	"fast_model" text,
	"verified_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "instance_ai_settings" ADD CONSTRAINT "instance_ai_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;