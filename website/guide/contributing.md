# Contributing

Contributions are welcome: code, documentation, translations, bug reports. They must respect the principles of the
product (salary range in clear, a declared selection process, an outcome for every application, no automated decisions
about people).

## Run it locally

Requirements: Node 24, pnpm 10 (`corepack enable`), Docker with Compose v2.

```bash
git clone https://github.com/fabrilallo/candydati.git && cd candydati
cp .env.example .env
pnpm install
pnpm infra:up      # Postgres on :5434, MinIO on :9000
pnpm db:migrate
pnpm dev           # web on :3000, api on :4100
```

Emails go to Mailpit at `http://localhost:8025`. Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

This documentation lives in the `website/` folder: `pnpm --filter @candydati/website dev`.

## Before you open a pull request

- Read [CONTRIBUTING.md](https://github.com/fabrilallo/candydati/blob/main/CONTRIBUTING.md): layout, rules, tests
  first, commit messages.
- Accept the [Contributor License Agreement](https://github.com/fabrilallo/candydati/blob/main/CLA.md) before your
  first pull request is merged: tick the box in the pull request template. You keep the copyright of your
  contribution.
- Follow the [Code of Conduct](https://github.com/fabrilallo/candydati/blob/main/CODE_OF_CONDUCT.md).
- Report security issues privately, never in a public issue
  ([SECURITY.md](https://github.com/fabrilallo/candydati/blob/main/SECURITY.md)).

The architecture is described in
[ARCHITECTURE.md](https://github.com/fabrilallo/candydati/blob/main/docs/ARCHITECTURE.md) and in the
[decision records](https://github.com/fabrilallo/candydati/blob/main/docs/adr/README.md).
