# team-tracker

Code name of a source-available, agentic ATS (BUSL-1.1, see `LICENSE`). The product name is NOT decided: never write it
in code. It is read from `loadPlatformConfig` (`@tt/domain`), fed by `PLATFORM_*` / `NUXT_PUBLIC_PLATFORM_*`.
Principles and scope: `docs/PRODUCT.md`. Design system: `docs/DESIGN-SYSTEM.md`. Architecture: `docs/ARCHITECTURE.md`.

## Layout
- `apps/api`      Fastify + Better Auth (organization plugin) + Mastra agent + MCP server.
- `apps/worker`   pg-boss worker (automations, deadlines, retention, imports, email).
- `apps/web`      Nuxt 4 + shadcn-vue: internal app and public pages. UI in Italian and English.
- `packages/domain`      Zod schemas, roles and permissions, audit log events, platform config. No I/O.
- `packages/db`          Drizzle schema, migrations, client (Postgres 17).
- `packages/core`        application services (use cases). The only place where logic lives.
- `packages/providers`   adapters to the outside world: AI, CV extraction, email, storage, queue, imports, observability.
- `packages/ad-quality`  job ad quality analysis (rules plus model).
- `tools`                repository tooling (environment variable docs generator).
- `e2e`                  Playwright end-to-end tests and README screenshots.

## Rules
- Logic lives in `packages/core`. REST routes, agent tools and MCP tools are thin adapters over the same services, with
  the same permissions.
- Every use case checks permissions and writes to the audit log (`audit_log`, append-only).
- Every domain table has `organization_id`: no query without an organization filter.
- Roles and permissions are declared only in `packages/domain/src/access/permissions.ts`.
- LLM models only through Mastra, with `provider/model` strings from env (`AGENT_MODEL`, `FAST_MODEL`). Never a vendor SDK.
- The agent never ranks, scores or rejects candidates.
- Immutable data: return new objects, never modify inputs.
- Files < 400 lines, functions < 50. Tests next to the code (`*.test.ts`), Vitest, written first; coverage ≥ 80%.
- Zod validation at every boundary (HTTP, agent tools, files, model responses).
- API responses use the `@tt/domain` envelope (`ok` / `fail`).
- Conventional commits (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`).

## Commands
- `pnpm infra:up` Postgres on :5434 and MinIO on :9000 (console :9001)
- `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`
- `pnpm db:generate && pnpm db:migrate` Drizzle migrations
