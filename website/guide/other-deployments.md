# Other ways to deploy

The [one-command installer](./quick-start) is the simplest path. The same stack (`docker-compose.prod.yml`) also runs
in these setups.

## Dokploy

[Dokploy](https://dokploy.com) runs Docker Compose projects behind its own Traefik, with domains and certificates
managed from its interface. Candydati uses its **Docker Compose** deployment type with the unchanged
`docker-compose.prod.yml`:

1. Create a project and a Compose service, with your repository (or a release tag) and the compose path
   `./docker-compose.prod.yml`. Turn on **Isolated Deployments**.
2. Paste the environment variables in Dokploy's Environment tab: the public `https` URL, the generated secrets, the
   email provider, `WEB_BIND=127.0.0.1`.
3. Add the domain on service `web`, port `3000`, with HTTPS from Let's Encrypt, and deploy.
4. Create the first owner at `/signup?setup` with the `BOOTSTRAP_TOKEN`.

Dokploy can also be driven by a coding agent (Claude Code, Codex, Cursor) through its MCP server or CLI. Full guide,
including backups, troubleshooting and what an agent's key exposes:
[docs/deploy/dokploy.md](https://github.com/fabrilallo/candydati/blob/main/docs/deploy/dokploy.md).

## Docker Compose by hand

If you prefer to manage every file yourself: clone the repository on the server, copy `.env.example` to `.env`, set
the secrets and the email provider, put a reverse proxy with TLS in front of the web container (the guide uses Caddy)
and start the stack with `docker compose -f docker-compose.prod.yml --profile backup up -d --build`. This builds the
images on the server, which needs about 4 GB of free memory.

Full guide, with the Caddy configuration, updates, network and several instances on one host:
[docs/deploy/docker-compose.md](https://github.com/fabrilallo/candydati/blob/main/docs/deploy/docker-compose.md).

## Managed database and storage

Postgres 17 and any S3-compatible storage can replace the bundled ones when you want provider backups and failover;
it is not needed for speed. See
[OPERATIONS.md](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md) for the architecture, the
reverse proxy settings (request size and timeouts for imports up to 200 MiB) and the operator security checklist.
