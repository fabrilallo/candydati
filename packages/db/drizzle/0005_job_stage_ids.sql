-- Selection stages get a stable id. Existing applications store the positional id `stage-<index>`, so that is the id given.
UPDATE "job" SET "content" = jsonb_set("content", '{process}', (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN jsonb_typeof(el.value) = 'object' AND el.value -> 'id' IS NULL
      THEN el.value || jsonb_build_object('id', 'stage-' || (el.ord - 1))
      ELSE el.value END
    ORDER BY el.ord), '[]'::jsonb)
  FROM jsonb_array_elements("content" -> 'process') WITH ORDINALITY AS el(value, ord)
))
WHERE jsonb_typeof("content" -> 'process') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("content" -> 'process') AS e
    WHERE jsonb_typeof(e) = 'object' AND e -> 'id' IS NULL
  );
--> statement-breakpoint
UPDATE "job_template" SET "content" = jsonb_set("content", '{process}', (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN jsonb_typeof(el.value) = 'object' AND el.value -> 'id' IS NULL
      THEN el.value || jsonb_build_object('id', 'stage-' || (el.ord - 1))
      ELSE el.value END
    ORDER BY el.ord), '[]'::jsonb)
  FROM jsonb_array_elements("content" -> 'process') WITH ORDINALITY AS el(value, ord)
))
WHERE jsonb_typeof("content" -> 'process') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements("content" -> 'process') AS e
    WHERE jsonb_typeof(e) = 'object' AND e -> 'id' IS NULL
  );
