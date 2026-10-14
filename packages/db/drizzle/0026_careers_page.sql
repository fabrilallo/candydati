CREATE TABLE "careers_media" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"widths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alt" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "careers_media_organization_id_id_pk" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "careers_media_kind_check" CHECK ("careers_media"."kind" in ('image', 'video'))
);
--> statement-breakpoint
CREATE TABLE "careers_page" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"draft_updated_at" timestamp with time zone NOT NULL,
	"draft_updated_by" text NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text
);
--> statement-breakpoint
ALTER TABLE "careers_media" ADD CONSTRAINT "careers_media_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "careers_page" ADD CONSTRAINT "careers_page_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "careers_media_org_created_idx" ON "careers_media" USING btree ("organization_id","created_at");