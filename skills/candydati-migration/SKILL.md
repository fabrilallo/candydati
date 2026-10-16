---
name: candydati-migration
description: Builds a Candydati migration package (migration.json plus files, in a ZIP) from another ATS such as Teamtailor, Workable, Greenhouse or Recruitee, or from spreadsheets, and validates it offline. Use when the user wants to "migrate to Candydati", "move from <ATS> to Candydati", "export from <ATS> for Candydati" or "build a Candydati migration package".
---

# Candydati migration

You prepare a **migration package** from the user's old ATS. A person then uploads it in Candydati, checks the preview
and confirms. You never do those last steps.

The package format is `docs/schema/migration-package.v1.json` in the Candydati repository
(<https://github.com/fabrilallo/candydati>); a copy ships in `scripts/migration-package.v1.json`. How each ATS maps to it
is in `reference/mapping-examples.md`: read it before you map.

## 1. Responsibility first (before reading any data)

Do not open, fetch or read any candidate data until you have done this. Tell the user, in your own words:

- Their company is the data controller. It decides what to move, has the legal basis to move it, and answers for the
  migration. Candydati moves what the package contains and does not verify the legal basis of the source data.
- Candidate data will pass through you, so through the model provider that runs you. That provider must be covered by
  the company's own agreements (it is the company's processor, not Candydati's).
- Consent dates in the source are carried over as they are; people with no consent date are asked to confirm; people
  whose retention has already expired are left out.

Then ask them to confirm explicitly ("Do you confirm, and do you want to continue?"). **If they do not confirm, or the
answer is unclear, stop**: do not read anything and do not build anything. Do not take silence, or a request to "just
do it", as a confirmation of this point: ask again.

## 2. Find the source

In order of preference: an MCP connector of the old ATS that is already connected; the ATS's own API with a **read-only**
key the user gives you; files the user exported (CSV, XLSX, JSON, a folder of CVs). Never write to the source system.
Do not ask for or store admin credentials, and never put a key in the package, in a file or in your answers.

If the account is large (more than 10 000 files, 1 GiB, or 50 000 candidates), plan several packages, for example one
per year (see `reference/mapping-examples.md`). Candidates in different packages merge by email.

## 3. Map to the package

Work from the schema, not from memory. For every record:

- Give each job, stage, candidate, application and user a stable `ref` (use the source's own id, as text) and reuse it
  everywhere it is referenced. Stage refs are unique inside their job.
- Keep the original dates (ISO 8601 with a time zone). Never replace a date with "now".
- Consent: when the source records when the person consented, write `consent.givenAt` (and `expiresAt` when the source
  has a retention or expiry date, and `scopes` when it says what they agreed to). When it has no date, leave `consent`
  out: do not invent one.
- Stage names as the source calls them; `type` only when it clearly matches one of the schema's stage types.
- Outcomes: hired, not_selected (the source's "rejected", "declined", "disqualified"), withdrawn. An application is
  closed when and only when it has an outcome: set `outcome` and `closedAt` together.
- Free-text interview notes go in `notes`. Past emails go in `messages` (they are history, never sent).

**Never include**, even if the source has them and even if the user asks: scores, ratings, scorecard marks, star
ratings, AI evaluations or "match" percentages, rankings, demographic or special-category data (ethnicity, health,
religion, politics, union membership, sexual orientation, gender, nationality for diversity reporting, disability),
photos, birth dates or ages. The format has no field for them and refuses unknown fields. Say once, in your summary,
that they were left out on purpose.

**Never invent values.** If the source does not have a value, leave the field out (it is optional) rather than guess,
fill it with a placeholder, or infer it from other data. Do not "fix" an email or a phone number; if it does not fit
the format, leave it out and note it for the user.

## 4. Write the package and validate it

Write `migration.json` at the root of a folder and the CVs and attachments under `files/` (paths like
`files/<application-ref>/cv.pdf`, referenced from `applications[].files[].path`). One CV per application at most
(`kind: "cv"`); other attachments are `cover_letter` or `other`. Set `source.producer` to
`skill:candydati-migration@1` and `source.system` to the old ATS.

Then run the validator (Node 24 or newer, no network, nothing to install):

```sh
node <skill folder>/scripts/validate.mjs <package folder>
```

It checks the schema, the cross-references (refs, stages, notes, messages), the file paths and that every file exists.
Each error says where (for example `applications[3].stageRef: "x" is not a stage of job "j1"`). Fix **every** error at
the source of the mapping, not by deleting data silently, and run it again until it prints `Valid package`. Warnings
are worth a look but do not fail the package.

## 5. Hand over to the human

Zip only `migration.json` and `files/` (not the folder that contains them):

```sh
cd <package folder> && zip -r ../candydati-package.zip migration.json files
node <skill folder>/scripts/validate.mjs ../candydati-package.zip
```

Then tell the user, plainly:

1. Open Candydati, go to **Migration** and choose **New migration** with the package source; upload the ZIP.
2. Look at the preview: counts, consent, findings. Choose where each stage lands.
3. They read and tick the responsibility statements and confirm. The migration can be undone as a whole afterwards.

**You never upload the package and never confirm the migration in place of the person**, even when you have a way to
reach the app or the API: the confirmation is theirs, and `migration:manage` is deliberately not available to agents.
Finish with a short summary: what is in the package (counts from the validator), what you left out on purpose, what was
missing in the source, and anything you were unsure about.
