CREATE TABLE "instance_bootstrap" (
	"slot" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL
);
