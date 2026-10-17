# Operations

How to run an instance: architecture, sizing, first start, TLS, upgrades, backups, monitoring, scaling, email and a
security checklist. Step-by-step deployments: [Docker Compose + Caddy](deploy/docker-compose.md) and
[Dokploy](deploy/dokploy.md). Every variable: [ENVIRONMENT.md](ENVIRONMENT.md). Security model: [../SECURITY.md](../SECURITY.md).

## Architecture of a deployment

```
browser --https--> reverse proxy (Caddy / nginx / Traefik)
                        |  http :3000
                      web (Nuxt)  --- /api/** and /mcp --->  api (Fastify, :4000)  ---> postgres 17
                                                              |    ^                     ^
                                                              |    +---- worker (pg-boss) +--> S3 / MinIO
                                                              +--------------------------+   SMTP / Resend
```

| Service | Role | Port | State |
|---|---|---|---|
| `web` | pages, public careers, proxy of `/api/**` and `/mcp` to the api | 3000 (the only one behind the proxy) | none |
| `api` | REST, auth, MCP, assistant; applies migrations at start | 4000 (internal; `API_PUBLISH` on 127.0.0.1) | none |
| `worker` | jobs: email, webhooks, imports, retention, deadlines | 4001 health/metrics (internal) | none |
| `postgres` | all data and the job queue (schema `pgboss`) | 5432 (internal) | `pgdata` volume |
| `minio` | CVs and exports (any S3 works instead) | 9000 (internal) | `miniodata` volume |
| `backup` (profile) | daily `pg_dump` | none | `backups` volume |

Only `web` is reachable from outside. Everything is stateless except Postgres and the bucket: back those two up.

## Sizing

A small team (a few recruiters, hundreds of applications a month) runs on **2 vCPU, 4 GB RAM, 40 GB disk**. Measured on
the production stack in October 2026: about 850 MB at rest (api 360 MB, worker 230 MB, MinIO 90 MB, Postgres 70 MB,
Caddy 55 MB, web 45 MB) and about 1.3 GB during a burst of 3 000 requests (the web rises to 400 MB, then returns to
115 MB). 2 GB RAM is the floor for a small team that does not import large archives; 4 GB is the recommendation,
because imports and migrations hold an archive in memory (a migration package up to 1 GiB). Server-side rendering
takes one core under load, hence 2 vCPU. Examples at about €5–7 a month (October 2026, prices change): Hetzner Cloud
CX23 or CAX11 (Arm: the images are multi-architecture), OVHcloud VPS-1. Disk grows with CVs (a few hundred KB each)
and the audit log. Building the images needs about 4 GB of free memory: build elsewhere and pull, or add swap
on a small server. Move to managed Postgres and S3 when you need provider backups and failover, not for speed.

## Required environment

The stack refuses to start (`docker/config-check.sh`, then the api and the worker) with example values. Set at least:

| Variable | Value |
|---|---|
| `PLATFORM_URL` | the public **https** URL |
| `BETTER_AUTH_SECRET`, `INBOUND_WEBHOOK_SECRET` | `openssl rand -base64 48` |
| `POSTGRES_PASSWORD`, `S3_SECRET_KEY` | `openssl rand -base64 36` (16 characters or more) |
| `S3_ACCESS_KEY` | any name |
| `EMAIL_PROVIDER` | optional: `smtp` or `resend` (+ `SMTP_*` / `RESEND_API_KEY`, `EMAIL_DOMAIN`, `EMAIL_INBOUND_DOMAIN`). Unset, the first owner configures email from the app (Settings, Email); the instance stays closed to the outside until it works |

## First start

1. `cp .env.example .env`, edit, then `docker compose -f docker-compose.prod.yml up -d --build`.
2. Sign-up is `invite_only`: the first owner needs a setup code. The api logs
   `First owner setup: open https://<host>/signup?setup#code=...` at every start until an account is confirmed: open
   that link, confirm the email and create the organization. The code is derived from `BETTER_AUTH_SECRET`; to choose
   your own, set `BOOTSTRAP_TOKEN` (then the log names it instead of printing a code).
3. Check `/api/ready` (below), send yourself a test message, create the first backup (`backup.sh once`).

## TLS and reverse proxy

The web container speaks plain http: terminate TLS in front of it. Bind it to loopback (`WEB_BIND=127.0.0.1`) when the
proxy runs on the same host. Pass `X-Forwarded-Proto`; set `PLATFORM_URL` to the public https URL (cookies are Secure).
Rate limits use the connection address of the web container's peer, which behind any reverse proxy is the proxy: the
limits are then shared by all visitors (safer, less precise). Behind Cloudflare only, set `NUXT_TRUST_CLOUDFLARE=true`.

The emailed links carry their only credential in the URL: mask them in the proxy access log (SECURITY.md, "Reverse
proxy access logs"). Complete examples:

**Caddy** (automatic certificates)

```caddyfile
ats.example.com {
	reverse_proxy 127.0.0.1:3000
	request_body {
		max_size 210MB
	}
	log {
		output file /var/log/caddy/ats.log
		format filter {
			request>uri regexp "(/(?:api/auth/reset-password|accept-invitation|feedback|consent|api/v1/public/(?:feedback|consent))/)[^/?]+|([?&](?:token|secret|key|code|state|otp|cookies|id)=)[^&]*" "${1}${2}***"
			request>headers>Referer delete
		}
	}
}
```

**nginx** (certificates with certbot)

```nginx
# http { ... }
map $uri $candydati_loggable_path {
    default $uri;
    "~^(?<head>/(?:api/auth/reset-password|accept-invitation|feedback|consent|api/v1/public/(?:feedback|consent))/)[^/]+(?<tail>.*)$" "${head}***${tail}";
}
log_format candydati_masked '$remote_addr [$time_local] "$request_method $candydati_loggable_path" $status $body_bytes_sent "$http_user_agent"';

server {
    listen 443 ssl http2;
    server_name ats.example.com;
    ssl_certificate     /etc/letsencrypt/live/ats.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ats.example.com/privkey.pem;
    access_log /var/log/nginx/ats.log candydati_masked;
    client_max_body_size 210m;          # imports go up to 200 MiB
    proxy_read_timeout 300s;            # the web proxy waits up to 5 minutes for the api
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id $request_id;   # becomes reqId in the api and worker logs
    }
}
```

Never route `/metrics` or the api port (4000) through the proxy.

## Upgrades and rollback

Installed with `deploy/install.sh`: `candydati update` (or `candydati update X.Y.Z`) takes a backup, downloads the
release's compose file and images, restarts and waits for `/api/ready`. It runs the installer of the target release
with `--upgrade`, so the steps always match that release. By hand:

1. Read the [changelog](../CHANGELOG.md). Take a backup first: `backup.sh once`.
2. `git pull` (or change `CANDYDATI_VERSION`), then `docker compose -f docker-compose.prod.yml up -d --build`.
3. The api applies migrations at start (`RUN_MIGRATIONS=true`) under a Postgres advisory lock: several api replicas
   starting together wait for the first, which migrates once ([MIGRATIONS.md](MIGRATIONS.md)). Migrations are additive:
   old and new versions overlap safely during a rolling deploy. Compose recreates `api` before `web` and `worker`
   (they wait for it to be healthy).
4. Watch `docker compose logs -f api` until "api ready" and check `/api/ready`.

**Rollback.** Migrations have no down step. If the new version is bad but its migration is additive, redeploy the previous
image: it ignores the new columns. If a migration itself failed, the failed one is rolled back and the earlier ones
stay; fix and restart (MIGRATIONS.md). If data was damaged, restore the backup taken in step 1 into a new database,
check it, then point the stack at it (below).

## Backups and restore

What to protect: **Postgres** (everything, including jobs and the audit log) and the **bucket** (CVs, exports). Secrets live
in your `.env`: keep a copy in a password manager. Test the restore, not only the backup.

**Database, the `backup` service.** `docker compose -f docker-compose.prod.yml --profile backup up -d` starts a service
that runs `pg_dump -Fc` at start and every day at `BACKUP_AT` (UTC), checks the dump (`pg_restore --list`), writes
`<db>-<UTC timestamp>.dump` and a `.sha256` to the `backups` volume, keeps `BACKUP_RETENTION_DAYS` days and, with
`BACKUP_UPLOAD=true`, uploads it to `s3://<bucket>/backups/` (and prunes there by the same age). Its healthcheck fails
when no backup succeeded in 26 hours. Settings in `.env.example`.

- **Offsite.** By default the upload goes to the platform's own MinIO: a second copy on the same disk, not a disaster
  plan. Set `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` to
  another provider (and `BACKUP_S3_PATH_STYLE=false` for virtual-hosted style). Single uploads are limited to 5 GB.
- **Encryption.** `BACKUP_S3_SSE=AES256` (or `aws:kms`) adds the server-side encryption header; MinIO answers 501 until a
  KMS is configured. `BACKUP_ENCRYPTION_PASSPHRASE` encrypts every dump with AES-256 before it leaves the container
  (files end in `.dump.enc`): keep the passphrase outside the backups, or they cannot be restored.
- One backup now: `docker compose -f docker-compose.prod.yml --profile backup run --rm backup backup.sh once`.

**Restore** (into a new database; the service must be able to `CREATE DATABASE`):

```bash
# list and fetch (from the volume, or download the object from S3 first)
docker compose -f docker-compose.prod.yml --profile backup run --rm backup ls -la /backups
docker compose -f docker-compose.prod.yml --profile backup run --rm backup \
  restore.sh /backups/candydati-20261014T023000Z.dump --into candydati_restored
```

To switch the instance to the restored copy: stop `api` and `worker`, then either rename databases in `psql`
(`ALTER DATABASE candydati RENAME TO candydati_old; ALTER DATABASE candydati_restored RENAME TO candydati;`)
or run `restore.sh ... --into candydati --replace` with them stopped, then start them. The api applies migrations
missing from an older dump. Rows written after the dump are lost: that is the recovery point (RPO) of daily backups;
for less, add continuous archiving (WAL) with your Postgres provider.

**Tested procedure.** `docker/restore-test.sh` proves the chain without touching your data: it dumps the database to
a file, restores it into `<db>_restore_test`, compares the row count of every table of the `public` schema and drops the
temporary database. Run it on a quiet database after every upgrade of Postgres or of the backup scripts:

```bash
DATABASE_URL=postgres://candydati:...@localhost:5434/candydati docker/restore-test.sh
```

**Storage.** The bucket holds the originals; the database only the references. Back it up independently:

- MinIO to another bucket or host: `mc mirror --overwrite --remove local/candydati remote/candydati-mirror`
  from a cron job (the MinIO client runs anywhere that reaches both), or stop MinIO and snapshot the `miniodata` volume.
- Managed S3 (AWS, Scaleway, R2...): enable versioning plus a lifecycle rule, and cross-region or cross-provider
  replication; or the provider's snapshots.
- Restore the bucket **at the same time** as the database: a CV the database points to but the bucket lost shows as a
  missing file; an object without a row is harmless. Erasure requests delete objects: a restore can bring back data a
  person asked to erase, so re-run the erasures requested since the backup (the audit log in the restored database
  tells which).

## Monitoring and alerts

Everything below is optional and off by default: nothing is sent anywhere and no endpoint is exposed until you set it.

**Logs.** Structured JSON (pino) on stdout of every service; collect them with the Docker log driver, Loki/Promtail, or
your host's agent. `LOG_LEVEL` sets the level (`info` default).

| Field | Meaning |
|---|---|
| `level` (30 info, 40 warn, 50 error, 60 fatal), `time` (ms), `msg` | as in pino |
| `reqId` | request id. The web proxy takes a well-formed `X-Request-Id` from your proxy or creates one, forwards it to the api and returns it in the response; jobs queued while answering carry it, and the worker logs the same `reqId` (a job queued by the scheduler has none). Search one id to follow a request into its jobs |
| `req.method`, `req.url` | url with secrets masked as `***`; headers are never logged |
| `res.statusCode`, `responseTime` | on `request completed` |
| `queue`, `jobId`, `attempt`, `lastAttempt`, `error` | worker: the queue, the job, the attempt, a safe error code |
| `err.type`, `err.message`, `err.stack` | errors; for database errors only the SQLSTATE, constraint and table, never SQL values |
| `check` | `readiness check failed`: `database`, `storage` or `queue` |

**Health.**

| Endpoint | Meaning | Use |
|---|---|---|
| `GET /api/health` (api; also through the web) | process up and database reachable; 503 otherwise | container liveness |
| `GET /api/ready` | database, object storage and queue each checked (3 s timeout); `{checks:{database,storage,queue}}`, 503 if any fails | load balancer, uptime monitor |
| `GET /healthz` (web) | the web server answers; does not call the api | web container liveness |
| `GET :4001/health` and `/ready` (worker, internal) | process up; ready = queues registered and database reachable, not ready while shutting down | worker healthcheck |

Point an external uptime monitor at `https://<host>/api/ready`.

**Metrics.** Set `METRICS_TOKEN` (16+ characters) and scrape `GET /metrics` with `Authorization: Bearer <token>` on the
api (port 4000, loopback or the internal network) and on the worker (`worker:4001`). Without a token the endpoint does not
exist. `/metrics` is not under `/api`, so the web proxy never forwards it: do not publish it.

```yaml
# prometheus.yml
scrape_configs:
  - job_name: candydati-api
    authorization: { credentials_file: /etc/prometheus/candydati-metrics-token }
    static_configs: [{ targets: ["api:4000"] }]
  - job_name: candydati-worker
    authorization: { credentials_file: /etc/prometheus/candydati-metrics-token }
    static_configs: [{ targets: ["worker:4001"] }]
```

| Series | From | Meaning |
|---|---|---|
| `candydati_http_requests_total{method,route,status}`, `candydati_http_request_duration_seconds` | api | traffic by route pattern (never by url) |
| `candydati_email_failures_total{kind}` | api | account, receipt and sign-in notice emails that failed |
| `candydati_jobs_total{queue,outcome}`, `candydati_job_duration_seconds{queue}` | worker | outcomes: `completed`, `retry`, `failed` (out of attempts), `invalid_payload` |
| `candydati_queue_jobs{queue,state}`, `candydati_queue_oldest_waiting_seconds{queue}` | worker | depth (`queued`, `deferred`, `active`, `failed`) and age of the oldest ready job |
| `candydati_outbox_pending_events`, `candydati_outbox_oldest_pending_seconds`, `candydati_outbox_dead_events` | worker | webhook/automation backlog and dead letters |
| `candydati_email_failed_messages_24h` | worker | outbound candidate messages that failed in the last day |
| `process_*`, `nodejs_*`, `candydati_build_info` | both | CPU, memory, event loop lag, start time |

Queue and outbox gauges come from the worker only (a scrape of several instances does not count them twice).
They are read from Postgres at each scrape: counts and ages only, no row content.

Alerts to set (Prometheus rules, adapt thresholds):

```yaml
groups:
  - name: candydati
    rules:
      - alert: ApiNotReady          # also watch /api/ready with an external uptime check
        expr: up{job="candydati-api"} == 0
        for: 2m
      - alert: ApiServerErrors
        expr: sum(rate(candydati_http_requests_total{status=~"5.."}[5m])) / sum(rate(candydati_http_requests_total[5m])) > 0.02
        for: 10m
      - alert: ApiSlow
        expr: histogram_quantile(0.95, sum by (le) (rate(candydati_http_request_duration_seconds_bucket[5m]))) > 2
        for: 10m
      - alert: JobsFailing          # out of retries
        expr: sum by (queue) (increase(candydati_jobs_total{outcome="failed"}[15m])) > 0
      - alert: QueueBacklog
        expr: candydati_queue_oldest_waiting_seconds > 600
        for: 10m
      - alert: OutboxDeadLetters
        expr: candydati_outbox_dead_events > 0
        for: 5m
      - alert: OutboxBacklog
        expr: candydati_outbox_oldest_pending_seconds > 900
        for: 10m
      - alert: EmailFailures
        expr: candydati_email_failed_messages_24h > 5 or increase(candydati_email_failures_total[1h]) > 0
      - alert: WorkerGone
        expr: up{job="candydati-worker"} == 0
        for: 5m
```

Also alert on: the `backup` container turning unhealthy (no successful backup in 26 hours: `docker compose ps`, or your container monitor), disk space (Postgres, MinIO and backup volumes) and certificate expiry, with your usual host monitoring.

**Error reporting.** `SENTRY_DSN` (api and worker) and `NUXT_SENTRY_DSN` (web) send server errors to any
Sentry-compatible collector (Sentry, self-hosted Sentry, GlitchTip, Bugsink). Off when empty. API 5xx errors, worker jobs
that ran out of attempts, uncaught exceptions and web 5xx are reported with: the error type, the message with emails,
long tokens and URL queries masked and capped at 300 characters, code locations (relative paths, no variables), and the
tags `service`, `request_id`, `route`, `queue`, `job_id`. Never: request bodies, headers, cookies, query strings, users,
breadcrumbs, or candidate fields; database errors keep only SQLSTATE, constraint and table (the same safe serializer as
the logs). At most 30 reports a minute per process. `SENTRY_ENVIRONMENT` and `SENTRY_RELEASE` label them. Traces are not
exported: there is no OpenTelemetry SDK in the image; use the `reqId` in the logs to follow a request. Self-host the
collector in the EU if the reports are subject to your data residency rules.

## Scaling

- **api**: stateless. Run several replicas behind the web proxy (web talks to one `NUXT_API_INTERNAL_URL`: put a load
  balancer or Docker's DNS round robin behind it, or use Swarm/Kubernetes). Sign-in throttles and daily budgets live in
  Postgres, so replicas share them. Migrations are serialised by the advisory lock. `TRUST_PROXY` must still name only the
  web container(s).
- **worker**: one is enough for a long time. Several can run: pg-boss hands each job to one worker; schedules are
  registered idempotently. Add replicas when `candydati_queue_oldest_waiting_seconds` keeps growing and CPU is the limit.
- **web**: stateless, run as many as needed.
- **Postgres** is the first bottleneck: pool of 10 connections per process by default; mind `max_connections` when adding
  replicas, or use a managed Postgres with a connection limit that fits.

## Email deliverability

Verification, password reset, invitations and every candidate message depend on mail arriving. In the app, set the
sending domain (Settings, email): the domain verification feature shows the DNS records the provider needs and their
status (`pending`, `verified`, `failed`). Publish, at your DNS provider:

- **SPF**: one TXT on the sending domain including the provider (`v=spf1 include:<provider> ~all`); a single SPF record only.
- **DKIM**: the CNAME/TXT records shown by the verification (Resend) or generated by your SMTP provider.
- **DMARC**: `_dmarc` TXT, start with `v=DMARC1; p=none; rua=mailto:dmarc@your-domain` and read the reports for a few
  weeks, then move to `quarantine`.
- Reverse replies: an MX record for `EMAIL_INBOUND_DOMAIN` to the provider's inbound host and the webhook to
  `https://<host>/api/v1/inbound/...` signed with `INBOUND_WEBHOOK_SECRET`.
- Use a dedicated subdomain (`mail.example.com`) so a reputation problem never touches the company mail.

Check with `candydati_email_failed_messages_24h` and a test to mail-tester or your own inbox after every DNS change.

## Careers page media and caches

Images and videos of the careers page (PRODUCT.md §3.4) are served on two routes:

- **Published files** (`/api/v1/public/organizations/{org}/careers-media/{id}/{file}`): only the files a visible section of
  the published page uses. The file name carries the hash of the uploaded content and the width, so the bytes behind a URL
  never change, and they are sent with `Cache-Control: public, max-age=31536000, immutable`. A CDN in front of the web
  app may keep them.
- **Library files** (`/api/v1/careers-page/media/{id}/files/{file}`): everything else (the draft, the editor's library
  and preview). Session and `careers_page:manage` of the same organization are checked on every request, and the answer
  is `Cache-Control: private, max-age=300`: never in a shared cache.

**Accepted trade-off.** A file cannot be deleted while the published page uses it; once it is no longer published and
is deleted, the object is gone from storage, but copies already in CDN or browser caches can keep being served by those
caches for up to the immutable TTL (one year) to whoever has the exact URL. The URL is not guessable (random asset id plus
content hash) and is no longer linked from any page. If an image must disappear at once (for example a person asked to
be removed from a photo), unpublish it, delete it, then purge the URL on your CDN (Cloudflare "Purge by URL", or your
CDN's equivalent); browsers that already downloaded it keep their local copy until they evict it.

## Security checklist for operators

- [ ] Secrets are random and unique (`openssl rand -base64 48`); `.env` is `chmod 600`, not in git, copied to a password manager.
- [ ] The first owner signed up and confirmed their email (that closes the bootstrap); `SIGNUP_MODE=invite_only` (default in the compose file).
- [ ] Only the reverse proxy is reachable from outside: `web` on `127.0.0.1` (`WEB_BIND`), `API_PUBLISH` on loopback, no host ports for Postgres, MinIO or the worker; firewall allows 80/443 and SSH only.
- [ ] TLS with a valid certificate and HSTS; `PLATFORM_URL` is https.
- [ ] Proxy access logs mask the link tokens and drop `Referer` (SECURITY.md); log retention fits your privacy notice.
- [ ] `METRICS_TOKEN` only if you scrape, and `/metrics` and `:4001` reachable from the monitoring network only.
- [ ] Backups run, are encrypted (`BACKUP_ENCRYPTION_PASSPHRASE` or an encrypted offsite bucket), copied offsite, and a restore was tested (`docker/restore-test.sh`) in the last quarter.
- [ ] Host: unattended security updates, SSH keys only, Docker not exposing its API; images updated at least monthly (rebuild to pick up base image patches).
- [ ] Staff: 2FA required for owners and admins (organization security settings); API keys expire (`API_KEY_DEFAULT_TTL_DAYS`).
- [ ] SPF, DKIM and DMARC published; `WEBHOOKS_ALLOW_PRIVATE` is false (the compose file forces it).
- [ ] Spend limits at the LLM provider if `AGENT_MODEL` / `FAST_MODEL` are set (the daily budgets cap calls, not money).
- [ ] An alert reaches a person: uptime monitor on `/api/ready`, backup health, disk space.
