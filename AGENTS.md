# Candydati: instructions for coding agents

Read by Claude Code (through `CLAUDE.md`), Codex, Cursor, GitHub Copilot, Gemini CLI, Aider and any agent that follows
the `AGENTS.md` convention. People find the same rules in `CONTRIBUTING.md`.

Source-available, agentic ATS (BUSL-1.1, see `LICENSE`); domains candydati.it and candydati.com. Never write the product
name in UI or email copy: read it from `loadPlatformConfig` (`@candydati/domain`), fed by `PLATFORM_*` /
`NUXT_PUBLIC_PLATFORM_*`, so a deployment can rebrand.
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
- LLM models only through Mastra, with `provider/model` from env (`AGENT_MODEL`, `FAST_MODEL`, which win) or from the
  instance AI settings saved in the app (key passed explicitly to Mastra, never written to the environment). Never a vendor SDK.
- The agent never ranks, scores or rejects candidates.
- Immutable data: return new objects, never modify inputs.
- Files < 400 lines, functions < 50. Tests next to the code (`*.test.ts`), Vitest, written first; coverage ≥ 80%.
- Zod validation at every boundary (HTTP, agent tools, files, model responses).
- API responses use the `@candydati/domain` envelope (`ok` / `fail`).
- Conventional commits (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`).

## Commands
- `pnpm infra:up` Postgres on :5434 and MinIO on :9000 (console :9001)
- `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm lint`
- `pnpm db:generate && pnpm db:migrate` Drizzle migrations

## Working as an agent
- Read `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` before changing behaviour; the principles (salary in clear, declared
  process, an answer to every applicant, no automated decisions about people) are not negotiable.
- Write the failing test first, then the code. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` before declaring the
  work done; say what you could not run.
- Never weaken a check to make it pass: no lower coverage thresholds, no disabled lint rules, no skipped tests, no new
  entries in `.gitleaks.toml` or `.github/audit-allowlist.txt` without a reason written next to them.
- Keep changes small and focused on the task; do not reformat or rename unrelated code.
- Never put secrets or real candidate data in code, tests, fixtures, logs or prompts: use the generators in `src/testing/`.
