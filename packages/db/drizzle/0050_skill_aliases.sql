CREATE TABLE "skill_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"skill" text NOT NULL,
	"alias" text NOT NULL,
	"alias_key" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_alias_text_check" CHECK (char_length("skill_alias"."skill") between 1 and 60 and char_length("skill_alias"."alias") between 1 and 60 and char_length("skill_alias"."alias_key") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "skill_alias_disabled" (
	"organization_id" text NOT NULL,
	"alias_key" text NOT NULL,
	"disabled_by" text NOT NULL,
	"disabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_alias_disabled_organization_id_alias_key_pk" PRIMARY KEY("organization_id","alias_key"),
	CONSTRAINT "skill_alias_disabled_key_check" CHECK (char_length("skill_alias_disabled"."alias_key") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "skill_alias" ADD CONSTRAINT "skill_alias_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_alias_disabled" ADD CONSTRAINT "skill_alias_disabled_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_alias_org_key_uidx" ON "skill_alias" USING btree ("organization_id","alias_key");--> statement-breakpoint
CREATE INDEX "skill_alias_org_idx" ON "skill_alias" USING btree ("organization_id");