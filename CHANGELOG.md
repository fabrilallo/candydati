# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/) once it reaches 1.0.

## [Unreleased]

Two additive migrations run at start as usual; take a backup first (docs/OPERATIONS.md). Nothing existing is changed or
dropped: `0050_mcp_move_proposals` (two columns on `move_proposal`, `source` with default `rule` and a nullable
`reason`) and `0051_skill_aliases` (two new tables).

### Added

- **Fill in with LinkedIn on the application form.** When the api has `LINKEDIN_CLIENT_ID` and
  `LINKEDIN_CLIENT_SECRET` (a LinkedIn app with "Sign In with LinkedIn using OpenID Connect", redirect URL
  `{PLATFORM_URL}/api/v1/public/linkedin/callback`), the public form offers "Fill in with LinkedIn": first name, last
  name and a verified email fill the form, which the candidate reviews and sends as usual. No account, nothing stored:
  photo, language and member id are discarded, the data waits at most 10 minutes in an encrypted HttpOnly cookie and
  reaches the form once. Next to the CV, the form explains how to save the LinkedIn profile as a PDF and upload it.
  The default privacy notice mentions it. Set up: Configuration guide, "Fill in with LinkedIn".
- **Recent runs of an automation rule.** The rule editor shows "Ultime esecuzioni" / "Recent runs": the last 20 times
  the rule fired, newest first, with the kind of trigger, the time and a link to the application. Read-only
  (`GET /api/v1/automations/:id/runs?limit=`, at most 50, names only with `candidate:read`); a log of what the rule
  did, never a score or a ranking.
- **MCP can propose a move, a person decides.** New tool `propose_stage_move`: an external assistant (Claude, ...)
  proposes moving an application to another stage of the same job, with a short reason (500 characters, plain text). It
  is the same proposal a `propose_move` rule writes, attributed to the person behind the key or connected app (shown as
  such, with the reason, in Needs attention and on the application) and confirmed or dismissed by a person with one
  click; it moves nothing itself. Asking again for the same target returns the waiting proposal. It needs the new
  permission `candidate:propose_move`, held by the roles that may move (owner, admin, recruiter, hiring manager) and
  limited to the jobs they reach; it is opt-in for API keys (a scope to tick) and for connected apps (an unticked box on
  the consent page, OAuth scope `candidate:propose_move`). A reason given at a restricted stage is shown only to those
  who read that stage. Audited as `move_proposal.proposed`. MCP still cannot move, decide on, message or erase
  candidates. Connected apps authorized before this change see the consent page once more the next time they connect.
- **Skill aliases per organization.** Owners and admins (new permission `skill_alias:manage`, never an API key or the
  assistant) can add their own aliases on top of the built-in dictionary ("Go developer" for Go, or a brand-new skill with
  its aliases) and switch off a built-in alias they do not want, under **Settings, Skills**. The filter on declared criteria
  (assistant and MCP) reads the built-in dictionary plus the organization's changes, on both sides, and each result says
  which name a CV used for a skill ("Golang" for "Go"). An alias belongs to one skill, ignoring case, punctuation and
  diacritics; at most 500 per organization. Still a filter: no score, ordered by date of application. REST:
  `/api/v1/skill-aliases` (session only, in the OpenAPI reference); audited as `skill_alias.added`, `.removed`,
  `.disabled` and `.enabled`.

### Changed

- **The settings in the side menu fold away.** The settings groups below the daily work sit under one "Settings" button
  that opens and closes them, keyboard reachable. This browser remembers a collapsed menu, and a settings page always
  opens its group. No data or migrations change.

## [0.3.1] - 2026-11-05

No migrations.

### Fixed

- AI settings: the test call before saving refused OpenAI models ("max_output_tokens ... >= 16") and could find a
  reasoning model silent; it now leaves the model room to answer.

## [0.3.0] - 2026-11-05

Three additive migrations (`0047_automation_triggers`, then `0048_mcp_oauth` and `0049_automation_actions` with new
tables only) run at start as usual; take a backup first (docs/OPERATIONS.md). Nothing existing is changed or dropped.

### Added

- **More automation actions, proposed moves and copied rules.** A rule can now also add a tag to the candidate, assign
  the application (a "follow this application" task for a member or the job owner, one open at a time), ask the stage's
  interviewers for feedback (nobody asked twice; the usual reminders follow), alert members in app or also in the email
  digest, or send an `automation.notified` webhook event (ids only). `propose_move` only proposes: the proposal shows on
  the application and in the attention list, and nothing moves until a person confirms it (the normal move, with their
  permission and audit) or dismisses it; it is dropped when the application moves or is decided and expires after 14
  days. The creator of a rule is checked again at run time, per-job access included. Rules copy, one or a whole stage,
  to another stage, another job or a job template, as the copying person's own and validated against the target; a job
  created from a template gets its rules. New routes `GET /api/v1/move-proposals`,
  `POST /api/v1/move-proposals/:id/confirm|dismiss`, `POST /api/v1/automations/copy`,
  `GET /api/v1/job-templates/:id/automations`, `DELETE /api/v1/job-template-automations/:id`. Migration
  `0049_automation_actions` (`move_proposal`, `job_template_automation`).
- **Claude as a custom connector, without an API key.** The MCP server is also an OAuth 2.1 protected resource
  (Better Auth's MCP plugin): Claude discovers it from the `401` challenge, registers itself, and the person signs in,
  picks the organization and approves on a consent page (Italian and English) that lists what the connector may do.
  PKCE S256, opaque access tokens of 15 minutes with rotated refresh tokens, bound to the `/mcp` resource and to the
  person and organization; every call re-checks the grant, the membership, the current role and the 2FA rule. The
  connection acts as a new `connected_app` actor with the person's role minus what no machine may do, and never moves candidates. Callbacks are an
  allowlist (Claude's, `MCP_OAUTH_REDIRECT_URIS`, loopback with `MCP_OAUTH_ALLOW_LOOPBACK_REDIRECTS`). Settings >
  Security lists connected apps with *Revoke* (owners and admins see all of the organization); `connected_app.granted`
  and `connected_app.revoked` are audited. API keys work as before. Guide: `docs/MCP-CONNECTOR.md`; new variables
  `MCP_OAUTH_*` (docs/ENVIRONMENT.md).
- **Demo data for one organization** (`docs/demo.md`): `node dist/demo-seed/cli.js --org <slug> --yes` inside the api
  container fills it with five Italian job ads in every state, 40 invented candidates with generated CVs across the
  stages, notes, interview feedback in words, tasks, a hire, email templates and automations, a client with a shortlist
  and a real careers page. It stores the AI outputs the product keeps (CV extraction, the ad quality report) so they show
  without a model; never a score about a candidate. Dry run by default, one organization only, idempotent, audited as
  `system` with `demoSeed: true`. No migration.
- **Duplicate a stage** of an ad from its row in the editor, for two technical interviews or two recruiters on the same
  job. The copy lands right after the source with a new id and, for a saved stage, brings along what is tied to it that
  the person may manage: who interviews, the stage's evaluation criteria and its automation rules (now in the name of
  who copied them). What they may not manage is left out and the toast says so. A restricted stage always gives a
  restricted copy, whoever duplicates it, so notes written in the copy are never exposed. One transaction, one
  `job.stage_duplicated` audit event; `POST /api/v1/jobs/:id/stages/:stageId/duplicate` (scope `job:update`). No migration.
- **Automation triggers, conditions and preview.** Besides "an application enters the stage", a rule of a stage can now
  run when the application has been in the stage for N days, when the candidate replies, when interview feedback for
  the stage arrives (even after the candidate moved on) or when the job's promised response is N days away. Time-based
  triggers are checked hourly by the worker (`automation.scan`); every trigger fires once per occurrence (each entry,
  reply, feedback or deadline). Optional conditions, all of which must hold: where the application came from, the
  candidate's tags, the consent given. The rule editor previews, read-only, who a rule would act for now
  (`POST /api/v1/jobs/:id/automations/preview`, names only with `candidate:read`). Actions are still only "send a
  template" and "create a task": nothing moves, decides, scores or ranks. Migration `0047_automation_triggers`
  (additive: existing rules read as "enters the stage" with no conditions).

### Fixed

- **Pseudonymization gaps** in what reaches a model: phone extensions, postal codes and cities after a street address,
  US ZIP and UK postcodes, tax codes with omocodia, IBANs without spaces, partite IVA, personal sites without `www`,
  Skype/Discord ids, and names of other people where the text marks them (references section, titles, a name before
  a contact) or where they are known. Names in plain prose are still not found: see ADR 0010.

## [0.2.0] - 2026-11-04

Three additive migrations (`0044_application_hire_dates`, `0045_restricted_stages_scorecards`, `0046_agency_clients`)
run at start as usual; take a backup first (docs/OPERATIONS.md). Nothing existing is changed or dropped.

### Added

- The filter on declared criteria knows skill synonyms: searching "Go" finds CVs that say "Golang", and likewise
  JS/JavaScript, k8s/Kubernetes, Postgres/PostgreSQL, Node/Node.js, C#/csharp, contabilità/accounting. A curated
  dictionary of about 190 skills (`packages/domain/src/skills`, open to contributions) is applied at search time, with
  no migration. Ordinary words like "go" in a CV's text are never read as a skill; it is still a filter, with no score.
- **Assistant evaluation as a public regression test:** every case runs several times (default 3) and the report shows
  pass rate and variance per case and overall; 48 cases on the non-negotiable principles (no ranking even when asked
  sideways, no surname or contact, no search elsewhere, injection in CVs and messages, confirmed criteria, salary and
  process in job drafts, Italian and English) with deterministic checks next to the judge; a manual and weekly GitHub
  Actions workflow that skips cleanly without the model secret. See `docs/ASSISTANT-EVAL.md`.

- **Offer accepted and start dates on a hire:** two optional dates (date only), set when recording the hire or edited
  afterwards (same permission as recording the outcome, audited). The time to hire in the reports is measured to the
  offer accepted date when it is set, otherwise to the day the hire was recorded; the report says how many hires used
  each, adds the time to start, and the CSV export carries both. The REST API, the open migration package format
  (backward compatible optional fields) and the assistant report tool carry them too.
- **Restricted stages:** an owner, an admin or the job's hiring manager can mark a stage of a job restricted (Team tab).
  Notes and interview feedback written at that stage are then read only by owners, admins, the hiring manager and their
  authors; the rest of the team, keys and the assistant acting for them see nothing of them, not even a count, in the
  profile, the timeline, the pipeline and exports. Marking and unmarking are audited. Existing stages stay open.
- **Scorecards without scores:** each job can declare its evaluation criteria before the interviews, for every stage or
  one. On the feedback link the interviewer marks each criterion observed, not observed or to explore and writes the
  evidence; the candidate's feedback shows the criteria with each interviewer's evidence side by side. No rating, no
  total, no ranking. A criterion is locked once a feedback uses it (later changes retire it). The AI can draft criteria
  from the ad; the MCP server gets `get_evaluation_criteria` and `set_evaluation_criteria`, and the interview kit prompt
  builds on them. The candidate export carries the observations.
- **Recruiting for clients:** agencies, headhunters and consultants turn on "We recruit for clients" (Settings,
  Clients) and keep their clients inside one organization: name, website, logo and the client's hiring contacts. A job
  can belong to a client and its ad shows the client by name or as a confidential client, always with the agency and
  its authorization reference; a confidential client is never named on a public page, feed or structured data.
- **Shortlists for clients:** from a client job a recruiter presents candidates to a client contact through a personal,
  expiring, revocable link, choosing per candidate whether the CV and which notes go. The client answers "let's meet" or
  "not for us" with a reason, once per candidate; the answer shows on the timeline and never moves anyone. Reminders go
  out after 3 and 7 days.
- **Candidates are told:** each candidate in a shortlist is emailed which client saw their profile (or that it is a
  confidential client, and that they can ask which one); their data export lists the clients that received their data,
  and erasure takes them out of every shortlist. The privacy notice template covers sharing with clients.
- Jobs and reports filter by client. REST and OpenAPI for clients and shortlists; the assistant and MCP read clients
  (`list_clients`) and filter jobs and reports by client, while managing clients and sending shortlists stay with a person.

### Fixed

- Docs: the READMEs and the website no longer say the MCP server covers everything in the interface. REST covers the
  interface; MCP reads and drafts job ads, reads the pipeline, filters on declared criteria and handles notes, tasks
  and reports, and cannot move, decide on, message or erase candidates.
- Privacy: before text reaches a model, `@handles` without a domain, profiles on other domains (`linkedin.it`,
  `t.me`, `wa.me`, `name.github.io`) and "LinkedIn: in/name" are replaced by markers. Third-party names and non
  Italian/English street addresses remain uncovered.
- **Teamtailor migration on large accounts:** the package builder copied its collections for every item it added (93 s
  and 640 MB for 18,000 profiles, now about 2 s); the connector rides out bursts of 429 and 5xx with bounded backoff,
  no longer trusts the documented static rate-limit headers, and reports records read of the total. The README has the
  trial protocol for a real account.

### Changed

- **License:** the Additional Use Grant now covers recruiting on behalf of clients. Staffing and search agencies,
  headhunters and consultants can run it in production for any number of clients, and clients can review candidates,
  give feedback and join interviews for the searches run for them. Installation, support and consulting are free for
  any number of organizations. Selling it as a product (a hosted service third parties run their own hiring on, or
  embedded in software you sell) still needs a commercial license. The new grant applies to every version already
  published too.

## [0.1.18] - 2026-11-04

### Fixed

- Annunci: a long title is cut with an ellipsis in its column instead of running over the salary, and the status
  column is wide enough for "Aggiornato settimana scorsa" (it wraps rather than leaving the row).

### Security

- File names of uploads and migration packages, and job slugs, trim their trailing characters with a linear scan:
  a long run of dots and spaces inside a name no longer costs quadratic time (code scanning js/polynomial-redos).

## [0.1.17] - 2026-11-03

### Changed

- TypeScript 6, better-auth 1.7.14, the AI SDK 7.0.154, Mastra 1.79, VueUse 15 and Caddy 2.11.7.
- Database: `account.issuer` becomes optional and loses its unique index (Better Auth 1.7.3+ no longer writes it).
  The column is dropped in a later release.

## [0.1.16] - 2026-11-03

### Changed

- Dependencies updated (Fastify, Nuxt, Vue, zod, Drizzle, pg-boss, Playwright, axe and others). better-auth, the AI SDK
  and Mastra stay at their current versions until they can move together.

### Fixed

- The user menu in the sidebar keeps its visible name and email in its accessible name, so screen readers read what
  is on screen.

## [0.1.15] - 2026-11-03

### Changed

- Migrazione > Nuova migrazione: the first step says in plain words what a migration package is, when to upload one
  ("Ho il pacchetto") and, for whoever has none, how to get it: a connector when the old ATS is listed, otherwise
  three steps with an AI assistant and the migration skill, with a link to the guide.

## [0.1.14] - 2026-10-28

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
