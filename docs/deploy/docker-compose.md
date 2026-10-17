# Deploy on a VPS with Docker Compose and Caddy

One server, one command, automatic HTTPS. For the concepts (sizing, backups, monitoring, upgrades) see
[../OPERATIONS.md](../OPERATIONS.md).

> **The quick way.** `deploy/install.sh` does everything below for you with the published images and a Caddy container
> (`caddy` profile): `curl -fsSL https://github.com/fabrilallo/candydati/releases/latest/download/install.sh | sudo bash`.
> This guide is the manual path: build from the sources, Caddy on the host, full control over every setting.

## 1. Server

A Linux VPS with 2 vCPU, 4 GB RAM (add 2 GB swap if you build on it) and 40 GB disk, a DNS `A` record for the host name
(`ats.example.com`), ports 80 and 443 open, everything else closed.

```bash
curl -fsSL https://get.docker.com | sh          # Docker Engine with Compose v2
sudo apt-get install -y caddy git               # Caddy from the distribution, or caddyserver.com/docs/install
```

## 2. Configure

```bash
git clone <your repository url> candydati && cd candydati
cp .env.example .env && chmod 600 .env
```

Edit `.env` (the stack refuses to start with the example secrets):

```bash
PLATFORM_URL=https://ats.example.com
PLATFORM_NAME=Your name
BETTER_AUTH_SECRET=$(openssl rand -base64 48)
INBOUND_WEBHOOK_SECRET=$(openssl rand -base64 48)
POSTGRES_PASSWORD=$(openssl rand -base64 36)
S3_ACCESS_KEY=candydati-minio
S3_SECRET_KEY=$(openssl rand -base64 36)
EMAIL_PROVIDER=smtp                             # or resend
SMTP_HOST=...  SMTP_PORT=587  SMTP_USER=...  SMTP_PASSWORD=...  EMAIL_DOMAIN=mail.example.com
WEB_BIND=127.0.0.1                              # only Caddy reaches the web container
METRICS_TOKEN=                                  # optional, see OPERATIONS.md
```

Write the real values (the `$(...)` above are commands to run: paste their output). Remaining variables:
[../ENVIRONMENT.md](../ENVIRONMENT.md).

## 3. Caddy

`/etc/caddy/Caddyfile` (certificates are automatic; the log block masks the link tokens, as SECURITY.md asks):

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

`sudo systemctl reload caddy`. nginx instead: see the example in OPERATIONS.md.

## 4. Start

```bash
docker compose -f docker-compose.prod.yml --profile backup up -d --build
docker compose -f docker-compose.prod.yml ps          # all healthy after a minute or two
curl -s https://ats.example.com/api/ready             # {"success":true,"data":{"status":"ready",...}}
```

Open the link that `docker compose -f docker-compose.prod.yml logs api | grep "First owner setup"` prints (the setup
code is already in it), sign up and create the organization. `--profile backup` starts the daily backup;
point it at an offsite bucket (OPERATIONS.md, Backups) and run `docker/restore-test.sh` once.

## 5. Update

```bash
git pull
docker compose -f docker-compose.prod.yml --profile backup run --rm backup backup.sh once   # safety net
docker compose -f docker-compose.prod.yml --profile backup up -d --build
```

Migrations run at api start. Rollback notes: OPERATIONS.md, "Upgrades and rollback".

## Network and data

- **Published ports.** Only `web` is published on the host (`WEB_PORT`, default 3000). Postgres, MinIO and the
  worker stay on the internal network; the api is reachable only from `127.0.0.1` (`API_PUBLISH`). Browsers always
  talk to the web, which forwards `/api/**` and `/mcp` to the api.
- **Trusted proxy.** The compose file pins the internal network (`CANDYDATI_SUBNET`, default `172.31.77.0/24`) and a fixed
  address for the web (`CANDYDATI_WEB_IP`, default `172.31.77.10`). The api uses that address as `TRUST_PROXY`, so only the
  web can set the client IP. If the subnet clashes with another stack, change both variables together.
- **Data.** The volumes `pgdata` (database) and `miniodata` (CVs and files) are what to back up. `down` keeps them,
  `down -v` deletes them.
- **Several instances on one host.** Give each its own `COMPOSE_PROJECT_NAME`, `WEB_PORT`, `API_PUBLISH` and
  `CANDYDATI_SUBNET`/`CANDYDATI_WEB_IP`.
- **Behind Cloudflare.** Set `NUXT_TRUST_CLOUDFLARE=true` only if the origin is reachable from Cloudflare alone.
- **Startup checks.** The stack refuses to start with the example secrets, a `PLATFORM_URL` over http or
  `EMAIL_PROVIDER=log` (`docker/config-check.sh`, then api and worker). Database migrations and the MinIO bucket are
  created at api start; the worker starts once the api is healthy.
- **Email while testing.** `EMAIL_PROVIDER=smtp` with `--profile mail` starts Mailpit, bound to `127.0.0.1`
  (UI on `MAILPIT_UI_PORT`, default 8025).
- **Images built elsewhere.** `docker build --target api|worker|web .` builds each image on its own, for example on a
  CI runner when the server is short of memory.

## Useful commands

```bash
docker compose -f docker-compose.prod.yml logs -f api worker      # JSON logs; filter by "reqId"
docker compose -f docker-compose.prod.yml exec postgres psql -U candydati candydati
docker compose -f docker-compose.prod.yml down                    # stops, keeps volumes (never add -v)
```
