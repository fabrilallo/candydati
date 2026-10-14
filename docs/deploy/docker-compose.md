# Deploy on a VPS with Docker Compose and Caddy

One server, one command, automatic HTTPS. For the concepts (sizing, backups, monitoring, upgrades) see
[../OPERATIONS.md](../OPERATIONS.md).

## 1. Server

A Linux VPS with 2 vCPU, 4 GB RAM (add 2 GB swap if you build on it) and 40 GB disk, a DNS `A` record for the host name
(`ats.example.com`), ports 80 and 443 open, everything else closed.

```bash
curl -fsSL https://get.docker.com | sh          # Docker Engine with Compose v2
sudo apt-get install -y caddy git               # Caddy from the distribution, or caddyserver.com/docs/install
```

## 2. Configure

```bash
git clone <your repository url> team-tracker && cd team-tracker
cp .env.example .env && chmod 600 .env
```

Edit `.env` (the stack refuses to start with the example secrets):

```bash
PLATFORM_URL=https://ats.example.com
PLATFORM_NAME=Your name
BETTER_AUTH_SECRET=$(openssl rand -base64 48)
INBOUND_WEBHOOK_SECRET=$(openssl rand -base64 48)
POSTGRES_PASSWORD=$(openssl rand -base64 36)
S3_ACCESS_KEY=tt-minio
S3_SECRET_KEY=$(openssl rand -base64 36)
BOOTSTRAP_TOKEN=$(openssl rand -base64 48)      # first start only
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

Open `https://ats.example.com/signup?setup`, enter `BOOTSTRAP_TOKEN`, confirm the email, create the organization. Then
delete `BOOTSTRAP_TOKEN` from `.env` and run the `up -d` command again. `--profile backup` starts the daily backup;
point it at an offsite bucket (OPERATIONS.md, Backups) and run `docker/restore-test.sh` once.

## 5. Update

```bash
git pull
docker compose -f docker-compose.prod.yml --profile backup run --rm backup backup.sh once   # safety net
docker compose -f docker-compose.prod.yml --profile backup up -d --build
```

Migrations run at api start. Rollback notes: OPERATIONS.md, "Upgrades and rollback".

## Useful commands

```bash
docker compose -f docker-compose.prod.yml logs -f api worker      # JSON logs; filter by "reqId"
docker compose -f docker-compose.prod.yml exec postgres psql -U tt team_tracker
docker compose -f docker-compose.prod.yml down                    # stops, keeps volumes (never add -v)
```
