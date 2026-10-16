# Contribuire

I contributi sono benvenuti: codice, documentazione, traduzioni, segnalazioni di bug. Devono rispettare i principi del
prodotto (RAL in chiaro, un processo di selezione dichiarato, un esito per ogni candidatura, nessuna decisione
automatica sulle persone).

## Avviarlo in locale

Requisiti: Node 24, pnpm 10 (`corepack enable`), Docker con Compose v2.

```bash
git clone https://github.com/fabrilallo/candydati.git && cd candydati
cp .env.example .env
pnpm install
pnpm infra:up      # Postgres su :5434, MinIO su :9000
pnpm db:migrate
pnpm dev           # web su :3000, api su :4100
```

Le email arrivano a Mailpit su `http://localhost:8025`. Controlli: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

Questa documentazione sta nella cartella `website/`: `pnpm --filter @candydati/website dev`.

## Prima di aprire una pull request

- Leggi [CONTRIBUTING.md](https://github.com/fabrilallo/candydati/blob/main/CONTRIBUTING.md) (in inglese): struttura,
  regole, test prima del codice, messaggi di commit.
- Accetta il [Contributor License Agreement](https://github.com/fabrilallo/candydati/blob/main/CLA.md) prima che la tua
  prima pull request venga unita: spunta la casella nel modello della pull request. Il copyright del tuo contributo
  resta tuo.
- Segui il [Codice di condotta](https://github.com/fabrilallo/candydati/blob/main/CODE_OF_CONDUCT.md).
- Segnala i problemi di sicurezza in privato, mai in una issue pubblica
  ([SECURITY.md](https://github.com/fabrilallo/candydati/blob/main/SECURITY.md)).

## Con un agente di coding

Claude Code, Codex, Cursor, Copilot e strumenti simili sono benvenuti. Leggono le regole del progetto da
[AGENTS.md](https://github.com/fabrilallo/candydati/blob/main/AGENTS.md) (in inglese). Di ogni riga della tua pull
request rispondi comunque tu: leggi il diff, lancia i controlli, tienila piccola e spiegata, e non dare mai a un agente
segreti o dati reali di candidati. La CI ripete tutti i controlli e nulla viene unito finché non passano.

L'architettura è descritta in
[ARCHITECTURE.md](https://github.com/fabrilallo/candydati/blob/main/docs/ARCHITECTURE.md) e nei
[decision record](https://github.com/fabrilallo/candydati/blob/main/docs/adr/README.md) (in inglese).
