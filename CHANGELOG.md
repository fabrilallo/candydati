# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/) once it reaches 1.0.

## [Unreleased]

### Added

- Distribuzione shows visits and applications of the ad day by day: a chart over the last 7, 30 or 90 days (visits as
  light bars, applications as dark bars inside them), for every source or for one saved link, source or campaign,
  with the totals above it ("Visite", "Candidature", "Candidature ogni 100 visite") and a table per source and
  campaign. Screen readers get the same figures as a table. API: `GET /api/v1/jobs/:id/traffic` (`report:read`),
  daily counts per source and campaign, documented in OpenAPI. Visits stay anonymous daily counts.
- Who applied through a link: each saved link has "Vedi chi si è candidato da…", and choosing a source lists the
  people too (name, date, where the application stands), linking to the profile. The list is the job's pipeline, so
  it shows exactly the people the board shows the viewer.
- The candidate profile says where the application came from ("Provenienza: LinkedIn, campagna autunno-2026", or
  Diretta, Import, Inserita a mano). The pipeline and profile answers of the api carry `origin` and `campaign`.

### Changed

- "1 visita, conversione —" is gone. A rate is still shown only from the fifth visit (`REPORT_MIN_SAMPLE`), so one
  visit and one application had no rate and showed a bare dash; now the figure is "candidature ogni 100 visite" and,
  under five visits, the text says that more visits are needed (Distribuzione) or "troppo poche per un tasso"
  (Report). The hire rate is left out instead of showing a dash when there are too few applications. The saved links
  count every application that came through them, not only the last 90 days.

### Fixed

- Panoramica: the note saying candidate metrics would come with applications is gone. In its place, for whoever can
  read the reports, the four headline figures of the last 30 days (time to hire, answers given, coverage, applications
  received) and a link to Report.

## [0.1.13] - 2026-10-28

### Added

- Tracked links are saved on the ad. In Distribuzione > Link tracciati, "Salva link" keeps the channel and campaign
  just built; "Link salvati" lists every saved link each time the tab opens, any number of them (one per channel and
  campaign), with the URL to copy, the applications that came through it in the last 90 days and a button to remove it.
  Only the pair is stored, the URL follows the public address of the ad; removing a link changes no figure. Saving and
  removing need `job:publish` and are audited (`job.tracked_link_created`, `job.tracked_link_removed`). API:
  `GET` and `POST /api/v1/jobs/:id/tracked-links`, `DELETE /api/v1/jobs/:id/tracked-links/:linkId`. Migration 0042
  creates `job_tracked_link` (new table, no backfill).

### Fixed

- A tab left open across a deploy reloads itself on the next page change, instead of running the old version against
  the new api (which showed "Qualcosa non ha funzionato" when publishing right after 0.1.12).

## [0.1.12] - 2026-10-28

### Changed

- The ad quality score ("Qualità dell'annuncio", 0-10) now exists only when the instance has a language model (the
  fast model). Without one there is no score anywhere: "Analizza annuncio" says that AI must be turned on, with a link
  to Impostazioni > AI for whoever can change the models and a word to ask the installation's administrator for
  everyone else; publishing never shows the below-threshold step; the dashboard card and the job list show no score or
  "Sotto soglia" badge. Scores stored earlier by the rules alone are no longer shown. Publication rules and compliance
  checks work as before, with or without a model. API: `POST /api/v1/jobs/quality` returns `status` (`assessed` or
  `unavailable`, with `assessment: null`), publishing returns `qualityStatus` (`assessed`, `unavailable`, `failed`),
  job stats carry `quality.available`; the MCP and assistant tools return the same.

## [0.1.11] - 2026-10-27

### Added

- Job editor: "Suggerisci responsabilità" proposes 3 to 6 responsibilities from the ad's title, role, seniority and
  language (and what is already written, to avoid repeats), with the fast model. Each one is added by the person with
  "Aggiungi", or all at once; nothing is saved or overwritten. Only the ad's own words reach the model, never candidate
  data. The button appears when the instance has a fast model; each call is audited as
  `job.responsibilities_suggested`. API: `POST /api/v1/jobs/responsibilities/suggest`.

### Changed

- Job editor: Publish also sits at the end of the form, with what is still missing and a link to the first gap.
- "Import" in the sidebar is now "Importa candidati" / "Import candidates", and its page says what it is for (CVs and
  spreadsheets you already have) and points to Migration for moving from another ATS.
- Public job ad is more compact: smaller hero and title, salary and process side by side, key facts in four columns,
  tighter section gaps, process stages as slim rows, and the apply button inside the top block.
- The role of a job ad (and of a job request) is no longer a closed list: pick a role or choose "Other" and write it.
  The ad stores `role: other` plus `customRole` (80 characters at most, required to publish); the text is shown on the
  public page, careers list, statistics and in the job posting data. The public schema `job-content.v1` gains the
  optional `customRole` field and the `other` role value.

### Fixed

- Sidebar candidate count stayed at the old number after an application until a full reload: it now refreshes on
  focus and on navigation.
- Dashboard quality chart: the threshold label sat on the first bar; it is now a legend under the chart.
- Ad quality score: an ad with every structured field filled but meaningless free text (placeholders like "asd" or
  "bla bla", lorem ipsum, keyboard mashing, the same word repeated) scored up to 9 out of 10, because the text
  categories counted items and words instead of content. A deterministic check (Italian and English) now treats such
  text as absent, so those categories score 0 also when a model scores the ad. Each filler text is listed with what to
  write instead, and the first advice asks to rewrite it. The model is told to judge substance, not length.
- Ad editor: the details of the quality analysis (categories, vague phrases, advice) are open by default and can be
  folded away.

## [0.1.10] - 2026-10-27

### Added

- Help page (`/app/help`, "Guida" in the sidebar): short recipes for the main tasks, filtered by role, searchable, each
  with a link to the right page. The assistant answers "where do I..." questions from the same recipes
  (`find_help_recipe`) and links to the page instead of inventing menus.
- Members: owners and admins change a member's role from the list. Nobody changes their own role, only an owner touches
  the owner role, and the last owner stays.
- My tasks: who can manage tasks adds one from the page, for themselves or a colleague, not tied to a candidate.

## [0.1.9] - 2026-10-23

### Fixed

- One logo everywhere: the app showed the product initial on a yellow circle, the favicon and the README the mark (a C
  closing on a check). The app now shows the mark next to the product name (`NUXT_PUBLIC_PLATFORM_ICON_URL` replaces
  it), and the README wordmark uses Bricolage Grotesque like the app.

## [0.1.8] - 2026-10-23

### Added

- Privacy by design for AI: the assistant and the MCP server give a model candidates by first name and id only.
  Surnames, emails, phone numbers, links, street addresses, tax codes, IBANs and full dates are replaced by markers
  (`[surname]`, `[email]`...) in CVs, cover letters and messages too; message drafts keep `{{candidate.lastName}}` as a
  variable that the composer fills in (ADR 0010).
- Find candidates for a job on objective criteria a person confirms (skills, languages, minimum experience, location,
  words in the CV): `find_candidates_by_criteria` for the assistant and over MCP. A filter over the job's applicants and
  the talent pool only, no score, ordered by date of application; CVs that could not be checked are reported;
  protected characteristics and maximum experience are refused; every search is audited as
  `candidate.searched_by_criteria`.
- Five HR workflows as MCP prompts, for Claude Code, Codex and any MCP client: `write_job_ad`, `answer_inbox`,
  `find_candidates`, `weekly_report`, `interview_kit`.
- Tab icon: the platform mark (`NUXT_PUBLIC_PLATFORM_ICON_URL` replaces it); careers pages show the organization logo.

### Changed

- New visual identity: Bricolage Grotesque, ink on warm paper, one yellow accent for the salary and what is due soon,
  coral only for what is late, 2px ink outlines and hard offset shadows on every panel, menu and dialog. New mark in the
  app, the favicon and the README.
- The public ad no longer mentions response times; copy that said they are visible before applying now matches
  PRODUCT.md.
- MCP `get_pipeline`, `list_attention` and `create_task` return candidates without surname.

## [0.1.7] - 2026-10-18

### Added

- The organization logo, set from the careers page editor: an image of the media library (re-encoded as WebP, served
  from the public media route) or an https address. It changes at once on the careers page, every ad, search engine
  data, the ad editor preview and the organization switcher. `GET`/`PUT /api/v1/organization/logo`, audited as
  `organization.logo_changed`. Migrations 0039 (column) and 0040 (index, built concurrently).

## [0.1.6] - 2026-10-17

### Fixed

- The AI model field is a dropdown of every suggested model of the provider, with "Another model…" for any name; it
  showed only the suggestion matching the prefilled value.

## [0.1.5] - 2026-10-17

### Added

- **AI models configured from the app** (Settings, AI): the assistant model (side panel, job ad drafting) and the
  fast model (ad quality score, CV reading), each with its own provider and switchable off, and the key of each
  provider in use. Saved only after a test call to each model; keys sealed at rest; changes apply without a restart.
  Suggested: `openai/gpt-6-luna` and `google/gemini-3.1-flash-lite` (the maintainers' own, not a benchmark).
  `AGENT_MODEL` and `FAST_MODEL` still win. Migration `0038`.

### Fixed

- A fast model without its provider key is now off (it failed every call while MCP still spent budget).
- The processing register shows no model provider when no model is on, instead of "nessuno".

## [0.1.4] - 2026-10-17

### Fixed

- The first owner's sign-up page has no setup code field at all: the code comes with the link, survives a reload of
  the page and is removed once the account exists. An operator's own `BOOTSTRAP_TOKEN` is opened as
  `/signup?setup#code=<value>`.

## [0.1.3] - 2026-10-17

### Added

- **Setup checklist** on the dashboard while anything is left to set up: email, privacy notice (publishing needs
  it), careers page, first ad, first publication, team. Each step ticks from the real state, a role sees only the
  steps it can take, and the list goes away once all are done.

### Changed

- The deploy skill keeps the Dokploy API key in the shell environment only, never in a file.

## [0.1.2] - 2026-10-17

### Changed

- The first owner's sign-up page no longer shows the setup code field when the link brings the code.
- The deploy skill asks the user only for Dokploy's URL and an API key, and fetches the template without a checkout.
- AI agents find the deploy skill on their own: a line for them atop both READMEs, and `llms.txt` on the
  documentation site.

### Fixed

- The linear-time check of the tests compares an 8x growth (limit 16), so a slow CI runner no longer fails linear
  code.

## [0.1.1] - 2026-10-17

Self-hosting with the minimum: a server with Dokploy and, optionally, a coding agent. No email account or domain to
prepare before the first deploy.

### Added

- **Email configured from the app:** without `EMAIL_PROVIDER` the instance starts, and its first owner (or an
  `INSTANCE_ADMIN_EMAILS` address) sets SMTP or Resend in Settings, Email. Saved only after a test email went through;
  the password or key is sealed at rest and never returned. Until email works, invitations, publishing a job or the
  careers page and public applications are refused, so no candidate is left without an answer. `EMAIL_PROVIDER` in the
  environment still wins (shown read-only). Migration `0037`.
- **Dokploy template** (`deploy/dokploy/`, generated from `docker-compose.prod.yml`): published images, secrets and
  domain generated by Dokploy, nothing to build. Upgrades through `CANDYDATI_VERSION`.
- **Deploy skill for coding agents** (`skills/candydati-deploy`): Claude Code, Codex or Cursor deploy Candydati on
  Dokploy through its API, asking only for Dokploy's URL and key, and hand back the first owner link.

### Changed

- The first owner signs up through the setup link without a confirmation email: the setup code proves the operator.

### Fixed

- Two timing tests that failed on slow CI runners (linear-time check, JSON reader timeout).

## [0.1.0] - 2026-10-17

First release: phases 0 to 10 of the roadmap. Images `ghcr.io/fabrilallo/candydati-{api,worker,web,backup}:0.1.0`
(amd64 and arm64); `install.sh` sets up a server in one command.

### Added

- **Tracked links and visit analytics:** a link builder in the Distribution tab of each ad (channel presets, campaign),
  the campaign (`utm_campaign`) stored with each application, daily visit counters of the public ad page
  (`job_view_daily`, no cookies, no stored IP or user agent, crawlers and Do Not Track left out, deleted after 25 months),
  and Reports sources with visits, conversion and campaigns, also per ad and in the CSV export.
- **Foundations (phase 0):** pnpm and Turborepo monorepo, Postgres 17 with Drizzle, Better Auth with organizations, roles
  and invitations, permission check and append-only audit log in every use case, Italian and English UI.
- **Job ad and publication standard (phase 1):** structured editor, mandatory salary range and declared selection process
  before publishing, ad quality score (`@candydati/ad-quality`), templates, public careers page with JSON-LD.
- **Applications and pipeline (phase 2):** application form without registration, versioned consent, CV upload and
  extraction, pipeline stages taken from the declared process, candidate record, notes, search.
- **Communication (phase 3):** emails on behalf of the company, replies attached to the application, templates, bulk
  sending, outcome messages.
- **Automations and deadlines (phase 4):** response-time countdown, "to handle" view, notifications and digests, tasks,
  per-stage automations, signed webhooks through an outbox, closing a job requires an outcome for every application.
- **GDPR (phase 5):** automatic retention with warning and erasure, data subject rights from the candidate record,
  candidate and organization exports with a public schema, legal templates in `docs/legal`.
- **Agent, API and MCP (phase 6):** scoped API keys, OpenAPI at `/api/v1/openapi.json`, MCP server at `/mcp`, stateless
  internal assistant, adversarial eval suite (`pnpm --filter @candydati/api eval:agent`).
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
- **First owner setup link:** with no `BOOTSTRAP_TOKEN`, the api logs
  `First owner setup: open https://<host>/signup?setup#code=...` at start until an account is confirmed. The code is
  derived from `BETTER_AUTH_SECRET` and travels in the URL fragment, which no server receives; nothing to generate,
  paste or remove.

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

- **License:** from AGPL-3.0-only to the Business Source License 1.1 (`BUSL-1.1`). Self-hosting for your own
  hiring stays free; offering the product to third parties as a hosted or embedded service needs a commercial license.
  Each version becomes AGPL-3.0-only four years after its release. Contributions now require the [CLA](CLA.md)
  instead of the DCO sign-off.
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

- The production stack deploys with Dokploy's isolated deployments (`config-check` no longer sets `network_mode`).
- `nuxt typecheck` no longer depends on which vite version pnpm hoists.
- Confirmation link refused because the invitation lapsed or was withdrawn: the person lands on a page that
  explains it and asks for a new invitation, instead of a raw JSON answer.
- Candidate page: server and browser rendered different markup on a production build (hydration mismatch).
