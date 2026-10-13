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

## Safe harbor

Good-faith research that respects this policy, avoids privacy violations and service disruption, and uses only your own
test data will not be pursued.
