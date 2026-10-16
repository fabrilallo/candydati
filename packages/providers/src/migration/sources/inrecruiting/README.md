# Zucchetti InRecruiting connector (file export, beta)

Zucchetti InRecruiting has **no public API**. Access to the data goes through the vendor's support (possibly as a paid
service), see the [Kombo notes](https://docs.kombo.dev/ats/connectors/inrecruiting) and the
[Juicebox guide](https://docs.juicebox.ai/help/ats-setup/inrecruiting). So this connector (`input: 'files'`) reads the
**full export** an operator obtains from InRecruiting/Zucchetti: one spreadsheet (CSV or XLSX) and, optionally, a ZIP
with the CVs.

> **ASSUMED, not verified.** No real export format is public. The column names below are the ones an export is most
> likely to use, and the fixtures (`inrecruiting-fixtures.ts`) are synthetic and labeled ASSUMED. The connector stays
> `beta` until a real migration confirms it (ADR 0009, decision 6). A column can always be renamed before upload.

## Files

| File | What |
| --- | --- |
| `columns.ts` | header synonyms (Italian and English) and the detection; reports score-like and unknown columns |
| `rows.ts` | reads one row: names, email, phone, dates, outcome, tags |
| `map.ts` | rows to jobs, candidates, applications and notes (pure, no I/O) |
| `cv-match.ts` | pairs the CVs of the ZIP with applications |
| `dates.ts`, `outcomes.ts` | date formats and outcome words |
| `index.ts` | the connector: parses the files with the import's parsers and writes the package through the builder |

## Recognised columns

Matching ignores case, accents and punctuation; the exact header must equal one of these.

| Field | Headers |
| --- | --- |
| first name / last name / full name | Nome, First name / Cognome, Last name, Surname / Nome e cognome, Nominativo, Full name, Candidato (a lone "Nome" is the full name) |
| email | Email, E-mail, Indirizzo email |
| phone | Telefono, Cellulare, Phone, Mobile |
| job (required) | Annuncio, Posizione, Posizione lavorativa, Ruolo, Job, Job title, Vacancy, Offerta |
| job code | Codice annuncio, Codice posizione, Job code, Job id, Riferimento |
| stage | Stato, Fase, Stage, Status, Fase selezione |
| applied at | Data candidatura, Applied at, Application date, Data |
| outcome | Esito, Esito finale, Outcome, Risultato |
| notes | Note, Notes, Commenti, Osservazioni |
| tags | Tag, Tags, Etichette |
| source | Fonte, Source, Origine, Canale |
| CV | CV, File, Allegato, Curriculum, Nome file |

A name (a full name, or first and last name) and a job are required. Without them the fetch fails with
`input_columns_missing` and the wizard says which headers were expected.

## Mapping rules

- One row is one application. Jobs are the distinct job titles (plus the code when there is one). A job whose
  applications are all decided is `closed` (closed on the date of the last one); otherwise it is a `draft`, so the
  migration never publishes anything.
- Stages are the distinct stage values of each job, in order of first appearance. An empty stage becomes `Candidatura`.
- Outcome: from the outcome column, else from the stage value when it is an outcome word. `assunto/a`, `hired` is hired;
  `scartato`, `rifiutato`, `non idoneo`, `non assunto`, `rejected` is not selected; `ritirato`, `rinunciato`,
  `withdrawn` is withdrawn. An outcome word in the stage column is not a stage: the application sits in the last stage
  of its job. `closedAt` is the row date, or the export time when the row has none.
- People are merged by email (any case), else by name. A second row of the same person for the same job is dropped and
  counted.
- Dates: `2025-03-14`, ISO, and Italian `14/03/2025` (also `-` and `.`).

## CV matching

Strongest evidence first, across all rows (a weak guess never takes a file a sure match wants), reusing the import's
name helpers (`fileStem`, `nameFromFileName`, `nameKey`, `normalizeEmail`):

1. the CV/file column names the file (path or name without extension);
2. the email is in the file name;
3. the full name is the file name, words in any order, only when no other candidate has that name and one file fits.

A CV goes to one application (the candidate's first one for evidence 2 and 3). CVs are recognised by content (PDF,
DOCX), never by name. CVs nobody claimed are not imported and are counted.

## What is never imported

Scores, ratings and evaluations (ADR 0009, decision 3). A column whose header looks like one (Valutazione, Punteggio,
Rating, Voto, Giudizio, Stelle, Score...) is ignored on purpose and listed in the preview. Columns not recognised at all
are listed too (headers only, never values).

## Limits

25 MB per spreadsheet, 5000 rows (a bigger file is refused, not cut: split it), the import's limits on the ZIP.
