# @candydati/e2e

End-to-end tests (Playwright, Chromium only) for the critical flows. One spec per flow:

1. `01-invite-colleague` sign up (address confirmed through the emailed link), create organization, invite a recruiter
   by email, accept, members page
2. `02-job-ad` privacy notice, job ad, publish blocked (missing field, one-sex title), public pages, XML feed
3. `03-apply-and-pipeline` public application with PDF, receipt email, move, message, outcome
4. `04-candidate-rights` ZIP export, erasure by typing the name, gone from search
5. `05-interview-feedback` external interviewer link from email, no session, phone viewport
6. `06-import` ZIP + CSV import, preview with confidence, confirm, undo
12. `12-migration` migration package (built in code by `support/migration.ts`): preview, bulk stage mapping, the three
   declarations, closed jobs with their history, undo

Every test creates its own user, organization and data with unique emails and never touches anything else.
Signing up sends a confirmation email: `signUp` opens its link from Mailpit, which signs the person in (there is no
session before that). The stack must run with `SIGNUP_MODE=open` (the default outside production) and an SMTP
provider that delivers to Mailpit (`EMAIL_PROVIDER=smtp`, as in `.env.example`).
PDFs, ZIP and CSV are generated in code.

## Run

Against the running dev stack (`pnpm infra:up`, `pnpm dev`):

```sh
pnpm --filter @candydati/e2e install:browsers   # once: downloads Chromium
pnpm test:e2e                            # from the root, or: pnpm --filter @candydati/e2e test
pnpm --filter @candydati/e2e exec playwright test 03   # one spec
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
runner's `X-Forwarded-For` (`TRUST_PROXY`), or `API_URL=proxy` if that stack runs with relaxed limits. Invitations are emailed: the accept link
(`/accept-invitation/{id}`) is read from the invitee's message in Mailpit.
A first run against `nuxt dev` is slow (the browser loads thousands of modules): prefer a built stack in CI.

## README screenshots

`pnpm --filter @candydati/e2e screenshots` builds a demo organization through the app (owner `giulia.rossi@example.com`, four
published ads, ten applicants, notes, external interviewer feedback, a published careers page with locally generated
images) and writes `docs/assets/screenshots/{pipeline,job-editor,careers,candidate}.png` (1440 px wide, light theme,
palette PNGs under 600 KB). It uses its own config (`playwright.screenshots.config.ts`, files in `screenshots/`), so
`pnpm test` and CI never run it. Needs the dev stack with the worker running (the CV reader fills the cards).
`SCREENSHOTS_REUSE=1` captures again from the previous run's organization without seeding.
