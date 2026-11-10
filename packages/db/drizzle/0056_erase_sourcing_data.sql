-- External sourcing was removed before release: no feature reads these rows any more, so nothing would expire them or
-- let the people in them see or erase them. They hold personal data (people found outside the organization), so they
-- are erased here. The tables and the organization_setting columns stay until a later release drops them, because the
-- previous version still reads them during a deploy (docs/MIGRATIONS.md rule 1). A handful of rows: inline is fine.
DELETE FROM "sourced_contact";--> statement-breakpoint
DELETE FROM "sourcing_objection";--> statement-breakpoint
DELETE FROM "sourcing_risk_acceptance";
