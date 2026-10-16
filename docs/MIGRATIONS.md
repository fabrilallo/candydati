# Migrations

Schema changes are Drizzle migrations in `packages/db/drizzle`. Generate with `pnpm db:generate`, review the SQL, commit it.
`runMigrations` (`packages/db/src/migrate.ts`) applies them, on api start when `RUN_MIGRATIONS=true`.

## How they run

- **One runner at a time.** The runner takes a Postgres session advisory lock for the whole run. Replicas started
  together wait for the first one and then find nothing to do, instead of racing and crash-looping.
- **One transaction per migration.** A failure rolls back only that migration; the earlier ones stay applied and the
  journal (`drizzle.__drizzle_migrations`) matches the database. Within a migration all statements are atomic.
- **`CONCURRENTLY` migrations run outside a transaction** (Postgres forbids it inside one). A migration containing the word
  `CONCURRENTLY` is applied statement by statement, so every statement in it must be idempotent (`IF NOT EXISTS`). If one
  fails midway, fix the cause and restart: it resumes safely. A failed `CREATE INDEX CONCURRENTLY` leaves an INVALID
  index behind; `DROP INDEX CONCURRENTLY` it before retrying (`select indexrelid::regclass from pg_index where not indisvalid`).
- `pnpm db:migrate` runs the same `runMigrations` against `DATABASE_URL` (from the root `.env`, else the local
  docker-compose database). Do not use `drizzle-kit migrate`: its runner has no lock and cannot apply `CONCURRENTLY`.

## Rules for new migrations

1. **Additive first.** Add the column, table or index in one release; switch the code to it in the next; remove the old
   thing in a later one. Never rename or drop something the running version still reads: old and new api replicas
   overlap during a deploy.
2. **`NOT NULL` needs a default or a backfill.** `ADD COLUMN x text NOT NULL` fails on a table that has rows. Use
   `ADD COLUMN x text NOT NULL DEFAULT '...'` (instant on Postgres 11+ for constant defaults), or add it nullable,
   backfill, then `SET NOT NULL`. To keep a "no default" schema, drop the default afterwards.
3. **Backfill in batches, outside the migration.** An `UPDATE` or `INSERT ... SELECT` over a big table inside a migration
   holds a transaction (and row locks) for its whole duration and blocks every deploy behind it. In the migration add the
   column nullable; backfill from a worker task or a one-off script in batches of a few thousand rows
   (`WHERE id > $last ORDER BY id LIMIT 5000`, commit between batches); enforce `NOT NULL` or the constraint once done.
   Small, bounded backfills (lookup tables, a handful of rows per organization) may stay inline.
4. **`CREATE INDEX CONCURRENTLY` in its own migration**, with `IF NOT EXISTS`, containing nothing else
   (`generate --custom`, then write the SQL). Plain `CREATE INDEX` blocks writes on the table while it builds. Declare the
   index in the Drizzle schema as usual so `drizzle-kit generate` sees no drift; only the SQL file differs.
5. **Constraints in two steps.** `ADD CONSTRAINT ... NOT VALID` first (cheap), `VALIDATE CONSTRAINT` later (does not block writes).
6. **Keep locks short.** Do not combine a table rewrite (`ALTER COLUMN TYPE`, volatile default) with other work. Set a
   `lock_timeout` for DDL on hot tables.
7. **Never edit an applied migration** except to make it safer without changing the resulting schema (see below). The
   runner decides what to apply by the journal timestamp, so such an edit does not re-run anywhere.
8. Triggers and functions live in migrations too (Drizzle does not model them): `CREATE OR REPLACE`, and describe the
   reason in a SQL comment.

## Existing migrations

- **0002** added `account.issuer NOT NULL` with no default. It now adds the column nullable, backfills it from
  `provider_id` and then sets `NOT NULL`: same final schema, and it no longer fails on a database that has accounts.
- **0013** adds `application.origin` with a constant default (no rewrite) and backfills `application_stage_event` and
  `response_promise` from `application` and a full scan of `audit_log`, in one transaction. Fine for the current data
  volumes; on a large existing installation it holds locks while it runs. It has already run everywhere it will run
  (the product has no public release yet), so it stays as is: rule 3 applies from now on.
- **0015** adds `notification.emailed_at` and sets it for every existing row (`UPDATE ... SET emailed_at = created_at`),
  which rewrites `notification` once in a transaction. Same remark.
- **0017** adds `candidate.last_applied_at`, a trigger on `application` that keeps it up to date and a one-statement
  backfill. The backfill is small per organization; on a very large `candidate` table, split it per rule 3.
- **0018** creates the indexes concurrently (search, notifications, caps, outbox, audit log, retention).
- **0020** creates `job_team_member`, adds `organization_setting.restrict_recruiters_to_team` (constant default) and
  backfills the teams inline: each job's creator, and every hiring manager or interviewer referenced by a job (feedback
  asked of them, a task about the job, the request it came from), if still a member. One row per job and person, so small;
  on a very large installation split it per rule 3. Stage interviewers need no row: they are read with the team.
- **0021** adds `application.submitted_contact` and nulls stored `candidate.linkedin_url` values that are not http(s)
  addresses and `organization.logo` values that are not https ones (stored XSS and tracking-pixel hardening). The two
  `UPDATE`s write only the offending rows; on a very large `candidate` table the scan itself is the only cost.
- **0023** gives every API key without an expiry `created_at + 90 days` (never more than a year from now), whatever
  `API_KEY_DEFAULT_TTL_DAYS` says. **A key created more than 90 days before the upgrade stops working the moment the
  migration runs.** It only touches keys whose `expires_at` is null, so a grace period is set before upgrading, not by
  editing the migration: see the upgrade notes in `CHANGELOG.md`.
- **0025** creates `organization_creation_quota` and adds `instance_bootstrap.owner_user_id`. It backfills one quota row
  per account that is an owner today (its earliest owned organization), so `one_per_user` keeps refusing them, and the
  bootstrap owner from the confirmed account of the claimed address. Both are bounded by the number of owners.
- **0026** creates `careers_page` (one row per organization: the draft and the published document, jsonb validated by
  `careersPageDocumentSchema` on write and read) and `careers_media` (images and videos of the careers page, primary key
  `(organization_id, id)`, a `kind` check, widths and default description). New tables only: no backfill, no lock on
  existing tables. An organization without a row gets the default page.
- **0027** adds `careers_page.revision` (integer, constant default 0, no rewrite): the optimistic lock of the careers
  page editor.
