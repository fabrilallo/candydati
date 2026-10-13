# team-tracker

Nome in codice di un ATS open source e agentico. Il nome del prodotto NON è deciso: mai scriverlo nel codice,
si legge da `loadPlatformConfig` (`@tt/domain`), alimentato da `PLATFORM_*` / `NUXT_PUBLIC_PLATFORM_*`.
Principi e perimetro: `docs/PRODUCT.md`. Design system: `docs/DESIGN-SYSTEM.md`. Architettura: `docs/ARCHITECTURE.md`.

## Layout
- `apps/api`      Fastify + Better Auth (plugin organization) + agente Mastra + server MCP.
- `apps/worker`   worker pg-boss (automazioni, scadenze, conservazione, import, email).
- `apps/web`      Nuxt 4 + shadcn-vue: app interna e pagine pubbliche. UI in italiano e inglese.
- `packages/domain`  schemi Zod, ruoli e permessi, eventi del registro, config di piattaforma. Nessun I/O.
- `packages/db`      schema Drizzle, migrazioni, client (Postgres 17).
- `packages/core`    servizi applicativi (casi d'uso). Unico punto in cui vive la logica.

## Rules
- La logica sta in `packages/core`. Route REST, strumenti dell'agente e strumenti MCP sono adattatori sottili sopra
  gli stessi servizi, con gli stessi permessi.
- Ogni caso d'uso passa dal controllo dei permessi e scrive nel registro delle azioni (`audit_log`, solo append).
- Ogni tabella di dominio ha `organization_id`: nessuna query senza filtro per organizzazione.
- Ruoli e permessi si dichiarano solo in `packages/domain/src/access/permissions.ts`.
- Modelli LLM solo via Mastra con stringhe `provider/model` da env (`AGENT_MODEL`, `FAST_MODEL`). Mai un SDK di un fornitore.
- L'agente non ordina, non assegna punteggi e non scarta candidati.
- Dati immutabili: si restituiscono nuovi oggetti, non si modificano gli input.
- File < 400 righe, funzioni < 50. Test accanto al codice (`*.test.ts`), Vitest, scritti prima; copertura ≥ 80%.
- Validazione Zod a ogni confine (HTTP, strumenti dell'agente, file, risposte dei modelli).
- Risposte API con l'envelope di `@tt/domain` (`ok` / `fail`).
- Commit convenzionali (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`).

## Commands
- `pnpm infra:up` Postgres su :5434 e MinIO su :9000 (console :9001)
- `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`
- `pnpm db:generate && pnpm db:migrate` migrazioni Drizzle
