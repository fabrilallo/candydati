# Teamtailor connector

Status: **beta**. Built on Teamtailor's public documentation, not verified on a real account (ADR 0009, decision 6).
Sources used: https://docs.teamtailor.com/ and the full reference mirror https://teamtailor-docs.netlify.app/ (the
first renders only in a browser; the mirror is the same reference as static HTML).

## How to get the key

In Teamtailor: Settings, Integrations, API keys (https://app.teamtailor.com/app/settings/integrations/api_keys),
create a key with **Admin** scope and **read** permission. Candidates, job applications, notes, answers and stages need
the Admin scope ("Required scope: Admin" in the reference). The key is used only for the transfer and is never stored.

## What it reads

Base `https://api.teamtailor.com/v1`, JSON:API, headers `Authorization: Token token=<key>` and `X-Api-Version: 20161108`
(the docs: "The current version is 20161108", header required). Pages of 30 (`page[size]`, max 30), following `links.next`.
The key is never sent to a file URL. Files on a host other than `api.teamtailor.com` (the signed storage URLs) are
fetched without credentials, from public addresses only (https, every resolved address public, redirects re-checked).

| Endpoint | Used for |
| --- | --- |
| `GET /users` | `name`, `email`: sign notes (no accounts are created) |
| `GET /jobs?filter[status]=all` | `title`, `status`, `created-at` (open, unlisted: open; archived: closed; draft, temp: draft) |
| `GET /jobs/{id}/stages?sort=row_order` | `name`, `row-order` (path as in the docs' pagination example) and `stage-type` |
| `GET /reject-reasons` | `rejected-by-company`, only to tell a rejection from a withdrawal |
| `GET /job-applications?include=candidate,job,stage,reject-reason` | `created-at`, `rejected-at`, `changed-stage-at`, `cover-letter`, `referring-site`, `sourced`, and the ids of candidate, job, stage, reject reason |
| `GET /questions`, `GET /answers?include=candidate,question` | form answers: question `title`; answer `text`, `boolean`, `range` |
| `GET /candidates` | `first-name`, `last-name`, `email`, `phone`, `linkedin-url`, `tags`, `created-at`, `resume` (else `original-resume`) |
| `GET /uploads?include=candidate,job` | `url` (valid 1 minute), `file-name`, and the candidate and job ids |
| `GET /notes` | `note`, `user-id`, `candidate-id`, `private-note`, `created-at` |

Mapping: a rejected application (`rejected-at`) is `not_selected`, or `withdrawn` when its reject reason has
`rejected-by-company: false`; otherwise an application in a `Hired` stage is `hired`. Rejection wins over a hired stage.
Teamtailor exposes only the current stage and `changed-stage-at`: the stage history is one entry. Files are downloaded
right after their record is read (signed links live 30 s to 1 minute). The CV and the form answers go to the
candidate's latest application; an upload goes to the application of its job, else to the latest.

## Left out on purpose

Ratings, scores, NPS, partner and assessment results, AI results, any demographic field, pictures and `pitch`, custom
fields, referrals, requisitions, todos, activities, locations, departments, roles, teams, `linkedin-profile` and
`facebook-profile` HTML, and the candidate's unsubscribed flag. Choice answers (the API gives alternative ids, not their
text). Messages (no email endpoint is documented). No consent is mapped: the candidate has only the write-only
`set-consent-expiration` and no consent date, so the product asks every person to reconfirm.

## Verified against the docs

Base URL, both headers, the version, pagination parameters and `links.next`, the rate-limit headers (documented as
static values, so the connector paces itself at 3 requests a second), the attributes named above, the stage types
(Inbox, In process, Hired), signed URL lifetimes, the `rejected-by-company` flag. The fixtures in
`src/testing/fixtures/migration/teamtailor/` are built from the docs' examples.

## Assumed, not verified

- That `include` makes list responses carry `relationships.<name>.data` (`{ id, type }`): the docs' list examples show
  only `links`. If the API does not, the run stops with `source_invalid_response` instead of importing nothing.
- That `filter[status]=all` returns jobs of every status for an Admin key, and that no `filter[feed]` is needed.
- The notes list shape: the docs show `{ "notes": [ { "data": ... } ] }`; both that and `{ "data": [...] }` are accepted.
- That signed file URLs need no credentials (the docs' example is on `teamtailor-production.s3.amazonaws.com`). Any
  public https host is accepted for them, without the key; a link that is refused or expired is skipped and counted.
- That `created-at` of jobs is present (the docs say it needs Admin permission); a stand-in date is used if missing.
- A candidate without a name gets the email's local part and `-`; a candidate without any name gets `-`.
- Real rate limits and page timing. The docs give no number, only static headers (see "Large accounts"); the pacing
  below is ours, not Teamtailor's. Large real accounts have not been tried.
- Whether `/jobs/{id}/stages` pagination and `sort=row_order` behave as the docs' example link suggests (stages are also
  sorted locally by `row-order`).

## Large accounts

What the connector does at the scale of tens of thousands of profiles, and what the docs do and do not say.

- **Rate limits.** The docs (https://docs.teamtailor.com/, "Rate Limit Headers") name `X-Rate-Limit-Limit`,
  `X-Rate-Limit-Remaining` and `X-Rate-Limit-Reset`, and say they "contain static values. Please use common sense when
  making requests to the API until it returns real rate limit values". No request quota is documented. So the connector
  does not wait on those headers (a static `Remaining: 0` would stall a run forever); it paces itself at 3 requests a
  second and honours a `429` with its `Retry-After`.
- **Retries.** A `429`, a `5xx`, a timeout (30 s per page) or a broken connection is retried up to 8 times with
  exponential backoff and jitter (1 s doubling to 60 s; a `Retry-After` is obeyed up to 120 s). That tolerates about
  three minutes of throttling per request, then the run fails with `source_rate_limited` or `source_unavailable`. A
  `401`/`403` fails at once as `credentials_refused` ("the key was refused": wrong key, or not an Admin read key).
- **Memory.** Pages of 30 are read one at a time and every file streams to storage, never into memory. What is kept is
  the package itself (one record per person, application and note) and two lookup maps (applications and answers by
  candidate) until the candidates are read. Measured on a synthetic account of 18,000 profiles, 24,000 applications,
  18,000 answers, 6,000 notes and 900 files: the whole run including the split into packages takes about 1 to 3 s and
  stays near 180 MB of heap, test data included (the test server's fixtures are in that number). Before the fix, per-item
  array and map copies in the package builder made the same run take 93 s and 640 MB; they are gone. A real account
  has longer texts (cover letters), so expect a few times that: well within the worker's memory.
- **Packages.** One package holds at most 10,000 files, 50,000 people and 100,000 applications
  (`MIGRATION_LIMITS`). An account above that is split by job into several linked parts, automatically.
- **Progress.** Before reading, the connector asks each list for its size (`meta.record-count`, one request of one
  record per list) and reports records read of the total; if any list does not say, the total stays unknown (an
  indeterminate bar, never a wrong one). Progress also keeps the batch alive for the reconciler (15 minutes without a
  sign), and the job may run up to 12 hours.
- **Resuming.** There is none inside a run, on purpose: credentials are kept only until the fetch ends and a failed fetch
  is never retried (ADR 0009, decision 5). A crash or an exhausted retry fails the batch; the operator starts a new
  migration with the key again. Nothing is committed by a fetch, so there is nothing to duplicate, and committing the
  same account twice is safe: people merge by email and applications already imported are skipped
  (`skippedAlreadyApplied`).
- **Time.** At 3 requests a second, 18,000 profiles need roughly: 2,000 to 3,000 page requests (10 to 17 minutes, the
  application, answer, upload and note lists are of the same order as the candidates) plus one request per file (every
  CV and upload is one download, paced by the same bucket): up to 18,000 more, so 1.5 to 2 hours if every profile has a
  CV, less if many do not. These are estimates from the page size and the pacing, not measurements on a real account.

## Trial on a real account

Status stays **beta** until a trial like this one is done and recorded in `docs/migration/sources.md`.

**Who runs it.** The account's owner, on their own self-hosted instance. No candidate data passes through us: the key
is entered in their instance, the data goes from Teamtailor to their server, and only the numbers below come back.

**What they need.**
1. A self-hosted instance with a worker running (the fetch runs in the worker), with room for the files: CVs of 18,000
   profiles can be several GB of temporary storage. Disk or object storage at least that large, and a 4 GB server.
2. A read-only API key with the **Admin** scope (Settings, Integrations, API keys). Create it for the trial and revoke it
   afterwards. It is never stored by the instance and never leaves the instance and Teamtailor.
3. The migration wizard: choose Teamtailor, paste the key, wait. Do not stop the worker during the run.

**Expected duration.** Between about 15 minutes (no files) and 2 hours (a CV for every profile), see "Time" above. The
migration screen shows records read of the total, and the number of parts when it ends. Then comes the analysis of each
part, the preview, and the commit by an owner or admin.

**What to record** (counts only, no names, emails or documents):
- Per entity, Teamtailor vs imported: candidates, applications, jobs, notes, users, files (CVs and uploads). Teamtailor's
  numbers are the lists' `meta.record-count`, also visible as totals in its UI; ours are in the preview and, after the
  commit, in the import summary. Note every difference and what the preview said about it (skipped, merged by email,
  no email).
- The run's own report (`onReport`: users, jobs, candidates and skipped, applications and skipped, notes and skipped,
  files and skipped, answers) and the preview notices.
- Errors: the failure code shown (`credentials_refused`, `source_rate_limited`, `source_unavailable`,
  `source_invalid_response`, `part_too_large`, `fetch_interrupted`, `fetch_failed`), at what progress it happened, and
  whether a second attempt got further.
- Duration: start, end, number of parts, and how many files failed (expired signed link, refused, too large). Whether
  `429` appeared at all (worker log: `throttle` and `retry` events, with redacted URLs).
- Peak memory and disk of the worker, if easy to read.
- What looks wrong in the data: stages, outcomes (hired, rejected, withdrawn), the CV on the right application, notes
  authors. Describe, do not paste.

**How to report back.** Open an issue titled "Teamtailor trial: <number of profiles>" on the project's repository with
the numbers above (a table is ideal) and the error codes; no personal data, no key, no screenshots of candidates. Say
which points of "Assumed, not verified" held and which did not. When they hold on a real account, the connector can go
to stable; each one that fails is fixed first.
