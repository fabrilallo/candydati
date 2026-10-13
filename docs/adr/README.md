# Architecture decision records

Short records of decisions already taken. Format: context, decision, consequences. New decisions get the next number;
a superseded ADR is marked, not deleted.

| # | Decision |
|---|---|
| [0001](0001-logic-in-core.md) | Logic in `packages/core`, thin adapters |
| [0002](0002-better-auth-organizations.md) | Better Auth organizations for tenancy and roles |
| [0003](0003-append-only-audit-log.md) | Append-only audit log enforced in the database |
| [0004](0004-outbox-for-webhooks.md) | Transactional outbox for webhooks and automations |
| [0005](0005-no-automated-decisions.md) | No automated decisions on candidates |
| [0006](0006-models-via-mastra.md) | Models only through Mastra, configured by env strings |
| [0007](0007-stateless-assistant.md) | Stateless assistant |
| [0008](0008-imports-consent-renewal.md) | Consent to renew for imported candidates |
