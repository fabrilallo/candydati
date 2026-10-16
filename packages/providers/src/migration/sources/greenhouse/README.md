# Greenhouse connector (beta)

Reads Greenhouse **Harvest v3** with OAuth 2.0 client credentials and writes a migration package (ADR 0009). Harvest v1
and v2 were retired on 2026-08-31. Built on the public documentation (https://harvestdocs.greenhouse.io); **not
verified on a real account**.

## Create the credentials (customer side)

1. In Greenhouse, open Dev Center, API Credentials, and create credentials of type **Harvest V3 (OAuth)**.
2. Grant **read (list) permissions only** for: users, jobs, job interview stages, candidates, applications, application
   stages, notes, attachments, sources. Scope names follow `harvest:<resource>:list` (assumed, see below).
3. **Never grant EEOC or demographic permissions.** The connector never calls them.
4. Grant the **"private data" permission**. Without it Greenhouse silently returns private notes empty: the migration
   would look complete and miss them.
5. Enter the Client ID and Client secret in the wizard. The secret is kept only while the fetch runs.

The list endpoints answer only for a Site Admin authorizing user (the integration user created with the credentials).

## What is read (docs pages relied on)

All under https://harvestdocs.greenhouse.io/. Every list answers a bare JSON array.

| What | Endpoint (page) | Becomes |
| --- | --- | --- |
| Token | `POST https://auth.greenhouse.io/token`, HTTP Basic, `grant_type=client_credentials` (`docs/authentication.md`) | bearer; renewed a minute before `expires_in` and once on a 401 |
| Users | `/v3/users` (`reference/get_v3-users.md`) | users (name, email): note authors |
| Jobs | `/v3/jobs` (`reference/get_v3-jobs.md`), every status | jobs; `closed_at` only for closed jobs; templates skipped |
| Stages | `/v3/job_interview_stages?job_ids=` (`reference/get_v3-job-interview-stages.md`), 50 jobs per request, inactive stages kept | job stages in `sort_order` |
| Candidates | `/v3/candidates` (`reference/get_v3-candidates.md`) | name, first valid email, phone, LinkedIn link, tags (the `tags` field) |
| Applications | `/v3/applications` (`reference/get_v3-applications.md`) | stage = `job_interview_stage_id`; `rejected` becomes `not_selected` closed at `rejected_at`; `hired` becomes `hired`; `answers` |
| Stage history | `/v3/application_stages` (`reference/get_v3-application-stages.md`) | `stageHistory` from `entered_at` (entries without it are skipped) |
| Origin | `/v3/sources` (`reference/get_v3-sources.md`) | application origin = source name |
| Notes | `/v3/notes?type=NOTE,EMAIL` (`reference/get_v3-notes.md`) | `NOTE` becomes a note (author, `private` unless `publicly_visible`); `EMAIL` becomes a past message |
| Files | `/v3/attachments` (`reference/get_v3-attachments.md`) | `resume` becomes cv, `cover_letter` cover letter, `other`, `take_home_test` and `form_attachment` other |

Paging follows the docs (`pagination.md`): `per_page=500` on the first request only, then the `Link: <...>; rel="next"`
URL exactly as given; no Link header means the last page. Rate limits (`api-rate-limiting.md`): a fixed 30 s window;
the reader obeys `X-RateLimit-Remaining`/`Reset` and `Retry-After`, and the connector adds a conservative request rate.

Emails get their direction from the addresses: inbound when `email_from` is one of the candidate's addresses, outbound
otherwise. Files are downloaded right after their record is read (the URLs are valid seven days).

## Not imported, on purpose

- **Scorecards and ratings** (and any `candidate_rating`): never requested, and the package has no field for them.
- **EEOC and demographic data**: the endpoints are never called.
- **Offers**: no salary data; offer packets, offer letters and signed offers are not downloaded. Agreements
  (`midfunnel_agreement`, `automated_agreement`) are not downloaded either.
- **AI opt-out statuses**, custom fields, addresses, rejection reasons, recruiters, referrers.
- Notes of other types (activity, interview, feedback, forms, LinkedIn, follow-ups...).
- **Consent**: Harvest documents no consent date, so candidates come across **without consent**. The product asks them
  to reconfirm (ADR 0008, ADR 0009 decision 2). `can_email` is not treated as a consent date.
- Prospects without a job, applications of a job that is not in the package, and candidates without a name.

## Verified and assumed

Verified against the docs pages above: the token request, paging, rate headers, every endpoint's parameters and the
fields used. Assumed, to be checked on a real account:

- The scope names (`harvest:<resource>:list`) and that a Site Admin integration user can read all of the above.
- `/v3/sources` exists (its page exists but it is not in the docs index); if the token cannot read it, origins are left out.
- Attachment URLs: they may be on a host other than `harvest.greenhouse.io` (signed storage URLs). The bearer is sent
  only to `harvest.greenhouse.io`; a file on any other host is fetched without credentials, from public addresses only
  (https, every resolved address public, redirects re-checked). A file that is refused or expired is skipped (the
  application still comes across).
- A hired application has no hiring date in the docs: its last update (`updated_at`) is used as the closing date.
- An application with no current stage (or one outside the job's first 50 stages) is placed in the job's first stage.
- A second resume of an application is imported as an ordinary file (a package holds one CV per application).
- The request rate (burst 5, 2 per second) stays under the documented example limit of 75 per 30 s.
- The tag names come from the candidate's `tags` field; `/v3/candidate_tags` and applied tags are not needed.
