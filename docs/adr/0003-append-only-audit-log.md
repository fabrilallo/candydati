# ADR 0003: Append-only audit log at database level

Status: accepted

## Context

Recruiting data is personal data. We must show who saw, changed, exported or erased what, and that the record cannot be quietly edited, including by a bug or a compromised application account.

## Decision

Every use case writes to `audit_log` in the same transaction. Postgres triggers reject UPDATE, DELETE and TRUNCATE on the table (migration `0001_audit_log_append_only.sql`). Erasure leaves an audit row and nothing else about the person.

## Consequences

Tamper resistance does not depend on application code. Fixing a wrong row needs a new compensating row. A superuser can still drop the trigger, so backups and DB access control remain the operator's duty.
