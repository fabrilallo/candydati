# team-tracker

Nome in codice di un ATS open source e agentico, dalla parte del candidato: RAL in chiaro obbligatoria, processo di selezione dichiarato, nessuna candidatura senza esito.

Il nome del prodotto non è deciso e non va scritto nel codice.

- Piano: [`docs/PLAN.md`](docs/PLAN.md)
- Stato: Fase 0 (fondamenta) e Fase 1 (annuncio e standard) fatte: organizzazioni, ruoli, inviti, registro delle azioni; editor dell'annuncio con blocco della pubblicazione, punteggio di qualità, template, pagina carriere pubblica con JSON-LD; Fase 2 (candidatura e pipeline): form senza registrazione con consenso versionato e CV, estrazione del CV, pipeline a fasi, scheda candidato, note, ricerca; Fase 3 (comunicazione): email a nome dell'azienda, risposte agganciate alla candidatura, template, invio massivo, messaggi di esito. In locale le email finiscono in Mailpit (http://localhost:8025). Fase 4 (automazioni e scadenze): conto alla rovescia sulla risposta promessa, vista Da gestire, notifiche e riepiloghi, attività, automazioni per fase, webhook firmati, chiusura dell'annuncio vincolata agli esiti. Fase 5 (GDPR): cancellazione automatica alla scadenza con avviso, diritti dell'interessato dalla scheda candidato, export del candidato e dell'organizzazione, modelli dei documenti in docs/legal. Fase 6 (agentic-ready): chiavi API con ambiti, OpenAPI su /api/v1/openapi.json, server MCP su /mcp, assistente interno senza memoria sul server, test avversariali con `pnpm --filter @tt/api eval:agent`. Fase 7 (distribuzione): feed XML, llms.txt e sitemap per organizzazione sotto /careers/{org}/, API pubblica di sola lettura, interfaccia per i canali di distribuzione. Fase 8 (import): ZIP o cartelle di CV, CSV, Excel ed export di Notion, con abbinamento, anteprima, consenso da rinnovare via email e annullamento dell'intero import. Fase 9 (strumenti per l'HR): conformità dell'annuncio al diritto italiano, CCNL e benefit strutturati, feedback dei colloqui senza login, richieste di apertura con approvazione, annunci fermi. Fase 10 (report): tempo di assunzione e copertura, passaggi tra le fasi, provenienza, tempi di risposta rispettati, export CSV.
- Avvio in locale: `cp .env.example .env`, `pnpm install`, `pnpm infra:up`, `pnpm dev` (web su :3000, api su :4100).

## Self-hosting

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
