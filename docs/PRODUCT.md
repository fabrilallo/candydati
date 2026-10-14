# Product

This document explains what the product is, the principles it will not trade away, and the rules the code enforces to honour them. Code and other documents cite it as `PRODUCT.md §n`.

`team-tracker` is a code name. The product name is read from platform configuration (`loadPlatformConfig`) and is never written in code.

## 1. What it is

An open source, agentic applicant tracking system (ATS) that sits on the candidate's side of the table. Transparency is not an option a company can switch off: it is how the product works.

It is built for small and mid-sized companies, their recruiters and generalist HR people (not only technical users), and for the candidates who apply through the public careers pages. It is designed to be driven equally well by a person in the interface and by an agent through the API.

The interface is available in Italian and English. Job ad compliance rules follow Italian law (see §4.2).

## 2. Principles

These are not configuration. A deployment cannot turn them off.

### 2.1 Salary range is mandatory

A job ad without a salary range cannot be published. The range is shown in the ad, in the structured data and in every feed.

### 2.2 The selection process is declared

Stages, who runs them, how long they take and how fast candidates get an answer are visible before anyone applies. The stages declared in the ad become the stages of the pipeline: what the candidate reads is what the recruiter uses.

### 2.3 Every application gets an answer

Every candidate always receives an outcome. The system supports this structurally:

- every application carries a response promise ("answer within N days") that is counted down and escalated internally;
- an ad with applications still open cannot be closed: a person decides each one first;
- applications past their promise are surfaced to the company until someone acts.

### 2.4 No automated decisions about candidates

The product does not rank, score, order or reject people, and it has no automation rule that moves or decides. Quality scores evaluate the ad, never candidates. Interview feedback describes what was seen and carries no score. This is also the GDPR position on automated decision-making (§6).

### 2.5 Agentic-ready

Everything that can be done in the interface can be done through the API and through MCP, with the same use cases and the same permissions (see §5).

### 2.6 GDPR by design

Consent, retention and erasure exist from the first candidate record stored, not as a later addition (see §6).

### 2.7 No lock-in

The code is open. A complete export in an open, documented format is available at any time (see §4.4).

## 3. Scope

### 3.1 In scope

| Area | What it covers |
|---|---|
| Job ad | Structured editor, mandatory standard (§4), quality score, templates |
| Careers page | Open positions list, ad page, application form with no registration. Deliberately minimal, not a site builder |
| Pipeline | Stages per ad, candidate profile, notes, tags, search across the candidate database. The original CV is always viewable next to the data extracted from it |
| Communication | Templates, single and bulk sends, inbound email attached to the candidate, outcome messages |
| Automation | Triggers per stage, response deadlines, reminders. No trigger decides about a candidate |
| Distribution | Structured `JobPosting` data, XML feed, public read-only ads API |
| GDPR | Versioned consents, retention, automatic erasure, candidate rights (§6) |
| Access | Organizations, roles, per-ad selection team, append-only audit log |
| Reports | Time to hire, conversion per stage, source, response times and share of applications with an outcome |
| Import / export | Import from CVs and unstructured data with preview and confirmation, undoable as a whole; complete export |
| HR tools | Interview feedback without login (see below), hiring needs intake form, optional approval of budget and salary before publication, flagging of stalled ads |
| Agent | Internal process assistant, public API, MCP server, webhooks (§5) |

HR tools in more detail:

- **Interview feedback without an account.** The person running a stage receives a personal link by email, answers fixed questions per stage type from a phone in a few minutes, and gets a reminder if needed. The feedback describes; it assigns no score to the candidate (§2.4).
- **Hiring needs intake.** The hiring manager fills in a form (role, budget, stages, interviewers) from which the assistant prepares a draft ad.
- **Opening approval.** Per organization, publication can require an approved budget and salary range.
- **Stalled ads.** An ad published for 90 days without activity is flagged to the company. It is never closed automatically.

### 3.2 Out of scope by choice

Advanced career site builder, automatic CV screening or ranking, email campaigns to candidates, on-site chat, onboarding, automatic "match" scores.

### 3.3 Deferred

Scorecards and interview kits. Restricted stages (feedback and notes of a stage visible only to owners, admins and the hiring manager, §6.2). Interview scheduling through an integration with a scheduling service rather than a proprietary calendar sync. Dedicated importers for individual ATS products.

## 4. The job ad standard

Two levels of control: the first blocks, the second flags.

### 4.1 Deterministic publish rules

No model is involved. Without these fields the ad stays a draft.

| Field | Rule |
|---|---|
| Title and role | Role chosen from the taxonomy, not free text |
| Experience level | Value from the taxonomy |
| Salary | Minimum and maximum, currency, period, gross. Both required, maximum greater than or equal to minimum |
| Contract type | Value from the list |
| Work mode | Remote, hybrid or on site. For hybrid or on site: location and days on site |
| Selection process | Ordered list of stages, each with type, duration and who runs it |
| Response time | Days within which a candidate hears back after each stage |
| Responsibilities | At least three items |
| Requirements | Required and preferred kept separate |

### 4.2 Italian compliance and structured pay

The publish check also encodes Italian rules. Clear violations block publication; doubtful wording is flagged.

- The ad must address both sexes (D.Lgs. 198/2006).
- Protected categories must be mentioned correctly (L. 68/99).
- The applicable collective agreement (CCNL), classification level and quantified benefits (meal vouchers, welfare, thirteenth and fourteenth month salary) are structured fields of the ad. They appear on the public page, in the feed and in the JSON-LD.

### 4.3 Quality score

The score has ten categories, each from 0 to 1: selection process, role requirements, work mode, salary transparency, benefits and welfare, growth and training, work-life balance, clarity of responsibilities, culture and values, technologies and tools.

- The editor shows the score, the vague phrases found and a proposed rewrite while the author types.
- The flagging threshold is configurable per instance. Below it, the editor warns before publication and says what to improve. The score never blocks: the author can always publish.
- The analysis runs inside the repository (no external service), so it works when self-hosted. If the analysis fails, publication does not wait for it.
- The score evaluates the ad, never candidates.

### 4.4 Public schema

The schemas of the job ad and of the application are public and versioned (`docs/schema/`). They are the same ones used by the API, the feeds, import and export.

## 5. Agent and API principles

### 5.1 Surfaces

| Surface | What |
|---|---|
| Internal assistant | An assistant in the interface whose tools call the same application services as everything else |
| Public API | REST documented with OpenAPI, keys with permission scopes per organization |
| MCP server | The same use cases exposed as tools for a company's own agents |
| Webhooks | Signed events: application received, stage change, outcome, ad published |

### 5.2 What the assistant may do

It writes and corrects the ad, proposes the salary range (with benchmark data where a provider is configured), drafts replies, nudges whoever owes a response, flags applications about to expire, extracts structured data from CVs and guides imports.

### 5.3 What it may not do, and why

- **It does not rank, score or reject candidates** (§2.4). The product takes no automated decisions.
- **It never sends a message to a candidate on its own.** A person confirms every message. The only automatic message is the application receipt.
- **Closing, deciding and administration stay with a person.** Keys and the assistant cannot be granted those capabilities.
- **Every action is in the audit log, distinguishable from human ones**, so anyone can tell who did what.
- **CV and email contents are data, not instructions.** The assistant does not execute what it finds written inside them; this is tested adversarially.
- **It holds the permissions of the user it acts for, never more.** API keys carry explicit scopes and the same checks apply on every call.
- **It is stateless.** It keeps no server-side memory, so conversations that may contain candidate data add no store to retain, export or erase. The model provider is configurable and listed as a sub-processor (§6).

### 5.4 Machine-readable public pages

Public ad pages carry JSON-LD `JobPosting` with the salary always present, plus feeds and `llms.txt`, so that search engines and agents read the same transparent data.

## 6. GDPR approach

Roles. The client company is the data controller. In the hosted offering the service operator is the processor. When self-hosted, the company is both.

| Requirement | How |
|---|---|
| Notice and consent | Versioned text per organization. Each application stores the version, date and scope accepted |
| Separate consent scopes | `selection` (the position applied for only) or also `talent_pool` (future positions) |
| Retention | Duration per scope, expiry computed on every candidate |
| Automatic erasure | Daily job: notice before expiry, then anonymisation or deletion, files included |
| Candidate rights | On request to the contact given in the notice; the recruiter carries them out from the candidate profile: data export, correction, erasure, consent withdrawal |
| Audit log | Who viewed, changed, exported or deleted what. Append only |
| Minimisation | No field for special-category data; CV extraction discards photo, date of birth, marital status |
| Access | Permissions by role and by ad (§6.2) |
| Language models | Configurable provider, listed as a sub-processor; no data used for training; a local model is possible when self-hosting |
| Automated decisions | None (§2.4) |
| Documents | Data processing agreement template, sub-processor list, record of processing activities (`docs/legal/`) |
| Public form | A submission never rewrites an existing person's profile: the typed contact data stays on the application and a recruiter reviews it ("new details from the application"). An existing open application is answered like a success (nothing reveals who applied), receipts have a per-recipient and a per-organization daily cap, and an optional Cloudflare Turnstile check can be switched on |
| Imported data | Consent marked "to be renewed", with a reconfirmation email; imported candidates stay visible only in the pipeline of their import until they reconfirm, and their data is erased if they do not |

### 6.1 What erasure cannot reach

Erasure removes the candidate and everything hanging from the applications in the database and in file storage (CVs, and
the organization exports generated so far, which are deleted whenever any candidate is erased: generate a new one). It
cannot reach copies that left the system:

- **Webhooks already delivered.** The receiving system keeps what it received (events carry ids and counts only, but
  the receiver may have looked the person up).
- **Emails already sent.** Receipts, replies and reconfirmation requests sit in the recipients' mailboxes and in the
  sending provider's logs (SMTP server, Resend) for as long as that provider keeps them; Mailpit in development keeps
  them until it is restarted.
- **Provider copies.** A CV text sent to a language model for extraction or the assistant stays under the provider's
  own retention (choose a provider with no training and short retention, or a local model).
- **Exports and downloads people made.** A candidate export or an organization export that a recruiter saved to a
  disk, and database backups, are the operator's to purge (backups age out with their rotation).

The privacy notice template tells candidates the same.

### 6.2 Access by role and by ad

The organization role says what a person may do; the team of a job says on which jobs they may do it. This is enforced
in core, on every surface (interface, API, MCP, assistant), for candidates, applications, CVs, messages, notes, feedback,
tasks, notifications, the attention list, pipelines, search, exports, imports, automations and reports.

- **Owners and admins** reach every job of the organization.
- **Recruiters** reach every job too, unless the organization turns on "recruiters see only the jobs of their team"
  (off by default); then they are scoped like the roles below.
- **Hiring managers and interviewers** reach only the jobs whose team they are on. A person is on a job's team when
  added to it (Team tab: hiring manager, interviewer or recruiter), when they created the job (added automatically,
  also for a draft made from a hiring request, together with the requester), or when they interview at one of its stages
  (implicitly, for as long as they are assigned to the stage).
- A job outside one's scope does not exist: lists leave it out and opening it answers "not found". A candidate is visible
  when at least one of their applications belongs to a reachable job, and the profile shows only those applications and
  the notes, messages, feedback and tasks about them. A note on the candidate as a whole (not about an application) is
  visible to scoped people only when they wrote it. Erasing a candidate as a scoped person erases only the applications
  they reach. Exports of a candidate contain only what the exporter reaches; requests under the GDPR rights are best run
  by an owner or admin, who reach everything.
- **API keys and the assistant** have the scope of the person they act for, never more. Adding or removing team members
  and the recruiter setting are decisions of a person: keys and the assistant cannot make them.
- Team changes and the recruiter setting are in the audit log.
- **Deferred: restricted stages.** Making the feedback and notes of a stage visible only to owners, admins and the job's
  hiring manager is not implemented: notes are not tied to a stage today. Until then, everyone on a job's team sees all
  of its feedback and notes.

## 7. Open source and hosted

- **Open source (AGPL):** the complete product. No reserved features.
- **Optional hosted offering:** the same code, with external data providers (for example salary benchmarks) and distribution channels registered on top.
- **How the two are kept apart in code:** external data enters only through generic interfaces (such as `SalaryBenchmarkProvider`, `DistributionChannel`, `EmailProvider`). The open source build ships empty or generic implementations. There is no hosted-only branch in the code.

## 8. Architecture and conventions in brief

### 8.1 The central rule

Business logic lives in `packages/core`. REST routes, assistant tools and MCP tools are thin adapters over the same services with the same permissions. This is what makes the product agentic-ready without writing everything twice. See `docs/ARCHITECTURE.md`.

### 8.2 One response envelope

Every API response uses one shape: outcome, data, error and pagination metadata. Inputs are validated with a schema at every boundary (HTTP, assistant tools, uploaded files, model responses).
