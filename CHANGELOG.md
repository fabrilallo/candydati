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
- Self-hosting stack (`docker-compose.prod.yml`), CI, end-to-end tests.

### Security

- Client IP handling behind proxies, storage outage handling and other hardening from the consolidation pass.
