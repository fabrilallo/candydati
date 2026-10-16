# Migrating from another ATS

Bring your recruiting history over from another ATS: jobs and their stages, candidates, applications with outcomes and
dates, notes, emails and CVs. You always see a preview before anything is written, and you can undo the whole
migration.

::: warning You remain responsible
Your company is the **data controller**. It decides what to move and has the legal basis to move it. Candydati moves
what the package contains and does not verify the legal basis of the source data.

If an AI agent or a third-party tool prepares the package, your company chooses it: that agent's model provider or that
tool is **your** processor, covered by **your** agreements, not Candydati's.

Before the migration starts you tick three statements, and they are recorded in the audit log with your name and the
time.
:::

Only owners and admins can migrate. The permission is not available to API keys or to the assistant.

## What moves, and what does not

**Comes across**

- Jobs, with their status (draft, open, closed), dates and the stages of their process.
- Candidates: name, email, phone, LinkedIn address, tags, the date they were created.
- Applications: the current stage, the outcome (hired, not selected, withdrawn) and its date, the origin, the cover
  letter, the answers to the application questions, the history of stage changes.
- CVs and other attachments.
- Notes, with their author and original date, including free-text interview notes.
- Past emails, as history: they are never sent again.

**Does not come across, on purpose**

- Scores, ratings, scorecard marks, AI evaluations, "match" percentages and rankings. Candydati does not score people
  (see [Introduction](./introduction)), so the format has no field for them. Free-text interview notes do come across
  as notes.
- Demographic or special-category data, photos and birth dates: the product collects only what selection needs.
- Accounts and credentials. The authors of notes become members only if their email matches an existing member;
  otherwise the note keeps their name.

The format refuses unknown fields instead of ignoring them, so none of these can slip in under another name.

### Consent and retention

The same company stays the controller, so consent carries over:

- A candidate with a **consent date** in the source keeps it: it is recorded as given on the original date, and
  retention follows the expiry in the source or your organization's retention period.
- A candidate with **no date** goes through the reconfirmation flow of imports: if they have an email they are asked to
  confirm, and the data is erased if they do not.
- A candidate whose retention has **already expired** is left out, with everything attached to them: a migration does
  not bring back data that should have been erased.

If a person is already among your candidates (matched by email), their profile is never overwritten: the history is
added to it.

## The steps

Open **Migration** in the navigation, then **New migration**.

1. **Source.** Choose how the package comes in. Today that is "Upload a migration package".
2. **Package.** Upload the ZIP. Nothing reaches your candidates yet.
3. **Analysis.** The package is opened and every reference is checked. You can close the page: the migration stays in
   the list. If the package cannot be read, nothing was written and the reason is shown.
4. **Preview.** The counts (jobs, people, applications, notes, emails, files), the jobs, the consent summary and the
   findings, grouped as errors, things to check and information. Errors block the migration until they are solved
   (for example, your organization has no published privacy notice).
5. **Jobs and stages.** Choose where each stage of the old process lands in your pipelines, by name for every job or job
   by job, and leave out the jobs you do not want. *Received* is the first column: applications arrive there.
6. **Responsibility.** Read the box above and tick the three statements: your organization is the controller; you checked
   the preview and know that consent dates and retention are taken from the source as they are; any AI agent or tool
   that prepared the package is covered by your agreements. Then confirm.
7. **Result.** The migration is written in chunks. You see what was created, merged and left out, and the consent
   requests that were sent.

## Preview and undo

Nothing is written until step 6, and the preview shows what will happen. After the migration, **Undo migration** erases,
for good:

- the people the migration created, with their CVs, notes, emails and applications;
- for people who already existed, only what the migration added (applications, notes, emails and history);
- the jobs the migration created, when nothing else refers to them.

What stays: people who confirmed their consent, or applied again after the migration (from then on the data is theirs),
and jobs that are published or have other applications. The record of the migration stays in the list with its counts.
Undo cannot be reversed.

## The package format

A migration package is one ZIP with a file `migration.json` at the root and the CVs and attachments under `files/`.
The format is public and versioned:
[`migration-package.v1.json`](https://github.com/fabrilallo/candydati/blob/main/docs/schema/migration-package.v1.json)
(see also the
[schema notes](https://github.com/fabrilallo/candydati/blob/main/docs/schema/README.md)).

- `source` says which system it comes from, when it was exported and who built the package.
- `jobs` with their `stages`, `candidates` with an optional `consent`, `applications`, `notes`, `messages` and `users`.
- Every record has a stable `ref` chosen by whoever builds the package; dates are ISO 8601 with a time zone.
- A package holds at most 10,000 files and 1 GiB, 50,000 candidates, 100,000 applications, 200,000 notes and 200,000
  emails. A larger account is migrated as several packages, for example one per year: the candidates are merged by
  email.

A connector, the agent skill and a hand-written package all go through the same validation.

## The agent skill

The repository includes a skill that teaches an AI agent (Claude Code, and other agents that can read instructions and
run `node`) to read your old ATS and build the package for you. It lives in
[`skills/candydati-migration`](https://github.com/fabrilallo/candydati/tree/main/skills/candydati-migration), with
install notes in its README.

- The agent starts by telling you that your company is responsible, and stops if you do not confirm.
- It never includes scores, ratings, evaluations, demographic data, photos or birth dates, and never invents a value.
- It checks the package offline with a validator (`scripts/validate.mjs`, Node 24 or newer, no network) before it gives
  you the ZIP.
- It never uploads the package and never confirms the migration: you do, in the app.

Remember that the candidate data passes through the agent's model provider: it must be covered by your agreements.

## Connectors

Built-in connectors, where you enter a read-only key and the package is built for you, are **coming soon**. The one available today, Zucchetti InRecruiting, has no public API: it reads an export file you upload
(see [InRecruiting](#inrecruiting)).

| Source | Status |
| --- | --- |
| Teamtailor | coming soon |
| Workable | coming soon |
| Greenhouse | coming soon |
| Recruitee | coming soon |
| Zucchetti InRecruiting | beta (export file) |

When they arrive they will be marked **beta**: built on the source's public documentation and not yet verified on a real
account, so check the preview carefully. A connector becomes stable only after a real migration, recorded in
[the sources list](https://github.com/fabrilallo/candydati/blob/main/docs/migration/sources.md). The API key is kept
encrypted only while the data is fetched, then wiped. Until then, use the skill or a package you build yourself.

### InRecruiting

Zucchetti InRecruiting has **no public API**, so this connector does not ask for a key: it reads the **export** you get
from the vendor. It is **beta**: the column names below are assumed (no real export format is public) and it has not been
verified on a real account, so check the preview carefully.

1. **Ask for a full export.** Contact InRecruiting / Zucchetti support and ask for an export of your applications as a
   spreadsheet (CSV or Excel), one row per application, and, if you want the CVs, a ZIP with the CV files. This may be a
   paid service on your plan: that is between you and the vendor.
2. **Check the columns.** Candydati recognises these headers (Italian or English, any case, accents ignored):

   | Information | Recognised headers |
   | --- | --- |
   | Name (required) | Nome e cognome, Nominativo, Full name, or Nome and Cognome / First name and Last name |
   | Job (required) | Annuncio, Posizione, Ruolo, Job, Job title, Vacancy |
   | Job code | Codice annuncio, Codice posizione, Job code |
   | Email, phone | Email, Telefono, Cellulare, Phone |
   | Stage | Stato, Fase, Stage, Status |
   | Applied on | Data candidatura, Application date, Applied at |
   | Outcome | Esito, Esito finale, Outcome |
   | Notes, tags, source | Note, Tag, Fonte, Source |
   | CV file | CV, File, Allegato, Curriculum |

   A column with another name is **left out and listed** in the preview. If your export uses other names, **rename the
   columns in the spreadsheet before uploading**: it takes a minute and nothing else changes.
3. **Upload.** Choose *Zucchetti InRecruiting* in the first step, then the spreadsheet and, optionally, the ZIP of CVs.
   The files are used only to read your data and are deleted at the end of the reading, whatever happens: success, failure, or a worker that stopped.

How it reads the file: one row is one application; jobs are the distinct job titles (plus the code when there is one);
the stages of a job are the distinct stage values in order of first appearance; a status or outcome such as *Assunto*,
*Scartato*, *Non idoneo*, *Ritirato* (hired, rejected, withdrawn) closes the application on the date of the row. People
are merged by email, or by name when there is no email. A CV is matched through the CV column, otherwise by the email or
the full name in the file name; a CV that cannot be matched with certainty is not imported, and the preview says how many.
A job with applications still open comes across as a draft: the migration never publishes anything.

**Scores and ratings are never imported.** A column called Valutazione, Punteggio, Rating, Voto, Stelle and the like is
ignored on purpose and listed in the preview. The sheet can have up to 5000 rows: split a bigger one.

If the reading fails with "the spreadsheet has no column for the name or the job", rename the columns as above and
upload again.

## GDPR and your role

- Your organization is the controller, before and after the migration. Check that you have a legal basis to move the
  data, and that your privacy notice covers it. A published privacy notice is required before a migration can start.
- Consent dates and retention periods are carried over as they are: you answer for their accuracy.
- An AI agent or a third-party tool that prepares the package is your processor. Candydati is not its processor.
- Data you did not want to keep (scores, special categories) is never brought in, and expired data is left out.
- Everything is recorded in the audit log, including your three statements, and erasure and data subject rights work on
  the migrated people like on any other candidate. See [Security and privacy](./security).
