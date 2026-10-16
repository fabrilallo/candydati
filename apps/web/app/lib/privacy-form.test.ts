import { DEFAULT_RETENTION_DAYS } from '@candydati/domain'
import { describe, expect, it } from 'vitest'
import { notice, PRIVACY_TEXT } from '~~/test/fixtures/candidate-fixtures'
import { initialPrivacyForm, validatePrivacyForm } from './privacy-form'

describe('initialPrivacyForm', () => {
  it('starts from the active version when there is one', () => {
    expect(initialPrivacyForm(notice(), null, 'en')).toEqual({ language: 'it', text: PRIVACY_TEXT, contactEmail: 'privacy@acme.test', selectionDays: 365, talentPoolDays: 730 })
  })

  it('otherwise starts from the template and the default retention', () => {
    expect(initialPrivacyForm(null, 'Testo modello', 'en')).toEqual({
      language: 'en',
      text: 'Testo modello',
      contactEmail: '',
      selectionDays: DEFAULT_RETENTION_DAYS.selection,
      talentPoolDays: DEFAULT_RETENTION_DAYS.talent_pool,
    })
    expect(initialPrivacyForm(null, null, 'xx').language).toBe('it')
  })
})

describe('validatePrivacyForm', () => {
  const valid = { language: 'it' as const, text: PRIVACY_TEXT, contactEmail: ' privacy@acme.test ', selectionDays: 365, talentPoolDays: 730 }

  it('builds the input of the contract', () => {
    expect(validatePrivacyForm(valid)).toEqual({
      ok: true,
      input: { language: 'it', text: PRIVACY_TEXT.trim(), contactEmail: 'privacy@acme.test', retentionDays: { selection: 365, talent_pool: 730 } },
    })
  })

  it('maps problems to fields', () => {
    expect(validatePrivacyForm({ ...valid, text: 'corto', contactEmail: 'x', selectionDays: 5, talentPoolDays: null })).toEqual({
      ok: false,
      errors: { text: 'privacy.validation.textMin', contactEmail: 'privacy.validation.email', selectionDays: 'privacy.validation.days', talentPoolDays: 'privacy.validation.days' },
    })
    expect(validatePrivacyForm({ ...valid, text: 'x'.repeat(20_001) })).toEqual({ ok: false, errors: { text: 'privacy.validation.textMax' } })
  })
})
