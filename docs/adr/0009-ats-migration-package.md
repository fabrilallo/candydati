# ADR 0009: ATS migration through one public package

Status: accepted

## Context

Companies that leave another ATS need their recruiting history: jobs and their stages, candidates, applications with
outcomes and dates, notes, stage history, emails, CVs and attachments. The import (ADR 0008) handles loose CVs and
spreadsheets for one job at a time; it cannot carry closed jobs, outcomes or history. Writing one bespoke importer per
ATS would multiply validation paths, and every vendor API differs from its documentation in some way.

## Decision

One public, versioned **migration package** (`migration.json` plus files, in a ZIP; schema in
`docs/schema/migration-package.v1.json`) is the only way in. Built-in source connectors and an agent skill are
interchangeable producers of that package; the product validates it, shows a preview, and an owner or admin confirms
it. The migration commits in chunks and can be undone as a whole.

1. **Responsibility is the operator's.** The company running the migration is the data controller. It decides what to
   move and has the legal basis for it. When an AI agent or a third-party tool builds the package, the company chooses
   that agent's model provider or tool, which is its own sub-processor under its own agreements, not the platform's.
   The product says so in four places: the confirmation step (explicit declarations, recorded in the audit log), the
   documentation page, the skill's first instruction, and PRODUCT.md §6.
2. **Consent carries over.** Same controller, same legal basis: a candidate with a consent date in the source keeps it
   (status `given`, original date, retention from the source expiry or from the organization's notice). A candidate
   without any date goes through the reconfirmation flow of ADR 0008. A candidate whose retention has already expired
   is excluded by default: a migration must not bring back data that should have been erased.
3. **No scores on people.** The package schema has no field for ratings, scores, scorecard marks, AI evaluations,
   demographic or special-category data, photos or birth dates, and it is strict: unknown fields are refused, not
   ignored. Connectors drop those values on purpose. Free-text interview notes come across as notes (ADR 0005).
4. **Humans confirm.** Packages are uploaded and confirmed in the app by an owner or admin. `migration:manage` is not
   grantable to API keys or the assistant, like `import:manage`.
5. **Credentials are never stored.** A connector's API key is kept encrypted only for the duration of the fetch, then
   wiped; it never appears in logs, audit metadata or job payloads in clear.
6. **Beta until proven.** Each connector is marked beta: the UI and the docs say it is built on the vendor's public
   documentation and not yet verified on a real account. A connector becomes stable only after a real migration,
   recorded in `docs/migration/sources.md`.

## Consequences

One validation path for every producer: a connector, the skill and a hand-written package meet the same schema and the
same checks. Connectors can be wrong; the preview and the undo contain the damage, and the beta label sets
expectations. The operator answers for the transfer, for the consent dates it carries over and for any AI agent or tool
used to prepare the package; the product records their declarations but does not verify the legal basis of the source
data. Scores and ratings kept in the old ATS are lost on purpose.
