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
2. **A filter on declared criteria, never a judgement.** A person declares objective, job-related criteria (skills,
   languages, minimum experience, location, words in the CV) and confirms them; the assistant may propose them, the
   tools require an explicit confirmation flag. The database applies them deterministically (`cvMatchesCriteria` is the
   reference, Postgres the implementation): every result meets every criterion, there is no score, no partial match,
   no order by merit, no "top N". A model never reads CVs to decide who fits.
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
everything a model sees. Keyword filters are blunt: synonyms and differently worded CVs are missed, which is why the
result is a starting point for a person and why unchecked CVs are reported. Whether a deterministic filter with
model-proposed criteria falls under the AI Act high-risk category should be confirmed by each deploying organization's
legal counsel.
