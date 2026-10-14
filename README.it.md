<p align="center"><a href="README.md">English</a> · <strong>Italiano</strong></p>

# team-tracker

Nome in codice di un ATS open source e agentico, dalla parte del candidato: RAL in chiaro obbligatoria, processo di selezione dichiarato, nessuna candidatura senza esito.

Il nome del prodotto non è deciso e non va scritto nel codice.

## Perché

**L'ATS non è un nemico.** Chi si candida spesso immagina l'ATS come una scatola nera che nasconde il CV o taglia fuori le persone prima che qualcuno le legga. Il software fa quello che decide chi lo gestisce: lo stesso strumento può lasciare i candidati senza risposta oppure rispondere a tutti. La differenza sta in come lo si configura e lo si usa.

Per questo è open source: le regole che applica sono codice che chiunque può leggere, verificare e migliorare, e le buone pratiche sono parte del prodotto invece di essere lasciate alla buona volontà. RAL in chiaro, processo dichiarato e un esito per ogni candidatura non si possono disattivare.

- Prodotto (in inglese): [`docs/PRODUCT.md`](docs/PRODUCT.md); design system: [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)
- Cosa fa: annunci con RAL e processo obbligatori e conformi al diritto italiano, pagina carriere personalizzabile (hero con immagine o video, galleria, valori, numeri, testimonianze, anteprima dal vivo) con dati strutturati e feed, candidature senza registrazione con consenso versionato, pipeline a fasi, comunicazione con i candidati, scadenze e automazioni, GDPR completo (conservazione, diritti, export), import di CV e fogli di calcolo, feedback dei colloqui senza login, report, API pubblica, server MCP e assistente. Dettagli in [`docs/PRODUCT.md`](docs/PRODUCT.md).
- Autore: **Fabrizio Lallo** (fabrizio.lallo95@gmail.com), fondatore di [TechCompenso](https://techcompenso.com) e
  [XCompenso](https://xcompenso.com), creatore di [FuffAnnuncio](https://www.fuffannuncio.com) e
  [Riccometro](https://www.riccometro.it).
- Avvio in locale: `cp .env.example .env`, `pnpm install`, `pnpm infra:up`, `pnpm dev` (web su :3000, api su :4100).

## Self-hosting in dettaglio

Uno stack completo (Postgres 17, MinIO, api, worker, web) con un solo comando. Serve Docker con Compose v2.

```bash
cp .env.example .env
# modifica .env: almeno PLATFORM_URL (https), EMAIL_PROVIDER e i segreti (vedi tabella)
docker compose -f docker-compose.prod.yml up -d --build
```

L'app è su `http://localhost:3000` (porta `WEB_PORT`), da esporre in https dietro il reverse proxy. Lo stack non parte con i segreti di esempio, con un `PLATFORM_URL` in http o con `EMAIL_PROVIDER=log` (`docker/config-check.sh`, poi api e worker). Registrati subito, prima di rendere pubblico l'URL: con `SIGNUP_MODE=invite_only` (default in produzione) il primo owner è l'unico account che si crea senza invito, e in produzione serve il `BOOTSTRAP_TOKEN` monouso impostato nel `.env` (`openssl rand -base64 48`). Apri `/signup?setup`, inserisci il token nel campo "Codice di configurazione", conferma l'email e crea l'organizzazione; poi togli il token dal `.env` e invita i colleghi via email (vedi SECURITY.md). Chi può creare altre organizzazioni lo decide `ORGANIZATION_CREATION` (default: una per persona). Le migrazioni del database e la creazione del bucket MinIO avvengono da sole all'avvio dell'api; il worker parte quando l'api è sana.

Su [Dokploy](docs/deploy/dokploy.md) il deploy si può anche delegare a un agente di coding (Claude Code, Codex, Cursor): con una API key di Dokploy l'agente usa il [server MCP o la CLI di Dokploy](docs/deploy/dokploy.md#set-it-up-with-an-ai-coding-agent-optional) per creare il servizio, impostare le variabili, aggiungere il dominio e leggere i log. I segreti conviene incollarli a mano: la guida spiega perché.

Rete e dati:
- Solo `web` è pubblicato sull'host. Postgres, MinIO e worker stanno sulla rete interna; l'api è raggiungibile solo da `127.0.0.1` (`API_PUBLISH`). Il browser parla sempre con il web, che inoltra `/api/**` all'api.
- Volumi Docker `pgdata` (database) e `miniodata` (CV e file): sono i dati da salvare. `docker compose -f docker-compose.prod.yml down` li conserva, `down -v` li cancella.
- Per più istanze sulla stessa macchina imposta `COMPOSE_PROJECT_NAME` e porte diverse.
- Dietro un reverse proxy con TLS punta `PLATFORM_URL` all'URL pubblico (https) e inoltra tutto al web. I link inviati per email (reset della password, verifica, inviti, feedback, consenso) hanno il token nell'URL: maschera gli access log del proxy come fa l'api (esempi nginx e Caddy in [SECURITY.md](SECURITY.md#reverse-proxy-access-logs)). Il compose fissa la rete interna (`TT_SUBNET`, default `172.31.77.0/24`) e un indirizzo fisso per il web (`TT_WEB_IP`, default `172.31.77.10`), che usa come `TRUST_PROXY` dell'api: solo il web e' il suo proxy. Mailpit (profilo `mail`) ascolta solo su 127.0.0.1. Dietro Cloudflare imposta `NUXT_TRUST_CLOUDFLARE=true` (solo se l'origine e' raggiungibile solo da Cloudflare). `WEBHOOKS_ALLOW_PRIVATE` e' sempre `false` nello stack.
- Posta di sviluppo: `EMAIL_PROVIDER=smtp` e `--profile mail`, UI Mailpit su `http://localhost:8025`.

Variabili (tutte in `.env`; il compose imposta da solo gli indirizzi interni, per cui `DATABASE_URL`, `S3_ENDPOINT` e `NUXT_API_INTERNAL_URL` del `.env` valgono solo in sviluppo):

| Variabile | Obbligatoria | Note |
|---|---|---|
| `PLATFORM_URL` | sì | URL pubblico dell'app (origine del web), es. `https://lavora.example.com` |
| `BETTER_AUTH_SECRET` | sì | almeno 32 caratteri casuali (`openssl rand -base64 48`); i valori di esempio sono rifiutati |
| `INBOUND_WEBHOOK_SECRET` | sì | almeno 32 caratteri casuali; firma dei webhook email in ingresso |
| `POSTGRES_PASSWORD` | sì | password del database, almeno 16 caratteri casuali (`POSTGRES_USER`, `POSTGRES_DB` opzionali) |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | sì | credenziali di MinIO (e dell'app), segreto di almeno 16 caratteri casuali; `S3_BUCKET` opzionale |
| `PLATFORM_NAME`, `PLATFORM_SUPPORT_EMAIL`, `PLATFORM_DEFAULT_LOCALE` | no | identità e lingua (`it` o `en`; la lingua è fissata alla build, rifai `--build` se la cambi) |
| `EMAIL_PROVIDER` | sì | `smtp` o `resend` (`RESEND_API_KEY`); per SMTP `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`. `log` non invia nulla ed è rifiutato in produzione |
| `EMAIL_DOMAIN`, `EMAIL_FROM_LOCAL`, `EMAIL_INBOUND_DOMAIN` | no | dominio di invio e di ricezione delle risposte |
| `AGENT_MODEL`, `FAST_MODEL` + chiave del fornitore | no | vuoti = assistente spento e nessuna chiamata a modelli; chiavi: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY` |
| `LOG_LEVEL`, `TRUSTED_ORIGINS`, `API_KEY_RATE_LIMIT`, `IMPORT_STALE_DAYS` | no | livello di log, origini extra per CORS, richieste al minuto per chiave API, giorni prima che un import non confermato venga eliminato |
| `NUXT_PUBLIC_TIME_ZONE`, `PLATFORM_TIME_ZONE`, `NUXT_PUBLIC_SOURCE_URL` | no | fuso orario delle date (schermate e email; default `Europe/Rome`) e URL dove sfogliare i file del repository |
| `NUXT_API_MAX_BODY_BYTES`, `NUXT_API_TIMEOUT_MS` | no | limiti del proxy web verso l'api: dimensione massima del corpo (default 204 MiB) e attesa massima della risposta (default 5 minuti) |
| `WEB_PORT`, `API_PUBLISH`, `MAILPIT_UI_PORT` | no | porte sull'host |
| `TT_SUBNET`, `TT_WEB_IP`, `TRUST_PROXY`, `NUXT_TRUST_CLOUDFLARE` | no | rete interna e fiducia nel proxy (vedi sopra) |
| `APPLICATIONS_DAILY_MAX_PER_ORGANIZATION`, `APPLICATIONS_DAILY_MAX_PER_JOB`, `CV_MODEL_DAILY_BUDGET` | no | tetti giornalieri alle candidature e alle estrazioni di CV con modello (default 500, 200, 1000) |
| `SIGNUP_MODE` | no | `invite_only` (default in produzione: account solo con invito, più il primo owner) o `open` |
| `BOOTSTRAP_TOKEN` | per il primo avvio | segreto monouso (almeno 32 caratteri casuali) per la registrazione del primo owner su `/signup?setup`; senza, in produzione nessuno può avviare l'istanza. Toglilo dopo |
| `ORGANIZATION_CREATION`, `INSTANCE_ADMIN_EMAILS` | no | chi crea organizzazioni: `one_per_user` (default con `invite_only`), `instance_admins` (solo il primo owner e gli indirizzi elencati) o `open` |
| `API_KEY_DEFAULT_TTL_DAYS` | no | giorni di vita di una chiave API senza scadenza indicata (default 90, massimo 365) |
| `MCP_MODEL_DAILY_BUDGET_PER_KEY`, `MCP_MODEL_DAILY_BUDGET_PER_USER`, `MCP_MODEL_DAILY_BUDGET_PER_ORGANIZATION`, `ASSISTANT_DAILY_BUDGET_PER_USER`, `ASSISTANT_DAILY_BUDGET_PER_ORGANIZATION` | no | tetti giornalieri alle chiamate a modelli da MCP (default 200 per chiave, 300 per persona, 1000 per organizzazione) e dall'assistente (200 per persona, 2000 per organizzazione) |

Aggiornare: `git pull && docker compose -f docker-compose.prod.yml up -d --build`. Le immagini si costruiscono anche a mano: `docker build --target api|worker|web .`.
