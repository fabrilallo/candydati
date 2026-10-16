# Mapping examples

How the usual sources map to the Candydati migration package (`docs/schema/migration-package.v1.json`). The field
names of each ATS below are the ones commonly seen in its exports and public API; they change between versions and
accounts, so **look at the real data first** and map what is there. When a source value has no place in the package,
leave it out. Never invent one.

## What every source maps to

| Package | Take it from | Notes |
| --- | --- | --- |
| `jobs[]` | the job / position / requisition | `status`: `draft`, `open` or `closed`. `closedAt` only when `closed`. `content` is optional and partial (description, location, contract); leave out what the source does not have. |
| `jobs[].stages[]` | the job's pipeline stages | `name` as written in the source. `type` only when it clearly is one of the schema's stage types (for example a phone screen is `screening_call`); otherwise leave it out and the person chooses in the wizard. Do not add a "Received" stage: Candydati creates it. |
| `candidates[]` | the candidate / person / talent | One per person, with a stable `ref`. `email` is how the same person is merged with an existing one and across packages. |
| `candidates[].consent` | a consent / GDPR date, "talent pool until" date | Only when the source records the date. `givenAt` required; `expiresAt` if the source has a retention or expiry date; `scopes` (`selection`, `talent_pool`) if it says so. No date: leave `consent` out. |
| `applications[]` | the application / candidacy / job application | `candidateRef`, `jobRef` and `stageRef` (current stage, a stage of that job). `createdAt` is the original application date. |
| `applications[].stageHistory[]` | stage change events | `stageRef` and `enteredAt`; only real events. |
| `applications[].outcome` and `closedAt` | hired / rejected / withdrawn and its date | Always together. See below. |
| `applications[].answers[]` | answers to application questions | `question` and `answer` as text. |
| `applications[].files[]` | CV, cover letter, attachments | Copy to `files/<application-ref>/<name>`; `kind` is `cv`, `cover_letter` or `other`; at most one `cv` per application. |
| `applications[].origin` | source / channel | For example `linkedin`. |
| `notes[]` | comments, interview notes | Free text only, with the author (`authorRef` from `users`, or `authorName`) and the original date. |
| `messages[]` | emails exchanged with the candidate | History only: they are never sent. `direction` is `outbound` or `inbound`. |
| `users[]` | the recruiters who wrote notes | Only to sign notes. They do not become accounts. |

## Outcomes

| Source says | Package |
| --- | --- |
| hired, placed, offer accepted | `outcome: "hired"` |
| rejected, declined by the company, disqualified, not selected, archived with a rejection reason | `outcome: "not_selected"` |
| withdrawn, candidate declined, candidate withdrew | `outcome: "withdrawn"` |
| still in progress, active | no `outcome`, no `closedAt` |

Rejection reasons that are free text may go in a note. Do not turn a reason into a score or a label of the person.

## Source by source

### Teamtailor

Jobs, candidates, job applications (the link between the two), stages, notes, files and consent are all separate
records. Candidate `created-at` becomes `createdAt`; the job application carries the stage and the rejection or hire
state. Consent and "GDPR" fields, when present, give `consent.givenAt`. Candidate ratings, "Teamtailor connect" matches,
pictures and any diversity or demographic questions are dropped.

### Workable

A candidate is tied to one job, so a person who applied twice appears twice: write one `candidates[]` entry per
distinct person (match by email) and one `applications[]` per application. Stages come from the job's pipeline;
"disqualified" is `not_selected`; "hired" is `hired`; "withdrew" is `withdrawn`. Ratings, scorecard results, evaluation
scores and the photo are dropped. Comments are notes.

### Greenhouse

Candidates have several applications, each to a job with its own stages and a status (active, rejected, hired);
rejected maps to `not_selected`. The rejection reason may become a note. Scorecards and their overall recommendations
and ratings are dropped on purpose; the free-text interview notes inside them can come across as a note. Demographic
survey answers (EEOC and similar) and the photo are dropped.

### Recruitee

Candidates are placements in offers; each placement has a stage, a disqualification state and dates. Disqualified is
`not_selected`. Notes, files and the stage-change timeline map to `notes`, `files` and `stageHistory`. Ratings and
scores are dropped.

### A generic spreadsheet (CSV or XLSX)

Typically one row per application. Group rows by person (email) to create `candidates[]` once, by job title to create
`jobs[]`, and make one `stages[]` per distinct stage name of each job. Use the row number or an id column as `ref`. If a
column holds dates in a local format, convert them to ISO 8601 with a time zone only when the time zone is known (ask
the user, do not guess). A "rating" or "score" column is dropped. CVs in a folder: match them to applications by a
column or file name, and say what could not be matched.

## What to drop on purpose

Scores, star ratings, scorecard marks, "match" percentages, AI summaries or evaluations, rankings, talent-pool scores,
demographic or special-category data (ethnicity, gender, health, religion, politics, union, sexual orientation,
disability, nationality for diversity reporting), photos and avatars, birth dates and ages, social profiles other than
the LinkedIn URL, internal salary expectations of other employees, and credentials of any kind. The format refuses
unknown fields, so these cannot slip in under another name: do not rename them to make them fit.

## Large accounts: several packages

A package holds at most 10 000 files and 1 GiB uncompressed (and 50 000 candidates, 100 000 applications, 200 000 notes,
200 000 messages). Beyond that, split by time: one package per year of application date, or by job groups. Rules:

- Every package is complete on its own: it must contain the jobs and stages its applications refer to (repeat a job in
  two packages if its applications span both years; give it the same `ref`).
- Candidates are merged by email, so the same person in two packages becomes one.
- Upload them one at a time in Candydati, with a preview each; an undo applies to one migration at a time.
- Run `scripts/validate.mjs` on each package.
