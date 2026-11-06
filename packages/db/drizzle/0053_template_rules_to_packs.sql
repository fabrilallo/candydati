-- Job templates stop holding rules: each template that has some gets one automation pack with them, linked to it.
-- A stage id becomes the type of that stage in the template's process (`received` stays). A rule whose stage is gone,
-- or a proposed move whose target is gone, received or the rule's own type, cannot be placed and is dropped.
CREATE TEMP TABLE "template_rule_anchor" ON COMMIT DROP AS
SELECT
  a.*,
  CASE WHEN a."stage_id" = 'received' THEN 'received' ELSE (
    SELECT el.value ->> 'type' FROM jsonb_array_elements(jt."content" -> 'process') WITH ORDINALITY AS el(value, ord)
    WHERE COALESCE(el.value ->> 'id', 'stage-' || (el.ord - 1)) = a."stage_id" LIMIT 1
  ) END AS "anchor",
  CASE WHEN a."action" = 'propose_move' THEN (
    SELECT el.value ->> 'type' FROM jsonb_array_elements(jt."content" -> 'process') WITH ORDINALITY AS el(value, ord)
    WHERE COALESCE(el.value ->> 'id', 'stage-' || (el.ord - 1)) = a."config" ->> 'toStageId' LIMIT 1
  ) END AS "move_anchor"
FROM "job_template_automation" a
JOIN "job_template" jt ON jt."id" = a."template_id" AND jt."organization_id" = a."organization_id"
WHERE jsonb_typeof(jt."content" -> 'process') = 'array';
--> statement-breakpoint
DELETE FROM "template_rule_anchor"
WHERE "anchor" IS NULL OR ("action" = 'propose_move' AND ("move_anchor" IS NULL OR "move_anchor" = "anchor"));
--> statement-breakpoint
-- "<template> (template)", numbered when that name is taken in the organization (pack names are unique, ignoring case).
CREATE TEMP TABLE "template_pack" ON COMMIT DROP AS
SELECT
  t."id" AS "template_id",
  t."organization_id",
  t."created_by",
  left(t."name", 60) AS "base",
  row_number() OVER (PARTITION BY t."organization_id", lower(left(t."name", 60)) ORDER BY t."created_at", t."id")
    + CASE WHEN EXISTS (
        SELECT 1 FROM "automation_pack" p WHERE p."organization_id" = t."organization_id" AND lower(p."name") = lower(left(t."name", 60) || ' (template)')
      ) THEN 1 ELSE 0 END AS "n"
FROM "job_template" t
WHERE EXISTS (SELECT 1 FROM "template_rule_anchor" r WHERE r."template_id" = t."id");
--> statement-breakpoint
INSERT INTO "automation_pack" ("id", "organization_id", "name", "description", "created_by", "created_at", "updated_at")
SELECT 'tplpack_' || "template_id", "organization_id",
  CASE WHEN "n" = 1 THEN "base" || ' (template)' ELSE "base" || ' (template ' || "n" || ')' END,
  '', "created_by", now(), now()
FROM "template_pack";
--> statement-breakpoint
INSERT INTO "automation_pack_rule" ("id", "organization_id", "pack_id", "stage_anchor", "trigger", "trigger_config", "conditions", "action", "config", "enabled", "created_by", "created_at")
SELECT "id", "organization_id", 'tplpack_' || "template_id", "anchor", "trigger", "trigger_config", "conditions", "action",
  CASE WHEN "action" = 'propose_move' THEN jsonb_set("config", '{toStageId}', to_jsonb("move_anchor")) ELSE "config" END,
  "enabled", "created_by", "created_at"
FROM "template_rule_anchor";
--> statement-breakpoint
INSERT INTO "job_template_pack" ("organization_id", "template_id", "pack_id", "position")
SELECT "organization_id", "template_id", 'tplpack_' || "template_id", 0 FROM "template_pack";
--> statement-breakpoint
DROP TABLE "template_rule_anchor";
--> statement-breakpoint
DROP TABLE "template_pack";
--> statement-breakpoint
DROP TABLE "job_template_automation" CASCADE;
