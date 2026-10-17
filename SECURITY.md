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
  (`change-me...`, `candydati-minio-secret`), too short (32 characters for the first two, 16 for the others) or not random
  enough. `docker-compose.prod.yml` runs the same check (`docker/config-check.sh`) before any other service starts.
  Generate each one with `openssl rand -base64 48`.
- **Transport.** Production requires `https` for `BETTER_AUTH_URL` and `PLATFORM_URL`, so the session cookie is
  always `Secure`.
- **Email.** `EMAIL_PROVIDER=log` (which sends nothing) is refused in production. Without `EMAIL_PROVIDER` the instance
  starts and its first owner (or an instance admin, `INSTANCE_ADMIN_EMAILS`) configures SMTP or Resend from the app:
  the settings are saved only after a test email to that admin went through, the SMTP password or Resend key is sealed
  at rest (AES-256-GCM, key derived from `BETTER_AUTH_SECRET` with its own HKDF info) and never returned by the api.
  Until email works, invitations, publishing a job or the careers page and public applications are refused, so no
  candidate is left without an answer. `EMAIL_PROVIDER` set in the environment wins and the app shows it read-only.
- **Accounts.** Every account confirms its email before the first sign-in (the first owner's is confirmed by the setup code, below); sign-up and password reset answer the
  same whether an address is registered or not. `SIGNUP_MODE=invite_only` is the production default: an account can be
  created only by an address with a pending invitation, which only a confirmed account with that address can accept.
- **First owner (bootstrap).** On an instance with no confirmed account, `invite_only` still accepts one sign-up: the
  first owner. In production it needs a setup code: the operator's `BOOTSTRAP_TOKEN` when set (at least 32 random
  characters), else an HMAC-SHA256 of `BETTER_AUTH_SECRET` (it reveals nothing about the secret). While the bootstrap
  is open the api logs `First owner setup: open https://<host>/signup?setup#code=<code>` at every start: whoever reads
  the server's logs is the operator. The code travels in the URL fragment, which browsers never send, so no proxy or
  access log records it. The sign-up page has no field for it: it reads the code from the link, keeps it in that tab's
  `sessionStorage` (a reload does not lose it; it is removed once the account exists), drops it from the address bar
  and sends it as the `x-bootstrap-token` header. A `BOOTSTRAP_TOKEN` chosen by the operator is never logged: the line
  then reads `#code=<BOOTSTRAP_TOKEN>`, for the operator to fill in. Keep the api logs as private as `.env` until the
  first owner exists. The sign-up claims the bootstrap for one address under a Postgres advisory lock (two concurrent
  sign-ups cannot both get through). With the setup code, the claim holder's address is confirmed at sign-up, without an
  email: the code already proves the operator, and a new instance may have no email provider yet. The account is then
  recorded as the first owner; if that fails (the claim changed in between) the address goes back to unconfirmed, so
  nobody passes the bootstrap without being its owner. Only confirmed accounts close the bootstrap; an unconfirmed claim
  (a sign-up without a configured code, outside production) lapses after 24 hours. Once the first owner exists the code
  opens nothing and the api stops logging it. From then on people join through invitations. To open sign-up on purpose, set
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

## Outbound requests of migration connectors

A migration connector (Teamtailor, Greenhouse, Workable, Recruitee) never opens a socket of its own: every request goes
through one reader (`packages/providers/src/http/json-reader.ts`), GET only except the OAuth token exchange. The reader
has two modes, and a credential can only ever travel with the first:

- **Authenticated (the vendor's API).** `getJson`, `postForm` and `download` reach only the hosts the connector declares
  (`hosts()`: the vendor's API hosts, nothing else), over https on the default port, with no user info in the URL.
  The host is resolved once, every address must be public (no loopback, private, link-local, CGNAT, metadata or
  reserved range, IPv4 or IPv6) and the connection is pinned to those addresses, so DNS rebinding cannot move it.
  Redirects stay on the same origin (three at most; the token exchange is never redirected). These calls carry the
  connector's credentials.
- **Public file (no credentials).** Vendors hand out CVs and attachments as signed URLs on storage or CDN hosts outside
  their API domains. `downloadPublicFile` fetches such a file from any public host under a narrow rule: https on the
  default port, no user info, every resolved address public and the connection pinned to them (SNI kept), at most
  three redirects, each to an https URL that passes the same checks and is resolved and pinned again. It accepts no
  caller headers at all (passing any is a programming error), so no `Authorization`, cookie or API key can reach a host
  outside the allowlist; the URL's own signature is its only credential. The response is never parsed: the body streams
  to storage under the same size cap and timeout as an authenticated download, and a foreign host's rate-limit headers
  never slow the vendor's API.

Each connector chooses per file: a URL on its own API origin goes through the authenticated `download`, any other URL
through `downloadPublicFile`. In both modes, events and errors carry the URL with every query value replaced (signed
URLs carry their signature in the query) and never a header or a body.

## Reverse proxy access logs

The api masks its own logs, but a reverse proxy in front of the web container logs every URL first, and the emailed
links carry their only credential in the URL (`/api/auth/reset-password/<token>`, `/reset-password?token=...`,
`/api/auth/verify-email?token=...`, `/accept-invitation/<id>`, `/feedback/<token>`, `/consent/<token>`). Configure the
same masking there, and do not log the `Referer`. With nginx, log the path without the query and mask the path tokens:

```nginx
# http { ... }
map $uri $candydati_loggable_path {
    default $uri;
    "~^(?<head>/(?:api/auth/reset-password|accept-invitation|feedback|consent|api/v1/public/(?:feedback|consent))/)[^/]+(?<tail>.*)$" "${head}***${tail}";
}
log_format candydati_masked '$remote_addr [$time_local] "$request_method $candydati_loggable_path" $status $body_bytes_sent "$http_user_agent"';
access_log /var/log/nginx/access.log candydati_masked;
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
