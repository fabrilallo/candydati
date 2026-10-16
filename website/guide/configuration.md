# Configuration

Every setting of an instance lives in one file, `/opt/candydati/.env`, written by the installer. Edit it with:

```bash
sudo candydati config
```

The command opens the file in your editor (`$EDITOR`) and applies the change when you close it. The file holds
secrets: it is readable only by root. Keep a copy in your password manager.

The full list of variables, with defaults, is generated from the code:
[ENVIRONMENT.md](https://github.com/fabrilallo/candydati/blob/main/docs/ENVIRONMENT.md). The commented example is
[.env.example](https://github.com/fabrilallo/candydati/blob/main/.env.example).

## Safety checks at start

The stack refuses to start with an example secret or a short one, with a `PLATFORM_URL` that is not `https`, or
without a real email provider. The error names the variable, never its value. The installer generates secrets that
pass these checks: you only meet them if you edit the file by hand.

## Common settings

### Identity

| Variable | Default | Meaning |
|---|---|---|
| `PLATFORM_NAME` | `Candydati` | name shown in the interface and in emails. Set it to your own name if you want |
| `PLATFORM_URL` | (required) | public `https` address of the instance |
| `PLATFORM_SUPPORT_EMAIL` | | contact address shown to users |
| `PLATFORM_DEFAULT_LOCALE` | `it` | default language: `it` or `en` |
| `PLATFORM_TIME_ZONE` | `Europe/Rome` | time zone of dates in emails |

### Who can join

| Variable | Default | Meaning |
|---|---|---|
| `SIGNUP_MODE` | `invite_only` | `invite_only`: people join only through an invitation (plus the first owner). `open`: anyone can create an account |
| `ORGANIZATION_CREATION` | `one_per_user` with `invite_only` | who may create organizations: `open`, `one_per_user` (one organization ever created per account) or `instance_admins` |
| `INSTANCE_ADMIN_EMAILS` | | comma-separated addresses that may always create organizations |
| `BOOTSTRAP_TOKEN` | | one-time token of the first owner's sign-up. Remove it once that account is confirmed |

Every account confirms its email before the first sign-in. Two-factor authentication is available to everyone, and
owners and admins can require it in their organization.

### Public application form

| Variable | Default | Meaning |
|---|---|---|
| `APPLICATIONS_DAILY_MAX_PER_ORGANIZATION` | `500` | applications per organization in 24 hours; above it the form answers politely that it is full |
| `APPLICATIONS_DAILY_MAX_PER_JOB` | `200` | the same, per job |
| `RECEIPTS_DAILY_MAX_PER_ORGANIZATION` | `300` | application receipt emails per organization per day |
| `NUXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | | optional Cloudflare Turnstile check on the form. Off when empty: Cloudflare is never required |

### Job ads

| Variable | Default | Meaning |
|---|---|---|
| `PLATFORM_AD_QUALITY_THRESHOLD` | `6` | quality score (0 to 10) below which an ad is flagged before publication. It never blocks publication |

### Other groups

- Email: [Email](./email).
- AI and its budgets: [AI assistant](./ai).
- Backups, metrics and error reports: [Day-to-day operations](./operations).
- API keys: `API_KEY_DEFAULT_TTL_DAYS` (default 90 days, at most a year) and `API_KEY_RATE_LIMIT` (requests per
  minute per key). See [API, webhooks and MCP](./api).
