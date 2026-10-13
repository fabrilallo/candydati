CREATE TABLE "automation_execution" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"application_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"stage_entered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_execution" ADD CONSTRAINT "automation_execution_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_execution" ADD CONSTRAINT "automation_execution_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_execution" ADD CONSTRAINT "automation_execution_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_execution_entry_uq" ON "automation_execution" USING btree ("rule_id","application_id","stage_id","stage_entered_at");