# Candydati migration skill

An agent skill that helps an AI coding or chat agent build a **Candydati migration package** from another ATS
(Teamtailor, Workable, Greenhouse, Recruitee, a spreadsheet, and so on) and check it offline. The package format is
`docs/schema/migration-package.v1.json`; a person uploads the ZIP in Candydati, reviews the preview and confirms. The
skill never uploads or confirms anything.

What is here:

- `SKILL.md`: the instructions the agent follows. The first step is the responsibility notice: the agent stops if the
  user does not confirm.
- `scripts/validate.mjs`: validates a package folder or ZIP against the schema and the cross-reference rules. Node 24 or
  newer, no network, no dependencies to install. `node scripts/validate.mjs <folder-or-zip> [--json]`; exit code 0 when
  valid, 1 otherwise.
- `scripts/migration-package.v1.json`: a copy of the schema, kept equal to `docs/schema/` by a test.
- `reference/mapping-examples.md`: how the usual sources map to the package, what to drop, how to split large accounts.

## Install

The skill is a folder: copy `skills/candydati-migration/` (the whole folder, with `scripts/` and `reference/`).

- **Claude Code**: put the folder in `.claude/skills/` of a project (`.claude/skills/candydati-migration/SKILL.md`) or in
  `~/.claude/skills/` for all your projects. Claude Code reads `SKILL.md` and loads it when your request matches the
  description, for example "migrate our Teamtailor data to Candydati".
- **Codex and other agents** that follow the `AGENTS.md` convention: they do not load `SKILL.md` as a skill on their own.
  Keep the folder in your repository and add a line to your `AGENTS.md` such as: "To build a Candydati migration
  package, read and follow `skills/candydati-migration/SKILL.md`." The instructions are plain Markdown and the validator
  is a plain Node script, so any agent that can read files and run `node` can use them.
- **Without an agent**: you can follow `SKILL.md` and `reference/mapping-examples.md` by hand and run the validator
  yourself.

Where each tool looks for skills or instructions may change: check its documentation if the skill is not picked up.

## Check it works

```sh
node skills/candydati-migration/scripts/validate.mjs path/to/package-folder
```

Repository tests for the validator: `pnpm --filter @candydati/tools test`.

## Keep the schema copy in sync

`pnpm --filter @candydati/domain schema` writes `docs/schema/migration-package.v1.json` and this copy together, and
a test fails if the two ever differ. If the schema starts using a JSON Schema keyword the small validator in
`scripts/lib/json-schema.mjs` does not know, it stops with an error instead of skipping the check.
