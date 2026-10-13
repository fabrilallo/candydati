# Contributing

Thanks for helping. This is an open source ATS built on the candidate's side: salary range in clear, a declared
selection process, every application gets an outcome. Contributions must respect those principles
(see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/adr/`](docs/adr)).

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately, see
[`SECURITY.md`](SECURITY.md).

## Setup

Requirements: Node 24 (`.nvmrc`), pnpm 10 (via Corepack: `corepack enable`), Docker with Compose v2.

```bash
cp .env.example .env
pnpm install
pnpm infra:up      # Postgres on :5434, MinIO on :9000 (console :9001)
pnpm db:migrate
pnpm dev           # web on :3000, api on :4100
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | run web, api and worker |
| `pnpm test` | unit and integration tests (need `pnpm infra:up`) |
| `pnpm test:coverage` | tests with coverage (CI requires at least 80%) |
| `pnpm test:e2e` | Playwright flows (`pnpm --filter @tt/e2e install:browsers` once) |
| `pnpm typecheck`, `pnpm lint` | static checks |
| `pnpm db:generate && pnpm db:migrate` | create and apply Drizzle migrations |

## Architecture rules

These are enforced in review.

- Logic lives in `packages/core`. REST routes, assistant tools and MCP tools are thin adapters over the same use cases,
  with the same permissions.
- Every use case goes through the permission check and writes to the append-only `audit_log`.
- Every domain table has `organization_id`; no query without an organization filter.
- Roles and permissions are declared only in `packages/domain/src/access/permissions.ts`.
- LLM models only through Mastra, with `provider/model` strings from env (`AGENT_MODEL`, `FAST_MODEL`). Never import a
  vendor SDK.
- The assistant never ranks, scores or rejects candidates, and never messages one without a person's confirmation.
- Validate with Zod at every boundary (HTTP, tool input, files, model output).
- API responses use the `ok` / `fail` envelope from `@tt/domain`.
- Immutable data: return new objects, do not mutate inputs.
- Files under 400 lines, functions under 50.
- The product name is not decided: never write it in code; read it with `loadPlatformConfig`.

## Tests first

Write the failing test, then the code. Tests sit next to the code (`*.test.ts`), Vitest. Coverage stays at 80% or more.
Bug fixes start with a test that reproduces the bug.

## Commits and pull requests

- Conventional commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
  Example: `fix: reject expired consent tokens`.
- Keep pull requests focused; fill in the template; make sure `pnpm lint`, `pnpm typecheck` and tests pass.
- Use `Fixes #123` to link the issue.

## Sign-off (DCO), no CLA

We use the [Developer Certificate of Origin](https://developercertificate.org/) instead of a Contributor License
Agreement. It is a lightweight statement that you wrote the change or have the right to submit it under the project
license (AGPL-3.0-only). You keep your copyright, and we do not ask you to assign or relicense anything. Sign every
commit:

```bash
git commit -s -m "feat: add something"
```

This appends `Signed-off-by: Your Name <you@example.com>`, which must match your commit author. To fix a missing
sign-off: `git commit --amend -s` (last commit) or `git rebase --signoff main`.

## Contributions and licensing

All contributions are licensed under AGPL-3.0-only. Do not add code, assets or screenshots you do not have the right to
publish, and do not copy from proprietary products.
