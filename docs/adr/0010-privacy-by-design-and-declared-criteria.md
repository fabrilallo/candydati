# ADR 0010: Pseudonymized data for models, search on declared criteria

Status: accepted

## Context

Recruiters use the assistant and their own agents (Claude Code, Codex and others over MCP) on candidate data. Two
requests came together: models should not receive more personal data than the task needs, and recruiters want to find
"the candidates that fit this job" in their database. A model reading CVs and picking the best ones is screening by an
AI system: it conflicts with ADR 0005, GDPR art. 22, and is a high-risk use under the AI Act (Annex III, point 4).

## Decision

1. **Privacy by design for models.** Assistant and MCP tools give a model a candidate's first name and id only.
   Surname, contacts and direct identifiers are replaced by markers (`[surname]`, `[email]`, ...) in every text a
   candidate wrote (`pseudonymizeText`, `packages/domain/src/privacy`). Drafts keep `{{candidate.lastName}}` as a
   variable for the person's composer. This is pseudonymization, not anonymization: the data is still personal data.
   Covered: emails, phones (international, spaced, with an `int.`/`ext.` extension), links and social profiles (any
   common TLD, `t.me`, `wa.me`, `name.github.io`, "LinkedIn: in/name", personal sites such as `name.it` or
   `name.com/about`), `@handles` and messaging ids after their app name (Skype, Discord, Signal, Teams), Italian street
   addresses with CAP and city, English ones with city and US ZIP or UK postcode, tax codes (with omocodia), partite
   IVA after their label, IBANs, full dates. Third parties, deterministically and only where the text marks them: full
   names in a references section (up to an empty line), after a title (Dott., Ing., Mr...), right before a contact, and
   known names passed as `otherNames` (`[name]`). Every pattern is bounded to stay linear on hostile text.
   Residual risk, accepted and stated: third-party names in plain prose ("ho lavorato con Mario Bianchi"), single-word
   or lower-case names, notes naming people, a partita IVA without its label (masked as a phone), bare domains with a
   common TLD and no path (`mariorossi.com`), address formats of other countries, and anything free text can hide.
   `otherNames` is not yet filled with the organization members by the tools: the directory has no list of them.
2. **A filter on declared criteria, never a judgement.** A person declares objective, job-related criteria (skills,
   languages, minimum experience, location, words in the CV) and confirms them; the assistant may propose them, the
   tools require an explicit confirmation flag. The database applies them deterministically (`cvMatchesCriteria` is the
   reference, Postgres the implementation): every result meets every criterion, there is no score, no partial match,
   no order by merit, no "top N". A model never reads CVs to decide who fits. A skill is compared under its known
   names, from a curated, data-only dictionary (`packages/domain/src/skills`): "Go" finds "Golang", "k8s" finds
   "Kubernetes". The dictionary lists synonyms only, never a related skill, so it widens the spelling, not the
   judgement. It is applied at match time on both sides (stored CVs are not rewritten); a skill it does not know is
   compared exactly, ignoring case, punctuation and diacritics. Ordinary words ("go", "excel") are never read as a
   skill in the free text of a CV. Each organization manages its own aliases on top of that shared base (tables
   `skill_alias` and `skill_alias_disabled`, permission `skill_alias:manage` for owners and admins, never a key or the
   agent): it may add an alias to a built-in skill or define a skill of its own, and switch off a built-in alias. An
   alias belongs to one skill per organization (a word the dictionary or another alias already owns is refused), so the
   book of an organization is still a plain table of spellings: it widens or narrows the spelling and weighs nothing.
   A result names the spelling a CV used for each skill criterion ("Golang" met "Go"), so a person sees why it is
   there; the order stays the date of application. CV extraction does not normalize skills (it stores them as written),
   so the matching at search time is the only place the aliases apply.
3. **Only people whose consent covers the job.** The search looks at the job's applicants and at the talent pool,
   never at people who applied to another position only.
4. **No proxies for protected characteristics.** Criteria naming age, sex, origin, religion, family, disability or
   appearance are refused, with the same scan the job ads go through. There is no maximum experience: it works as an
   age limit.
5. **Nobody is excluded silently.** CVs that could not be checked (not read, or not structured when a criterion needs
   it) are counted and reported, so a person looks at them.
6. **Audited.** Every search records who ran it, for which job, the criteria in words and the number of results, never
   who was found.

## Consequences

Users get a sourcing tool without the product deciding about people, and external agents work on less personal data.
Pseudonymization lowers the risk but CV content can still single someone out, so the rules of ADR 0005 still apply to
everything a model sees. Keyword filters are blunt: skills outside the dictionary and differently worded CVs are missed, which is why the
result is a starting point for a person and why unchecked CVs are reported. Whether a deterministic filter with
model-proposed criteria falls under the AI Act high-risk category should be confirmed by each deploying organization's
legal counsel.
