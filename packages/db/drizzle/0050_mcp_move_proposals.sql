ALTER TABLE "move_proposal" ADD COLUMN "source" text DEFAULT 'rule' NOT NULL;--> statement-breakpoint
ALTER TABLE "move_proposal" ADD COLUMN "reason" text;