# team-tracker

> **Codename.** The product name is not decided yet; it is read from configuration (`PLATFORM_*`), never hard-coded.

SPDX-License-Identifier: AGPL-3.0-only

An open source, agentic applicant tracking system (ATS) on the **candidate's side**.

- **Salary range in clear.** A job ad without a range cannot be published.
- **Declared selection process.** Stages, who runs them, duration and response time are visible before applying.
- **No application without an outcome.** Every candidate always gets an answer; a job with open applications cannot be closed.
- **No automated decisions.** The assistant works on the process. It never ranks, scores or rejects people.
- **Agentic-ready.** Everything in the UI is available through a REST API (OpenAPI) and an MCP server.
- **GDPR by design.** Versioned consent, retention and automatic erasure, data subject rights, full export in open formats.

Status: pre-1.0 (see the [changelog](CHANGELOG.md)). What the product is and its principles: [docs/PRODUCT.md](docs/PRODUCT.md).

<!-- Screenshots: add images here (e.g. docs/images/pipeline.png), made from your own instance. -->

## Quickstart (development)

Requirements: Node 24, pnpm 10 (`corepack enable`), Docker with Compose v2.

```bash
cp .env.example .env
pnpm install
pnpm infra:up       # Postgres :5434, MinIO :9000
pnpm db:migrate
pnpm dev            # web http://localhost:3000, api http://localhost:4100
```

Locally, emails go to Mailpit (http://localhost:8025). Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Self-hosting

```bash
cp .env.example .env     # set PLATFORM_URL and the secrets
docker compose -f docker-compose.prod.yml up -d --build
```

The first account you register creates your organization. Required variables, networking, reverse proxy and
upgrade notes are in the [section below](#self-hosting-in-dettaglio) (Italian; variable names and commands are the same).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) and [decision records](docs/adr/README.md)
- [Contributing](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), [Security policy](SECURITY.md)
- [Product](docs/PRODUCT.md): principles, scope, job ad standard, agent and GDPR approach
- [Design system](docs/DESIGN-SYSTEM.md)
- [Public data schemas](docs/schema/README.md), [legal templates](docs/legal/README.md) (Italian, need legal review)

## Author

Created and maintained by **Fabrizio Lallo** (fabrizio.lallo95@gmail.com), founder of
[TechCompenso](https://techcompenso.com) and [XCompenso](https://xcompenso.com), and creator of
[FuffAnnuncio](https://www.fuffannuncio.com) and [Riccometro](https://www.riccometro.it). The job ad quality analysis in
this project is derived from FuffAnnuncio.

## License

[GNU AGPL v3](LICENSE) (`AGPL-3.0-only`). If you run a modified version as a network service, you must offer its
source to its users.

---

# Italiano

Nome in codice di un ATS open source e agentico, dalla parte del candidato: RAL in chiaro obbligatoria, processo di selezione dichiarato, nessuna candidatura senza esito.

Il nome del prodotto non è deciso e non va scritto nel codice.

- Prodotto (in inglese): [`docs/PRODUCT.md`](docs/PRODUCT.md); design system: [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)
- Cosa fa: annunci con RAL e processo obbligatori e conformi al diritto italiano, pagina carriere con dati strutturati e feed, candidature senza registrazione con consenso versionato, pipeline a fasi, comunicazione con i candidati, scadenze e automazioni, GDPR completo (conservazione, diritti, export), import di CV e fogli di calcolo, feedback dei colloqui senza login, report, API pubblica, server MCP e assistente. Dettagli in [`docs/PRODUCT.md`](docs/PRODUCT.md).
- Autore: **Fabrizio Lallo** (fabrizio.lallo95@gmail.com), fondatore di [TechCompenso](https://techcompenso.com) e
  [XCompenso](https://xcompenso.com), creatore di [FuffAnnuncio](https://www.fuffannuncio.com) e
  [Riccometro](https://www.riccometro.it).
- Avvio in locale: `cp .env.example .env`, `pnpm install`, `pnpm infra:up`, `pnpm dev` (web su :3000, api su :4100).

## Self-hosting in dettaglio

Uno stack completo (Postgres 17, MinIO, api, worker, web) con un solo comando. Serve Docker con Compose v2.

```bash
cp .env.example .env
# modifica .env: almeno PLATFORM_URL e i segreti (vedi tabella)
docker compose -f docker-compose.prod.yml up -d --build
```

L'app è su `http://localhost:3000` (porta `WEB_PORT`). Registrati: il primo account crea la tua organizzazione. Le migrazioni del database e la creazione del bucket MinIO avvengono da sole all'avvio dell'api; il worker parte quando l'api è sana.

Rete e dati:
- Solo `web` è pubblicato sull'host. Postgres, MinIO e worker stanno sulla rete interna; l'api è raggiungibile solo da `127.0.0.1` (`API_PUBLISH`). Il browser parla sempre con il web, che inoltra `/api/**` all'api.
- Volumi Docker `pgdata` (database) e `miniodata` (CV e file): sono i dati da salvare. `docker compose -f docker-compose.prod.yml down` li conserva, `down -v` li cancella.
- Per più istanze sulla stessa macchina imposta `COMPOSE_PROJECT_NAME` e porte diverse.
- Dietro un reverse proxy con TLS punta `PLATFORM_URL` all'URL pubblico (https) e inoltra tutto al web. Il compose fissa la rete interna (`TT_SUBNET`, default `172.31.77.0/24`) e la usa come `TRUST_PROXY` dell'api: il web e' il suo proxy. Dietro Cloudflare imposta `NUXT_TRUST_CLOUDFLARE=true` (solo se l'origine e' raggiungibile solo da Cloudflare). `WEBHOOKS_ALLOW_PRIVATE` e' sempre `false` nello stack.
- Posta di sviluppo: `TT_EMAIL_PROVIDER=smtp` e `--profile mail`, UI Mailpit su `http://localhost:8025`.

Variabili (tutte in `.env`; il compose imposta da solo gli indirizzi interni, per cui `DATABASE_URL`, `S3_ENDPOINT` e `NUXT_API_INTERNAL_URL` del `.env` valgono solo in sviluppo):

| Variabile | Obbligatoria | Note |
|---|---|---|
| `PLATFORM_URL` | sì | URL pubblico dell'app (origine del web), es. `https://lavora.example.com` |
| `BETTER_AUTH_SECRET` | sì | almeno 32 caratteri casuali (`openssl rand -hex 32`) |
| `INBOUND_WEBHOOK_SECRET` | sì | almeno 32 caratteri; firma dei webhook email in ingresso |
| `POSTGRES_PASSWORD` | sì | password del database (`POSTGRES_USER`, `POSTGRES_DB` opzionali) |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | sì | credenziali di MinIO (e dell'app); `S3_BUCKET` opzionale |
| `PLATFORM_NAME`, `PLATFORM_SUPPORT_EMAIL`, `PLATFORM_DEFAULT_LOCALE` | no | identità e lingua (`it` o `en`; la lingua è fissata alla build, rifai `--build` se la cambi) |
| `TT_EMAIL_PROVIDER` | no | `log` (default, non invia nulla), `smtp` o `resend` (`RESEND_API_KEY`); per SMTP `TT_SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` |
| `EMAIL_DOMAIN`, `EMAIL_FROM_LOCAL`, `EMAIL_INBOUND_DOMAIN` | no | dominio di invio e di ricezione delle risposte |
| `AGENT_MODEL`, `FAST_MODEL` + chiave del fornitore | no | vuoti = assistente spento e nessuna chiamata a modelli |
| `WEB_PORT`, `API_PUBLISH`, `MAILPIT_UI_PORT` | no | porte sull'host |
| `TT_SUBNET`, `TRUST_PROXY`, `NUXT_TRUST_CLOUDFLARE` | no | rete interna e fiducia nel proxy (vedi sopra) |
| `APPLICATIONS_DAILY_MAX_PER_ORGANIZATION`, `APPLICATIONS_DAILY_MAX_PER_JOB`, `CV_MODEL_DAILY_BUDGET` | no | tetti giornalieri alle candidature e alle estrazioni di CV con modello (default 500, 200, 1000) |

Aggiornare: `git pull && docker compose -f docker-compose.prod.yml up -d --build`. Le immagini si costruiscono anche a mano: `docker build --target api|worker|web .`.
