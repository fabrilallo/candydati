# Recruitee connector (beta)

Reads a Recruitee account through its REST API and writes a migration package (ADR 0009). It is **the least verified
connector**: Recruitee's public documentation is thin, it has not been run against a real account, and several endpoints
and response shapes are assumed. The preview before the commit is the safety net.

## Credentials

- **Company ID or subdomain**: digits (Settings, Company settings, General) or the subdomain.
- **Personal API token**: an **admin** creates it in Settings, Apps and plugins, Personal API tokens, "New token". The
  token has the permissions of its creator, so a user who cannot see every candidate gives an incomplete migration.
  It is used for this fetch only and never stored (ADR 0009, decision 5). Revoke it after the migration.

## What it does

Host `api.recruitee.com` only, base `https://api.recruitee.com/c/{company}`, `Authorization: Bearer <token>`. GET only.
Throttled to 5 requests a second (documented limit: 1000 a minute per token; Recruitee announced stricter limits from
15 October 2025 without publishing them); 429 and `Retry-After` are honoured by the reader. Each candidate costs about
three requests, so 10,000 candidates take roughly an hour and a half.

| Endpoint | Used for | Status |
| --- | --- | --- |
| `GET /search/new/candidates?limit=100&page=N&sort_by=created_at_asc` | candidates, tags, source, GDPR expiry, placements (job, stage, disqualification) | verified in the docs |
| `GET /candidates/{id}` | CV (`cv_original_url`, else `cv_url`), `cover_letter`, `links` (LinkedIn) | verified in the docs, never run |
| `GET /offers` and `GET /offers?scope=archived` | jobs, status, dates | endpoint documented, response shape **assumed** |
| `GET /offers/{id}` | pipeline stages of an offer (`pipeline_template.stages`) | verified in the docs |
| `GET /candidates/{id}/notes` | notes | **assumed**: no public documentation |
| `attachments` list inside `GET /candidates/{id}` | extra files | **assumed**: the docs only show `attachments_count` |

Sources relied on: docs.recruitee.com `reference/getting-started`, `reference/searchnewcandidates.md`,
`reference/candidatesid-get.md`, `reference/offersid-get.md`, `reference/offers-get.md` (no response schema),
`reference/candidates-get.md` (not used: the search endpoint is the documented way to list), `llms.txt`, and the support
articles `8213076-faq-api` and `12087172-upcoming-changes-to-your-custom-api-integrations` (the legacy `/offers`
endpoint changed on 1 December 2025; its new shape is not public).

## Mapping

- Placement (application): disqualified (`disqualified` or `disqualified_at`) becomes `not_selected`, closed at the
  disqualification date; a stage named or categorised "hired" becomes `hired`. Otherwise it stays open at its stage.
  `disqualify_kind` values are not documented, so no `withdrawn` outcome is produced; `disqualify_reason` is dropped.
- Jobs: status `draft` to draft, `closed` and `archived` to closed, everything else (published, internal) to open.
  Jobs and stages missing from the offers list are rebuilt from the placements. Job descriptions are not imported.
- Consent: only when a clear given date exists (`gdpr_consent_given_at`, **an assumed field name**: the docs document
  `gdpr_expires_at` and `gdpr_consent_ever_given` but no date), with `gdpr_expires_at` as its expiry. Without a date the
  person goes through the reconfirmation flow. A candidate whose `gdpr_expires_at` has already passed is left out.
- The candidate-level cover letter and files go on the candidate's first application. Deleted candidates are left out.

## Dropped on purpose

Ratings, positive ratings, evaluations and scorecards, photos and avatars, equal-opportunity (`eeo_*`) data and any
demographic field. They are never read, and the package has no field for them.

## Not imported

Activity timeline, emails and messages, talent pools' own settings, interview scheduling, custom profile fields,
job descriptions, stage history (the search hit has no stage dates), withdrawn outcome. No documented shape exists for
the timeline and emails, so they are not attempted.

## Failure behaviour

- 401/403 on the search or on a refused token: the fetch fails with `credentials_refused`. Other failures surface as
  the reader's codes (`source_unavailable`, `source_rate_limited`, `source_invalid_response`), never with a URL or body.
- Optional endpoints (offers, offer detail, candidate detail, notes): 401/403 switches the endpoint off for the run, 404
  skips that call (five in a row switch it off), an unexpected shape skips the call. Skips are counted
  (`onSummary` / `onSkip`), never logged with data. Jobs are then rebuilt from placements and the candidates still come.
- Files: downloaded right after their candidate is read. The token is sent only to `api.recruitee.com`; a file on any
  other host (Recruitee's file host is not documented, signed storage URLs are likely) is fetched without credentials,
  from public addresses only (https, every resolved address public, redirects re-checked). A file that fails is skipped
  and counted as `file_<code>` (for example `file_not_found`, `file_host_not_allowed` for a private address).
- A record the package refuses (an unsafe name, for example) is skipped and counted; the rest goes on.
