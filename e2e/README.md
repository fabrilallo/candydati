# @tt/e2e

End-to-end tests (Playwright, Chromium only) for the critical flows. One spec per flow:

1. `01-invite-colleague` sign up, create organization, invite a recruiter, accept, members page
2. `02-job-ad` privacy notice, job ad, publish blocked (missing field, one-sex title), public pages, XML feed
3. `03-apply-and-pipeline` public application with PDF, receipt email, move, message, outcome
4. `04-candidate-rights` ZIP export, erasure by typing the name, gone from search
5. `05-interview-feedback` external interviewer link from email, no session, phone viewport
6. `06-import` ZIP + CSV import, preview with confidence, confirm, undo

Every test creates its own user, organization and data with unique emails and never touches anything else.
PDFs, ZIP and CSV are generated in code.

## Run

Against the running dev stack (`pnpm infra:up`, `pnpm dev`):

```sh
pnpm --filter @tt/e2e install:browsers   # once: downloads Chromium
pnpm test:e2e                            # from the root, or: pnpm --filter @tt/e2e test
pnpm --filter @tt/e2e exec playwright test 03   # one spec
```

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | web origin |
| `MAILPIT_URL` | `http://localhost:8025` | Mailpit REST API (emails are read by recipient) |
| `API_URL` | `http://localhost:4100` | api origin; `proxy` sends browser api calls through the web proxy untouched |
| `E2E_WORKERS` | `2` | parallel workers |

## Rate limits

The api limits per client IP (sign-up/sign-in 20 per minute, public applications 5 per 10 minutes, imports 10 per
minute) and the web proxy only trusts the socket address, so one machine running the whole suite shares one budget.
By default each browser context sends its `/api/**` calls straight to `API_URL` with its own `X-Forwarded-For`
(the api trusts that header from loopback only, see `TRUST_PROXY`). Signed-in page loads also make the web server call
the api for the session, which shares one budget for all users, so after the first load the tests move with the app's
router (`support/nav.ts`) and reload only where fresh data is the point.

In CI against a compose stack: set `BASE_URL`, `MAILPIT_URL`, and either set `API_URL` to an api origin that trusts the
runner's `X-Forwarded-For` (`TRUST_PROXY`), or `API_URL=proxy` if that stack runs with relaxed limits. Invitations are
logged by the api, not emailed: the accept link is read from the inviter's organization (`/accept-invitation/{id}`).
A first run against `nuxt dev` is slow (the browser loads thousands of modules): prefer a built stack in CI.
