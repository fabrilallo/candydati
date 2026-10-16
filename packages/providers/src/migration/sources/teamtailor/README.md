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
The key is never sent to a file URL.

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
- That signed file URLs are on `teamtailor-production.s3.amazonaws.com` (the docs' example). Another host is refused
  by the reader: the file is skipped and counted, never fetched.
- That `created-at` of jobs is present (the docs say it needs Admin permission); a stand-in date is used if missing.
- A candidate without a name gets the email's local part and `-`; a candidate without any name gets `-`.
- Real rate limits and page timing; large accounts have not been tried.
- Whether `/jobs/{id}/stages` pagination and `sort=row_order` behave as the docs' example link suggests (stages are also
  sorted locally by `row-order`).
