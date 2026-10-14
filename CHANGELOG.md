# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/) once it reaches 1.0.

## [Unreleased]

Phases 0 to 10 of the roadmap are implemented. Nothing has been released yet.

### Added

- **Foundations (phase 0):** pnpm and Turborepo monorepo, Postgres 17 with Drizzle, Better Auth with organizations, roles
  and invitations, permission check and append-only audit log in every use case, Italian and English UI.
- **Job ad and publication standard (phase 1):** structured editor, mandatory salary range and declared selection process
  before publishing, ad quality score (`@tt/ad-quality`), templates, public careers page with JSON-LD.
- **Applications and pipeline (phase 2):** application form without registration, versioned consent, CV upload and
  extraction, pipeline stages taken from the declared process, candidate record, notes, search.
- **Communication (phase 3):** emails on behalf of the company, replies attached to the application, templates, bulk
  sending, outcome messages.
- **Automations and deadlines (phase 4):** response-time countdown, "to handle" view, notifications and digests, tasks,
  per-stage automations, signed webhooks through an outbox, closing a job requires an outcome for every application.
- **GDPR (phase 5):** automatic retention with warning and erasure, data subject rights from the candidate record,
  candidate and organization exports with a public schema, legal templates in `docs/legal`.
- **Agent, API and MCP (phase 6):** scoped API keys, OpenAPI at `/api/v1/openapi.json`, MCP server at `/mcp`, stateless
  internal assistant, adversarial eval suite (`pnpm --filter @tt/api eval:agent`).
- **Distribution (phase 7):** XML feeds, `llms.txt` and sitemap per organization, read-only public API, distribution
  channel interface.
- **Import (phase 8):** ZIP or folders of CVs, CSV, Excel, Notion exports, matching, preview, consent to renew by email,
  undo of a whole import.
- **HR tools (phase 9):** Italian-law compliance checks on ads, structured CCNL and benefits, interview feedback without
  login, job opening requests with approval, stale job alerts.
- **Reports (phase 10):** time to hire, stage conversion, source, response times, CSV export.
- **Careers page builder:** owners and admins compose the public careers page from sections (hero with image or
  muted looping video, text, image and text, gallery, video with a click-to-load YouTube/Vimeo facade, values, numbers,
  testimonials, open positions, links), pick an accent (checked for WCAG AA contrast), a heading font and a corner
  style, preview it live at desktop and phone width, save drafts and publish (`Settings / Careers page`). Uploaded images
  are checked by their bytes and re-encoded to WebP in three widths without metadata; videos up to 60 MB are served with
  byte ranges. Organizations that never published keep the previous page (name and open positions). Only the media of the published
  page are public; drafts are protected by a revision number against concurrent edits; the organization export includes
  the page and its media. Migrations `0026` and `0027`.
- Self-hosting stack (`docker-compose.prod.yml`), CI, end-to-end tests.

### Security

- **Accounts:** email verification before any session, password reset and sign-up without user enumeration,
  invitations accepted only by the invited verified address, invite-only sign-up by default in production, progressive
  per (email, IP) sign-in delays stored in Postgres, optional TOTP two-factor authentication that can be required for
  owners and admins (the enrolment shows a QR code and the copyable key).
- **Configuration:** production refuses example or weak secrets, http URLs and the log email provider. API keys expire
  by default (90 days). MCP batch calls are counted and capped, and paid model calls have daily budgets per key, user
  and organization.
- **Data:** only http(s) links from user input, bounded inflation of DOCX, XLSX and ZIP files, database errors logged
  without parameters, public applications never overwrite a candidate profile nor reveal existing ones, receipts capped
  per organization, optional Turnstile.
- **Web:** nonce-based CSP and security headers, web proxy with body size caps and timeouts, client IP taken only from
  the trusted proxy.
- **Access:** per-job teams scope every candidate read and write in core for interviewers and hiring managers, with a
  leak test over every use case.
- **Supply chain:** images pinned by digest, credential-less CI checkouts, gitleaks configuration, dependency audit with
  a minimum release age.

### Changed

- **Reliability:** background jobs are sent on the transaction connection (a job exists if and only if its transaction
  committed). The reconciler (`tasks.reconcile`) queues again messages, exports, imports and CV extractions whose task
  was lost, including work blocked by a job that failed for good. The outbox retries with backoff and parks an event
  after 10 failed attempts (dead letter). Per-rule, per-item and per-event savepoints, guarded status transitions,
  idempotent digests and workers, retention that re-checks under lock, file erasure after commit with retries.
- **Scale:** keyset pagination, new indexes (trigram search, notifications, caps, outbox, audit, retention), streaming
  organization export and import uploads with bounded memory, `DELIVERY_LOG_RETENTION_DAYS` pruning of delivered events.
- **Migrations:** an advisory lock and one transaction per migration; CI checks migration drift.
- **Quality gates:** file size (400 lines) and function size (50 lines) enforced by ESLint with no temporary exceptions,
  import boundaries between packages, generated environment reference (`docs/ENVIRONMENT.md`), OpenAPI documents every
  route (two-way test), coverage of web components, end-to-end tests in CI.

### Upgrade notes

- **API keys without an expiry (migration 0023).** Every such key gets its creation date plus 90 days, so a key created
  more than 90 days ago **stops working as soon as the migration runs**. To give those keys a grace period, run this
  before upgrading (the migration leaves keys that already have an expiry alone), then replace them in time:

  ```sql
  UPDATE api_key SET expires_at = now() + interval '30 days'
  WHERE expires_at IS NULL AND created_at < now() - interval '90 days';
  ```
- **`ORGANIZATION_CREATION=one_per_user` (migration 0025)** now counts organizations an account created, not the ones
  it owns. Every account that owns an organization at upgrade time counts as having created one, including owners who
  were promoted rather than creating it. An account that created an organization cannot create another even after
  handing the owner role over.
- **First owner (migration 0025).** The bootstrap owner is recorded from the confirmed account of the claimed address.
  `ORGANIZATION_CREATION=instance_admins` now uses it instead of the oldest confirmed account.

### Fixed

- Candidate page: server and browser rendered different markup on a production build (hydration mismatch).
