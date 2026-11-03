-- Better Auth 1.7.3+ no longer writes account.issuer (required by 1.7.0-1.7.2): relax it and drop its unique index, as
-- its 1.7 upgrade guide says. The column stays for replicas of the previous release during a deploy (docs/MIGRATIONS.md).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DROP INDEX "account_issuer_account_id_uidx";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
