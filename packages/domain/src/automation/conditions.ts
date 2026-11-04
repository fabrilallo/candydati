import { z } from 'zod';
import { TAG_MAX, type Application } from '../candidate/application.js';
import { CONSENT_SCOPES, type ConsentScope, type ConsentStatus } from '../candidate/privacy.js';

/** Where an application came from (`Application.source`). */
export const APPLICATION_SOURCES = ['careers_page', 'manual', 'import'] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const MAX_CONDITION_TAGS = 10;

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/**
 * Optional filters of a rule, on objective facts a person declares: every one present must hold. They narrow who a rule
 * acts for; they never rank, score or order anyone (PRODUCT.md §2.4).
 */
export const automationConditionsSchema = z
  .object({
    /** The application came from one of these. */
    sources: z.array(z.enum(APPLICATION_SOURCES)).min(1).max(APPLICATION_SOURCES.length).transform(unique).optional(),
    /** The candidate carries every one of these tags (lowercase, like the profile stores them). */
    tags: z.array(z.string().trim().toLowerCase().min(1).max(TAG_MAX)).min(1).max(MAX_CONDITION_TAGS).transform(unique).optional(),
    /** The candidate gave consent, through the form, for every one of these scopes. */
    consentScopes: z.array(z.enum(CONSENT_SCOPES)).min(1).max(CONSENT_SCOPES.length).transform(unique).optional(),
  })
  .strict();
export type AutomationConditions = z.output<typeof automationConditionsSchema>;
export type AutomationConditionsInput = z.input<typeof automationConditionsSchema>;

/** What the conditions read about one application and its candidate. */
export interface ConditionSubject {
  readonly source: Application['source'];
  readonly consentStatus: ConsentStatus;
  readonly consentScopes: readonly ConsentScope[];
  readonly tags: readonly string[];
}

export const conditionSubjectOf = (application: Pick<Application, 'source' | 'consentStatus' | 'consent'>, candidate: { readonly tags: readonly string[] }): ConditionSubject => ({
  source: application.source,
  consentStatus: application.consentStatus,
  consentScopes: application.consent.scopes,
  tags: candidate.tags,
});

export const hasConditions = (conditions: AutomationConditions): boolean =>
  conditions.sources !== undefined || conditions.tags !== undefined || conditions.consentScopes !== undefined;

/** Pure: every condition present holds. Imported data waiting for reconfirmation (`to_renew`) has no consent scope yet. */
export function matchesConditions(conditions: AutomationConditions, subject: ConditionSubject): boolean {
  if (conditions.sources && !conditions.sources.includes(subject.source)) return false;
  if (conditions.tags && !conditions.tags.every((tag) => subject.tags.includes(tag))) return false;
  if (conditions.consentScopes) {
    const given = subject.consentStatus === 'given' ? subject.consentScopes : [];
    if (!conditions.consentScopes.every((scope) => given.includes(scope))) return false;
  }
  return true;
}
