# Migration sources

The sources Candydati can migrate from, and how far each one has been verified. Every producer of a migration package
(a built-in connector, the [agent skill](../../skills/candydati-migration/README.md) or a hand-written package) meets
the same public format, [`migration-package.v1.json`](../schema/migration-package.v1.json), and goes through the same
validation, preview and undo (ADR 0009).

## Connectors

| Source | Kind | Status | What it brings | Verified on a real account |
| --- | --- | --- | --- | --- |
| Teamtailor | built-in connector | beta (built on public docs, not verified on a real account) | users, jobs and stages, candidates, applications with outcome and dates, notes, form answers, CVs and uploads; no scores, no consent date, one stage-history entry, no emails ([details](../../packages/providers/src/migration/sources/teamtailor/README.md)) | no |
| Workable | built-in connector | beta (built on public docs, not verified on a real account) | jobs and their stages, candidates, applications with outcome and dates, stage history, notes, historical messages, CVs; [details](../../packages/providers/src/migration/sources/workable/README.md) | no |
| Greenhouse | built-in connector | beta (built on public docs, not verified on a real account) | users, jobs and stages, candidates, applications with outcome, origin and stage history, notes, past emails, CVs and files; see its [README](../../packages/providers/src/migration/sources/greenhouse/README.md) | no |
| Recruitee | built-in connector | planned | not yet defined | no |
| Any other ATS or a spreadsheet | package built by the [agent skill](../../skills/candydati-migration/README.md) or by hand | available | whatever the package contains | not applicable |

Connectors marked **beta** are built on public documentation and not yet verified on a real account. "Planned" means a
connector is on the list and not started. When a connector is released, its row says what it brings and what it
cannot, and it is marked **beta**.

## Maturity levels

- **planned**: no code yet.
- **beta**: built on the public documentation of the source and not yet verified on a real account. The product says so
  in the wizard, and the preview is the safety net: check it carefully before you confirm.
- **stable**: verified, as described below.

## Promoting a connector to stable

A connector moves from beta to stable only after **a real migration** of a real account of that source has been done
end to end (package built, preview checked, confirmed, results compared with the source), and the migration is recorded
in the table below. The record says: the date, the source and its plan or edition, the approximate size (jobs,
candidates, applications, files), what was compared and how, the differences found and what was changed in the
connector because of them, and who did it. No personal data of candidates goes in the record. Documentation or a test
account alone is not enough, and a connector is demoted back to beta if the source's API changes in a way that breaks it.

## Record of real migrations

| Date | Source | Size | What was checked | Differences found | Result |
| --- | --- | --- | --- | --- | --- |
| none yet | | | | | |
