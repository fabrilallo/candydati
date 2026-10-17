import type { InstanceEmailSettingsDto } from '@candydati/domain'

/** Instance email settings as the api returns them; by default a fresh instance with nothing configured. */
export const instanceEmail = (overrides: Partial<InstanceEmailSettingsDto> = {}): InstanceEmailSettingsDto => ({
  source: 'none',
  ready: false,
  canManage: true,
  provider: null,
  smtp: null,
  resend: null,
  sendingDomain: null,
  fromLocal: 'noreply',
  verifiedAt: null,
  ...overrides,
})

/** Configured from the app with SMTP, a password stored. */
export const smtpReady = (overrides: Partial<InstanceEmailSettingsDto> = {}): InstanceEmailSettingsDto =>
  instanceEmail({
    source: 'app',
    ready: true,
    provider: 'smtp',
    smtp: { host: 'smtp.example.org', port: 587, secure: false, user: 'mailer', hasPassword: true },
    sendingDomain: 'acme.test',
    fromLocal: 'jobs',
    verifiedAt: '2026-10-17T10:00:00.000Z',
    ...overrides,
  })
