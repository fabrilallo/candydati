# Deploy on Dokploy

[Dokploy](https://dokploy.com) runs Docker Compose projects behind its own Traefik, with domains and certificates from
its UI. We use its **Docker Compose** deployment type with the unchanged `docker-compose.prod.yml`: no Dokploy-specific
override file is needed, because the only host port (`web`) can be bound to loopback (`WEB_BIND`) and Traefik reaches
the container over the Docker network. Concepts (backups, monitoring, upgrades): [../OPERATIONS.md](../OPERATIONS.md).
Dokploy's own documentation: <https://docs.dokploy.com/docs/core/docker-compose>.

## Before you start

- A server with Dokploy installed (2 vCPU, 4 GB RAM or more; the image build needs memory), and a DNS `A` record for
  the host name pointing at it.
- The repository reachable by Dokploy (GitHub/GitLab/Git URL; a deploy key for a private one).
- An SMTP account or a Resend API key: set it in the environment below, or leave `EMAIL_PROVIDER` out and configure it
  from the app after the first sign-in (Settings, Email). Until email works, invitations, publishing and applications wait.

## 1. Create the application

1. Create a **Project**, then **Create Service, Compose**. Name it (for example `ats`). Type: **Docker Compose** (not Stack).
2. **Provider**: Git, your repository and branch (or a tag: pin releases). **Compose Path**: `./docker-compose.prod.yml`.
3. In **Advanced**, turn on **Isolated Deployments**: Dokploy then gives the stack its own network and attaches
   what Traefik needs. Our compose file keeps its internal `internal` network (with the fixed web address used by the api's
   `TRUST_PROXY`) next to it; if `172.31.77.0/24` clashes with another stack, change `CANDYDATI_SUBNET` and `CANDYDATI_WEB_IP` together.

## 2. Environment variables (Dokploy's Environment tab)

Dokploy writes the tab to a `.env` next to the compose file; `docker-compose.prod.yml` reads variables from it, so
paste them as `NAME=value` lines. Minimum:

```ini
PLATFORM_URL=https://ats.example.com
PLATFORM_NAME=Your name
BETTER_AUTH_SECRET=<openssl rand -base64 48>
INBOUND_WEBHOOK_SECRET=<openssl rand -base64 48>
POSTGRES_PASSWORD=<openssl rand -base64 36>
S3_ACCESS_KEY=candydati-minio
S3_SECRET_KEY=<openssl rand -base64 36>
EMAIL_PROVIDER=smtp
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_DOMAIN=mail.example.com
EMAIL_INBOUND_DOMAIN=inbound.example.com
WEB_BIND=127.0.0.1
WEB_PORT=3000
```

Generate each secret on your machine and paste the result. `WEB_BIND=127.0.0.1` keeps the web port off the public
interface (use a free `WEB_PORT` if another service on the server already uses 3000). Optional: `METRICS_TOKEN`,
`SENTRY_DSN`, `NUXT_SENTRY_DSN`, backups (below), LLM keys. Full list: [../ENVIRONMENT.md](../ENVIRONMENT.md).
`PLATFORM_URL` must be the public **https** URL even though Dokploy terminates TLS: the cookies are Secure.

## 3. Domain and HTTPS

In the **Domains** tab: **Add Domain**.

- Host: `ats.example.com`
- **Service name: `web`**, **Container port: `3000`**
- HTTPS on, certificate provider Let's Encrypt.

Do not add domains for `api`, `worker`, `postgres` or `minio`: they stay internal. Use **Preview Compose** to see the
Traefik labels Dokploy adds. Domain changes in a Compose application need a redeploy.

Request size: imports go up to 200 MiB; if Traefik or a CDN in front limits bodies or times out sooner than 5 minutes,
raise it there. Behind Traefik every visitor reaches the web container from the proxy's address, so the per-address
rate limits are shared by all visitors (safe, less precise; OPERATIONS.md, TLS and reverse proxy). Traefik access logs
write URLs with the link tokens: keep them off or mask them as in SECURITY.md.

## 4. Deploy and first start

Press **Deploy**. The first build takes several minutes. In **Logs** choose service `api`: wait for "api ready" (the
migrations ran). Check `https://ats.example.com/api/ready`.

Bootstrap: in the `api` logs find the line `First owner setup: open https://ats.example.com/signup?setup#code=...`,
open that link (the setup code is already filled in), confirm the email and create the organization. The line is
printed at every start until the first account is confirmed; then the code opens nothing.

## 5. Health checks

The images define their own `HEALTHCHECK`s and the compose file uses them (`depends_on: condition: service_healthy`),
so Dokploy shows healthy/unhealthy per container: `api` (`/api/health`), `worker` (its port 4001 `/health`), `web`
(`/healthz`), `postgres`. For uptime monitoring use `https://ats.example.com/api/ready` (database, storage, queue).

## 6. Backups

Two options, use both:

1. **Our `backup` service (recommended).** Add `COMPOSE_PROFILES=backup` to the Environment tab and redeploy: the
   service runs `pg_dump` every day, keeps `BACKUP_RETENTION_DAYS` days and can upload to S3 with encryption. For a real
   offsite copy set `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY`,
   `BACKUP_S3_SECRET_KEY` (and `BACKUP_ENCRYPTION_PASSPHRASE`). Run one now from the service's terminal:
   `backup.sh once`. Restore: `restore.sh /backups/<file> --into <new database>` (OPERATIONS.md).
2. **Dokploy Volume Backups.** The volumes in our file are named (`pgdata`, `miniodata`, `backups`), so Dokploy's
   **Volume Backups** (Compose, Volume Backups tab) can copy them to an S3 destination on a cron schedule; restore by
   name `{appName}_{volumeName}` into a volume that does not exist. A file copy of a running Postgres volume is only
   crash-consistent: choose "Turn off container" for `postgres`, and rely on option 1 for a clean `pg_dump`. Dokploy's
   database backup feature applies to databases created as Dokploy Database services, not to the Postgres inside a compose
   file.

Protect the bucket (CVs) with `miniodata` volume backups, an S3 mirror or provider snapshots (OPERATIONS.md, Storage).

## 7. Updates

Redeploy: **Deploy** pulls the branch, rebuilds the images and recreates changed containers; migrations run at api
start. Enable **Auto Deploy** with the webhook only for a branch you control; pin a tag for production. Take a backup
before an upgrade (`backup.sh once`). Never use "fresh volumes"/volume deletion options on this application.

## Set it up with an AI coding agent (optional)

Dokploy can be driven from outside its UI with an API key, so a coding agent (Claude Code, Codex, Cursor and others)
can do steps 1 to 5 for you while you watch: create the project and the compose service, set the non-secret
variables, add the domain, deploy and read the logs.

**Get a key.** In Dokploy, open **Settings, Profile**, section **API/CLI**, and generate a key
([authentication docs](https://docs.dokploy.com/docs/cli/authentication)). The key acts with the permissions of the user
who created it. Prefer a dedicated Dokploy user that can see only this project, and revoke the key when the setup is done.

**Connect the agent**, in one of three ways:

- **MCP server**, for agents that support the Model Context Protocol. Dokploy publishes one:
  [github.com/dokploy/mcp](https://github.com/dokploy/mcp). It needs `DOKPLOY_URL` and `DOKPLOY_API_KEY`.
  - Claude Code:

    ```bash
    claude mcp add dokploy-mcp -e DOKPLOY_URL=https://dokploy.example.com -e DOKPLOY_API_KEY="$DOKPLOY_API_KEY" -- npx -y @dokploy/mcp
    ```

  - Codex (`~/.codex/config.toml`):

    ```toml
    [mcp_servers.dokploy]
    command = "npx"
    args = ["-y", "@dokploy/mcp"]
    env = { DOKPLOY_URL = "https://dokploy.example.com", DOKPLOY_API_KEY = "..." }
    ```

  - Cursor and other clients: the JSON configuration is in the repository's README.
- **CLI**, for agents that run shell commands ([CLI docs](https://docs.dokploy.com/docs/cli)):

  ```bash
  npm install -g @dokploy/cli
  dokploy auth -u https://dokploy.example.com -t "$DOKPLOY_API_KEY"
  dokploy verify
  ```

- **REST API**, with the `x-api-key` header ([API reference](https://docs.dokploy.com/docs/api)). Dokploy also serves
  its own OpenAPI document.

Give the agent Dokploy's documentation index, <https://docs.dokploy.com/llms.txt>, together with this guide and
[../ENVIRONMENT.md](../ENVIRONMENT.md). A prompt that works well:

> Deploy this repository on my Dokploy server following `docs/deploy/dokploy.md`. Use the Docker Compose service type,
> `docker-compose.prod.yml`, isolated deployments, and the domain `ats.example.com`. Set every non-secret variable from
> `docs/ENVIRONMENT.md` and stop to let me paste the secrets myself. Then deploy, wait for the health checks of step 5,
> and show me the logs of any service that is not healthy. Never delete volumes and never use "fresh volumes" options.

**What the key exposes.**
- The Dokploy API returns the environment variables, and database passwords, of every service the key can see. With
  a key, whatever is in the Environment tab passes through the agent's context and through its model provider.
- Safer: generate the secrets yourself (for example `openssl rand -base64 48` for `BETTER_AUTH_SECRET`), paste them in
  the Environment tab by hand, and let the agent handle everything else.
- Never commit the key, including inside a project's `.claude/settings.json` or `.mcp.json`.

## Troubleshooting

- **config-check fails**: the log names the variable (example secret, short secret, `PLATFORM_URL` not https,
  `EMAIL_PROVIDER` not smtp/resend). Fix it in the Environment tab, redeploy.
- **404 from Traefik after adding the domain**: redeploy (labels are read at deploy), check service `web` and port 3000.
- **Port already allocated**: another service uses `WEB_PORT`; change it (the domain still works, Traefik uses the Docker network).
- **Subnet overlap**: change `CANDYDATI_SUBNET` and `CANDYDATI_WEB_IP`.
- **`declares mutually exclusive network_mode and networks`**: the compose file predates the fix for isolated
  deployments; deploy a newer commit (no service may set `network_mode`).
- **Build killed**: not enough memory; add swap or build images elsewhere.
