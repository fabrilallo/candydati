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

1. check the actor's permission on the role (declared in `packages/domain/src/access/permissions.ts`, nowhere else), before looking at the input: a role that may not do this learns nothing about the schema;
2. validate input, then scope it to the actor's organization;
3. open a unit of work (one DB transaction), except for read-only use cases and those declared with `transaction.skip`,
   which run without one;
4. run the handler against ports (`deps.jobs`, `deps.applications`, ...);
5. write an `audit_log` row in the same transaction;
6. commit, then run the after-commit effects (queue sends such as email, automations and file deletion). They run only
   once the transaction has committed, so a rollback never leaves a message sent or a file gone.

REST routes, assistant tools and MCP tools call the same use cases, so permissions and audit are identical on every
surface. Adapters contain no business rules.

## Accounts and sign-in

Better Auth (`apps/api/src/auth/create-auth.ts`) runs email + password with these rules:

- **Verified address first.** Sign-up never creates a session: Better Auth emails a single-use link (24 hours) and the
  link signs the person in. A sign-up with an address that already has an account answers exactly like a new one and
  emails the owner instead, so sign-up reveals nothing. A session of an unconfirmed address (one older than this rule)
  is refused by every `/api/v1` route with `403 email_not_verified`.
- **Sign-up mode.** `SIGNUP_MODE=open` (default outside production) lets anyone register; `invite_only` (default in
  production) accepts an address only with a pending invitation, plus the first owner of an instance with no confirmed
  account (`apps/api/src/auth/signup-policy.ts`). In production that bootstrap needs the one-time `BOOTSTRAP_TOKEN`
  (`x-bootstrap-token` header, the `/signup?setup` field); the claim is taken under an advisory lock in
  `instance_bootstrap` and lapses after 24 hours unconfirmed.
- **Organization creation** is an instance setting (`ORGANIZATION_CREATION`, Better Auth `allowUserToCreateOrganization`,
  `auth/organization-creation.ts`): one per person by default with `invite_only`, or only the instance admins.
- **Invitations** are emailed through the configured EmailProvider (it/en) and accepted only by a confirmed account
  whose address is the invited one. The accept link is never logged.
- **Password reset**: `POST /api/auth/request-password-reset` always answers the same; the emailed token works once
  for an hour and the reset signs out every session.
- **Failed sign-ins** slow down further attempts instead of locking the account (`auth/sign-in-throttle.ts`): per
  (email, client address) the wait doubles from 1 s up to 5 minutes after 5 failures; per account, across addresses,
  up to 2 minutes after 20 failures, except for addresses that signed in to that account before, so a flood cannot
  keep the owner out. After 10 failures the owner gets one email per hour. The counters live in Postgres
  (`auth_throttle`), shared by every api instance; an in-memory store serves the tests.
- **Two-factor (TOTP)** is optional, with backup codes (Better Auth `twoFactor` plugin). An organization can require it
  for owners and admins (`organization_security_setting`); until they enrol, `/api/v1` answers them
  `403 two_factor_required`, the Better Auth organization endpoints that change members, invitations or settings answer
  `403 TWO_FACTOR_REQUIRED` (a `hooks.before` step, `auth/organization-two-factor-gate.ts`, gated unless listed as a
  read or one's own invitation) and their API keys are suspended (`authenticateApiKey`).
- **Request logs** mask every token carried by a URL (`http/log-serializers.ts`): reset, verification, invitation,
  OAuth and public links. A reverse proxy needs the same masking (SECURITY.md has nginx and Caddy examples).
- **Account emails** (verification, reset, invitation, failed sign-ins) are sent in the background, so the answer's
  timing does not depend on whether an address exists.
- The routes that send email (sign-up, password reset, verification) have their own, smaller per-client budget.

## Organization isolation

Every domain table has `organization_id`, and every adapter query filters by it. Organizations, members and
invitations come from Better Auth's organization plugin. Roles map to permissions in one file. API keys belong to an
organization and carry scopes, never more than the creating user's permissions.

Per-job access ([`PRODUCT.md`](PRODUCT.md) §6.2) is applied by the use case pipeline itself: before a handler runs,
`scopeDeps` (`packages/core/src/access/scope-deps.ts`) replaces every repository of job or candidate data (`jobs`,
`applications`, `candidates`, `candidateSearch`, `notes`, `messages`, `tasks`, `reports`, ...) with one limited to the jobs
the actor reaches, resolved once per run from `job_team_member`, `job_stage_interviewer` and the organization setting
(`access/job-scope.ts`). Owners, admins, unrestricted recruiters and the system get the repositories as they are. A
handler cannot reach data outside the scope, and a job-scoped actor without the team repository fails closed. The test
`access/job-scope-leak.test.ts` runs every use case a scoped role can run as the people of job A against the data of job
B; a new use case must be added to it.

## Outbox and workers

Use cases record domain events in `outbox_event` in the same transaction as the change. The worker publishes them:
signed webhooks (`webhook_endpoint`, `webhook_delivery`), automations (`automation_rule`, `automation_execution`),
notifications and tasks. pg-boss (in Postgres) drives queues for email sending, inbound email, CV extraction, retention
and erasure, response deadlines, imports and distribution sync. Scheduled jobs handle retention warnings, daily digests
and stale-job detection. Jobs are idempotent and keyed so a retry does not repeat a side effect.

**Where a job is queued.** With pg-boss, the unit of work sends a job on the connection of the transaction that stores
the work (`BindableTaskQueue.bindTo`), so the job exists if and only if the transaction committed. Two sends happen
after the commit and are not atomic with it: `cv.extract` of a public application (it keeps its own intake
transaction) and sends with a queue that cannot join a transaction.

**Reconciler (`tasks.reconcile`).** Every five minutes the worker looks for work that was stored but whose task never
arrived (a crash between commit and send, a queue outage): messages still `queued`, organization exports still
`pending`, import batches `uploaded` or `importing`, CV extractions still `pending`, each older than 15 minutes
(`STUCK_AFTER_MINUTES`). It queues their task again with the row id as singleton key, so a task the queue still knows
is not duplicated. pg-boss inserts with a job id derived from that key (`ON CONFLICT DO NOTHING`), so a job that ended
`failed` or `cancelled` would block its key until pg-boss cleans it up: the reconciler asks for `replaceFailed`, and
the queue deletes a dead job of that key before sending the new one. Tasks that cannot be queued are counted
(`failed`) and retried on the next run. Rows are only ever picked while they still wait, so finished work is never
queued again.

**Outbox retry and dead letter.** The publisher claims due events (`SKIP LOCKED`) and fans each one out in a savepoint of
its own. A failing event is rolled back alone and its attempt is counted with a short error code, due again after a
backoff of 30 s doubling per attempt, capped at 6 h. After `OUTBOX_MAX_ATTEMPTS` (10) failed fan-outs the event is
parked (`dead_at`, dead letter): it is never taken again and newer events go on. Webhook deliveries and distribution
syncs retry with pg-boss backoff for at least 24 hours; the delivery itself is logged as `failed` on the last attempt.

**Log retention (`DELIVERY_LOG_RETENTION_DAYS`).** The daily retention job deletes outbox events that are published or
dead and webhook delivery rows older than this many days (default 30, worker setting). Events still waiting are never
deleted.

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

## Web security headers and links

- The web app sends, on every response, `X-Content-Type-Options: nosniff`, a `Permissions-Policy` and a `Referrer-Policy`
  (`no-referrer` on `/consent`, `/feedback` and `/accept-invitation`, whose URLs carry a secret); HSTS when the site URL
  is https. Pages also get a nonce-based CSP (`script-src 'self' 'nonce-...'`, no `unsafe-eval` in production,
  `frame-ancestors 'none'`, `object-src 'none'`). `server/middleware/security-headers.ts` writes the headers and
  `server/plugins/csp-nonce.ts` stamps the nonce on Nuxt's scripts. `/api/**` and `/mcp` keep the api's own headers (the CV
  viewer is a same-origin frame). A CDN that caches HTML caches its nonce too: keep public HTML out of long shared caches.
- Anything a stranger can type that ends up in a link is http(s) only (`httpUrlSchema` in `@tt/domain`), and templates
  bind `href`/`src` from data only through `safeExternalUrl` / `safeImageUrl` (`app/lib/template-links.test.ts` fails on
  any other binding). Organization logos are https only.
- Logs never carry query parameters: the `err` serializer (`safeErrorSerializer`) logs a database error as SQLSTATE,
  constraint and table only.
- DOCX, XLSX and ZIP imports are inflated with the real output counted against a cap (`inflateBounded`), never trusting
  the sizes in the archive headers.
- The web proxy sets `X-Forwarded-Host`/`-Proto` from the configured site URL, never from the client's headers; the api
  believes `X-Forwarded-For` only from the web container (`TT_WEB_IP` in the production compose).

## Assistant and MCP constraints

- Models are reached only through Mastra with `provider/model` strings from env (`AGENT_MODEL`, `FAST_MODEL`). Empty
  means the assistant is off and no model is called.
- The assistant acts with the permissions of the user it works for, and its actions are logged as agent actions.
- It never ranks, scores or rejects candidates. Any message to a candidate needs a person's confirmation.
- CV and email content is data, not instructions. An adversarial eval suite checks this (`pnpm --filter @tt/api eval:agent`).
- The conversation lives in the browser; the server stores nothing of it ([ADR 0007](adr/0007-stateless-assistant.md)).
- MCP tools are thin wrappers on the same use cases, authorized by API key scopes. Each tool call of a JSON-RPC batch
  counts against the key's per-minute limit and a batch holds at most 20 messages. Reads are audited as `mcp.read` with
  the tool name and the ids asked for, never the returned data.
- Paid model calls have daily budgets in Postgres (`usage_counter`, UTC day): MCP model-backed tools per key and per
  organization (`MCP_MODEL_DAILY_BUDGET_*`), assistant chat requests per person and per organization
  (`ASSISTANT_DAILY_BUDGET_*`), CV structuring per organization (`CV_MODEL_DAILY_BUDGET`).
- API keys always expire: 90 days by default (`API_KEY_DEFAULT_TTL_DAYS`), at most a year.

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
| Auth and tenancy | `user`, `session`, `account`, `verification`, `two_factor`, `organization`, `member`, `invitation`, `api_key`, `organization_setting`, `organization_security_setting` |
| Abuse limits | `auth_throttle` (failed sign-ins), `usage_counter` (daily model budgets) |
| Jobs | `job`, `job_team_member`, `job_template`, `job_stage_interviewer`, `job_request`, `job_distribution`, `distribution_setting` |
| Candidates | `candidate`, `application`, `application_stage_event`, `candidate_note`, `cv_extraction`, `response_promise` |
| Communication | `conversation`, `message`, `email_template`, `email_settings` |
| Automation | `automation_rule`, `automation_execution`, `task`, `notification`, `outbox_event`, `webhook_endpoint`, `webhook_delivery` |
| Privacy | `privacy_notice`, `consent_token`, `data_export`, `retention_run` |
| Import | `import_batch`, `import_item`, `import_analysis` |
| HR tools | `feedback_request`, `interview_feedback` |
| Audit | `audit_log` (append-only, enforced by triggers) |
