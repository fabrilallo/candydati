# Architecture

This document explains how the system is put together. Decisions and their reasons are in [`adr/`](adr). What the product is and its principles are in
[`PRODUCT.md`](PRODUCT.md); the visual contract is [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).

## Packages

```
apps/
  api/        Fastify: REST routes, Better Auth, assistant (Mastra), MCP server
  worker/     pg-boss queues: automations, deadlines, retention, import, email, distribution
  web/        Nuxt 4 + shadcn-vue: internal app and public pages (careers, application form, feedback, consent)
packages/
  domain/     Zod schemas, roles and permissions, audit event names, platform config. No I/O
  db/         Drizzle schema, migrations, client (Postgres 17)
  core/       application services (use cases), ports and Drizzle adapters. The only place where logic lives
  providers/  email (SMTP, Resend), object storage (S3), CV and import parsing, distribution channels
  ad-quality/ job ad quality score (rules plus optional model), no network
e2e/          Playwright flows
```

Dependency direction: `apps/*` -> `core` -> `domain`; `core` -> `db`; `providers` implement ports defined in `core`.
`domain` depends on nothing.

## Request flow

```
browser -> web (Nuxt, proxies /api/** and /mcp) -> api (Fastify)
  -> authenticate (session cookie or API key) -> build an Actor (user, organization, role/scopes)
  -> route validates input with Zod -> calls a use case in packages/core
  -> use case: permission check -> handler (inside a transaction) -> audit entry -> outbox event
  -> response in the { ok, data | error } envelope from @tt/domain
```

### Envelope exceptions

Every `/api/v1` route answers with the `ok` / `fail` envelope, except:

- **Inbound email webhooks** (`/api/v1/inbound/email/*`): called by the mail provider, they answer `{ "received": true }`
  and a plain provider-facing status code, never the envelope.
- **Better Auth** (`/api/auth/**`): sign-in, sessions and organization management are served by Better Auth, which
  returns its own JSON errors (`{ code, message }`) untouched.
- **Files** (CV, candidate export, organization export, CSV report) and **`/api/v1/openapi.json`**: the body is the file
  or the document; errors still use the envelope.

The OpenAPI document (`/api/v1/openapi.json`) describes every route usable with a session or an API key. A test
compares it with the real Fastify router in both directions: each `/api/v1` route is either documented or listed with a
reason in `apps/api/src/openapi/internal-routes.ts`, and each documented route exists.

The browser only talks to the web origin. The api is reachable from the web proxy and, in the production compose,
only from loopback on the host.

## Use case pipeline

Every use case is declared with a `define*UseCase` helper (name, Zod input schema, required permission, audit descriptor,
handler). The wrapper runs, in order:

1. validate input;
2. check the actor's permission (declared in `packages/domain/src/access/permissions.ts`, nowhere else);
3. open a unit of work (one DB transaction), except for read-only use cases and those declared with `transaction.skip`,
   which run without one;
4. run the handler against ports (`deps.jobs`, `deps.applications`, ...);
5. write an `audit_log` row in the same transaction;
6. commit, then run the after-commit effects (queue sends such as email, automations and file deletion). They run only
   once the transaction has committed, so a rollback never leaves a message sent or a file gone.

REST routes, assistant tools and MCP tools call the same use cases, so permissions and audit are identical on every
surface. Adapters contain no business rules.

## Organization isolation

Every domain table has `organization_id`, and every adapter query filters by it. Organizations, members and
invitations come from Better Auth's organization plugin. Roles map to permissions in one file; job-level and
stage-level restrictions are checked in core. API keys belong to an organization and carry scopes, never more than the
creating user's permissions.

## Outbox and workers

Use cases record domain events in `outbox_event` in the same transaction as the change. The worker publishes them:
signed webhooks (`webhook_endpoint`, `webhook_delivery`), automations (`automation_rule`, `automation_execution`),
notifications and tasks. pg-boss (in Postgres) drives queues for email sending, inbound email, CV extraction, retention
and erasure, response deadlines, imports and distribution sync. Scheduled jobs handle retention warnings, daily digests
and stale-job detection. Jobs are idempotent and keyed so a retry does not repeat a side effect.

## Public and authenticated surfaces

| Surface | Auth | Notes |
|---|---|---|
| `/app/**` and `/api/v1/**` | session or API key | permissions per role and scope |
| `/careers/{org}/**`, feed, `llms.txt`, sitemap, `/api/v1/public/**` | none, read-only | server-rendered, JSON-LD `JobPosting`, cacheable |
| Application form | none | versioned consent, rate limits, daily caps per organization and per job |
| Feedback and consent links | single-use token in URL | interview feedback without login; consent reconfirmation |
| Inbound email webhook | HMAC signature | `INBOUND_WEBHOOK_SECRET` |
| `/mcp` | API key | same use cases as REST |

Public pages avoid unbounded query-string URL spaces and set cache headers and `noindex` where needed.

## Assistant and MCP constraints

- Models are reached only through Mastra with `provider/model` strings from env (`AGENT_MODEL`, `FAST_MODEL`). Empty
  means the assistant is off and no model is called.
- The assistant acts with the permissions of the user it works for, and its actions are logged as agent actions.
- It never ranks, scores or rejects candidates. Any message to a candidate needs a person's confirmation.
- CV and email content is data, not instructions. An adversarial eval suite checks this (`pnpm --filter @tt/api eval:agent`).
- The conversation lives in the browser; the server stores nothing of it ([ADR 0007](adr/0007-stateless-assistant.md)).
- MCP tools are thin wrappers on the same use cases, authorized by API key scopes.

## GDPR flows

- **Consent:** versioned notice per organization; each application stores version, date and scope (single selection,
  or also future positions).
- **Retention:** expiry computed per candidate and scope; a daily job warns, then anonymizes or deletes, files included.
- **Rights:** the recruiter runs access, correction, erasure and withdrawal from the candidate record; each is audited.
- **Export:** per-candidate ZIP and whole-organization export, in the public schemas under [`schema/`](schema).
- **Import:** imported people get consent marked "to renew" and an email asking to reconfirm; no reply in the window
  means erasure ([ADR 0008](adr/0008-imports-consent-renewal.md)).
- **Minimization:** no special-category fields; CV extraction drops photo, birth date and marital status.
- Legal templates (privacy notice, DPA, record of processing) are in [`legal/`](legal). They need legal review.

## Data model overview

Defined in `packages/db/src/schema`, migrations in `packages/db/drizzle`.

| Area | Tables |
|---|---|
| Auth and tenancy | `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `api_key`, `organization_setting` |
| Jobs | `job`, `job_template`, `job_stage_interviewer`, `job_request`, `job_distribution`, `distribution_setting` |
| Candidates | `candidate`, `application`, `application_stage_event`, `candidate_note`, `cv_extraction`, `response_promise` |
| Communication | `conversation`, `message`, `email_template`, `email_settings` |
| Automation | `automation_rule`, `automation_execution`, `task`, `notification`, `outbox_event`, `webhook_endpoint`, `webhook_delivery` |
| Privacy | `privacy_notice`, `consent_token`, `data_export`, `retention_run` |
| Import | `import_batch`, `import_item`, `import_analysis` |
| HR tools | `feedback_request`, `interview_feedback` |
| Audit | `audit_log` (append-only, enforced by triggers) |
