# ADR 0008: Consent to renew for imports

Status: accepted

## Context

Customers import CVs, spreadsheets and Notion exports of people who never applied through the product, so there is no consent record under our notice.

## Decision

Imported candidates get consent marked "to renew" and an email with a public link to read the notice and choose their scope. If they do not confirm within the configured window, their data is erased by the retention job. An import is previewed first and can be undone as a whole.

## Consequences

Lawful handling of legacy data and a visible clean-up path. Some imported people will be erased. The operator remains responsible for having a legal basis to send the first email.
