import {
  JOB_LINE_MAX,
  JOB_LIST_MAX,
  JOB_ROLES,
  JOB_TEXT_MAX,
  JOB_TITLE_MAX,
  SENIORITY_LEVELS,
  SUGGESTED_RESPONSIBILITIES_MAX,
  SUPPORTED_LOCALES,
  responsibilitySuggestionsSchema,
  type JobRole,
  type SeniorityLevel,
  type SuggestResponsibilitiesResult,
} from '@candydati/domain';
import { z } from 'zod';
import type { CoreDeps } from '../../ports.js';
import { defineUseCase } from '../../use-case.js';

/** What the model may see: the ad's own words. Never anything about a candidate or a person. */
export interface ResponsibilityContext {
  readonly title: string | null;
  readonly role: JobRole | null;
  readonly seniority: SeniorityLevel | null;
  readonly language: 'it' | 'en';
  /** Lines already written, so the model does not repeat them. */
  readonly existing: readonly string[];
  readonly summary: string;
}

/** The fast model behind a port (Mastra, in the api). `available` follows the AI settings in force at each call. */
export interface ResponsibilitySuggester {
  available(): boolean;
  suggest(context: ResponsibilityContext): Promise<unknown>;
}

export interface SuggestResponsibilitiesDeps extends CoreDeps {
  readonly suggester: ResponsibilitySuggester;
  /** The model failed or answered out of shape: the caller gets `failed`, the cause goes here (never the ad text). */
  readonly onSuggestError?: ((error: unknown) => void) | undefined;
}

const inputSchema = z
  .object({
    title: z.string().trim().min(1).max(JOB_TITLE_MAX).optional(),
    role: z.enum(JOB_ROLES).optional(),
    seniority: z.enum(SENIORITY_LEVELS).optional(),
    language: z.enum(SUPPORTED_LOCALES).default('it'),
    existing: z.array(z.string().trim().max(JOB_LINE_MAX)).max(JOB_LIST_MAX).default([]),
    summary: z.string().trim().max(JOB_TEXT_MAX).default(''),
  })
  .refine((input) => input.title !== undefined || input.role !== undefined, { message: 'title_or_role_required', path: ['title'] });

const normalized = (line: string): string => line.trim().toLowerCase().replace(/\s+/g, ' ');

const fresh = (suggestions: readonly string[], existing: readonly string[]): string[] => {
  const seen = new Set(existing.map(normalized));
  return suggestions.filter((line) => !seen.has(normalized(line)) && seen.add(normalized(line))).slice(0, SUGGESTED_RESPONSIBILITIES_MAX);
};

/**
 * Proposes responsibilities for an ad from its title, role, seniority and language. Nothing is saved: the person adds
 * the lines they like. The model answer is data (Zod); a failure is an answer (`failed`), never a crash of the editor.
 * Audited without a transaction: a model call must not hold one.
 */
export const suggestResponsibilities = defineUseCase<SuggestResponsibilitiesDeps, typeof inputSchema, SuggestResponsibilitiesResult>({
  name: 'suggestResponsibilities',
  input: inputSchema,
  permission: 'job:update',
  audit: {
    action: 'job.responsibilities_suggested',
    target: (_input, _result, actor) => ({ type: 'organization', id: actor.organizationId }),
    metadata: (input, result) => ({
      role: input.role ?? null,
      seniority: input.seniority ?? null,
      language: input.language,
      status: result.status,
      ...(result.status === 'proposed' ? { count: result.responsibilities.length } : {}),
    }),
  },
  transaction: { skip: 'a model call must not hold a transaction; the audit row is one append' },
  handler: async ({ deps, input }): Promise<SuggestResponsibilitiesResult> => {
    if (!deps.suggester.available()) return { status: 'unavailable' };
    try {
      const context: ResponsibilityContext = {
        title: input.title ?? null,
        role: input.role ?? null,
        seniority: input.seniority ?? null,
        language: input.language,
        existing: input.existing,
        summary: input.summary,
      };
      const answer = responsibilitySuggestionsSchema.parse(await deps.suggester.suggest(context));
      const responsibilities = fresh(answer.responsibilities, input.existing);
      return responsibilities.length > 0 ? { status: 'proposed', responsibilities } : { status: 'failed' };
    } catch (error) {
      deps.onSuggestError?.(error);
      return { status: 'failed' };
    }
  },
});
