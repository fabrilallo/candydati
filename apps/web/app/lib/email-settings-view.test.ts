import { describe, expect, it } from 'vitest'
import { settings } from '~~/test/fixtures/message-fixtures'
import { domainStatusView, emailSettingsInput, validateEmailSettings } from './email-settings-view'

const domain = (status: 'verified' | 'pending' | 'failed' | 'unsupported') => settings({ fromAddress: 'jobs@acme.test', domain: { name: 'acme.test', status, records: [] } })

describe('domainStatusView', () => {
  it('maps every provider status to a pill', () => {
    expect(domainStatusView(domain('verified'))).toEqual({ state: 'verified', tone: 'success', key: 'emailSettings.status.verified', usesOwnAddress: true, showRecords: false, canVerify: true })
    expect(domainStatusView(domain('pending'))).toMatchObject({ tone: 'warning', usesOwnAddress: false, showRecords: true, canVerify: true })
    expect(domainStatusView(domain('failed'))).toMatchObject({ tone: 'destructive', usesOwnAddress: false, showRecords: true })
    expect(domainStatusView(domain('unsupported'))).toMatchObject({ tone: 'secondary', key: 'emailSettings.status.unsupported', showRecords: false, canVerify: false })
  })

  it('says the default address is in use when there is no own domain', () => {
    expect(domainStatusView(settings())).toMatchObject({ state: 'default', tone: 'outline', key: 'emailSettings.status.default', canVerify: false })
  })
})

describe('validateEmailSettings', () => {
  it('needs a sender name and accepts an empty address', () => {
    expect(validateEmailSettings({ senderName: ' ', fromAddress: '' })).toEqual({ senderName: 'emailSettings.errors.senderName' })
    expect(validateEmailSettings({ senderName: 'Acme', fromAddress: '' })).toEqual({})
  })

  it('refuses an address that is not an email or too long a name', () => {
    expect(validateEmailSettings({ senderName: 'x'.repeat(81), fromAddress: 'jobs' })).toEqual({ senderName: 'emailSettings.errors.senderName', fromAddress: 'emailSettings.errors.fromAddress' })
  })

  it('builds the request body, trimmed, with null for no address', () => {
    expect(emailSettingsInput({ senderName: ' Acme ', fromAddress: ' ' })).toEqual({ senderName: 'Acme', fromAddress: null })
    expect(emailSettingsInput({ senderName: 'Acme', fromAddress: ' Jobs@Acme.test ' })).toEqual({ senderName: 'Acme', fromAddress: 'jobs@acme.test' })
  })
})
