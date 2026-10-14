CREATE TABLE "organization_creation_quota" (
	"user_id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"claimed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_bootstrap" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "organization_creation_quota" ADD CONSTRAINT "organization_creation_quota_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_creation_quota" ADD CONSTRAINT "organization_creation_quota_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_bootstrap" ADD CONSTRAINT "instance_bootstrap_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ORGANIZATION_CREATION=one_per_user counts organizations created per account. Before this table it counted the
-- organizations an account owned: every current owner keeps that rule, as having created its earliest one.
INSERT INTO "organization_creation_quota" ("user_id", "organization_id", "claimed_at")
SELECT DISTINCT ON ("user_id") "user_id", "organization_id", "created_at"
FROM "member" WHERE "role" = 'owner' ORDER BY "user_id", "created_at", "organization_id";--> statement-breakpoint
-- An instance bootstrapped before the owner was recorded: its first owner is the confirmed account of the claimed address.
UPDATE "instance_bootstrap" SET "owner_user_id" = "user"."id" FROM "user"
WHERE "user"."email_verified" = true AND lower("user"."email") = "instance_bootstrap"."email" AND "instance_bootstrap"."owner_user_id" IS NULL;
