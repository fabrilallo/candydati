import { z } from 'zod';
import { fold, fragment } from '../job/compliance/fold.js';
import { scanPatterns } from '../job/compliance/scan.js';

export const CRITERIA_TERM_MAX = 60;
export const CRITERIA_YEARS_MAX = 40;

/** Case-insensitive duplicates are dropped, the first spelling is kept. */
const terms = (max: number) =>
  z
    .array(z.string().trim().min(1).max(CRITERIA_TERM_MAX))
    .max(max)
    .default([])
    .transform((list) => list.filter((term, index) => list.findIndex((other) => other.toLowerCase() === term.toLowerCase()) === index));

/**
 * Words that name a protected characteristic (age, sex, origin, religion, family, disability, appearance): a filter on
 * them is discrimination (D.Lgs. 198/2006, 215/2003, 216/2003), whatever the field it is written in.
 */
const PROTECTED =
  /\b(?:eta|age|aged|sesso|sex|gender|genere|donn[ae]|uomo|uomini|maschi[oe]?|femmin[ae]|male|female|men|women|nazionalita|nationality|etnia|ethnic\w*|razza|religion\w*|religios\w*|incinta|gravidanza|pregnan\w*|maternita|maternity|sposat[oaie]|married|celibe|nubile|figli|children|disabil\w*|disabled|orientamento|sexual\w*|bella\s+presenza|giovan[ei]|young|nat[oaie]|born|nascita|birth\w*)\b/;

/** The same scan the job ads go through, as if every term were a must-have requirement, in both languages. */
function isDiscriminatory(term: string): boolean {
  if (PROTECTED.test(fold(term))) return true;
  const fragments = [fragment('requirements.mustHave.0', term)];
  return scanPatterns(fragments, 'it').length > 0 || scanPatterns(fragments, 'en').length > 0;
}

/**
 * Objective, job-related criteria to look for in candidates' CVs. A person confirms them; the search only filters:
 * no score, no order by merit. There is deliberately no maximum experience: it would work as a limit on age.
 */
export const candidateCriteriaSchema = z
  .strictObject({
    /** Each must appear among the CV skills or in the CV text. */
    skills: terms(15),
    /** Each must appear among the CV languages (any level written next to it). */
    languages: terms(5),
    minYearsOfExperience: z.number().int().min(0).max(CRITERIA_YEARS_MAX).optional(),
    /** Any of them, in the CV location. */
    locations: terms(10),
    /** Each must appear in the CV text. */
    keywords: terms(10),
  })
  .superRefine((criteria, ctx) => {
    const all = [...criteria.skills, ...criteria.languages, ...criteria.locations, ...criteria.keywords];
    if (all.length === 0 && criteria.minYearsOfExperience === undefined) ctx.addIssue({ code: 'custom', message: 'criteria_empty' });
    if (all.some(isDiscriminatory)) ctx.addIssue({ code: 'custom', message: 'criteria_discriminatory' });
  });
export type CandidateCriteria = z.infer<typeof candidateCriteriaSchema>;

/** The criteria in plain words, for the person who confirms them and for the audit log. */
export function describeCriteria(criteria: CandidateCriteria): readonly string[] {
  return [
    ...criteria.skills.map((skill) => `skill: ${skill}`),
    ...criteria.languages.map((language) => `language: ${language}`),
    ...(criteria.minYearsOfExperience === undefined ? [] : [`at least ${criteria.minYearsOfExperience} years of experience`]),
    ...(criteria.locations.length === 0 ? [] : [`location: ${criteria.locations.join(' or ')}`]),
    ...criteria.keywords.map((keyword) => `CV mentions: ${keyword}`),
  ];
}
