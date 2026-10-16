# Workable connector (beta)

Reads a Workable account through the public SPI v3 and writes a migration package (ADR 0009). It is built on the public
documentation only and has **not been verified on a real account**: the preview in the wizard is the safety net.

## Getting the token

1. In Workable, open the menu at the top right, then **Integrations** (https://www.workable.com/backend/account/integrations).
2. Click **Generate new token** and tick the read scopes `r_jobs` and `r_candidates`. Nothing else is needed.
3. Copy the token at once: Workable shows it a single time.
4. The subdomain is the part before `.workable.com` in your account address (`acme` for `acme.workable.com`), also shown in
   the company profile settings.

Guide: https://workable.readme.io/reference/generate-an-access-token. Tokens are kept encrypted only while the fetch runs.

## What it reads (all GET, all through the shared reader)

Base `https://{subdomain}.workable.com/spi/v3`, `Authorization: Bearer <token>`. Lists are paged with `limit=100` and
`since_id`; the connector reads the `since_id` out of `paging.next` and builds the next URL itself, because the docs show
`paging.next` on another host and path (`www.workable.com/spi/v3/accounts/...`).

| Endpoint | Used for | Docs |
| --- | --- | --- |
| `/members?status=all` | note and message authors: `id`, `name`, `email` become package users | https://workable.readme.io/reference/members |
| `/stages` | the pipeline of every job: `slug`, `name`, `kind`, `position` | https://workable.readme.io/reference/stages |
| `/jobs?state=draft\|published\|archived\|closed` | jobs: `shortcode`, `title`, `state`, `created_at` | https://workable.readme.io/reference/jobs |
| `/candidates?shortcode=` | the candidate ids of each job | https://workable.readme.io/reference/job-candidates-index |
| `/candidates/{id}` | name, email, phone, tags, LinkedIn link, cover letter, answers, `stage`, `stage_kind`, `disqualified`, `withdrew`, `disqualified_at`, `hired_at`, `sourced`, `domain`, `created_at`, `resume_url` | https://workable.readme.io/reference/job-candidates-show |
| `/candidates/{id}/activities` | stage history, comments, messages, disqualification date | https://workable.readme.io/reference/candidate-activities |
| `resume_url` | the CV, downloaded right after the candidate is read | https://workable.readme.io/reference/job-candidates-show |

Rate limit: 10 requests per 10 seconds for account tokens (`429`, `X-Rate-Limit-*`):
https://workable.readme.io/reference/rate-limits. The reader's bucket (2, refilled 0.8 per second) never exceeds 10 in any
10 second window, and the reader also honours the `X-Rate-Limit-*` headers and `429`.

## Mapping

- Job state: `draft` is draft, `published` is open, `closed` and `archived` are closed (no closing date: Workable does not give one).
- Stages: the account pipeline, the same on every job. A type only where unambiguous: `phone-screen` is a screening call,
  `assessment` a take-home assignment, `offer` an offer. The candidate's current stage is matched by name, then by kind.
- A Workable candidate belongs to one job, so one candidate record becomes one person and one application (same id).
- Outcome: `disqualified` is not selected (withdrawn when `withdrew`), dated by the disqualification activity, else
  `disqualified_at`, else `updated_at`. `hired_at` or a hired stage is hired. Closing dates never precede creation.
- Activities: a move (a `target_stage`, or an action named like a stage) is a stage history entry; `comment` is a note;
  `message` is a historical email; `disqualification` gives the date and its reason becomes a note. Everything else is ignored.
- Origin: `sourced` when Workable says so, otherwise the referrer `domain`.

## Dropped on purpose

Ratings and `rating` activities, scorecards, evaluations, photos (`image_url`), address, headline, summary, skills,
education and experience entries, social profiles other than LinkedIn, and any demographic field. The schemas parse only
the fields above, so the rest never enters the connector.

## Failures

- `401` and `403` stop the migration: credentials refused (a missing scope looks the same).
- A candidate that is gone (`404`) or that the package refuses is skipped and counted, and the run goes on.
- A CV that cannot be downloaded (expired, too large, refused) is skipped and counted: the candidate stays, without the file.
- The subdomain must be one DNS label; anything else is refused before any request.

## Not imported

Attachments other than the resume (`/candidates/{id}/files`), offers, events and interviews, requisitions, job
descriptions, departments and locations, custom attributes, consent and GDPR data. Candidates come in without consent
dates, so they go through the reconfirmation flow of ADR 0008.

## Unverified (built on docs, not tried)

- **CV link**: the host of `resume_url` is not documented. The reader only reaches `*.workable.com`, so if the link points
  elsewhere (for example a storage host) the CV is skipped. The token is sent with the download; whether the link also
  expires quickly is unknown, hence the immediate download.
- **Message direction**: the docs give no direction. A message with a `member` is taken as sent by the team, one without as
  received from the candidate.
- **Move activities**: the docs describe `action_stage` and `target_stage` for moves, but their example shows a move as an
  action named like the stage (`phone-screen`). The connector accepts both and matches stages by name, then slug.
- **Answers**: only the shape in the create-candidate docs (`question.body`, `answer.body` or `answer.choices[].body`).
- **Consent / GDPR fields, custom fields, other attachments**: no clear documented field, so nothing is read.
- **Pagination of members and activities**: the docs show no `paging` there; it is followed if present.
- **Counts of skipped items** are kept by the run but not shown in the product yet.

The fixtures in `src/testing/fixtures/migration/workable/` are the docs' own examples; each carries its source URL.
