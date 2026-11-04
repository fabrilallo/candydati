# Skill dictionary

Data-only synonyms for the filter on declared criteria (`cvMatchesCriteria` and the Postgres search both use it), so
that "Go" finds "Golang" and "k8s" finds "Kubernetes". No I/O, no scoring: it only widens which spellings count as the
same skill.

## Add a skill

1. Append `{ id, name, aliases }` to the file of its area: `languages.ts`, `frameworks.ts`, `data-cloud.ts` or
   `business.ts` (or a new file added to `SKILLS` in `dictionary.ts`). `id` is a lowercase slug and never changes.
2. List real synonyms only (abbreviations, alternative spellings, the Italian name), never a related or broader skill:
   `ubuntu` is not an alias of `linux`, `github` is not an alias of `git`.
3. Do not add spellings that differ only by case, spaces, punctuation or accents: `normalizeSkill` already treats
   "Node.js", "node js" and "NODE-JS" as one. `C`, `C++` and `C#` stay distinct (`+` and `#` are kept).
4. If a written form is also an ordinary word ("go", "excel", "spring", "rust"), list it in `proseUnsafe`: it still
   matches a skill the CV lists, but is never searched as a word in the free text of a CV.
5. Run `pnpm --filter @candydati/domain test`: it fails on a duplicate id, a form owned by two skills, a redundant
   alias or a `proseUnsafe` entry the skill does not have.
