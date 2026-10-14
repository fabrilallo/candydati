# Security policy

## Supported versions

The project is pre-1.0. Only the latest commit on `main` and the most recent tagged release receive security fixes.

| Version | Supported |
|---|---|
| `main` / latest release | yes |
| older releases | no |

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private flow: go to the repository's **Security** tab, then
**Report a vulnerability** (GitHub Security Advisories). Include what you found, how to reproduce it, the affected
version or commit, and the impact you expect.

If you cannot use GitHub, email fabrizio.lallo95@gmail.com.

Response targets (best effort, run by volunteers):

| Step | Target |
|---|---|
| Acknowledge the report | 3 working days |
| First assessment and severity | 7 days |
| Fix or mitigation for high and critical issues | 30 days |
| Public advisory and credit | after a fix is released, coordinated with you |

Please give us a reasonable window to fix before any public disclosure.

## Scope

In scope: the code in this repository (`apps/api`, `apps/worker`, `apps/web`, `packages/*`), the Docker images and
`docker-compose.prod.yml`, and the default configuration. Examples: authentication and organization isolation bypass,
permission escalation, access to another organization's candidate data, injection, SSRF through webhooks, unsafe file
handling (CV upload, ZIP import), leaking personal data, tampering with the append-only audit log, prompt injection that
makes the assistant take an action the user could not.

**Self-hosted instances.** Each operator runs and secures their own deployment. Misconfiguration of your own server
(weak secrets, exposed ports, missing TLS, an unpatched host, `WEBHOOKS_ALLOW_PRIVATE=true`) is not a vulnerability in
the project, but a default that makes such misconfiguration easy is, so tell us. Never test against someone else's
instance.

Out of scope: denial of service by volume, social engineering, findings from automated scanners without a demonstrated
impact, vulnerabilities in third-party dependencies with no exploitable path here (report those upstream; we track them
with Dependabot and `pnpm audit`).

## Secure defaults for self-hosted instances

What the code enforces, so an operator does not have to remember it:

- **Secrets.** With `NODE_ENV=production` the api and the worker refuse to start when `BETTER_AUTH_SECRET`,
  `INBOUND_WEBHOOK_SECRET`, `S3_SECRET_KEY` or the password in `DATABASE_URL` is an example value from `.env.example`
  (`change-me...`, `tt-minio-secret`), too short (32 characters for the first two, 16 for the others) or not random
  enough. `docker-compose.prod.yml` runs the same check (`docker/config-check.sh`) before any other service starts.
  Generate each one with `openssl rand -base64 48`.
- **Transport.** Production requires `https` for `BETTER_AUTH_URL` and `PLATFORM_URL`, so the session cookie is
  always `Secure`.
- **Email.** `EMAIL_PROVIDER=log` (which sends nothing) is refused in production: confirmation, password reset and
  invitation emails must arrive.
- **Accounts.** Every account confirms its email before the first sign-in; sign-up and password reset answer the
  same whether an address is registered or not. `SIGNUP_MODE=invite_only` is the production default: an account can be
  created only by an address with a pending invitation, which only a confirmed account with that address can accept.
- **First owner (bootstrap).** On an instance with no account at all, `invite_only` still accepts one sign-up: the
  first owner. Create it right after the first start (sign up, confirm the email, create the organization), before
  the URL is public. From then on people join through invitations. To open sign-up on purpose, set `SIGNUP_MODE=open`.
- **Failed sign-ins** slow down further attempts (per address, and softly per account) instead of locking the
  account; addresses that signed in before are not slowed by a flood, and the owner gets an email after 10 failures.
  The counters live in Postgres, so several api instances share them.
- **Two-factor authentication** (TOTP with backup codes) is available to everyone under Settings, Security. Owners and
  admins can require it for owners and admins of their organization.
- **API keys** expire after 90 days by default (`API_KEY_DEFAULT_TTL_DAYS`) and never live longer than a year. MCP
  counts each tool call of a batch against the key's rate limit, caps batches at 20 messages and audits reads as
  `mcp.read`. Model-backed MCP tools and the assistant have daily budgets per key, person and organization.

## Safe harbor

Good-faith research that respects this policy, avoids privacy violations and service disruption, and uses only your own
test data will not be pursued.
