import { describe, expect, it } from 'vitest'
import { instanceEmail, smtpReady } from '~~/test/fixtures/instance-email-fixtures'
import { emptyInstanceEmailForm, formFromSettings, fromPreview, instanceEmailInput, instanceEmailState, testFailureHintKey, withPort } from './instance-email-view'

describe('instanceEmailState', () => {
  it('tells apart the server, ready and not configured', () => {
    expect(instanceEmailState(instanceEmail())).toBe('none')
    expect(instanceEmailState(smtpReady())).toBe('ready')
    expect(instanceEmailState(instanceEmail({ source: 'environment', ready: true }))).toBe('environment')
  })
})

describe('form', () => {
  it('starts with SMTP on 587 and noreply', () => {
    expect(formFromSettings(instanceEmail())).toEqual(emptyInstanceEmailForm)
    expect(emptyInstanceEmailForm).toMatchObject({ provider: 'smtp', port: '587', secure: false, fromLocal: 'noreply' })
  })

  it('fills from the stored settings, never with a secret', () => {
    const form = formFromSettings(smtpReady())
    expect(form).toMatchObject({ provider: 'smtp', host: 'smtp.example.org', port: '587', user: 'mailer', password: '', sendingDomain: 'acme.test', fromLocal: 'jobs' })
    expect(formFromSettings(instanceEmail({ provider: 'resend', resend: { hasApiKey: true }, sendingDomain: 'acme.test' }))).toMatchObject({ provider: 'resend', apiKey: '' })
  })

  it('turns TLS from the first byte on for 465 and off when leaving it', () => {
    const on = withPort(emptyInstanceEmailForm, '465')
    expect(on.secure).toBe(true)
    expect(withPort(on, '587').secure).toBe(false)
    const manual = { ...emptyInstanceEmailForm, secure: true }
    expect(withPort(manual, '2525').secure).toBe(true)
    expect(emptyInstanceEmailForm.port).toBe('587')
  })

  it('previews the From address', () => {
    expect(fromPreview({ ...emptyInstanceEmailForm, sendingDomain: ' Acme.test ' })).toBe('noreply@acme.test')
    expect(fromPreview({ ...emptyInstanceEmailForm, fromLocal: ' ', sendingDomain: 'acme.test' })).toBe('noreply@acme.test')
    expect(fromPreview(emptyInstanceEmailForm)).toBeNull()
  })
})

describe('instanceEmailInput', () => {
  it('builds an SMTP input, leaving out an empty password and user', () => {
    const result = instanceEmailInput({ ...emptyInstanceEmailForm, host: ' smtp.example.org ', sendingDomain: 'acme.test' })
    expect(result).toEqual({ ok: true, input: { provider: 'smtp', smtp: { host: 'smtp.example.org', port: 587, secure: false }, sendingDomain: 'acme.test', fromLocal: 'noreply' } })
  })

  it('sends the secrets only when typed', () => {
    const smtp = instanceEmailInput({ ...emptyInstanceEmailForm, host: 'h.example.org', user: 'u', password: 'secret', sendingDomain: 'acme.test' })
    expect(smtp.ok && smtp.input.provider === 'smtp' ? smtp.input.smtp : null).toEqual({ host: 'h.example.org', port: 587, secure: false, user: 'u', password: 'secret' })
    const resend = instanceEmailInput({ ...emptyInstanceEmailForm, provider: 'resend', apiKey: 're_123', sendingDomain: 'acme.test', fromLocal: 'jobs' })
    expect(resend).toEqual({ ok: true, input: { provider: 'resend', resend: { apiKey: 're_123' }, sendingDomain: 'acme.test', fromLocal: 'jobs' } })
    const kept = instanceEmailInput({ ...emptyInstanceEmailForm, provider: 'resend', sendingDomain: 'acme.test' })
    expect(kept.ok && kept.input.provider === 'resend' ? kept.input.resend : null).toEqual({})
  })

  it('maps each invalid field to a message', () => {
    const result = instanceEmailInput({ ...emptyInstanceEmailForm, host: '', port: '70000', sendingDomain: 'not a domain', fromLocal: 'no reply' })
    expect(result).toEqual({
      ok: false,
      errors: { host: 'instanceEmail.errors.host', port: 'instanceEmail.errors.port', sendingDomain: 'instanceEmail.errors.sendingDomain', fromLocal: 'instanceEmail.errors.fromLocal' },
    })
    expect(instanceEmailInput({ ...emptyInstanceEmailForm, host: 'h', port: 'abc', sendingDomain: 'acme.test' })).toMatchObject({ ok: false, errors: { port: 'instanceEmail.errors.port' } })
  })
})

describe('testFailureHintKey', () => {
  it('points at the domain for Resend and at the server for SMTP', () => {
    expect(testFailureHintKey('resend')).toBe('instanceEmail.test.hintResend')
    expect(testFailureHintKey('smtp')).toBe('instanceEmail.test.hintSmtp')
  })
})
