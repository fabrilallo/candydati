CREATE TABLE "interview_calendar_event" (
	"organization_id" text NOT NULL,
	"interview_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_calendar_event_organization_id_interview_id_pk" PRIMARY KEY("organization_id","interview_id")
);
--> statement-breakpoint
DROP TABLE "video_room" CASCADE;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "time_zone" text DEFAULT 'Europe/Rome' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "working_hours" jsonb DEFAULT '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "busy" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_connection" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interview_calendar_event" ADD CONSTRAINT "interview_calendar_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_calendar_event" ADD CONSTRAINT "interview_calendar_event_interview_id_interview_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interview"("id") ON DELETE cascade ON UPDATE no action;