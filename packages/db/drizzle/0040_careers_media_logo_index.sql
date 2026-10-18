-- Online-safe: CONCURRENTLY runs outside a transaction (see docs/MIGRATIONS.md), so the statement is idempotent.
-- At most one logo per organization.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "careers_media_org_logo_uidx" ON "careers_media" USING btree ("organization_id") WHERE "careers_media"."is_logo";
