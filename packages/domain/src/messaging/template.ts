import { z } from 'zod';

export const EMAIL_TEMPLATE_KINDS = ['receipt', 'outcome_not_selected', 'outcome_hired', 'stage_update', 'custom'] as const;
export type EmailTemplateKind = (typeof EMAIL_TEMPLATE_KINDS)[number];

/** Kinds with one active template per organization (an edited default). `custom` has as many as needed. */
export const SINGLETON_TEMPLATE_KINDS = ['receipt', 'outcome_not_selected', 'outcome_hired', 'stage_update'] as const;
export type SingletonTemplateKind = (typeof SINGLETON_TEMPLATE_KINDS)[number];

export const isSingletonKind = (kind: EmailTemplateKind): kind is SingletonTemplateKind => kind !== 'custom';

export const EMAIL_TEMPLATE_NAME_MAX = 80;
export const EMAIL_TEMPLATE_SUBJECT_MAX = 200;
export const EMAIL_TEMPLATE_BODY_MAX = 10_000;

export const emailTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(EMAIL_TEMPLATE_NAME_MAX),
  kind: z.enum(EMAIL_TEMPLATE_KINDS),
  subject: z.string().trim().min(1).max(EMAIL_TEMPLATE_SUBJECT_MAX),
  body: z.string().trim().min(1).max(EMAIL_TEMPLATE_BODY_MAX),
});
export type EmailTemplateInput = z.input<typeof emailTemplateInputSchema>;

export interface EmailTemplate {
  readonly id: string;
  readonly organizationId: string;
  readonly kind: EmailTemplateKind;
  readonly name: string;
  readonly subject: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
