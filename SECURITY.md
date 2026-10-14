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
- **First owner (bootstrap).** On an instance with no confirmed account, `invite_only` still accepts one sign-up: the
  first owner. In production it needs the one-time `BOOTSTRAP_TOKEN` from the environment (at least 32 random
  characters, `openssl rand -base64 48`): open `/signup?setup`, type it in the "Setup token" field (sent as the
  `x-bootstrap-token` header, never in a URL), confirm the email and create the organization. Without the token
  configured nobody can bootstrap a production instance. Only confirmed accounts close the bootstrap, so an unconfirmed
  sign-up cannot squat it: the claim is held by one address under a Postgres advisory lock (two concurrent sign-ups
  cannot both get through) and lapses after 24 hours if never confirmed. Confirming the address checks the claim
  again: only the holder of a live claim becomes the first owner (its account id is recorded), and an account admitted
  by a claim that has since lapsed or been taken over cannot confirm its address. If you did not confirm within 24
  hours, sign up again with the token, then use the new link. Once the first owner is confirmed the token
  opens nothing: remove it from `.env`. From then on people join through invitations. To open sign-up on purpose, set
  `SIGNUP_MODE=open`.
- **Organizations.** Each organization has its own model budgets, so who may create one is an instance setting
  (`ORGANIZATION_CREATION`): `one_per_user` by default with `invite_only`, `instance_admins` (only the first owner and
  `INSTANCE_ADMIN_EMAILS`) or `open`. `one_per_user` means one organization ever created per account: the slot is
  taken atomically before the organization exists (concurrent requests cannot both get through) and stays taken
  whatever role the account has later, so handing the owner role over frees nothing. The limit is per account, not per
  person: anyone who can get accounts invited can create one organization with each, so invite-only sign-up is what
  bounds people. Use `instance_admins` when organizations should be created only by you. Instance admins are never
  limited.
- **Failed sign-ins** slow down further attempts (per address, and softly per account) instead of locking the
  account; addresses that signed in before are not slowed by a flood, and the owner gets an email after 10 failures.
  The counters live in Postgres, so several api instances share them.
- **Two-factor authentication** (TOTP with backup codes) is available to everyone under Settings, Security. Owners and
  admins can require it for owners and admins of their organization. The requirement holds on every surface: the app
  (`/api/v1`, `403 two_factor_required`), Better Auth's own organization endpoints (inviting, removing and changing
  members, cancelling invitations, renaming: `403 TWO_FACTOR_REQUIRED`) and API keys (below).
- **API keys** expire after 90 days by default (`API_KEY_DEFAULT_TTL_DAYS`) and never live longer than a year; keys
  created before every key had an expiry got one in migration 0023 (creation date plus 90 days, so the oldest are now
  expired). The key of an owner or admin without 2FA stops working while their organization requires 2FA, and works
  again once they enrol; turning the requirement on lists the keys it suspends in the audit entry. MCP counts each tool
  call of a batch against the key's rate limit, caps batches at 20 messages and audits reads as `mcp.read`. Model-backed
  MCP tools have daily budgets per key, per person (across all their keys and organizations) and per organization; the
  assistant per person and per organization.
- **Logs.** Request logs of the api never carry a secret of a link: password reset (`/api/auth/reset-password/<token>`),
  email verification and account deletion (`?token=`), OAuth `code`/`state`, invitation ids and the public feedback and
  consent links are written as `***`. Headers (cookies, bearer keys) are never logged.

## Reverse proxy access logs

The api masks its own logs, but a reverse proxy in front of the web container logs every URL first, and the emailed
links carry their only credential in the URL (`/api/auth/reset-password/<token>`, `/reset-password?token=...`,
`/api/auth/verify-email?token=...`, `/accept-invitation/<id>`, `/feedback/<token>`, `/consent/<token>`). Configure the
same masking there, and do not log the `Referer`. With nginx, log the path without the query and mask the path tokens:

```nginx
# http { ... }
map $uri $tt_loggable_path {
    default $uri;
    "~^(?<head>/(?:api/auth/reset-password|accept-invitation|feedback|consent|api/v1/public/(?:feedback|consent))/)[^/]+(?<tail>.*)$" "${head}***${tail}";
}
log_format tt_masked '$remote_addr [$time_local] "$request_method $tt_loggable_path" $status $body_bytes_sent "$http_user_agent"';
access_log /var/log/nginx/access.log tt_masked;
```

With Caddy (the `filter` log encoder; Caddy already redacts cookies and authorization headers):

```caddyfile
ats.example.com {
	reverse_proxy 127.0.0.1:3000
	log {
		format filter {
			request>uri regexp "(/(?:api/auth/reset-password|accept-invitation|feedback|consent|api/v1/public/(?:feedback|consent))/)[^/?]+|([?&](?:token|secret|key|code|state|otp|cookies|id)=)[^&]*" "${1}${2}***"
			request>headers>Referer delete
		}
	}
}
```

## Safe harbor

Good-faith research that respects this policy, avoids privacy violations and service disruption, and uses only your own
test data will not be pursued.
