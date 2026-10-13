import { DEFAULT_RETENTION_DAYS, privacyNoticeInputSchema, SUPPORTED_LOCALES, type Locale, type PrivacyNoticeInput } from '@tt/domain'
import type { PrivacyNoticeDto } from './candidate-schemas'

/** The privacy settings editor. Days are `null` while the field is empty. */
export interface PrivacyFormValues {
  readonly language: Locale
  readonly text: string
  readonly contactEmail: string
  readonly selectionDays: number | null
  readonly talentPoolDays: number | null
}

export type PrivacyField = Exclude<keyof PrivacyFormValues, 'language'>
export type PrivacyErrors = Partial<Record<PrivacyField, string>>

const localeOf = (code: string): Locale => SUPPORTED_LOCALES.find((supported) => supported === code) ?? SUPPORTED_LOCALES[0]

/** The next version starts from the active one; the first from the template and the default retention. */
export const initialPrivacyForm = (active: PrivacyNoticeDto | null, template: string | null, locale: string): PrivacyFormValues =>
  active
    ? { language: active.language, text: active.text, contactEmail: active.contactEmail, selectionDays: active.retentionDays.selection, talentPoolDays: active.retentionDays.talent_pool }
    : { language: localeOf(locale), text: template ?? '', contactEmail: '', selectionDays: DEFAULT_RETENTION_DAYS.selection, talentPoolDays: DEFAULT_RETENTION_DAYS.talent_pool }

const FIELD_OF: Readonly<Record<string, PrivacyField>> = { text: 'text', contactEmail: 'contactEmail', selection: 'selectionDays', talent_pool: 'talentPoolDays' }

const keyOf = (field: PrivacyField, code: string): string => {
  if (field === 'text') return code === 'too_big' ? 'privacy.validation.textMax' : 'privacy.validation.textMin'
  return field === 'contactEmail' ? 'privacy.validation.email' : 'privacy.validation.days'
}

export type PrivacyResult = { readonly ok: true; readonly input: PrivacyNoticeInput } | { readonly ok: false; readonly errors: PrivacyErrors }

/** Pure: the `PrivacyNoticeInput` of the contract, or one translation key per field. */
export const validatePrivacyForm = (values: PrivacyFormValues): PrivacyResult => {
  const parsed = privacyNoticeInputSchema.safeParse({
    language: values.language,
    text: values.text,
    contactEmail: values.contactEmail.trim(),
    retentionDays: { selection: values.selectionDays ?? undefined, talent_pool: values.talentPoolDays ?? undefined },
  })
  if (parsed.success) return { ok: true, input: parsed.data }
  const errors = parsed.error.issues.reduce<PrivacyErrors>((acc, issue) => {
    const field = FIELD_OF[String(issue.path.at(-1) ?? '')]
    return field && !(field in acc) ? { ...acc, [field]: keyOf(field, issue.code) } : acc
  }, {})
  return { ok: false, errors }
}
