# @candydati/ad-quality

Scores a job ad (never candidates) on ten categories, 0..1 each, total 0..10. No network, no LLM SDK.

- `createRulesAnalyzer()` deterministic, `source: 'rules'`, no network. `available()` is false: the score exists only
  with a model (PRODUCT.md §4.3), so the rules are the structural part of the model report and its fallback.
- `createModelAnalyzer(generate)` model scores the free text, `source: 'model'`; structural categories always come from the rules.
- `createAdQualityAnalyzer({ generate?, onModelError? })` model with fallback to the rules; never throws for a valid content.
  Without `generate`, `available()` is false and callers show no score.

## Rubric of the rules analyzer

Scores are in {0, 0.5, 1}, as in the original FuffAnnuncio prompt. "Vague" means the item contains a stock phrase
from the Italian or English dictionary (`src/phrases`).

| Category | 0 | 0.5 | 1 |
|---|---|---|---|
| `selection_process` | no stages | stages, but no `responseDays` | at least one stage, each with duration and conductor, and `responseDays` |
| `salary_transparency` | no min and no max | only one bound, max < min, or max > 2 x min | min and max, max <= 2 x min |
| `work_mode` | mode not set | mode set, details missing | remote + country; hybrid/onsite + country, city, onsite days |
| `role_requirements` | no items | fewer than 3 items, or >= 50% vague, or < 60% specific (a number or >= 3 words, not vague) | >= 3 items, < 50% vague, >= 60% specific |
| `responsibilities_clarity` | no items | fewer than 3, >= 50% vague, or no number/KPI/goal term | >= 3 items, < 50% vague, at least one measurable item |
| `benefits` | no items | fewer than 3, >= 50% vague, or no quantified item | >= 3 items, < 50% vague, at least one item with a number |
| `technologies` | no items | fewer than 3 or >= 50% vague | >= 3 items, < 50% vague |
| `growth` | empty | >= 50% of the text is stock phrases, or no concrete element | a number or a named practice (budget, mentoring, certifications...) |
| `work_life_balance` | empty | same | a number or a named policy (leave, smart working, on-call, core hours...) |
| `culture` | empty | same | a number or a named practice (feedback, retrospective, code review, 1:1...) |

`improvements` has one line per category below 1, the biggest loss first, in the language of the ad.
Vague phrases are reported exactly as written, with a suggestion that asks for the missing fact.
