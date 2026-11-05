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
   Covered: emails, phones (international, spaced, with a `(0)` trunk prefix or a one-digit area, with an
   `int.`/`ext.` extension), links and social profiles (any common TLD, xing, viadeo, malt, `t.me`, `wa.me`,
   `name.github.io`, "LinkedIn: in/name", "GitHub: name", personal sites such as `name.it`, `name.fr`, `name.co.uk` or
   `name.com/about`), `@handles` and messaging ids after their app name (Skype, Discord, Signal, Teams), street
   addresses of Italy, France, Belgium, Switzerland, Germany, Austria, Spain, Latin America, the UK, the US, Canada and
   Australia with the postal code and city that follow them on the line, tax codes (with omocodia), Spanish DNI/NIE
   (check letter verified), ids after their label (DNI, RFC, CURP, CUIL, SSN, Steuer-ID, ...), partite IVA after their
   label, IBANs, full dates in five languages (numeric, ISO, "4 avril 1992", "7. Juli 1988", "15 de marzo de 1992",
   "March 4, 1991"). The surname is removed in any case, without accents ("Garcia"), transliterated ("Mueller") and
   inside a site or handle glued to it (`emilyjohnson.io`, `ejohnson_92`). Third parties, deterministically and only
   where the text marks them: full names in a references section (Referenze, References, Références, Referenzen,
   Referencias; up to an empty line), after a title (Dott., Ing., Mr, Mme, M., Frau, Herrn, Mag., Dña., Lic., ...),
   after a phrase that always introduces a person ("reporting to", "il mio responsabile", "sous la direction de",
   "meine Kollegin", "mi jefa"), right before a contact, and known names passed as `otherNames` (`[name]`); a full name
   found in one of those places is removed wherever else the text repeats it. Every pattern is bounded to stay linear
   on hostile text.
   Residual risk, accepted and stated: third-party names in plain prose ("ho lavorato con Mario Bianchi"), single-word
   or lower-case names, notes naming people, a partita IVA without its label (masked as a phone), bare domains with a
   common TLD and no path that do not contain the surname (`studio-rossi.com`), streets without a type word, a second
   surname missing from the stored last name, and anything free text can hide. `otherNames` is not yet filled with the
   organization members by the tools: the directory has no list of them.

   **Measured residual risk.** A corpus of 20 synthetic CVs, four per language (`packages/domain/src/testing/
   pseudonymization-corpus`, checked by `pseudonymize-corpus.test.ts`), lists for each CV the distinct strings that must
   disappear (candidate identifiers and contacts, and the surname of every third party) and the strings that must stay
   (first name, employers, places of work, schools, skills such as Java and Go, periods). The suite fails if a number
   below moves without this table being updated, and if any string that must stay is lost (none is, before or after).

   | Language | CVs | Must disappear | Removed before (commit c3b86a3) | Removed now | Known gaps | Third-party surnames removed now |
   |---|---|---|---|---|---|---|
   | Italian | 4 | 53 | 44 | 47 | 6 | 7 of 13 |
   | English (UK, US, CA, AU) | 4 | 53 | 35 | 49 | 4 | 10 of 14 |
   | French (FR, CH, BE) | 4 | 51 | 27 | 47 | 4 | 7 of 11 |
   | German (DE, AT) | 4 | 43 | 24 | 38 | 5 | 5 of 8 |
   | Spanish (ES, MX, AR) | 4 | 47 | 22 | 44 | 3 | 8 of 10 |
   | **Total** | **20** | **247** | **152 (61.5%)** | **225 (91.1%)** | **22** | **37 of 56** |

   Candidate identifiers and contacts: 188 of 191 removed (137 before). Known gaps, asserted as they are so the suite
   notices when one closes:
   - 19 third-party names in plain prose, with nothing in the text marking them as a person: "insieme a Luca Moretti e
     Sara Galli", "Ho collaborato con Francesca Rinaldi", "Worked closely with Priya Patel", "with PM Michael Chen",
     "Je travaille avec Mathieu Favre et Chloé Bonvin", "J'ai remplacé Kevin Janssens", "Zusammen mit Jonas Weber",
     "Mein Meister Klaus Richter", "Trabajé con Jordi Puig", "con Sofía Gómez". "with/con/avec/mit" followed by two
     capitalized words is just as often "with Google Cloud" or "con Spring Boot": only a named-entity recognizer tells
     them apart. They are 19 of the 22 gaps and 34% of the third-party surnames in the corpus.
   - A German street with no type word ("Am Sandtorkai 5") and its postal code ("20457 Hamburg"): "Am/Im + word +
     number" also matches "Im Team 5".
   - A second surname missing from the stored last name ("Andrea Hernández Ortega", last name "Hernández").

   The corpus is written to be realistic, not adversarial: it measures the patterns on ordinary CVs, not their limits.
   A references section also masks the capitalized role and company words on its lines ("Engineering Manager"), and a
   capitalized role right before a contact is masked as a name: over-masking, never a leak.
2. **A filter on declared criteria, never a judgement.** A person declares objective, job-related criteria (skills,
   languages, minimum experience, location, words in the CV) and confirms them; the assistant may propose them, the
   tools require an explicit confirmation flag. The database applies them deterministically (`cvMatchesCriteria` is the
   reference, Postgres the implementation): every result meets every criterion, there is no score, no partial match,
   no order by merit, no "top N". A model never reads CVs to decide who fits. A skill is compared under its known
   names, from a curated, data-only dictionary (`packages/domain/src/skills`): "Go" finds "Golang", "k8s" finds
   "Kubernetes". The dictionary lists synonyms only, never a related skill, so it widens the spelling, not the
   judgement. It is applied at match time on both sides (stored CVs are not rewritten); a skill it does not know is
   compared exactly, ignoring case, punctuation and diacritics. Ordinary words ("go", "excel") are never read as a
   skill in the free text of a CV.
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
