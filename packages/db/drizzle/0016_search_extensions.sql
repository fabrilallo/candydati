-- Trigram search needs the extension and an immutable wrapper (array_to_string is only STABLE, so it cannot be indexed).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE OR REPLACE FUNCTION candidate_tags_text(tags text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string(tags, ' ') $$;--> statement-breakpoint
-- Needed before the unique index of 0018: keep only the first successful delivery of each (endpoint, event).
DELETE FROM "webhook_delivery" d USING "webhook_delivery" k
  WHERE d."status" = 'success' AND k."status" = 'success' AND d."endpoint_id" = k."endpoint_id"
    AND d."event_id" = k."event_id" AND (k."created_at", k."id") < (d."created_at", d."id");
