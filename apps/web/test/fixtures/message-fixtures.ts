import type { EmailSettingsDto, EmailTemplateDto, MessageDto } from '@tt/domain'

export const message = (id: string, overrides: Partial<MessageDto> = {}): MessageDto => ({
  id,
  direction: 'outbound',
  subject: 'La tua candidatura',
  bodyText: 'Ciao Giulia, grazie per la candidatura.',
  status: 'sent',
  sentBy: { id: 'u1', name: 'Ada Lovelace' },
  createdAt: '2026-10-13T10:00:00.000Z',
  sentAt: '2026-10-13T10:00:05.000Z',
  unverifiedSender: false,
  error: null,
  ...overrides,
})

export const inbound = (id: string, overrides: Partial<MessageDto> = {}): MessageDto =>
  message(id, { direction: 'inbound', subject: 'Re: La tua candidatura', bodyText: 'Grazie a voi!', status: 'received', sentBy: null, createdAt: '2026-10-13T12:00:00.000Z', sentAt: null, ...overrides })

export const template = (id: string, overrides: Partial<EmailTemplateDto> = {}): EmailTemplateDto => ({
  id,
  name: 'Esito negativo',
  kind: 'outcome_not_selected',
  subject: 'La tua candidatura per {{ job.title }}',
  body: 'Ciao {{ candidate.firstName }},\n\ngrazie del tempo che ci hai dedicato.',
  isDefault: false,
  updatedAt: '2026-10-13T10:00:00.000Z',
  ...overrides,
})

export const TEMPLATES: readonly EmailTemplateDto[] = [
  template('t-receipt', { name: 'Conferma di ricezione', kind: 'receipt', subject: 'Abbiamo ricevuto la tua candidatura', body: 'Ciao {{ candidate.firstName }}, ti rispondiamo entro {{ job.responseDays }} giorni.', isDefault: true, updatedAt: null }),
  template('t-no'),
  template('t-hired', { name: 'Assunzione', kind: 'outcome_hired', subject: 'Benvenuta in {{ organization.name }}', body: 'Ciao {{ candidate.firstName }}, siamo felici di dirti di sì.', isDefault: true, updatedAt: null }),
  template('t-custom', { name: 'Promemoria colloquio', kind: 'custom', subject: 'Il colloquio', body: 'Ciao {{ candidate.firstName }}, a domani.' }),
]

export const settings = (overrides: Partial<EmailSettingsDto> = {}): EmailSettingsDto => ({
  senderName: 'Acme Recruiting',
  fromAddress: null,
  domain: null,
  effectiveFrom: '"Acme via Piattaforma" <noreply@mail.example.org>',
  ...overrides,
})
