-- candidate.last_applied_at replaces a per-row max() subquery in the candidate list. It is the latest created_at of a
-- consented application, kept by a trigger so no code path can forget it.
ALTER TABLE "candidate" ADD COLUMN "last_applied_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION refresh_candidate_last_applied() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE "candidate" SET "last_applied_at" = (
      SELECT max("created_at") FROM "application"
      WHERE "candidate_id" = OLD."candidate_id" AND "consent_status" = 'given')
    WHERE "id" = OLD."candidate_id";
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW."candidate_id" <> OLD."candidate_id") THEN
    UPDATE "candidate" SET "last_applied_at" = (
      SELECT max("created_at") FROM "application"
      WHERE "candidate_id" = NEW."candidate_id" AND "consent_status" = 'given')
    WHERE "id" = NEW."candidate_id";
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "application_refresh_candidate_last_applied"
  AFTER INSERT OR DELETE OR UPDATE OF "candidate_id", "consent_status", "created_at" ON "application"
  FOR EACH ROW EXECUTE FUNCTION refresh_candidate_last_applied();--> statement-breakpoint
-- Backfill. Fine for a small table; on a large one batch it outside the migration (docs/MIGRATIONS.md).
UPDATE "candidate" c SET "last_applied_at" = (
  SELECT max(a."created_at") FROM "application" a WHERE a."candidate_id" = c."id" AND a."consent_status" = 'given');
